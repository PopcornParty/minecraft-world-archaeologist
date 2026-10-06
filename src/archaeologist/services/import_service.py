"""Persist a parsed world as a snapshot and derive events, anomalies, and achievements."""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from archaeologist.adapters.base import UnsupportedPlatform
from archaeologist.adapters.registry import select_adapter
from archaeologist.parsers.level_dat import LevelDatError
from archaeologist.parsers.mcworld import ImportFormatError, open_source
from archaeologist.services.catalog import categorize


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class ImportService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self._lock = threading.Lock()

    def start(self, source: Path) -> str:
        job_id = uuid.uuid4().hex
        now = utcnow()
        self.conn.execute(
            """INSERT INTO import_jobs(id, status, progress, message, stage, source, created_at, updated_at)
               VALUES (?, 'queued', 0, 'Queued', 'queued', ?, ?, ?)""",
            (job_id, str(source), now, now),
        )
        self.conn.commit()
        thread = threading.Thread(target=self._run, args=(job_id, source), daemon=True)
        thread.start()
        return job_id

    def run_sync(self, source: Path, job_id: str | None = None) -> dict:
        job_id = job_id or uuid.uuid4().hex
        now = utcnow()
        self.conn.execute(
            """INSERT INTO import_jobs(id, status, progress, message, stage, source, created_at, updated_at)
               VALUES (?, 'queued', 0, 'Queued', 'queued', ?, ?, ?)""",
            (job_id, str(source), now, now),
        )
        self.conn.commit()
        self._run(job_id, source)
        return self.job(job_id)

    def job(self, job_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM import_jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def _update(self, job_id: str, **fields) -> None:
        fields["updated_at"] = utcnow()
        keys = ", ".join(f"{key} = ?" for key in fields)
        self.conn.execute(f"UPDATE import_jobs SET {keys} WHERE id = ?", (*fields.values(), job_id))
        self.conn.commit()

    def _run(self, job_id: str, source: Path) -> None:
        temp = None
        try:
            self._update(job_id, status="running", progress=5, stage="detect", message="Detecting world structure")
            if not source.exists():
                raise ImportFormatError(f"path does not exist: {source}")
            world_dir, temp = open_source(source)
            self._update(job_id, progress=15, stage="extract", message="Archive extracted" if temp else "World folder opened")
            adapter = select_adapter(world_dir)
            self._update(job_id, progress=25, stage="parse", message=f"Using {adapter.platform} adapter")

            def progress(message: str) -> None:
                self._update(job_id, progress=55, stage="parse", message=message)

            parsed = adapter.parse(world_dir, "mcworld" if temp else "directory", str(source), progress=progress)
            self._update(job_id, progress=70, stage="persist", message="Checking for an existing snapshot")
            result = self._persist(parsed, job_id)
            self._preserve_metadata(parsed, world_dir, result["world_id"], result["snapshot_id"])
            self._update(
                job_id,
                status="done",
                progress=100,
                stage="done",
                message="Duplicate snapshot left unchanged" if result["duplicate"] else "Snapshot stored",
                world_id=result["world_id"],
                snapshot_id=result["snapshot_id"],
                duplicate=1 if result["duplicate"] else 0,
            )
        except (ImportFormatError, LevelDatError, UnsupportedPlatform, OSError, ValueError) as exc:
            self._update(job_id, status="failed", stage="failed", message="Import failed", error=str(exc))
        except Exception as exc:  # last-resort guard so a bad world cannot crash the server
            self._update(job_id, status="failed", stage="failed", message="Import failed", error=f"unexpected error: {exc}")
        finally:
            if temp is not None:
                shutil.rmtree(temp, ignore_errors=True)

    def _preserve_metadata(self, parsed, world_dir: Path, world_id: str, snapshot_id: str) -> None:
        from archaeologist.db.connection import data_dir

        dest = data_dir() / "preserved" / world_id / snapshot_id
        dest.mkdir(parents=True, exist_ok=True)
        for name in parsed.preserved_files:
            src = world_dir / name
            if src.is_file():
                shutil.copy2(src, dest / name)
        (dest / "IMPORT.txt").write_text(
            "Copies of small metadata files only. The original world was not modified. "
            "The LevelDB terrain database is not copied; its hash is stored on the snapshot.\n",
            encoding="utf-8",
        )

    def _persist(self, parsed, job_id: str) -> dict:
        with self._lock:
            now = utcnow()
            world = self.conn.execute("SELECT * FROM worlds WHERE stable_key = ?", (parsed.stable_key,)).fetchone()
            if world is None:
                world_id = uuid.uuid4().hex
                self.conn.execute(
                    """INSERT INTO worlds(id, platform, stable_key, name, seed, game_type, difficulty, generator, first_seen_at, last_seen_at, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        world_id,
                        parsed.platform,
                        parsed.stable_key,
                        parsed.name,
                        parsed.seed,
                        parsed.level.get("game_type"),
                        parsed.level.get("difficulty"),
                        parsed.level.get("generator"),
                        now,
                        now,
                        now,
                    ),
                )
            else:
                world_id = world["id"]
                self.conn.execute(
                    "UPDATE worlds SET name = ?, last_seen_at = ?, game_type = ?, difficulty = ?, generator = ? WHERE id = ?",
                    (
                        parsed.name,
                        now,
                        parsed.level.get("game_type"),
                        parsed.level.get("difficulty"),
                        parsed.level.get("generator"),
                        world_id,
                    ),
                )
            existing = self.conn.execute(
                "SELECT id FROM snapshots WHERE world_id = ? AND fingerprint = ?",
                (world_id, parsed.fingerprint),
            ).fetchone()
            if existing:
                self.conn.execute(
                    """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail)
                       VALUES (?, ?, 'import_duplicate', 1, ?, 'Duplicate import skipped', ?)""",
                    (world_id, existing["id"], now, "Fingerprint matched an existing snapshot, so analysis was reused."),
                )
                self._index(world_id, "snapshot", existing["id"], parsed.name, "duplicate import", "")
                self.conn.commit()
                return {"world_id": world_id, "snapshot_id": existing["id"], "duplicate": True}

            previous = self.conn.execute(
                "SELECT * FROM snapshots WHERE world_id = ? ORDER BY imported_at DESC LIMIT 1",
                (world_id,),
            ).fetchone()
            snapshot_id = uuid.uuid4().hex
            spawn = parsed.level.get("spawn") or {}
            metadata = {
                "game_type_name": parsed.level.get("game_type_name"),
                "difficulty_name": parsed.level.get("difficulty_name"),
                "generator_name": parsed.level.get("generator_name"),
                "experiments": parsed.level.get("experiments"),
                "education": parsed.level.get("education"),
                "commands_enabled": parsed.level.get("commands_enabled"),
                "minimum_compatible_version": parsed.level.get("minimum_compatible_version"),
                "biome_override": parsed.level.get("biome_override"),
                "chunks_by_dimension": parsed.db.get("chunks_by_dimension"),
                "db_note": parsed.db.get("note"),
                "db_reason": parsed.db.get("reason"),
                "tables_read": parsed.db.get("tables_read"),
                "tables_unreadable": parsed.db.get("tables_unreadable"),
                "has_embedded_player": parsed.level.get("has_embedded_player"),
                "warnings": parsed.warnings,
            }
            item_rows = _item_rows(parsed.players)
            unique_items = {row[0] for row in item_rows}
            self.conn.execute(
                """INSERT INTO snapshots(
                    id, world_id, fingerprint, source_path, source_kind, imported_at, world_time, last_played,
                    storage_version, network_version, game_version, spawn_x, spawn_y, spawn_z, db_bytes,
                    chunk_count, chunk_count_quality, player_count, unique_item_count, metadata_json, warnings_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    snapshot_id,
                    world_id,
                    parsed.fingerprint,
                    parsed.source_path,
                    parsed.source_kind,
                    now,
                    parsed.level.get("time_ticks"),
                    parsed.level.get("last_played"),
                    parsed.level.get("storage_version"),
                    parsed.level.get("network_version"),
                    parsed.level.get("game_version"),
                    spawn.get("x"),
                    spawn.get("y"),
                    spawn.get("z"),
                    parsed.db.get("db_bytes"),
                    parsed.db.get("chunk_count"),
                    parsed.db.get("quality"),
                    len(parsed.players),
                    len(unique_items),
                    json.dumps(metadata),
                    json.dumps(parsed.warnings),
                ),
            )
            player_ids = {}
            for player in parsed.players:
                player_id = _upsert_player(self.conn, world_id, player, now)
                player_ids[player.get("player_key")] = player_id
                self.conn.execute(
                    """INSERT INTO player_states(snapshot_id, player_id, dimension, x, y, z, level, xp_progress, health, game_mode, deaths, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        snapshot_id,
                        player_id,
                        player.get("dimension"),
                        player.get("x"),
                        player.get("y"),
                        player.get("z"),
                        player.get("level"),
                        player.get("xp_progress"),
                        player.get("health"),
                        player.get("game_mode"),
                        player.get("deaths"),
                        json.dumps(player),
                    ),
                )
            for item_id, quantity, stacks, source, player_key in item_rows:
                self.conn.execute(
                    """INSERT INTO item_totals(snapshot_id, player_id, item_id, category, quantity, stack_count, source)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (snapshot_id, player_ids.get(player_key, ""), item_id, categorize(item_id), quantity, stacks, source),
                )
            self._events(world_id, snapshot_id, parsed, previous, now)
            self._anomalies(world_id, snapshot_id, previous)
            self._index(world_id, "world", world_id, parsed.name, parsed.seed or "", parsed.platform)
            self._index(world_id, "snapshot", snapshot_id, f"{parsed.name} snapshot", parsed.fingerprint[:12], parsed.level.get("game_version") or "")
            for player in parsed.players:
                self._index(world_id, "player", player_ids.get(player.get("player_key"), ""), player.get("display_name") or "", player.get("player_key") or "", "")
            for item_id in unique_items:
                self._index(world_id, "item", item_id, item_id, categorize(item_id), "")
            self.conn.commit()
            from archaeologist.services.achievements import evaluate

            evaluate(self.conn)
            self.conn.commit()
            return {"world_id": world_id, "snapshot_id": snapshot_id, "duplicate": False}

    def _index(self, world_id: str, entity_type: str, entity_id: str, title: str, body: str, tags: str) -> None:
        self.conn.execute("DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?", (entity_type, entity_id))
        self.conn.execute(
            "INSERT INTO search_fts(entity_type, entity_id, world_id, title, body, tags) VALUES (?, ?, ?, ?, ?, ?)",
            (entity_type, entity_id, world_id, title or "", body or "", tags or ""),
        )

    def _events(self, world_id, snapshot_id, parsed, previous, now) -> None:
        self.conn.execute(
            """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail, payload_json)
               VALUES (?, ?, 'snapshot_created', 2, ?, ?, ?, ?)""",
            (
                world_id,
                snapshot_id,
                now,
                "Snapshot created",
                f"{parsed.name} imported from {parsed.source_kind}",
                json.dumps({"fingerprint": parsed.fingerprint[:16]}),
            ),
        )
        if previous is None:
            self.conn.execute(
                """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail)
                   VALUES (?, ?, 'world_imported', 3, ?, 'World first seen', ?)""",
                (world_id, snapshot_id, now, parsed.name),
            )
            return
        old_items = {
            (row["item_id"], row["source"]): row["quantity"]
            for row in self.conn.execute(
                "SELECT item_id, source, SUM(quantity) AS quantity FROM item_totals WHERE snapshot_id = ? GROUP BY item_id, source",
                (previous["id"],),
            )
        }
        new_items = {}
        for player in parsed.players:
            for source, stacks in (player.get("inventories") or {}).items():
                for stack in stacks:
                    key = (stack["item_id"], source)
                    new_items[key] = new_items.get(key, 0) + stack["quantity"]
        for key, qty in new_items.items():
            delta = qty - old_items.get(key, 0)
            if abs(delta) >= 16:
                self.conn.execute(
                    """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail, payload_json)
                       VALUES (?, ?, 'inventory_change', ?, ?, ?, ?, ?)""",
                    (
                        world_id,
                        snapshot_id,
                        3 if abs(delta) >= 64 else 2,
                        now,
                        f"{key[0]} {delta:+d}",
                        f"{key[1]} changed since the previous snapshot",
                        json.dumps({"item_id": key[0], "source": key[1], "delta": delta}),
                    ),
                )
        if previous["chunk_count"] is not None and parsed.db.get("chunk_count") is not None:
            delta = parsed.db["chunk_count"] - previous["chunk_count"]
            if abs(delta) >= 32:
                self.conn.execute(
                    """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail, payload_json)
                       VALUES (?, ?, 'exploration_change', 2, ?, ?, ?, ?)""",
                    (
                        world_id,
                        snapshot_id,
                        now,
                        f"Chunk keys {delta:+d}",
                        "Measured LevelDB chunk-key coverage changed. This is not a block census.",
                        json.dumps({"delta": delta, "quality": "measured"}),
                    ),
                )

    def _anomalies(self, world_id, snapshot_id, previous) -> None:
        if previous is None:
            return
        rows = self.conn.execute(
            """SELECT item_id, SUM(quantity) AS quantity FROM item_totals WHERE snapshot_id = ? GROUP BY item_id""",
            (snapshot_id,),
        ).fetchall()
        old = {
            row["item_id"]: row["quantity"]
            for row in self.conn.execute(
                "SELECT item_id, SUM(quantity) AS quantity FROM item_totals WHERE snapshot_id = ? GROUP BY item_id",
                (previous["id"],),
            )
        }
        now = utcnow()
        for row in rows:
            before = old.get(row["item_id"], 0)
            after = row["quantity"]
            delta = after - before
            if abs(delta) >= 200 or (before and abs(delta) / max(before, 1) >= 3 and abs(delta) >= 64):
                self.conn.execute(
                    """INSERT INTO anomalies(world_id, snapshot_id, compared_to, kind, severity, title, detail, payload_json, created_at)
                       VALUES (?, ?, ?, 'item_change', ?, 'Unusual change detected', ?, ?, ?)""",
                    (
                        world_id,
                        snapshot_id,
                        previous["id"],
                        2 if abs(delta) >= 500 else 1,
                        f"{row['item_id']} moved from {before} to {after} ({delta:+d}). This is a description of the save, not a judgement.",
                        json.dumps({"item_id": row["item_id"], "before": before, "after": after}),
                        now,
                    ),
                )
        new_snap = self.conn.execute("SELECT * FROM snapshots WHERE id = ?", (snapshot_id,)).fetchone()
        if previous["chunk_count"] and new_snap["chunk_count"] and new_snap["chunk_count"] > previous["chunk_count"] * 1.5 and new_snap["chunk_count"] - previous["chunk_count"] > 100:
            self.conn.execute(
                """INSERT INTO anomalies(world_id, snapshot_id, compared_to, kind, severity, title, detail, created_at)
                   VALUES (?, ?, ?, 'exploration', 1, 'Unusual change detected', ?, ?)""",
                (
                    world_id,
                    snapshot_id,
                    previous["id"],
                    f"Measured chunk keys rose from {previous['chunk_count']} to {new_snap['chunk_count']}.",
                    now,
                ),
            )


def _upsert_player(conn, world_id, player, now) -> str:
    row = conn.execute(
        "SELECT id FROM players WHERE world_id = ? AND player_key = ?",
        (world_id, player.get("player_key")),
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE players SET display_name = ?, last_seen_at = ? WHERE id = ?",
            (player.get("display_name"), now, row["id"]),
        )
        return row["id"]
    player_id = uuid.uuid4().hex
    conn.execute(
        """INSERT INTO players(id, world_id, player_key, display_name, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (player_id, world_id, player.get("player_key"), player.get("display_name"), now, now),
    )
    return player_id


def _item_rows(players: list[dict]) -> list[tuple]:
    grouped: dict[tuple, list] = {}
    for player in players:
        for source, stacks in (player.get("inventories") or {}).items():
            for stack in stacks:
                key = (stack["item_id"], source, player.get("player_key") or "")
                grouped.setdefault(key, []).append(stack["quantity"])
    return [(item, sum(qtys), len(qtys), source, player_key) for (item, source, player_key), qtys in grouped.items()]

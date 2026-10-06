"""Snapshot comparison and analytics computed from stored rows."""

from __future__ import annotations

import json
import sqlite3


def compare(conn: sqlite3.Connection, left_id: str, right_id: str) -> dict:
    left = _snapshot(conn, left_id)
    right = _snapshot(conn, right_id)
    if left is None or right is None:
        raise KeyError("snapshot not found")
    items = _item_diff(conn, left_id, right_id)
    players = _player_diff(conn, left_id, right_id)
    world = _meta_diff(left, right)
    conn.execute(
        """INSERT INTO events(world_id, snapshot_id, event_type, importance, occurred_at, title, detail)
           VALUES (?, ?, 'comparison', 1, datetime('now'), 'Comparison viewed', ?)""",
        (right["world_id"], right_id, f"Compared {left_id[:8]} to {right_id[:8]}"),
    )
    conn.commit()
    from archaeologist.services.achievements import evaluate

    evaluate(conn)
    conn.commit()
    return {"left": left, "right": right, "items": items, "players": players, "world": world}


def _snapshot(conn, snapshot_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM snapshots WHERE id = ?", (snapshot_id,)).fetchone()
    return dict(row) if row else None


def _item_diff(conn, left_id: str, right_id: str) -> list[dict]:
    def totals(snapshot_id):
        rows = conn.execute(
            "SELECT item_id, SUM(quantity) AS quantity FROM item_totals WHERE snapshot_id = ? GROUP BY item_id",
            (snapshot_id,),
        )
        return {row["item_id"]: row["quantity"] for row in rows}

    before, after = totals(left_id), totals(right_id)
    keys = sorted(set(before) | set(after))
    out = []
    for key in keys:
        b = before.get(key, 0)
        a = after.get(key, 0)
        if b == a:
            status = "unchanged"
        elif key not in before:
            status = "new"
        elif key not in after:
            status = "removed"
        else:
            status = "changed"
        out.append({"item_id": key, "before": b, "after": a, "change": a - b, "status": status})
    return out


def _player_diff(conn, left_id: str, right_id: str) -> list[dict]:
    def states(snapshot_id):
        rows = conn.execute(
            """SELECT p.player_key, p.display_name, s.level, s.x, s.y, s.z, s.dimension, s.health, s.deaths
               FROM player_states s JOIN players p ON p.id = s.player_id WHERE s.snapshot_id = ?""",
            (snapshot_id,),
        )
        return {row["player_key"]: dict(row) for row in rows}

    before, after = states(left_id), states(right_id)
    out = []
    for key in sorted(set(before) | set(after)):
        b = before.get(key, {})
        a = after.get(key, {})
        level_before = b.get("level")
        level_after = a.get("level")
        change = None
        if isinstance(level_before, int) and isinstance(level_after, int):
            change = level_after - level_before
        out.append(
            {
                "player_key": key,
                "display_name": a.get("display_name") or b.get("display_name"),
                "status": "new" if key not in before else "removed" if key not in after else "changed",
                "level_before": level_before,
                "level_after": level_after,
                "level_change": change,
                "position_before": [b.get("x"), b.get("y"), b.get("z"), b.get("dimension")],
                "position_after": [a.get("x"), a.get("y"), a.get("z"), a.get("dimension")],
                "deaths_before": b.get("deaths"),
                "deaths_after": a.get("deaths"),
            }
        )
    return out


def _meta_diff(left: dict, right: dict) -> list[dict]:
    fields = [
        ("game_version", "Game version"),
        ("world_time", "World time (ticks)"),
        ("db_bytes", "LevelDB size (bytes)"),
        ("chunk_count", "Chunk keys"),
        ("player_count", "Players detected"),
        ("unique_item_count", "Unique items"),
        ("spawn_x", "Spawn X"),
        ("spawn_y", "Spawn Y"),
        ("spawn_z", "Spawn Z"),
        ("last_played", "Last played (unix)"),
    ]
    out = []
    for key, label in fields:
        b, a = left.get(key), right.get(key)
        change = a - b if isinstance(a, (int, float)) and isinstance(b, (int, float)) else None
        out.append({"field": key, "label": label, "before": b, "after": a, "change": change, "quality": left.get("chunk_count_quality") if key == "chunk_count" else "stored"})
    return out


def world_analytics(conn: sqlite3.Connection, world_id: str) -> dict:
    world = conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone()
    if world is None:
        raise KeyError("world not found")
    snapshots = [dict(row) for row in conn.execute("SELECT * FROM snapshots WHERE world_id = ? ORDER BY imported_at", (world_id,))]
    series = [
        {
            "snapshot_id": row["id"],
            "imported_at": row["imported_at"],
            "last_played": row["last_played"],
            "world_time": row["world_time"],
            "db_bytes": row["db_bytes"],
            "chunk_count": row["chunk_count"],
            "chunk_count_quality": row["chunk_count_quality"],
            "unique_item_count": row["unique_item_count"],
            "player_count": row["player_count"],
        }
        for row in snapshots
    ]
    items = [
        dict(row)
        for row in conn.execute(
            """SELECT s.imported_at, s.id AS snapshot_id, t.item_id, t.category, SUM(t.quantity) AS quantity
               FROM item_totals t JOIN snapshots s ON s.id = t.snapshot_id
               WHERE s.world_id = ? GROUP BY s.id, t.item_id ORDER BY s.imported_at""",
            (world_id,),
        )
    ]
    players = [dict(row) for row in conn.execute("SELECT * FROM players WHERE world_id = ?", (world_id,))]
    return {
        "world": dict(world),
        "snapshot_count": len(snapshots),
        "series": series,
        "items": items,
        "players": players,
        "notes": [
            "Chunk counts are measured only when a LevelDB index could be decoded, and are chunk keys rather than placed blocks.",
            "Item quantities come from player inventories embedded in the save, not from every chest.",
            "World age uses level.dat Time ticks when present (20 ticks = 1 second of world time), which is not the same as real playtime.",
        ],
    }


def dashboard(conn: sqlite3.Connection, world_id: str | None = None) -> dict:
    worlds = [dict(row) for row in conn.execute("SELECT * FROM worlds ORDER BY last_seen_at DESC")]
    if world_id is None and worlds:
        world_id = worlds[0]["id"]
    current = None
    insights = []
    recent_events = []
    anomalies = []
    if world_id:
        current = dict(conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone())
        snaps = [dict(row) for row in conn.execute("SELECT * FROM snapshots WHERE world_id = ? ORDER BY imported_at DESC LIMIT 2", (world_id,))]
        current["latest_snapshot"] = snaps[0] if snaps else None
        current["snapshot_count"] = conn.execute("SELECT COUNT(*) FROM snapshots WHERE world_id = ?", (world_id,)).fetchone()[0]
        if len(snaps) == 2:
            diff = _item_diff(conn, snaps[1]["id"], snaps[0]["id"])
            interesting = sorted([row for row in diff if row["change"]], key=lambda row: abs(row["change"]), reverse=True)[:5]
            for row in interesting:
                insights.append(f"{row['item_id']} changed by {row['change']:+d} since the previous snapshot.")
            if snaps[0]["chunk_count"] is not None and snaps[1]["chunk_count"] is not None:
                delta = snaps[0]["chunk_count"] - snaps[1]["chunk_count"]
                if delta:
                    insights.append(f"Measured chunk keys changed by {delta:+d}. This is index coverage, not a block count.")
        elif snaps:
            insights.append("Only one snapshot is stored. Import the world again after playing to start a history.")
        if snaps:
            meta = json.loads(snaps[0]["metadata_json"] or "{}")
            for warning in meta.get("warnings") or []:
                insights.append(warning)
        recent_events = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM events WHERE world_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 12",
                (world_id,),
            )
        ]
        anomalies = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM anomalies WHERE world_id = ? AND dismissed = 0 ORDER BY id DESC LIMIT 8",
                (world_id,),
            )
        ]
    return {"worlds": worlds, "current": current, "insights": insights, "events": recent_events, "anomalies": anomalies}

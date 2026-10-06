"""Writes, validation, and search indexing."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone

from archaeologist.services.parse import EVENT_TYPES

BUILTIN_ACHIEVEMENTS = [
    ("first_event", "First event", "Record one event.", "events", 1),
    ("events_10", "Ten events", "Record 10 events.", "events", 10),
    ("events_100", "Hundred events", "Record 100 events.", "events", 100),
    ("events_1000", "Thousand events", "Record 1,000 events.", "events", 1000),
    ("streak_7", "Seven-day streak", "Record activity on 7 consecutive days.", "streak", 7),
    ("streak_30", "Thirty-day streak", "Record activity on 30 consecutive days.", "streak", 30),
    ("first_million", "First million", "Reach a recorded balance of 1,000,000.", "balance", 1_000_000),
    ("ten_million", "Ten million", "Reach a recorded balance of 10,000,000.", "balance", 10_000_000),
    ("goals_10", "Ten goals", "Complete 10 goals.", "goals_completed", 10),
    ("goals_100", "Hundred goals", "Complete 100 goals.", "goals_completed", 100),
    ("sessions_10", "Ten sessions", "Record 10 sessions.", "sessions", 10),
    ("sessions_100", "Hundred sessions", "Record 100 sessions.", "sessions", 100),
    ("builds_100", "Hundred builds", "Record 100 building events.", "builds", 100),
    ("trades_100", "Hundred trades", "Record 100 trade events.", "trades", 100),
]


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


class StoreError(ValueError):
    pass


def seed(conn: sqlite3.Connection) -> None:
    for ident, name, description, rule, threshold in BUILTIN_ACHIEVEMENTS:
        conn.execute(
            """INSERT OR IGNORE INTO achievements(id, name, description, rule_key, threshold)
               VALUES (?, ?, ?, ?, ?)""",
            (ident, name, description, rule, threshold),
        )
    if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        for name in ("Construction", "Mining", "Trading", "Gear", "Shops", "Combat", "Miscellaneous"):
            conn.execute(
                "INSERT INTO categories(id, world_id, name, kind) VALUES (?, NULL, ?, 'spending')",
                (new_id(), name),
            )
    conn.execute(
        "INSERT OR IGNORE INTO settings(key, value) VALUES ('reminders_enabled', '0')"
    )
    conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES ('theme', 'dark')")


def index_row(conn, entity_type: str, entity_id: str, world_id: str, title: str, body: str) -> None:
    conn.execute("DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?", (entity_type, entity_id))
    conn.execute(
        "INSERT INTO search_fts(entity_type, entity_id, world_id, title, body) VALUES (?, ?, ?, ?, ?)",
        (entity_type, entity_id, world_id or "", title or "", body or ""),
    )


def create_world(conn, payload: dict) -> str:
    name = payload.get("name", "").strip()
    if not name:
        raise StoreError("World name is required.")
    world_id = new_id()
    now = utcnow()
    conn.execute(
        """INSERT INTO worlds(id, name, description, edition, seed, created_on, status, currency_name,
           main_location, tags, notes, image, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            world_id,
            name,
            payload.get("description") or "",
            payload.get("edition") or "Bedrock",
            payload.get("seed") or None,
            payload.get("created_on") or now[:10],
            payload.get("status") or "active",
            payload.get("currency_name") or "coins",
            payload.get("main_location") or "",
            payload.get("tags") or "",
            payload.get("notes") or "",
            payload.get("image") or None,
            now,
            now,
        ),
    )
    index_row(conn, "world", world_id, world_id, name, payload.get("description") or "")
    conn.commit()
    return world_id


def update_world(conn, world_id: str, payload: dict) -> None:
    row = conn.execute("SELECT id FROM worlds WHERE id = ?", (world_id,)).fetchone()
    if row is None:
        raise StoreError("World not found.")
    fields = ["name", "description", "edition", "seed", "created_on", "status", "currency_name", "main_location", "tags", "notes", "image"]
    sets, values = [], []
    for field in fields:
        if field in payload:
            sets.append(f"{field} = ?")
            values.append(payload[field])
    if not sets:
        return
    sets.append("updated_at = ?")
    values.append(utcnow())
    values.append(world_id)
    conn.execute(f"UPDATE worlds SET {', '.join(sets)} WHERE id = ?", values)
    world = conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone()
    index_row(conn, "world", world_id, world_id, world["name"], world["description"])
    conn.commit()


def create_player(conn, payload: dict) -> str:
    name = payload.get("name", "").strip()
    if not name or not payload.get("world_id"):
        raise StoreError("Player name and world are required.")
    player_id = new_id()
    now = utcnow()
    conn.execute(
        """INSERT INTO players(id, world_id, name, nickname, first_seen, last_seen, notes, relationship, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            player_id,
            payload["world_id"],
            name,
            payload.get("nickname") or "",
            payload.get("first_seen") or now[:10],
            payload.get("last_seen") or now[:10],
            payload.get("notes") or "",
            payload.get("relationship") or "friend",
            now,
        ),
    )
    index_row(conn, "player", player_id, payload["world_id"], name, payload.get("notes") or "")
    conn.commit()
    return player_id


def _touch_player(conn, world_id: str, name: str | None) -> str | None:
    if not name:
        return None
    row = conn.execute(
        "SELECT id FROM players WHERE world_id = ? AND name = ? COLLATE NOCASE",
        (world_id, name),
    ).fetchone()
    today = utcnow()[:10]
    if row:
        conn.execute("UPDATE players SET last_seen = ? WHERE id = ?", (today, row["id"]))
        return row["id"]
    return create_player(conn, {"world_id": world_id, "name": name, "first_seen": today, "last_seen": today})


def create_event(conn, payload: dict) -> str:
    title = (payload.get("title") or "").strip()
    world_id = payload.get("world_id")
    event_type = payload.get("event_type") or "note"
    if not title or not world_id:
        raise StoreError("Event title and world are required.")
    if event_type not in {key for key, _label in EVENT_TYPES} and not payload.get("custom_type"):
        raise StoreError("Unknown event type.")
    event_id = new_id()
    now = utcnow()
    occurred = payload.get("occurred_at") or now
    player_id = payload.get("player_id") or _touch_player(conn, world_id, payload.get("player_name"))
    amount = payload.get("amount")
    if amount is not None:
        amount = float(amount)
    item_delta = payload.get("item_delta")
    if item_delta is not None:
        item_delta = float(item_delta)
    open_session = conn.execute(
        "SELECT id FROM sessions WHERE world_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
        (world_id,),
    ).fetchone()
    session_id = payload.get("session_id") or (open_session["id"] if open_session else None)
    conn.execute(
        """INSERT INTO events(id, world_id, event_type, category, title, description, occurred_at, player_id,
           amount, item_name, item_delta, session_id, goal_id, location_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            event_id,
            world_id,
            event_type,
            payload.get("category") or "General",
            title,
            payload.get("description") or "",
            occurred,
            player_id,
            amount,
            payload.get("item_name") or None,
            item_delta,
            session_id,
            payload.get("goal_id") or None,
            payload.get("location_id") or None,
            now,
            now,
        ),
    )
    if amount is not None and amount != 0:
        kind = "income" if amount > 0 else "spending"
        conn.execute(
            """INSERT INTO transactions(id, world_id, event_id, player_id, kind, category, amount, occurred_at, note)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_id(), world_id, event_id, player_id, kind, payload.get("category") or "Miscellaneous", amount, occurred, title),
        )
    if payload.get("item_name") and item_delta is not None:
        _record_item(conn, world_id, payload["item_name"], item_delta, event_id, occurred, title)
    if payload.get("goal_id"):
        step = abs(item_delta) if item_delta else (abs(amount) if amount else 1)
        conn.execute(
            "UPDATE goals SET current = current + ?, updated_at = ? WHERE id = ? AND status = 'active'",
            (step, now, payload["goal_id"]),
        )
        conn.execute(
            """UPDATE goals SET status = 'completed', completed_at = ?, updated_at = ?
               WHERE id = ? AND status = 'active' AND current >= target""",
            (now, now, payload["goal_id"]),
        )
    deaths = payload.get("death_count")
    if deaths and int(deaths) > 1:
        for _ in range(int(deaths) - 1):
            extra = new_id()
            conn.execute(
                """INSERT INTO events(id, world_id, event_type, category, title, description, occurred_at, player_id,
                   session_id, created_at, updated_at)
                   VALUES (?, ?, 'death', 'Combat', ?, ?, ?, ?, ?, ?, ?)""",
                (extra, world_id, title, payload.get("description") or "", occurred, player_id, session_id, now, now),
            )
    index_row(conn, "event", event_id, world_id, title, payload.get("description") or "")
    from archaeologist.services.analytics import evaluate_achievements

    evaluate_achievements(conn)
    conn.commit()
    return event_id


def update_event(conn, event_id: str, payload: dict) -> None:
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise StoreError("Event not found.")
    title = payload.get("title", row["title"]).strip()
    if not title:
        raise StoreError("Event title is required.")
    amount = payload.get("amount", row["amount"])
    conn.execute(
        """UPDATE events SET title = ?, description = ?, event_type = ?, category = ?, occurred_at = ?,
           amount = ?, item_name = ?, item_delta = ?, updated_at = ? WHERE id = ?""",
        (
            title,
            payload.get("description", row["description"]),
            payload.get("event_type", row["event_type"]),
            payload.get("category", row["category"]),
            payload.get("occurred_at", row["occurred_at"]),
            amount,
            payload.get("item_name", row["item_name"]),
            payload.get("item_delta", row["item_delta"]),
            utcnow(),
            event_id,
        ),
    )
    conn.execute("DELETE FROM transactions WHERE event_id = ?", (event_id,))
    if amount not in (None, "", 0):
        value = float(amount)
        conn.execute(
            """INSERT INTO transactions(id, world_id, event_id, player_id, kind, category, amount, occurred_at, note)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                new_id(),
                row["world_id"],
                event_id,
                row["player_id"],
                "income" if value > 0 else "spending",
                payload.get("category", row["category"]),
                value,
                payload.get("occurred_at", row["occurred_at"]),
                title,
            ),
        )
    index_row(conn, "event", event_id, row["world_id"], title, payload.get("description", row["description"]))
    conn.commit()


def delete_event(conn, event_id: str) -> None:
    conn.execute("DELETE FROM search_fts WHERE entity_type = 'event' AND entity_id = ?", (event_id,))
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()


def _record_item(conn, world_id, name, delta, event_id, occurred, note) -> None:
    clean = name.strip()
    if not clean:
        return
    row = conn.execute(
        "SELECT id FROM items WHERE world_id = ? AND name = ? COLLATE NOCASE",
        (world_id, clean),
    ).fetchone()
    if row:
        item_id = row["id"]
    else:
        item_id = new_id()
        conn.execute(
            "INSERT INTO items(id, world_id, name, created_at) VALUES (?, ?, ?, ?)",
            (item_id, world_id, clean, utcnow()),
        )
        index_row(conn, "item", item_id, world_id, clean, "")
    previous = conn.execute(
        """SELECT r.quantity FROM item_records r JOIN items i ON i.id = r.item_id
           WHERE i.id = ? AND r.quantity IS NOT NULL ORDER BY r.occurred_at DESC LIMIT 1""",
        (item_id,),
    ).fetchone()
    quantity = (previous["quantity"] if previous and previous["quantity"] is not None else 0) + delta
    conn.execute(
        """INSERT INTO item_records(id, item_id, event_id, quantity, delta, occurred_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (new_id(), item_id, event_id, quantity, delta, occurred, note),
    )


def create_goal(conn, payload: dict) -> str:
    title = payload.get("title", "").strip()
    if not title or not payload.get("world_id"):
        raise StoreError("Goal title and world are required.")
    goal_id = new_id()
    now = utcnow()
    conn.execute(
        """INSERT INTO goals(id, world_id, player_id, title, description, category, target, current, deadline,
           priority, status, auto_event_type, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)""",
        (
            goal_id,
            payload["world_id"],
            payload.get("player_id"),
            title,
            payload.get("description") or "",
            payload.get("category") or "General",
            float(payload.get("target") or 1),
            float(payload.get("current") or 0),
            payload.get("deadline") or None,
            int(payload.get("priority") or 2),
            payload.get("auto_event_type") or None,
            payload.get("notes") or "",
            now,
            now,
        ),
    )
    index_row(conn, "goal", goal_id, payload["world_id"], title, payload.get("description") or "")
    conn.commit()
    return goal_id


def update_goal(conn, goal_id: str, payload: dict) -> None:
    row = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if row is None:
        raise StoreError("Goal not found.")
    current = float(payload.get("current", row["current"]))
    target = float(payload.get("target", row["target"]))
    status = payload.get("status", row["status"])
    completed = row["completed_at"]
    if status == "active" and current >= target:
        status = "completed"
        completed = utcnow()
    conn.execute(
        """UPDATE goals SET title = ?, description = ?, category = ?, target = ?, current = ?, deadline = ?,
           priority = ?, status = ?, notes = ?, completed_at = ?, updated_at = ? WHERE id = ?""",
        (
            payload.get("title", row["title"]),
            payload.get("description", row["description"]),
            payload.get("category", row["category"]),
            target,
            current,
            payload.get("deadline", row["deadline"]),
            int(payload.get("priority", row["priority"])),
            status,
            payload.get("notes", row["notes"]),
            completed,
            utcnow(),
            goal_id,
        ),
    )
    conn.commit()


def start_session(conn, world_id: str, notes: str = "", started_at: str | None = None, manual: int = 0) -> str:
    session_id = new_id()
    conn.execute(
        "INSERT INTO sessions(id, world_id, started_at, notes, manual) VALUES (?, ?, ?, ?, ?)",
        (session_id, world_id, started_at or utcnow(), notes, manual),
    )
    conn.commit()
    return session_id


def end_session(conn, world_id: str, ended_at: str | None = None) -> str | None:
    row = conn.execute(
        "SELECT id FROM sessions WHERE world_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
        (world_id,),
    ).fetchone()
    if row is None:
        raise StoreError("No open session.")
    conn.execute("UPDATE sessions SET ended_at = ? WHERE id = ?", (ended_at or utcnow(), row["id"]))
    from archaeologist.services.analytics import evaluate_achievements

    evaluate_achievements(conn)
    conn.commit()
    return row["id"]


def search(conn, query: str, limit: int = 40) -> list[dict]:
    tokens = [part.replace('"', "") for part in query.split() if part.strip()]
    if not tokens:
        return []
    match = " ".join(f'"{token}"' for token in tokens)
    try:
        rows = conn.execute(
            "SELECT entity_type, entity_id, world_id, title, body FROM search_fts WHERE search_fts MATCH ? LIMIT ?",
            (match, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [dict(row) for row in rows]


def balance(conn, world_id: str) -> float:
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE world_id = ?", (world_id,)).fetchone()
    return float(row["total"])


def export_backup(conn) -> dict:
    tables = [
        "worlds",
        "players",
        "categories",
        "events",
        "transactions",
        "items",
        "item_records",
        "goals",
        "sessions",
        "locations",
        "journal_entries",
        "milestones",
        "achievements",
        "progression_weights",
        "settings",
    ]
    payload = {"format": "mwa-backup", "version": 2, "exported_at": utcnow()}
    for table in tables:
        payload[table] = [dict(row) for row in conn.execute(f"SELECT * FROM {table}")]
    return payload


def import_backup(conn, payload: dict, mode: str) -> dict:
    if payload.get("format") != "mwa-backup" or payload.get("version") != 2:
        raise StoreError("Backup must be format mwa-backup version 2.")
    if mode not in {"merge", "replace"}:
        raise StoreError("Mode must be merge or replace.")
    required = ["worlds", "events", "players", "goals"]
    for key in required:
        if key not in payload or not isinstance(payload[key], list):
            raise StoreError(f"Backup is missing {key}.")
    tables = [
        "item_records",
        "transactions",
        "events",
        "goals",
        "sessions",
        "journal_entries",
        "locations",
        "milestones",
        "items",
        "players",
        "categories",
        "progression_weights",
        "worlds",
        "achievements",
        "settings",
    ]
    conn.execute("BEGIN")
    try:
        if mode == "replace":
            for table in tables:
                conn.execute(f"DELETE FROM {table}")
            conn.execute("DELETE FROM search_fts")
        for table in reversed(tables):
            rows = payload.get(table) or []
            if not rows:
                continue
            columns = list(rows[0].keys())
            marks = ", ".join("?" for _ in columns)
            names = ", ".join(columns)
            for row in rows:
                values = [row.get(column) for column in columns]
                if mode == "merge":
                    conn.execute(
                        f"INSERT OR REPLACE INTO {table} ({names}) VALUES ({marks})",
                        values,
                    )
                else:
                    conn.execute(f"INSERT INTO {table} ({names}) VALUES ({marks})", values)
        conn.execute("DELETE FROM search_fts")
        for world in conn.execute("SELECT id, name, description FROM worlds"):
            index_row(conn, "world", world["id"], world["id"], world["name"], world["description"])
        for event in conn.execute("SELECT id, world_id, title, description FROM events"):
            index_row(conn, "event", event["id"], event["world_id"], event["title"], event["description"])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return {"worlds": conn.execute("SELECT COUNT(*) FROM worlds").fetchone()[0]}


def dumps(payload: dict) -> str:
    return json.dumps(payload)

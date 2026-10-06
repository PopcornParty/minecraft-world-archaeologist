"""Achievement evaluation from stored facts. Nothing here is awarded manually."""

from __future__ import annotations

import json
import sqlite3

from archaeologist.services.catalog import ACHIEVEMENTS
from archaeologist.services.import_service import utcnow


def seed(conn: sqlite3.Connection) -> None:
    for ident, name, description in ACHIEVEMENTS:
        conn.execute(
            "INSERT OR IGNORE INTO achievements(id, name, description) VALUES (?, ?, ?)",
            (ident, name, description),
        )


def evaluate(conn: sqlite3.Connection) -> list[str]:
    seed(conn)
    unlocked = []
    snapshot_count = conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
    world_span = conn.execute(
        """SELECT world_id, MIN(imported_at) AS first_at, MAX(imported_at) AS last_at,
                  MIN(last_played) AS first_played, MAX(last_played) AS last_played, COUNT(*) AS n
           FROM snapshots GROUP BY world_id"""
    ).fetchall()
    unique_items = conn.execute("SELECT COUNT(DISTINCT item_id) FROM item_totals").fetchone()[0]
    max_chunks = conn.execute("SELECT MAX(chunk_count) FROM snapshots").fetchone()[0] or 0
    locations = conn.execute("SELECT COUNT(*) FROM locations").fetchone()[0]
    notes = conn.execute("SELECT COUNT(*) FROM journal_entries").fetchone()[0]
    comparisons = conn.execute("SELECT COUNT(*) FROM events WHERE event_type = 'comparison'").fetchone()[0]
    checks = {
        "first_snapshot": snapshot_count >= 1,
        "world_historian": snapshot_count >= 10,
        "archivist": snapshot_count >= 100,
        "collector": unique_items >= 50,
        "explorer": max_chunks >= 500,
        "cartographer": locations >= 5,
        "journal_keeper": notes >= 5,
        "comparator": comparisons >= 1,
        "second_look": any(row["n"] >= 2 for row in world_span),
        "long_haul": _long_haul(world_span),
    }
    evidence = {
        "snapshot_count": snapshot_count,
        "unique_items": unique_items,
        "max_chunks": max_chunks,
        "locations": locations,
        "notes": notes,
    }
    now = utcnow()
    for ident, ok in checks.items():
        if not ok:
            continue
        row = conn.execute("SELECT unlocked_at FROM achievements WHERE id = ?", (ident,)).fetchone()
        if row and row["unlocked_at"]:
            continue
        conn.execute(
            "UPDATE achievements SET unlocked_at = ?, evidence_json = ? WHERE id = ?",
            (now, json.dumps(evidence), ident),
        )
        unlocked.append(ident)
    return unlocked


def _long_haul(rows) -> bool:
    from datetime import datetime

    for row in rows:
        if row["first_played"] and row["last_played"] and row["last_played"] - row["first_played"] >= 30 * 86400:
            return True
        if row["first_at"] and row["last_at"]:
            try:
                span = datetime.fromisoformat(row["last_at"]) - datetime.fromisoformat(row["first_at"])
            except ValueError:
                continue
            if span.days >= 30:
                return True
    return False

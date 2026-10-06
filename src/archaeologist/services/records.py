"""Journal, locations, search, and export."""

from __future__ import annotations

import csv
import io
import json
import sqlite3
from datetime import datetime, timezone

from archaeologist.services.achievements import evaluate


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def add_journal(conn, payload: dict) -> int:
    cur = conn.execute(
        """INSERT INTO journal_entries(world_id, snapshot_id, player_id, location_id, written_at, title, body, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload.get("world_id"),
            payload.get("snapshot_id"),
            payload.get("player_id"),
            payload.get("location_id"),
            payload.get("written_at") or utcnow(),
            payload["title"].strip(),
            payload["body"].strip(),
            payload.get("tags") or "",
        ),
    )
    entry_id = cur.lastrowid
    conn.execute(
        """INSERT INTO events(world_id, snapshot_id, location_id, event_type, importance, occurred_at, title, detail)
           VALUES (?, ?, ?, 'journal', 2, ?, ?, ?)""",
        (
            payload.get("world_id"),
            payload.get("snapshot_id"),
            payload.get("location_id"),
            payload.get("written_at") or utcnow(),
            payload["title"].strip(),
            payload["body"].strip()[:500],
        ),
    )
    conn.execute(
        "INSERT INTO search_fts(entity_type, entity_id, world_id, title, body, tags) VALUES ('journal', ?, ?, ?, ?, ?)",
        (str(entry_id), payload.get("world_id") or "", payload["title"], payload["body"], payload.get("tags") or ""),
    )
    evaluate(conn)
    conn.commit()
    return entry_id


def add_location(conn, payload: dict) -> int:
    now = utcnow()
    cur = conn.execute(
        """INSERT INTO locations(world_id, name, dimension, x, y, z, description, tags, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload["world_id"],
            payload["name"].strip(),
            payload.get("dimension") or "overworld",
            float(payload["x"]),
            float(payload["y"]),
            float(payload["z"]),
            payload.get("description") or "",
            payload.get("tags") or "",
            now,
            now,
        ),
    )
    location_id = cur.lastrowid
    conn.execute(
        """INSERT INTO events(world_id, location_id, event_type, importance, occurred_at, title, detail)
           VALUES (?, ?, 'location', 2, ?, ?, ?)""",
        (payload["world_id"], location_id, now, f"Location saved: {payload['name'].strip()}", payload.get("description") or ""),
    )
    conn.execute(
        "INSERT INTO search_fts(entity_type, entity_id, world_id, title, body, tags) VALUES ('location', ?, ?, ?, ?, ?)",
        (
            str(location_id),
            payload["world_id"],
            payload["name"],
            f"{payload.get('description') or ''} {payload['x']} {payload['y']} {payload['z']}",
            payload.get("tags") or "",
        ),
    )
    evaluate(conn)
    conn.commit()
    return location_id


def search(conn, query: str, limit: int = 50) -> list[dict]:
    text = query.strip()
    if not text:
        return []
    # FTS5 query syntax is not the same as a user phrase. Quote each token.
    tokens = [part.replace('"', "") for part in text.split() if part.strip()]
    if not tokens:
        return []
    match = " ".join(f'"{token}"' for token in tokens)
    try:
        rows = conn.execute(
            """SELECT entity_type, entity_id, world_id, title, body, tags
               FROM search_fts WHERE search_fts MATCH ? LIMIT ?""",
            (match, limit),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []
    return [dict(row) for row in rows]


def export_items_csv(conn, snapshot_id: str) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["item_id", "category", "source", "player_id", "quantity", "stack_count"])
    for row in conn.execute(
        "SELECT item_id, category, source, player_id, quantity, stack_count FROM item_totals WHERE snapshot_id = ? ORDER BY quantity DESC",
        (snapshot_id,),
    ):
        writer.writerow([row["item_id"], row["category"], row["source"], row["player_id"], row["quantity"], row["stack_count"]])
    return buffer.getvalue()


def export_report_html(conn, world_id: str) -> str:
    world = conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone()
    if world is None:
        raise KeyError("world not found")
    snapshots = [dict(row) for row in conn.execute("SELECT * FROM snapshots WHERE world_id = ? ORDER BY imported_at", (world_id,))]
    events = [dict(row) for row in conn.execute("SELECT occurred_at, event_type, title, detail FROM events WHERE world_id = ? ORDER BY occurred_at", (world_id,))]
    journal = [dict(row) for row in conn.execute("SELECT written_at, title, body, tags FROM journal_entries WHERE world_id = ? ORDER BY written_at", (world_id,))]
    payload = {"world": dict(world), "snapshots": snapshots, "events": events, "journal": journal}
    data = json.dumps(payload).replace("<", "\\u003c")
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{world['name']} report</title>
<style>body{{font-family:Georgia,serif;margin:2rem;background:#f6f3ea;color:#1c1a16}} table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid #ccc;padding:6px;text-align:left}}</style>
</head><body>
<h1>{world['name']}</h1>
<p>Self-contained Minecraft World Archaeologist report. Generated from stored snapshots. Chunk figures, where present, are LevelDB key counts, not block censuses.</p>
<div id="app"></div>
<script id="data" type="application/json">{data}</script>
<script>
const data = JSON.parse(document.getElementById('data').textContent);
const app = document.getElementById('app');
app.innerHTML = '<h2>Snapshots</h2><table><tr><th>Imported</th><th>Version</th><th>Chunk keys</th><th>Items</th></tr>' +
  data.snapshots.map(s => `<tr><td>${{s.imported_at}}</td><td>${{s.game_version || ''}}</td><td>${{s.chunk_count ?? 'unavailable'}} (${{s.chunk_count_quality}})</td><td>${{s.unique_item_count}}</td></tr>`).join('') +
  '</table><h2>Timeline</h2><ul>' + data.events.map(e => `<li>${{e.occurred_at}} — ${{e.title}}</li>`).join('') +
  '</ul><h2>Journal</h2>' + data.journal.map(j => `<h3>${{j.title}}</h3><p>${{j.body}}</p>`).join('');
</script></body></html>"""

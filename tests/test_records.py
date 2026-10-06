from archaeologist.services.achievements import evaluate
from archaeologist.services.import_service import ImportService
from archaeologist.services.records import add_journal, add_location, search
from tests.test_parsers import make_world


def test_search_and_journal(conn, tmp_path):
    world = make_world(tmp_path / "w", name="Castle World")
    job = ImportService(conn).run_sync(world)
    add_journal(conn, {"world_id": job["world_id"], "title": "Built the castle today", "body": "Finished the east wall.", "tags": "build"})
    add_location(conn, {"world_id": job["world_id"], "name": "Secret Base", "x": 100, "y": 64, "z": -20, "description": "under the hill", "tags": "base"})
    hits = search(conn, "castle")
    assert any(hit["entity_type"] == "journal" for hit in hits)
    base = search(conn, "Secret")
    assert any(hit["title"] == "Secret Base" for hit in base)
    evaluate(conn)
    unlocked = conn.execute("SELECT id FROM achievements WHERE unlocked_at IS NOT NULL").fetchall()
    assert any(row["id"] == "first_snapshot" for row in unlocked)


def test_large_item_search(conn):
    conn.execute("INSERT INTO worlds(id, platform, stable_key, name, first_seen_at, last_seen_at, created_at) VALUES ('w', 'bedrock', 'k', 'Big', 't', 't', 't')")
    conn.execute("INSERT INTO snapshots(id, world_id, fingerprint, imported_at, metadata_json) VALUES ('s', 'w', 'f', 't', '{}')")
    conn.executemany(
        "INSERT INTO item_totals(snapshot_id, player_id, item_id, category, quantity, stack_count, source) VALUES ('s', '', ?, 'other', 1, 1, 'inventory')",
        [(f"minecraft:item_{i}",) for i in range(5000)],
    )
    for i in range(5000):
        conn.execute(
            "INSERT INTO search_fts(entity_type, entity_id, world_id, title, body, tags) VALUES ('item', ?, 'w', ?, 'other', '')",
            (f"minecraft:item_{i}", f"minecraft:item_{i}"),
        )
    conn.commit()
    import time

    started = time.perf_counter()
    rows = conn.execute("SELECT item_id FROM item_totals WHERE item_id = ?", ("minecraft:item_4999",)).fetchall()
    elapsed = time.perf_counter() - started
    assert rows
    assert elapsed < 1.0
    hits = search(conn, "item_4999")
    assert hits

from datetime import datetime, timedelta, timezone

from archaeologist.services.analytics import insights, streak_info, world_analytics, world_health
from archaeologist.services.store import create_event, create_world, export_backup, import_backup


def test_streak_and_insights(conn):
    world_id = create_world(conn, {"name": "Survival"})
    today = datetime.now(timezone.utc).replace(microsecond=0)
    for offset in range(3):
        create_event(
            conn,
            {
                "world_id": world_id,
                "title": f"Day {offset}",
                "event_type": "note",
                "occurred_at": (today - timedelta(days=offset)).isoformat(),
            },
        )
    streak = streak_info(conn, world_id)
    assert streak["current"] == 3
    assert streak["longest"] >= 3
    assert insights(conn, world_id)
    health = world_health(conn, world_id)
    assert health["activity"] in {"low", "medium", "high"}


def test_economy_analytics(conn):
    world_id = create_world(conn, {"name": "Market"})
    create_event(conn, {"world_id": world_id, "title": "Sold emeralds", "event_type": "trade", "amount": 500000, "category": "Trading"})
    create_event(conn, {"world_id": world_id, "title": "Spent on castle", "event_type": "building", "amount": -120000, "category": "Construction"})
    data = world_analytics(conn, world_id)
    assert data["income"] == 500000
    assert data["spending"] == -120000
    assert data["balance"] == 380000
    assert data["balance_series"][-1]["balance"] == 380000


def test_backup_roundtrip(conn, tmp_path):
    world_id = create_world(conn, {"name": "Keep"})
    create_event(conn, {"world_id": world_id, "title": "Note", "event_type": "note"})
    payload = export_backup(conn)
    from archaeologist.db.connection import reset_connection

    other = reset_connection(tmp_path / "other.sqlite")
    imported = import_backup(other, payload, "replace")
    assert imported["worlds"] == 1
    assert other.execute("SELECT title FROM events").fetchone()["title"] == "Note"


def test_bad_backup(conn):
    import pytest

    from archaeologist.services.store import StoreError

    with pytest.raises(StoreError):
        import_backup(conn, {"format": "nope"}, "merge")


def test_large_event_page(conn):
    world_id = create_world(conn, {"name": "Big"})
    conn.executemany(
        """INSERT INTO events(id, world_id, event_type, category, title, description, occurred_at, created_at, updated_at)
           VALUES (?, ?, 'note', 'Notes', ?, '', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')""",
        [(f"e{i}", world_id, f"Event {i}") for i in range(10000)],
    )
    conn.commit()
    import time

    started = time.perf_counter()
    rows = conn.execute(
        "SELECT id FROM events WHERE world_id = ? ORDER BY occurred_at DESC LIMIT 50 OFFSET 200",
        (world_id,),
    ).fetchall()
    assert len(rows) == 50
    assert time.perf_counter() - started < 1

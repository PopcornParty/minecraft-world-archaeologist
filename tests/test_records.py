import pytest

from archaeologist.services.store import (
    StoreError,
    create_event,
    create_goal,
    create_player,
    create_world,
    delete_event,
    end_session,
    start_session,
    update_event,
    update_goal,
)


def world(conn):
    return create_world(conn, {"name": "Donut SMP", "currency_name": "coins", "edition": "Bedrock"})


def test_event_lifecycle(conn):
    world_id = world(conn)
    event_id = create_event(conn, {"world_id": world_id, "title": "Built castle", "event_type": "building", "amount": -120000, "category": "Construction"})
    update_event(conn, event_id, {"title": "Expanded castle", "amount": -100000})
    row = conn.execute("SELECT title, amount FROM events WHERE id = ?", (event_id,)).fetchone()
    assert row["title"] == "Expanded castle"
    assert conn.execute("SELECT SUM(amount) FROM transactions").fetchone()[0] == -100000
    delete_event(conn, event_id)
    assert conn.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0


def test_invalid_event(conn):
    with pytest.raises(StoreError):
        create_event(conn, {"world_id": "missing", "title": ""})


def test_goal_and_session(conn):
    world_id = world(conn)
    goal_id = create_goal(conn, {"world_id": world_id, "title": "Reach 10M", "target": 10})
    update_goal(conn, goal_id, {"current": 10})
    assert conn.execute("SELECT status FROM goals WHERE id = ?", (goal_id,)).fetchone()[0] == "completed"
    start_session(conn, world_id)
    end_session(conn, world_id)
    assert conn.execute("SELECT COUNT(*) FROM sessions WHERE ended_at IS NOT NULL").fetchone()[0] == 1
    with pytest.raises(StoreError):
        end_session(conn, world_id)


def test_player_and_item(conn):
    world_id = world(conn)
    create_player(conn, {"world_id": world_id, "name": "Oliver"})
    create_event(conn, {"world_id": world_id, "title": "Made 4000 diamonds", "event_type": "mining", "item_name": "Diamond", "item_delta": 4000, "player_name": "Oliver"})
    qty = conn.execute("SELECT quantity FROM item_records").fetchone()[0]
    assert qty == 4000
    assert conn.execute("SELECT last_seen FROM players WHERE name = 'Oliver'").fetchone()[0]

from fastapi.testclient import TestClient

from archaeologist.api.app import create_app


def test_api_flow(tmp_path, monkeypatch):
    monkeypatch.setenv("MWA_DATA_DIR", str(tmp_path))
    from archaeologist.db.connection import reset_connection

    reset_connection(tmp_path / "api.sqlite")
    client = TestClient(create_app())
    assert client.get("/api/health").json()["world_files"] is False
    world = client.post("/api/worlds", json={"name": "Friends SMP", "currency_name": "dollars"}).json()
    parsed = client.post("/api/parse", json={"text": "Spent 500k", "world_id": world["id"]}).json()
    assert parsed["amount"] == -500000
    created = client.post("/api/events", json={"world_id": world["id"], "title": parsed["title"], "event_type": "money", "amount": parsed["amount"]})
    assert created.status_code == 200
    dash = client.get("/api/dashboard").json()
    assert dash["current"]["balance"] == -500000
    backup = client.get("/api/backup").json()
    assert backup["format"] == "mwa-backup"
    rejected = client.post("/api/backup/import", json={"mode": "replace", "confirm": False, "data": backup})
    assert rejected.status_code == 400
    page = client.get("/", follow_redirects=True)
    assert page.status_code == 200
    assert "Archaeologist" in page.text

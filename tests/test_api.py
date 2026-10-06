from fastapi.testclient import TestClient

from archaeologist.api.app import create_app
from tests.test_parsers import make_world


def test_health_and_upload(tmp_path, monkeypatch):
    monkeypatch.setenv("MWA_DATA_DIR", str(tmp_path))
    from archaeologist.db.connection import reset_connection

    reset_connection(tmp_path / "api.sqlite")
    client = TestClient(create_app())
    assert client.get("/api/health").json()["platform_supported"] == ["bedrock"]
    world = make_world(tmp_path / "world")
    response = client.post("/api/import/path", json={"path": str(world)})
    assert response.status_code == 200
    job_id = response.json()["job_id"]
    job = {}
    for _ in range(50):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in {"done", "failed"}:
            break
    assert job["status"] == "done"
    dash = client.get("/api/dashboard").json()
    assert dash["current"]["name"] == "Survival World"
    assert client.get("/").status_code == 200

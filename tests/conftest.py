
import pytest


@pytest.fixture()
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("MWA_DATA_DIR", str(tmp_path))
    from archaeologist.db.connection import reset_connection

    return reset_connection(tmp_path / "test.sqlite")

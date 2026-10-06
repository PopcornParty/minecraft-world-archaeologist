import os
import tempfile
from pathlib import Path

import pytest

ROOT = Path(tempfile.mkdtemp(prefix="mwa-test-"))
os.environ["MWA_DATA_DIR"] = str(ROOT)


@pytest.fixture()
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("MWA_DATA_DIR", str(tmp_path))
    from archaeologist.db.connection import reset_connection

    return reset_connection(tmp_path / "test.sqlite")

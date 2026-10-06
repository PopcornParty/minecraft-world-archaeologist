from __future__ import annotations

import os
from pathlib import Path

from archaeologist.db.schema import connect

_connection = None


def data_dir() -> Path:
    override = os.environ.get("MWA_DATA_DIR")
    if override:
        path = Path(override)
    else:
        path = Path.home() / ".local" / "share" / "minecraft-world-archaeologist"
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "archaeologist.sqlite"


def get_connection():
    global _connection
    if _connection is None:
        _connection = connect(db_path())
    return _connection


def reset_connection(path: Path | None = None):
    global _connection
    if _connection is not None:
        _connection.close()
    _connection = connect(path or db_path())
    return _connection

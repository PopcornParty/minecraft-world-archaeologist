import zipfile

import pytest

from archaeologist.parsers.level_dat import LevelDatError, parse_level_dat
from archaeologist.parsers.mcworld import ImportFormatError, open_source
from archaeologist.services.import_service import ImportService
from tests.test_parsers import make_mcworld, make_world


def test_import_and_duplicate(conn, tmp_path):
    world = make_world(tmp_path / "Survival")
    service = ImportService(conn)
    first = service.run_sync(world)
    assert first["status"] == "done"
    assert first["duplicate"] == 0
    second = service.run_sync(world)
    assert second["duplicate"] == 1
    assert second["snapshot_id"] == first["snapshot_id"]
    assert conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0] == 1


def test_second_snapshot_and_compare(conn, tmp_path):
    first_dir = make_world(tmp_path / "a", diamonds=24, level=12, last_played=1_700_000_000)
    service = ImportService(conn)
    first = service.run_sync(first_dir)
    second_dir = make_world(tmp_path / "b", diamonds=61, level=20, last_played=1_700_000_000 + 86400)
    second = service.run_sync(second_dir)
    assert second["duplicate"] == 0
    from archaeologist.services.analysis import compare

    diff = compare(conn, first["snapshot_id"], second["snapshot_id"])
    diamond = next(row for row in diff["items"] if row["item_id"] == "minecraft:diamond")
    assert diamond["before"] == 24
    assert diamond["after"] == 61
    assert diamond["change"] == 37
    assert diff["players"][0]["level_change"] == 8


def test_mcworld_archive(conn, tmp_path):
    world = make_world(tmp_path / "folder")
    archive = make_mcworld(tmp_path / "world.mcworld", world)
    job = ImportService(conn).run_sync(archive)
    assert job["status"] == "done"
    assert conn.execute("SELECT name FROM worlds").fetchone()["name"] == "Survival World"


def test_java_world_rejected(conn, tmp_path):
    world = tmp_path / "java"
    world.mkdir()
    (world / "level.dat").write_bytes(b"\x1f\x8b\x08\x00")
    (world / "region").mkdir()
    job = ImportService(conn).run_sync(world)
    assert job["status"] == "failed"
    assert "Java" in job["error"]


def test_truncated_level_dat(tmp_path):
    with pytest.raises(LevelDatError):
        parse_level_dat(b"\x0a\x00\x00\x00\x10\x00\x00\x00not-enough")


def test_corrupt_zip(tmp_path):
    bad = tmp_path / "bad.mcworld"
    bad.write_bytes(b"not a zip")
    with pytest.raises(ImportFormatError):
        open_source(bad)


def test_zip_slip_rejected(tmp_path):
    archive = tmp_path / "evil.mcworld"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("../level.dat", b"nope")
    with pytest.raises(ImportFormatError):
        open_source(archive)


def test_missing_world(conn, tmp_path):
    job = ImportService(conn).run_sync(tmp_path / "missing")
    assert job["status"] == "failed"
    assert "does not exist" in job["error"]


def test_source_not_modified(conn, tmp_path):
    world = make_world(tmp_path / "safe")
    before = (world / "level.dat").read_bytes()
    ImportService(conn).run_sync(world)
    assert (world / "level.dat").read_bytes() == before


def test_empty_directory(conn, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    job = ImportService(conn).run_sync(empty)
    assert job["status"] == "failed"

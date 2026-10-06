import zipfile
from pathlib import Path

from archaeologist.parsers.nbt_le import read_root_compound, write_level_dat


def make_world(path: Path, name="Survival World", seed=123456789, diamonds=24, level=12, last_played=1_700_000_000, extra=None):
    path.mkdir(parents=True, exist_ok=True)
    (path / "db").mkdir(exist_ok=True)
    (path / "db" / "CURRENT").write_text("MANIFEST-000001\n", encoding="utf-8")
    compound = {
        "LevelName": name,
        "RandomSeed": seed,
        "LastPlayed": last_played,
        "Time": 24000,
        "GameType": 0,
        "Difficulty": 2,
        "Generator": 1,
        "SpawnX": 0,
        "SpawnY": 64,
        "SpawnZ": 0,
        "StorageVersion": 10,
        "NetworkVersion": 800,
        "lastOpenedWithVersion": [1, 21, 50, 0, 0],
        "commandsEnabled": 1,
        "Player": {
            "PlayerLevel": level,
            "Pos": [10.5, 70.0, -4.0],
            "DimensionId": 0,
            "Inventory": [
                {"Name": "minecraft:diamond", "Count": diamonds, "Slot": 0},
                {"Name": "minecraft:iron_ingot", "Count": 40, "Slot": 1},
            ],
        },
    }
    if extra:
        compound.update(extra)
    (path / "level.dat").write_bytes(write_level_dat(compound))
    (path / "levelname.txt").write_text(name, encoding="utf-8")
    return path


def make_mcworld(path: Path, world: Path) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for file in world.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(world))
    return path


def test_roundtrip_level_dat(tmp_path):
    world = make_world(tmp_path / "w")
    compound, _ = read_root_compound(world.joinpath("level.dat").read_bytes()[8:])
    assert compound["LevelName"] == "Survival World"
    assert compound["Player"]["Inventory"][0]["Count"] == 24

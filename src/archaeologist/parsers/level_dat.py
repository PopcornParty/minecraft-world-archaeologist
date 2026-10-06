"""Bedrock level.dat parsing.

File layout (modern worlds, storage version 10):
  bytes 0-3  int32 LE  storage version
  bytes 4-7  int32 LE  NBT payload length, excluding the header
  bytes 8+   uncompressed little-endian NBT compound
"""

from __future__ import annotations

import struct
from typing import Any

from archaeologist.parsers.nbt_le import NBTError, read_root_compound


class LevelDatError(ValueError):
    """level.dat is missing, truncated, or not Bedrock little-endian NBT."""


GAME_TYPES = {0: "Survival", 1: "Creative", 2: "Adventure", 6: "Spectator"}
DIFFICULTIES = {0: "Peaceful", 1: "Easy", 2: "Normal", 3: "Hard"}
GENERATORS = {0: "Old", 1: "Infinite", 2: "Flat", 5: "Void"}
DIMENSIONS = {0: "overworld", 1: "nether", 2: "the_end"}


def _version_list(value: Any) -> str | None:
    if not isinstance(value, list) or not value:
        return None
    parts = [str(int(part)) for part in value[:5]]
    return ".".join(parts)


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    return None


def _list_items(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and isinstance(value.get("items"), list):
        return value["items"]
    return []


def parse_item_stack(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = raw.get("Name") or raw.get("id") or raw.get("Item")
    if isinstance(name, int):
        name = f"legacy:{name}"
    if not isinstance(name, str) or not name:
        return None
    count = raw.get("Count", raw.get("count", 1))
    try:
        quantity = int(count)
    except (TypeError, ValueError):
        quantity = 1
    slot = raw.get("Slot")
    damage = raw.get("Damage")
    return {
        "item_id": name,
        "quantity": quantity,
        "slot": int(slot) if isinstance(slot, int) else None,
        "damage": int(damage) if isinstance(damage, int) else None,
    }


def parse_player_blob(raw: Any, player_key: str, display_name: str | None = None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    pos = raw.get("Pos") or raw.get("pos")
    coords = _list_items(pos) if not isinstance(pos, list) else pos
    x = y = z = None
    if len(coords) >= 3:
        try:
            x, y, z = float(coords[0]), float(coords[1]), float(coords[2])
        except (TypeError, ValueError):
            x = y = z = None
    dim = raw.get("DimensionId", raw.get("Dimension", raw.get("dimension")))
    dimension = DIMENSIONS.get(dim, str(dim) if dim is not None else None)
    inventories: dict[str, list[dict[str, Any]]] = {}
    for source, key in (
        ("inventory", "Inventory"),
        ("armor", "Armor"),
        ("offhand", "Offhand"),
        ("ender", "EnderChestInventory"),
        ("ender", "EnderItems"),
    ):
        stacks = []
        for item in _list_items(raw.get(key)):
            parsed = parse_item_stack(item)
            if parsed and parsed["quantity"]:
                stacks.append(parsed)
        if stacks:
            inventories.setdefault(source, []).extend(stacks)
    return {
        "player_key": player_key,
        "display_name": display_name or raw.get("Name") or ("Local player" if player_key == "local" else player_key),
        "dimension": dimension,
        "x": x,
        "y": y,
        "z": z,
        "level": _as_int(raw.get("PlayerLevel", raw.get("XpLevel"))),
        "xp_progress": raw.get("PlayerLevelProgress", raw.get("XpP")),
        "health": raw.get("Health"),
        "game_mode": _as_int(raw.get("PlayerGameMode", raw.get("playerGameType"))),
        "deaths": _as_int(raw.get("Deaths") if "Deaths" in raw else None),
        "inventories": inventories,
        "present_fields": sorted(raw.keys()),
    }


def parse_level_dat(data: bytes) -> dict[str, Any]:
    if len(data) < 12:
        raise LevelDatError("level.dat is too small to contain a Bedrock header")
    if data[:2] == b"\x1f\x8b":
        raise LevelDatError(
            "this level.dat is gzip-compressed, which is the Java Edition layout; "
            "Java worlds are not supported"
        )
    storage_version, payload_length = struct.unpack_from("<ii", data, 0)
    if storage_version < 0 or storage_version > 100:
        raise LevelDatError(f"unexpected level.dat storage version {storage_version}")
    if payload_length <= 0:
        raise LevelDatError("level.dat payload length is empty")
    payload = data[8 : 8 + payload_length]
    if len(payload) < payload_length:
        raise LevelDatError(
            f"level.dat is truncated: header says {payload_length} bytes, file has {len(payload)}"
        )
    try:
        compound, consumed = read_root_compound(payload)
    except NBTError as exc:
        raise LevelDatError(f"level.dat NBT could not be read: {exc}") from exc
    if consumed < 8:
        raise LevelDatError("level.dat NBT compound is implausibly small")

    version = _version_list(compound.get("lastOpenedWithVersion"))
    min_version = _version_list(compound.get("MinimumCompatibleClientVersion"))
    player = compound.get("Player")
    players = []
    if isinstance(player, dict) and player:
        players.append(parse_player_blob(player, "local"))

    experiments = compound.get("experiments")
    experiment_names = sorted(experiments.keys()) if isinstance(experiments, dict) else []

    return {
        "storage_version": storage_version,
        "header_length": payload_length,
        "nbt_bytes_consumed": consumed,
        "level_name": compound.get("LevelName"),
        "seed": compound.get("RandomSeed"),
        "last_played": _as_int(compound.get("LastPlayed")),
        "time_ticks": _as_int(compound.get("Time")),
        "game_type": _as_int(compound.get("GameType")),
        "game_type_name": GAME_TYPES.get(_as_int(compound.get("GameType")) or -1),
        "difficulty": _as_int(compound.get("Difficulty")),
        "difficulty_name": DIFFICULTIES.get(_as_int(compound.get("Difficulty")) or -1),
        "generator": _as_int(compound.get("Generator")),
        "generator_name": GENERATORS.get(_as_int(compound.get("Generator")) or -1),
        "spawn": {
            "x": _as_int(compound.get("SpawnX")),
            "y": _as_int(compound.get("SpawnY")),
            "z": _as_int(compound.get("SpawnZ")),
        },
        "game_version": version,
        "minimum_compatible_version": min_version,
        "network_version": _as_int(compound.get("NetworkVersion")),
        "commands_enabled": compound.get("commandsEnabled"),
        "cheats_enabled": compound.get("cheatsEnabled"),
        "education": bool(compound.get("educationFeaturesEnabled") or compound.get("eduOffer")),
        "experiments": experiment_names,
        "biome_override": compound.get("BiomeOverride"),
        "players": players,
        "has_embedded_player": bool(players),
        "raw": compound,
    }

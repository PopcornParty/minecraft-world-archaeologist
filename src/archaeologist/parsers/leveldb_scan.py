"""Read Bedrock LevelDB table indexes without modifying the database.

Bedrock uses a Mojang fork of LevelDB. Chunk values may use a custom
compression type. This scanner reads table footers and index blocks when they
are uncompressed or zlib-compressed, then falls back to a bounded key scan.

It never writes to the world directory.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path
from typing import Any

from archaeologist.parsers.level_dat import parse_player_blob
from archaeologist.parsers.nbt_le import NBTError, read_root_compound

MAGIC = 0xDB4775248B80FB57
SUBCHUNK_TAGS = {0x2F, 0x2B, 0x2D, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x39, 0x3A, 0x3B, 0x3C, 0x76, 0x77}
DIMENSION_FROM_KEY = {0: "overworld", 1: "nether", 2: "the_end"}


class _Cursor:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def varint(self) -> int:
        result = 0
        shift = 0
        for _ in range(10):
            if self.pos >= len(self.data):
                raise ValueError("truncated varint")
            byte = self.data[self.pos]
            self.pos += 1
            result |= (byte & 0x7F) << shift
            if byte < 128:
                return result
            shift += 7
        raise ValueError("varint too long")


def _decompress_block(raw: bytes, compression: int) -> bytes | None:
    if compression == 0:
        return raw
    if compression in (2, 4):
        try:
            return zlib.decompress(raw)
        except zlib.error:
            try:
                return zlib.decompress(raw, wbits=-15)
            except zlib.error:
                return None
    return None


def _decode_entries(block: bytes) -> list[tuple[bytes, bytes]]:
    if len(block) < 4:
        return []
    restart_count = struct.unpack_from("<I", block, len(block) - 4)[0]
    if restart_count > 100_000:
        return []
    cursor = _Cursor(block)
    end = len(block) - 4 - (restart_count * 4)
    entries: list[tuple[bytes, bytes]] = []
    key = b""
    while cursor.pos < end:
        try:
            shared = cursor.varint()
            unshared = cursor.varint()
            value_len = cursor.varint()
        except ValueError:
            break
        if cursor.pos + unshared + value_len > end:
            break
        key = key[:shared] + cursor.data[cursor.pos : cursor.pos + unshared]
        cursor.pos += unshared
        value = cursor.data[cursor.pos : cursor.pos + value_len]
        cursor.pos += value_len
        entries.append((key, value))
        if len(entries) > 2_000_000:
            break
    return entries


def _read_index(table: bytes) -> tuple[list[tuple[bytes, bytes]], str]:
    if len(table) < 48:
        return [], "table too small"
    magic = struct.unpack_from("<Q", table, len(table) - 8)[0]
    if magic != MAGIC:
        return [], "not a leveldb table footer"
    handle = table[20:40]
    cursor = _Cursor(handle)
    try:
        offset = cursor.varint()
        size = cursor.varint()
    except ValueError:
        return [], "index handle unreadable"
    if offset < 0 or size <= 0 or offset + size + 5 > len(table):
        return [], "index block out of range"
    raw = table[offset : offset + size]
    compression = table[offset + size]
    decoded = _decompress_block(raw, compression)
    if decoded is None:
        return [], f"index compression {compression} is not readable without snappy"
    return _decode_entries(decoded), "index"


def _chunk_from_key(key: bytes) -> tuple[int, int, str] | None:
    if len(key) == 9:
        x, z = struct.unpack_from("<ii", key, 0)
        tag = key[8]
        if tag in SUBCHUNK_TAGS:
            return x, z, "overworld"
    if len(key) == 10:
        x, z = struct.unpack_from("<ii", key, 0)
        tag = key[8]
        if tag in SUBCHUNK_TAGS:
            return x, z, "overworld"
    if len(key) == 13:
        x, z, dim = struct.unpack_from("<iii", key, 0)
        tag = key[12]
        if tag in SUBCHUNK_TAGS:
            return x, z, DIMENSION_FROM_KEY.get(dim, f"dim_{dim}")
    if len(key) == 14:
        x, z, dim = struct.unpack_from("<iii", key, 0)
        tag = key[12]
        if tag in SUBCHUNK_TAGS:
            return x, z, DIMENSION_FROM_KEY.get(dim, f"dim_{dim}")
    return None


def _player_from_value(key: bytes, value: bytes) -> dict[str, Any] | None:
    text = key.decode("latin1", errors="ignore")
    if text == "~local_player":
        player_key = "local"
        name = "Local player"
    elif text.startswith("player_"):
        player_key = text
        name = text
    else:
        return None
    for offset in (0, 4, 8):
        try:
            compound, _ = read_root_compound(value, offset)
        except NBTError:
            continue
        if compound:
            return parse_player_blob(compound, player_key, name)
    return {"player_key": player_key, "display_name": name, "inventories": {}, "parse_note": "player key found but NBT payload was not readable"}


def scan_leveldb(db_dir: Path, progress=None) -> dict[str, Any]:
    if not db_dir.is_dir():
        return {
            "available": False,
            "quality": "unavailable",
            "reason": "no db directory",
            "chunk_count": None,
            "chunks_by_dimension": {},
            "players": [],
            "db_bytes": 0,
            "tables_read": 0,
            "tables_unreadable": 0,
        }
    files = [path for path in db_dir.iterdir() if path.is_file()]
    db_bytes = sum(path.stat().st_size for path in files)
    tables = [path for path in files if path.suffix == ".ldb" or path.suffix == ".sst"]
    chunks: set[tuple[int, int, str]] = set()
    players: dict[str, dict[str, Any]] = {}
    readable = 0
    unreadable = 0
    reasons: list[str] = []
    for index, table in enumerate(tables):
        if progress and index % 5 == 0:
            progress(f"Reading LevelDB table {index + 1}/{len(tables)}")
        data = table.read_bytes()
        entries, status = _read_index(data)
        if not entries:
            unreadable += 1
            if status not in reasons:
                reasons.append(status)
            raw_players = _scan_player_keys(data)
            for player in raw_players:
                players.setdefault(player["player_key"], player)
            continue
        readable += 1
        for key, value in entries:
            chunk = _chunk_from_key(key)
            if chunk:
                chunks.add(chunk)
            if key == b"~local_player" or key.startswith(b"player_"):
                # Index values are block handles, not player NBT. Record the key;
                # payload extraction is a separate bounded scan below.
                players.setdefault(
                    key.decode("latin1", errors="ignore").replace("~local_player", "local"),
                    {"player_key": "local" if key == b"~local_player" else key.decode("latin1"), "display_name": "Local player" if key == b"~local_player" else key.decode("latin1"), "inventories": {}, "parse_note": "player key present in LevelDB index"},
                )
        raw_players = _scan_player_keys(data)
        for player in raw_players:
            existing = players.get(player["player_key"], {})
            if player.get("inventories") or not existing.get("inventories"):
                players[player["player_key"]] = {**existing, **player}
    by_dim: dict[str, int] = {}
    for _x, _z, dim in chunks:
        by_dim[dim] = by_dim.get(dim, 0) + 1
    quality = "measured" if readable else "unavailable"
    return {
        "available": True,
        "quality": quality,
        "reason": None if readable else "; ".join(reasons) or "no tables",
        "chunk_count": len(chunks) if readable else None,
        "chunks_by_dimension": by_dim if readable else {},
        "players": list(players.values()),
        "db_bytes": db_bytes,
        "tables_read": readable,
        "tables_unreadable": unreadable,
        "table_count": len(tables),
        "note": (
            "Chunk count is the number of distinct chunk keys observed in readable LevelDB indexes. "
            "It is not a block census and does not include every historical chunk if a table index could not be decoded."
        ),
    }


def _scan_player_keys(data: bytes) -> list[dict[str, Any]]:
    found = []
    for marker in (b"~local_player", b"player_"):
        start = 0
        while True:
            at = data.find(marker, start)
            if at < 0:
                break
            blob_start = at + len(marker)
            # Try a few nearby offsets; values are not aligned to the key in SST blocks.
            for delta in range(0, 64):
                candidate = data[blob_start + delta : blob_start + delta + 200_000]
                if not candidate or candidate[0] != 0x0A:
                    continue
                try:
                    compound, _ = read_root_compound(candidate)
                except NBTError:
                    continue
                if "Inventory" in compound or "Pos" in compound or "PlayerLevel" in compound:
                    key = "~local_player" if marker == b"~local_player" else "player_scan"
                    found.append(parse_player_blob(compound, "local" if marker == b"~local_player" else key))
                    break
            start = at + len(marker)
            if len(found) > 32:
                return found
    return found

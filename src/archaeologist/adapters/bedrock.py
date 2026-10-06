"""Bedrock Edition world adapter.

Reads level.dat and, when the LevelDB index is readable, chunk-key coverage
and player keys. Does not write to the source world.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from archaeologist.adapters.base import ParsedWorld
from archaeologist.parsers.level_dat import LevelDatError, parse_level_dat
from archaeologist.parsers.leveldb_scan import scan_leveldb


def _stream_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class BedrockAdapter:
    platform = "bedrock"

    def detect(self, world_dir: Path) -> bool:
        level = world_dir / "level.dat"
        if not level.is_file():
            return False
        head = level.read_bytes()[:2]
        return head != b"\x1f\x8b"

    def parse(self, world_dir: Path, source_kind: str, source_path: str, progress=None) -> ParsedWorld:
        if progress:
            progress("Reading level.dat")
        level_path = world_dir / "level.dat"
        if not level_path.is_file():
            raise LevelDatError("missing level.dat")
        level_bytes = level_path.read_bytes()
        level = parse_level_dat(level_bytes)
        name = level.get("level_name")
        if not isinstance(name, str) or not name.strip():
            name_file = world_dir / "levelname.txt"
            name = name_file.read_text(encoding="utf-8", errors="replace").strip() if name_file.is_file() else "Unnamed world"
        level["level_name"] = name
        if progress:
            progress("Hashing world files")
        digest = hashlib.sha256()
        digest.update(level_bytes)
        preserved = ["level.dat"]
        for extra in ("levelname.txt", "world_icon.jpeg"):
            extra_path = world_dir / extra
            if extra_path.is_file():
                digest.update(extra.encode())
                digest.update(_stream_hash(extra_path).encode())
                preserved.append(extra)
        db_dir = world_dir / "db"
        if db_dir.is_dir():
            for db_file in sorted(path for path in db_dir.iterdir() if path.is_file()):
                digest.update(db_file.name.encode())
                digest.update(str(db_file.stat().st_size).encode())
                digest.update(_stream_hash(db_file).encode())
        if progress:
            progress("Scanning LevelDB keys")
        db = scan_leveldb(db_dir, progress=progress)
        players = list(level.get("players") or [])
        seen = {player["player_key"] for player in players}
        warnings = []
        for player in db.get("players") or []:
            if player.get("player_key") not in seen:
                players.append(player)
                seen.add(player["player_key"])
            elif player.get("inventories") and not any(item.get("inventories") for item in players if item.get("player_key") == player.get("player_key")):
                for existing in players:
                    if existing.get("player_key") == player.get("player_key"):
                        existing.update({k: v for k, v in player.items() if v not in (None, {}, [])})
        if not players:
            warnings.append("No player inventory was embedded in level.dat. Local player data may live only in the LevelDB actor store.")
        if db.get("quality") != "measured":
            warnings.append("Chunk keys could not be measured from the LevelDB index. World size is reported from database bytes only.")
        seed = level.get("seed")
        spawn = level.get("spawn") or {}
        stable = f"bedrock|{seed}|{name.strip().lower()}|{spawn.get('x')}|{spawn.get('z')}"
        return ParsedWorld(
            platform=self.platform,
            name=name.strip(),
            seed=None if seed is None else str(seed),
            stable_key=stable,
            fingerprint=digest.hexdigest(),
            level=level,
            players=players,
            db=db,
            source_kind=source_kind,
            source_path=source_path,
            preserved_files=preserved,
            warnings=warnings,
        )

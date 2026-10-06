"""Java Edition adapter slot.

Detection exists so a Java world fails with an explicit message. Parsing is
not implemented and must not be reported as supported.
"""

from __future__ import annotations

from pathlib import Path

from archaeologist.adapters.base import ParsedWorld, UnsupportedPlatform


class JavaAdapter:
    platform = "java"

    def detect(self, world_dir: Path) -> bool:
        level = world_dir / "level.dat"
        region = world_dir / "region"
        if not level.is_file():
            return False
        if level.read_bytes()[:2] == b"\x1f\x8b":
            return True
        return region.is_dir()

    def parse(self, world_dir: Path, source_kind: str, source_path: str, progress=None) -> ParsedWorld:
        raise UnsupportedPlatform(
            "Java Edition worlds use gzip big-endian level.dat and region files. "
            "This build only parses Bedrock Edition. The Java adapter is a placeholder so the format is rejected clearly."
        )

"""Source adapters. Only Bedrock is implemented."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


@dataclass
class ParsedWorld:
    platform: str
    name: str
    seed: str | None
    stable_key: str
    fingerprint: str
    level: dict[str, Any]
    players: list[dict[str, Any]]
    db: dict[str, Any]
    source_kind: str
    source_path: str
    preserved_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class MinecraftSource(Protocol):
    platform: str

    def detect(self, world_dir: Path) -> bool:
        ...

    def parse(self, world_dir: Path, source_kind: str, source_path: str, progress=None) -> ParsedWorld:
        ...


class UnsupportedPlatform(RuntimeError):
    """Raised when a future adapter is asked to parse a format it does not support."""

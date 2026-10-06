"""Archive and world-directory discovery. Source files are only read."""

from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path


class ImportFormatError(ValueError):
    """The path is not a readable Bedrock world or .mcworld archive."""


def is_world_dir(path: Path) -> bool:
    return path.is_dir() and (path / "level.dat").is_file()


def extract_mcworld(archive: Path, dest: Path) -> Path:
    if not zipfile.is_zipfile(archive):
        raise ImportFormatError(f"{archive.name} is not a zip/.mcworld archive")
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        if not names:
            raise ImportFormatError("archive is empty")
        if any(name.startswith("/") or ".." in Path(name).parts for name in names):
            raise ImportFormatError("archive contains unsafe paths and was not extracted")
        total = sum(info.file_size for info in zf.infolist())
        if total > 8 * 1024 * 1024 * 1024:
            raise ImportFormatError("archive expands beyond the 8 GiB safety limit")
        zf.extractall(dest)
    world = find_world_root(dest)
    if world is None:
        raise ImportFormatError("archive does not contain a Bedrock level.dat")
    return world


def find_world_root(path: Path) -> Path | None:
    if is_world_dir(path):
        return path
    if not path.is_dir():
        return None
    matches = [candidate for candidate in path.rglob("level.dat") if candidate.is_file()]
    if not matches:
        return None
    matches.sort(key=lambda item: len(item.parts))
    return matches[0].parent


def open_source(source: Path) -> tuple[Path, Path | None]:
    """Return (world_dir, temp_dir). Caller must delete temp_dir if set."""
    if source.is_dir():
        world = find_world_root(source)
        if world is None:
            raise ImportFormatError(f"{source} does not contain level.dat")
        return world, None
    if source.is_file() and source.suffix.lower() in {".mcworld", ".zip"}:
        temp = Path(tempfile.mkdtemp(prefix="mwa-import-"))
        try:
            world = extract_mcworld(source, temp)
        except Exception:
            shutil.rmtree(temp, ignore_errors=True)
            raise
        return world, temp
    raise ImportFormatError("import a Bedrock world folder or a .mcworld/.zip archive")

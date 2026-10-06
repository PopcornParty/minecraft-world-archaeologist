"""Little-endian NBT reader and writer used by Bedrock Edition.

Bedrock stores NBT little-endian and, in level.dat, uncompressed. Java Edition
uses big-endian NBT, usually gzip-compressed. This module does not claim to
read Java NBT.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Any

TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12

_TAG_NAMES = {
    TAG_END: "end",
    TAG_BYTE: "byte",
    TAG_SHORT: "short",
    TAG_INT: "int",
    TAG_LONG: "long",
    TAG_FLOAT: "float",
    TAG_DOUBLE: "double",
    TAG_BYTE_ARRAY: "byte_array",
    TAG_STRING: "string",
    TAG_LIST: "list",
    TAG_COMPOUND: "compound",
    TAG_INT_ARRAY: "int_array",
    TAG_LONG_ARRAY: "long_array",
}


class NBTError(ValueError):
    """Raised when a buffer is not valid little-endian NBT."""


@dataclass
class NamedTag:
    name: str
    tag_type: int
    value: Any


class _Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def remaining(self) -> int:
        return len(self.data) - self.pos

    def read(self, n: int) -> bytes:
        if n < 0 or self.pos + n > len(self.data):
            raise NBTError(f"unexpected end of NBT at offset {self.pos}, need {n} bytes")
        chunk = self.data[self.pos : self.pos + n]
        self.pos += n
        return chunk

    def u8(self) -> int:
        return self.read(1)[0]

    def i8(self) -> int:
        return struct.unpack("<b", self.read(1))[0]

    def i16(self) -> int:
        return struct.unpack("<h", self.read(2))[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.read(2))[0]

    def i32(self) -> int:
        return struct.unpack("<i", self.read(4))[0]

    def i64(self) -> int:
        return struct.unpack("<q", self.read(8))[0]

    def f32(self) -> float:
        return struct.unpack("<f", self.read(4))[0]

    def f64(self) -> float:
        return struct.unpack("<d", self.read(8))[0]

    def string(self) -> str:
        length = self.u16()
        raw = self.read(length)
        return raw.decode("utf-8", errors="replace")


def _read_payload(reader: _Reader, tag_type: int) -> Any:
    if tag_type == TAG_BYTE:
        return reader.i8()
    if tag_type == TAG_SHORT:
        return reader.i16()
    if tag_type == TAG_INT:
        return reader.i32()
    if tag_type == TAG_LONG:
        return reader.i64()
    if tag_type == TAG_FLOAT:
        return reader.f32()
    if tag_type == TAG_DOUBLE:
        return reader.f64()
    if tag_type == TAG_BYTE_ARRAY:
        length = reader.i32()
        if length < 0 or length > reader.remaining():
            raise NBTError(f"invalid byte array length {length}")
        return list(reader.read(length))
    if tag_type == TAG_STRING:
        return reader.string()
    if tag_type == TAG_LIST:
        item_type = reader.u8()
        length = reader.i32()
        if length < 0 or length > 5_000_000:
            raise NBTError(f"invalid list length {length}")
        return [_read_payload(reader, item_type) for _ in range(length)]
    if tag_type == TAG_COMPOUND:
        out: dict[str, Any] = {}
        while True:
            child_type = reader.u8()
            if child_type == TAG_END:
                break
            name = reader.string()
            out[name] = _read_payload(reader, child_type)
        return out
    if tag_type == TAG_INT_ARRAY:
        length = reader.i32()
        if length < 0 or length > 5_000_000:
            raise NBTError(f"invalid int array length {length}")
        return [reader.i32() for _ in range(length)]
    if tag_type == TAG_LONG_ARRAY:
        length = reader.i32()
        if length < 0 or length > 5_000_000:
            raise NBTError(f"invalid long array length {length}")
        return [reader.i64() for _ in range(length)]
    raise NBTError(f"unknown NBT tag type {tag_type}")


def read_named(data: bytes, offset: int = 0) -> tuple[NamedTag, int]:
    reader = _Reader(data)
    reader.pos = offset
    tag_type = reader.u8()
    if tag_type == TAG_END:
        return NamedTag("", TAG_END, None), reader.pos
    name = reader.string()
    value = _read_payload(reader, tag_type)
    return NamedTag(name, tag_type, value), reader.pos


def read_root_compound(data: bytes, offset: int = 0) -> tuple[dict[str, Any], int]:
    tag, pos = read_named(data, offset)
    if tag.tag_type != TAG_COMPOUND or not isinstance(tag.value, dict):
        raise NBTError("root tag is not a compound")
    return tag.value, pos


class _Writer:
    def __init__(self) -> None:
        self.parts: list[bytes] = []

    def bytes(self) -> bytes:
        return b"".join(self.parts)

    def write(self, data: bytes) -> None:
        self.parts.append(data)

    def u8(self, value: int) -> None:
        self.write(bytes([value & 0xFF]))

    def string(self, value: str) -> None:
        raw = value.encode("utf-8")
        if len(raw) > 65535:
            raise NBTError("string too long for NBT")
        self.write(struct.pack("<H", len(raw)))
        self.write(raw)


def _infer_type(value: Any) -> int:
    if isinstance(value, bool):
        return TAG_BYTE
    if isinstance(value, int) and not isinstance(value, bool):
        if -128 <= value <= 127:
            return TAG_BYTE
        if -2147483648 <= value <= 2147483647:
            return TAG_INT
        return TAG_LONG
    if isinstance(value, float):
        return TAG_DOUBLE
    if isinstance(value, str):
        return TAG_STRING
    if isinstance(value, dict):
        return TAG_COMPOUND
    if isinstance(value, list):
        return TAG_LIST
    raise NBTError(f"cannot encode {type(value).__name__}")


def _write_payload(writer: _Writer, tag_type: int, value: Any) -> None:
    if tag_type == TAG_BYTE:
        writer.write(struct.pack("<b", int(value)))
    elif tag_type == TAG_SHORT:
        writer.write(struct.pack("<h", int(value)))
    elif tag_type == TAG_INT:
        writer.write(struct.pack("<i", int(value)))
    elif tag_type == TAG_LONG:
        writer.write(struct.pack("<q", int(value)))
    elif tag_type == TAG_FLOAT:
        writer.write(struct.pack("<f", float(value)))
    elif tag_type == TAG_DOUBLE:
        writer.write(struct.pack("<d", float(value)))
    elif tag_type == TAG_STRING:
        writer.string(str(value))
    elif tag_type == TAG_COMPOUND:
        for key, child in value.items():
            child_type = _infer_type(child)
            writer.u8(child_type)
            writer.string(str(key))
            _write_payload(writer, child_type, child)
        writer.u8(TAG_END)
    elif tag_type == TAG_LIST:
        items = list(value)
        item_type = _infer_type(items[0]) if items else TAG_END
        writer.u8(item_type)
        writer.write(struct.pack("<i", len(items)))
        for item in items:
            _write_payload(writer, item_type, item)
    elif tag_type == TAG_BYTE_ARRAY:
        raw = bytes(value)
        writer.write(struct.pack("<i", len(raw)))
        writer.write(raw)
    elif tag_type == TAG_INT_ARRAY:
        writer.write(struct.pack("<i", len(value)))
        for item in value:
            writer.write(struct.pack("<i", int(item)))
    elif tag_type == TAG_LONG_ARRAY:
        writer.write(struct.pack("<i", len(value)))
        for item in value:
            writer.write(struct.pack("<q", int(item)))
    else:
        raise NBTError(f"cannot write tag type {tag_type}")


def write_root_compound(name: str, value: dict[str, Any]) -> bytes:
    writer = _Writer()
    writer.u8(TAG_COMPOUND)
    writer.string(name)
    _write_payload(writer, TAG_COMPOUND, value)
    return writer.bytes()


def write_level_dat(compound: dict[str, Any], storage_version: int = 10) -> bytes:
    """Write a Bedrock level.dat: 8-byte header plus little-endian NBT."""
    payload = write_root_compound("", compound)
    header = struct.pack("<ii", storage_version, len(payload))
    return header + payload

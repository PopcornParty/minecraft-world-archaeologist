"""Deterministic quick-entry parser. Not a language model."""

from __future__ import annotations

import re

EVENT_TYPES = [
    ("money", "Money"),
    ("mining", "Mining"),
    ("building", "Building"),
    ("combat", "Combat"),
    ("exploration", "Exploration"),
    ("inventory", "Inventory"),
    ("achievement", "Achievement"),
    ("death", "Death"),
    ("player", "Player"),
    ("trade", "Trade"),
    ("note", "Note"),
    ("goal", "Goal"),
]

TYPE_CATEGORY = {
    "money": "Miscellaneous",
    "mining": "Mining",
    "building": "Construction",
    "combat": "Combat",
    "exploration": "Exploration",
    "inventory": "Inventory",
    "achievement": "Progress",
    "death": "Combat",
    "player": "Social",
    "trade": "Trading",
    "note": "Notes",
    "goal": "Goals",
}

_AMOUNT = re.compile(
    r"(?P<sign>\+|-)?"
    r"(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)"
    r"\s*(?P<suffix>[kKmMbB])?"
)
_STACKS = re.compile(r"(?P<num>\d+)\s+stacks?\s+of\s+(?P<item>[a-zA-Z][a-zA-Z0-9_ ]{0,40})", re.I)
_ITEM_QTY = re.compile(
    r"(?P<verb>made|mined|found|got|collected|gained|sold|used|spent|lost)\s+"
    r"(?P<num>\d{1,3}(?:,\d{3})+|\d+)\s+(?P<item>[a-zA-Z][a-zA-Z0-9_ ]{0,32})",
    re.I,
)
_COUNT_WORDS = {"once": 1, "one": 1, "twice": 2, "two": 2, "thrice": 3, "three": 3}


def _scale(number: str, suffix: str | None) -> float:
    value = float(number.replace(",", ""))
    if suffix:
        value *= {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}[suffix.lower()]
    return value


def _money(text: str) -> float | None:
    spend = bool(re.search(r"\b(spent|spend|paid|bought|cost|lost)\b", text, re.I))
    income = bool(re.search(r"\b(earned|sold for|received|gained|profit|income)\b", text, re.I))
    match = _AMOUNT.search(text)
    if not match:
        return None
    if not (spend or income or match.group("suffix") or match.group("sign")):
        return None
    value = _scale(match.group("num"), match.group("suffix"))
    if match.group("sign") == "-":
        return -value
    if match.group("sign") == "+":
        return value
    if spend and not income:
        return -value
    if income and not spend:
        return value
    if spend:
        return -value
    return value


def _event_type(text: str) -> str:
    lowered = text.lower()
    rules = [
        ("death", ("died", "death", "deaths")),
        ("player", ("joined", "left the", "logged on")),
        ("trade", ("sold", "bought", "traded", "trade")),
        ("building", ("built", "build", "expanded", "constructed", "castle", "farm", "base")),
        ("mining", ("mined", "mining", "diamonds", "ancient debris")),
        ("combat", ("pvp", "won", "lost a fight", "killed")),
        ("exploration", ("found a", "explored", "discovered", "location", "nether", "the end")),
        ("achievement", ("elytra", "unlocked", "achievement")),
        ("goal", ("goal",)),
        ("inventory", ("inventory", "picked up")),
        ("money", ("spent", "earned", "paid", "balance")),
    ]
    for name, words in rules:
        if any(word in lowered for word in words):
            return name
    return "note"


def _item(text: str) -> tuple[str | None, float | None]:
    stacks = _STACKS.search(text)
    if stacks:
        name = stacks.group("item").strip().rstrip(".")
        delta = float(stacks.group("num")) * 64
        if re.search(r"\b(sold|used|spent|lost)\b", text, re.I):
            delta = -delta
        return name, delta
    found = _ITEM_QTY.search(text)
    if not found:
        if re.search(r"\belytra\b", text, re.I):
            return "Elytra", 1
        return None, None
    name = found.group("item").strip().rstrip(".")
    delta = float(found.group("num").replace(",", ""))
    if found.group("verb").lower() in {"sold", "used", "spent", "lost"}:
        delta = -delta
    return name, delta


def _player(text: str, known: list[str]) -> str | None:
    for name in sorted(known, key=len, reverse=True):
        if name and re.search(rf"\b{re.escape(name)}\b", text, re.I):
            return name
    joined = re.search(r"\b([A-Z][A-Za-z0-9_]{1,20})\s+(joined|left)\b", text)
    if joined:
        return joined.group(1)
    return None


def _deaths(text: str) -> int | None:
    if not re.search(r"\b(died|death|deaths)\b", text, re.I):
        return None
    numbered = re.search(r"\b(\d+)\b", text)
    if numbered:
        return int(numbered.group(1))
    for word, count in _COUNT_WORDS.items():
        if re.search(rf"\b{word}\b", text, re.I):
            return count
    return 1


def parse_quick(text: str, players: list[str] | None = None) -> dict:
    raw = " ".join(text.strip().split())
    if not raw:
        return {"ok": False, "error": "Enter what happened."}
    event_type = _event_type(raw)
    amount = _money(raw)
    item_name, item_delta = _item(raw)
    player = _player(raw, players or [])
    deaths = _deaths(raw)
    if amount is not None and event_type == "note":
        event_type = "money"
    if item_delta is not None and event_type in {"note", "money"}:
        event_type = "mining" if item_delta > 0 else "inventory"
    title = raw[:120]
    return {
        "ok": True,
        "source": "rules",
        "event_type": event_type,
        "category": TYPE_CATEGORY[event_type],
        "title": title,
        "description": raw,
        "amount": amount,
        "item_name": item_name,
        "item_delta": item_delta,
        "player_name": player,
        "death_count": deaths,
        "editable": True,
    }

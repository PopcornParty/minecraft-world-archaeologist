"""Item categories and achievement definitions. Achievements unlock from stored data only."""

from __future__ import annotations

ACHIEVEMENTS = [
    ("first_snapshot", "First snapshot", "Import the first world snapshot."),
    ("world_historian", "World historian", "Record 10 snapshots."),
    ("archivist", "Archivist", "Record 100 snapshots."),
    ("long_haul", "Long haul", "Track a world across a 30-day span of snapshot dates."),
    ("collector", "Collector", "Observe at least 50 distinct item ids."),
    ("explorer", "Explorer", "Measure at least 500 distinct chunk keys in one snapshot."),
    ("cartographer", "Cartographer", "Save 5 custom locations."),
    ("journal_keeper", "Journal keeper", "Write 5 journal entries."),
    ("comparator", "Comparator", "Run a snapshot comparison."),
    ("second_look", "Second look", "Import two different snapshots of the same world."),
]


def categorize(item_id: str) -> str:
    name = item_id.lower().removeprefix("minecraft:")
    if any(token in name for token in ("diamond", "emerald", "netherite", "ancient_debris")):
        return "rare"
    if any(token in name for token in ("iron", "gold", "copper", "coal", "lapis", "redstone", "quartz")):
        return "mineral"
    if any(token in name for token in ("sword", "pickaxe", "axe", "shovel", "hoe", "helmet", "chestplate", "leggings", "boots", "bow", "shield")):
        return "equipment"
    if any(token in name for token in ("log", "planks", "stem", "hyphae")):
        return "wood"
    if "food" in name or name in {"bread", "apple", "cooked_beef", "cooked_porkchop", "cooked_chicken", "golden_apple", "enchanted_golden_apple"}:
        return "food"
    if name.endswith("_spawn_egg"):
        return "spawn_egg"
    return "other"

from archaeologist.services.parse import parse_quick


def test_building_spend():
    parsed = parse_quick("Built castle and spent 120k on materials")
    assert parsed["event_type"] == "building"
    assert parsed["amount"] == -120_000
    assert parsed["category"] == "Construction"
    assert parsed["source"] == "rules"


def test_diamonds_and_stacks():
    diamonds = parse_quick("Made 4,000 diamonds")
    assert diamonds["item_name"].lower().startswith("diamond")
    assert diamonds["item_delta"] == 4000
    stacks = parse_quick("Sold 3 stacks of emeralds")
    assert stacks["event_type"] == "trade"
    assert stacks["item_delta"] == -192


def test_player_and_deaths():
    joined = parse_quick("Oliver joined", ["Oliver"])
    assert joined["event_type"] == "player"
    assert joined["player_name"] == "Oliver"
    died = parse_quick("Died twice")
    assert died["event_type"] == "death"
    assert died["death_count"] == 2


def test_empty():
    assert parse_quick("   ")["ok"] is False

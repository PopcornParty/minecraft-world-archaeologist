import assert from "node:assert/strict";
import test from "node:test";
import { parseQuick, recommendations, worldStats } from "../site/logic.mjs";

test("day and coordinates parse", () => {
  const parsed = parseQuick("Day 247, found diamonds at -342 12 891");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.day, 247);
  assert.equal(parsed.x, -342);
  assert.equal(parsed.kind, "discovery");
  assert.equal(parsed.source, "rules");
});

test("nether death stays a death", () => {
  const parsed = parseQuick("Died in Nether while exploring a fortress");
  assert.equal(parsed.kind, "death");
  assert.equal(parsed.dimension, "Nether");
});

test("recommendations use only recorded rows", () => {
  const world = { id: "w", eraNames: {} };
  const records = { milestones: [{ worldId: "w", key: "nether", name: "Enter the Nether", done: false }], projects: [], goals: [], discoveries: [] };
  const next = recommendations(world, records);
  assert.equal(next[0].title, "Enter the Nether");
  const stats = worldStats({ id: "w", currentDay: 100 }, { ...records, deaths: [{ worldId: "w" }], builds: [], sessions: [], discoveries: [], projects: [], goals: [] });
  assert.equal(stats.per100, 1);
});

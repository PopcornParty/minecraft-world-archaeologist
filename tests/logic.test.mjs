import assert from "node:assert/strict";
import test from "node:test";
import { ideas, parseQuick, stageOf, suggestions } from "../site/brain.mjs";

test("a short snapshot is enough", () => {
  const world = { id: "w", day: 193, gear: "Full Netherite", base: "Castle", doing: "mega farm", finished: "Dragon defeated, Elytra", flags: ["dragon", "elytra", "netherite"] };
  assert.equal(stageOf(world), "end");
  const next = suggestions(world, { events: [], projects: [], locations: [] });
  assert.equal(next[0].title.includes("Nether") || next.some((item) => /infrastructure|portal|farm|mega/i.test(item.title + item.why)), true);
  assert.equal(next.some((item) => /mine diamonds to make diamond armour/i.test(item.title)), false);
});

test("quick text keeps the day", () => {
  const parsed = parseQuick("Day 193, finally finished the castle and found an ancient city");
  assert.equal(parsed.day, 193);
  assert.equal(parsed.found.toLowerCase(), "ancient city");
});

test("idea library is large", () => {
  assert.ok(ideas().length >= 80);
});

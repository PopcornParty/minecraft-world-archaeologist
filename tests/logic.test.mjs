import assert from "node:assert/strict";
import test from "node:test";
import { analytics, streakInfo } from "../site/analytics.js";
import { parseQuick } from "../site/parse.js";

test("building spend parses to a negative amount", () => {
  const parsed = parseQuick("Built castle and spent 120k on materials");
  assert.equal(parsed.eventType, "building");
  assert.equal(parsed.amount, -120000);
  assert.equal(parsed.source, "rules");
});

test("stacks and deaths", () => {
  assert.equal(parseQuick("Sold 3 stacks of emeralds").itemDelta, -192);
  assert.equal(parseQuick("Died twice").deathCount, 2);
  assert.equal(parseQuick("Oliver joined", ["Oliver"]).playerName, "Oliver");
});

test("analytics use only recorded rows", () => {
  const world = { id: "w", currencyName: "coins" };
  const records = {
    events: [{ worldId: "w", eventType: "trade", title: "Sold", occurredAt: "2026-10-06T12:00:00.000Z" }],
    transactions: [{ worldId: "w", amount: 500000, occurredAt: "2026-10-06T12:00:00.000Z", category: "Trading", playerId: null }],
    items: [],
    itemRecords: [],
    players: [],
    sessions: [],
    weights: [],
    goals: [],
  };
  const stats = analytics(world, records);
  assert.equal(stats.balance, 500000);
  assert.equal(stats.events, 1);
});

test("streak counts consecutive days", () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const info = streakInfo([{ occurredAt: today }, { occurredAt: yesterday }]);
  assert.equal(info.current, 2);
});

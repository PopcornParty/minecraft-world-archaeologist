import assert from "node:assert/strict";
import test from "node:test";
import { blocked, recommend } from "../site/engine.mjs";

const world = { day: 193, base: "Castle", baseType: "Castle", progress: "Basically finished", stage: "Endgame", doing: "Castle walls", done: ["Dragon", "Dragon Egg", "Nether", "Wither", "Netherite", "Max Gear", "Elytra", "End Cities", "Major Farms"], gear: "Max Netherite", finished: "Dragon Elytra Netherite" };
const profile = { ranked: ["Building", "Projects"], never: ["Grinding", "Beginner progression"], ambition: 2, boredom: "Start something huge" };

test("endgame interview does not suggest gear", () => {
  assert.equal(blocked("Get Netherite", world, profile.never), true);
  assert.equal(blocked("Get an Elytra", world, profile.never), true);
  assert.equal(blocked("Defeat the Ender Dragon", world, profile.never), true);
  const text = recommend(world, profile).map((item) => item.title + item.why).join(" ");
  assert.equal(/get netherite|get an elytra|defeat the dragon|diamond gear/i.test(text), false);
  assert.match(text, /castle|settlement|district|kingdom/i);
});

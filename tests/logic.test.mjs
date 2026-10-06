import assert from "node:assert/strict";
import test from "node:test";
import { allow, recommend, reply } from "../site/engine.mjs";

const endgame = { day: 193, base: "Castle", gear: "Full maxed Netherite, 6 Elytra", finished: "Dragon defeated, dragon egg", flags: [] };

test("endgame never gets gear goals", () => {
  const list = recommend(endgame, ["Build"]);
  const text = list.map((item) => item.title + item.why).join(" ");
  assert.equal(allow("Get an Elytra", endgame), false);
  assert.equal(/get netherite|defeat the dragon|get an elytra/i.test(text), false);
  assert.match(text, /build|settlement|gear/i);
});

test("talk understands bored and insane", () => {
  assert.match(reply("I'm bored", endgame).title, /./);
  assert.match(reply("make the castle insane", endgame).title, /capital/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { interviewSteps, pitch, blocked } from "../site/engine.mjs";

const popcorn = { name: "The Kingdom", day: 193, stage: "Endgame", done: ["Netherite", "Elytra", "Dragon", "Wither", "Nether"], base: "Castle", baseFinish: 100, doingDone: "finished", problem: "I have loads of resources but don’t know what to build next." };
const profile = { kinds: ["Builder"], never: ["Grinding"], ambition: 3, rejected: [] };

test("finished castle is not asked what is unfinished", () => {
  const steps = interviewSteps({ stage: "Endgame", making: "Castle", base: "Castle", baseFinish: 100, kinds: ["Builder"] });
  assert.equal(steps.includes("castleLeft"), false);
  assert.equal(steps.includes("nextOpportunity"), true);
});

test("endgame castle does not get gear or a new castle", () => {
  const idea = pitch(popcorn, profile, 60);
  const text = `${idea.title} ${idea.why} ${idea.lead}`;
  assert.equal(blocked("Get Netherite", popcorn, profile.never), true);
  assert.equal(blocked("Get an Elytra", popcorn, profile.never), true);
  assert.equal(blocked("Kill the Dragon", popcorn, profile.never), true);
  assert.equal(/build a castle|get netherite|get an elytra|kill the dragon/i.test(text), false);
  assert.match(text, /castle is done|district|gate/i);
});

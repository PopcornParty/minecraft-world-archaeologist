import assert from "node:assert/strict";
import test from "node:test";
import { decide, blocked, interviewSteps } from "../site/engine.mjs";

const world = { name: "The Kingdom", day: 193, stage: "Endgame", done: ["Netherite", "Elytra", "Dragon", "Wither", "Nether"], base: "Castle", baseFinish: 100, doingDone: "finished", nextOpportunity: "A place outside the gate", problem: "I have loads of resources but don’t know what to do." };
const profile = { kinds: ["Builder"], never: ["Grinding"], ambition: 3 };

test("finished castle is not asked what is left", () => {
  const steps = interviewSteps({ stage: "Endgame", making: "Castle", base: "Castle", baseFinish: 100, kinds: ["Builder"] });
  assert.equal(steps.includes("castleLeft"), false);
});

test("endgame castle continues the open project or starts outside it", () => {
  const idle = decide(world, profile, { projects: [], locations: [{ name: "Castle" }] });
  const text = `${idle.lead} ${idle.create.name} ${idle.create.phases[0].tasks[0].name}`;
  assert.equal(/get netherite|get an elytra|kill the dragon|build a castle/i.test(text), false);
  assert.match(text, /castle is done|outside/i);
  const active = decide(world, profile, { projects: [{ status: "active", name: "Market", phases: [{ tasks: [{ name: "Build market entrance", done: false }] }] }], locations: [] });
  assert.equal(active.create, null);
  assert.match(active.lead, /current step/i);
  assert.equal(blocked("Get Netherite", world), true);
});

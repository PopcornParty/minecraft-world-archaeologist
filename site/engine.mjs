export const DONE = ["Netherite", "Elytra", "Dragon", "Wither", "Nether", "End Cities", "Major Farms", "Trading", "Storage"];

export function finished(world) {
  const text = `${(world.done || []).join(" ")} ${world.stage || ""} ${world.progress || ""}`.toLowerCase();
  const flags = {
    netherite: /netherite|max gear/.test(text),
    elytra: /elytra/.test(text),
    dragon: /dragon/.test(text),
    wither: /wither/.test(text),
    nether: /nether/.test(text),
  };
  flags.endgame = world.stage === "Endgame" || world.stage === "Completely insane" || (flags.netherite && flags.elytra && flags.dragon);
  flags.castleDone = Number(world.baseFinish) >= 100 || /finished/.test(String(world.doingDone || ""));
  return flags;
}

export function blocked(text, world, never = []) {
  const flags = finished(world);
  const value = String(text);
  if (flags.netherite && /get netherite|mine ancient debris/i.test(value)) return true;
  if (flags.elytra && /get an? elytra|find an? elytra/i.test(value)) return true;
  if (flags.dragon && /kill the dragon|defeat the dragon/i.test(value)) return true;
  if (flags.castleDone && /^build a castle$/i.test(value)) return true;
  if ((never || []).includes("Grinding") && /grind/i.test(value)) return true;
  if ((never || []).includes("Beginner progression") && /diamond gear/i.test(value)) return true;
  return false;
}

export function interviewSteps(d) {
  const steps = ["name", "world", "day", "stage"];
  if (d.stage === "Endgame" || d.stage === "Completely insane") steps.push("done", "going");
  else steps.push("going");
  if (d.going === "Current mega project" || d.going === "Building") steps.push("making");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`)) steps.push("castleFinish");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`) && Number(d.baseFinish) < 100 && d.baseFinish != null) steps.push("castleLeft");
  if (Number(d.baseFinish) >= 100) steps.push("nextOpportunity");
  steps.push("play");
  if ((d.kinds || []).includes("Technical")) steps.push("farms");
  if ((d.kinds || []).includes("Explorer")) steps.push("explored");
  if ((d.kinds || []).includes("Chaos")) steps.push("chaos");
  if ((d.kinds || []).includes("Builder") && Number(d.baseFinish) >= 100) steps.push("scale");
  if ((d.kinds || []).includes("Builder") && Number(d.baseFinish) < 100) steps.push("style");
  steps.push("hate", "ambition", "annoy");
  return steps;
}

export function pitch(world, profile, scale) {
  const flags = finished(world);
  const base = world.base || "base";
  const never = profile.never || [];
  const rejected = new Set(profile.rejected || []);
  let idea = { type: "WORLD DEVELOPMENT", title: `A road out of the ${base}`, why: "One path gives the place a direction.", phases: ["Mark the gate", "Lay the first road", "Add one stop"] };
  if (flags.endgame && flags.castleDone) {
    idea = { type: "WORLD DEVELOPMENT", title: "Capital district outside the main gate", why: "The castle is done. The next opportunity is the world around it, not another castle.", phases: ["Main road", "Residential district", "Market", "Defensive wall", "Landmarks"] };
  } else if (world.doing && !flags.castleDone) {
    idea = { type: "PROJECT", title: `Finish ${world.doing}`, why: "This is the open job.", phases: ["Close the current section", "Add the missing piece", "Stop"] };
  } else if ((profile.kinds || []).includes("Technical") && !rejected.has("TECHNICAL")) {
    idea = { type: "TECHNICAL", title: "A storage hall that the farms feed", why: "Machines without a place to land stay unused.", phases: ["Pick the farm", "Build the hall", "Connect one line"] };
  }
  if (rejected.has(idea.type) || never.includes("Building")) idea = { type: "EXPLORATION", title: "An outpost in a biome you do not live in", why: "A different session from the main build.", phases: ["Pick a direction", "Place a bed", "Mark it"] };
  if (blocked(idea.title, world, never)) idea = { type: "INFRASTRUCTURE", title: "A named road between two places", why: "Connection, not gear.", phases: ["Name the ends", "Build the road"] };
  const scopes = { 10: "Plan the road layout.", 30: "Build the first road section.", 60: "Create the first district.", 120: "Build the complete district." };
  return { ...idea, scope: scopes[scale] || scopes[60], minutes: scale || 60, lead: flags.castleDone ? "The castle is done. The next opportunity isn’t another building." : "Start from what is already open." };
}

export function remix(idea) { return { ...idea, title: `${idea.title} with a rail hall`, why: "Same place, a second reason to visit." }; }
export function escalate(idea) { return { ...idea, title: `${idea.title}, kingdom scale`, why: "Roads, districts, a wall, and a name.", phases: ["Road", "District", "Wall", "Name", "Second district"] }; }

export function parseEvent(text, day) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  let type = "Custom";
  let title = raw;
  if (/castle/.test(lower) && /finish|done|completed/.test(lower)) { type = "Build"; title = "Castle completed"; }
  else if (/elytra/.test(lower)) { type = "Item"; title = "Elytra"; }
  else if (/farm/.test(lower)) { type = "Build"; title = "Farm"; }
  else if (/storage/.test(lower)) { type = "World change"; title = "Storage moved"; }
  else if (/city|kingdom|district/.test(lower)) { type = "Project started"; title = raw; }
  else if (/nether/.test(lower)) { type = "Milestone"; title = "Nether"; }
  return { day, type, title };
}

export function reply(text, world, profile) {
  const raw = text.toLowerCase();
  const flags = finished(world);
  if (/finished the castle/.test(raw)) return { say: "Castle marked finished. I won’t ask what’s left on it.", event: parseEvent(text, world.day), patch: { baseFinish: 100, doingDone: "finished" } };
  if (/bored/.test(raw)) return { say: flags.castleDone ? "Your world isn’t missing gear. It’s missing a reason to leave the castle." : "Pick the open job, not a new world.", idea: pitch(world, profile, 60) };
  if (/insane|absurd/.test(raw)) return { say: flags.castleDone ? "Don’t rebuild the castle. Give the east side a district and a fortified road." : "Scale the open job up, don’t start a second one.", idea: escalate(pitch(world, profile, 120)) };
  if (/30|minutes/.test(raw)) return { say: "Same idea. Smaller scope.", idea: pitch(world, profile, 30) };
  if (/missing/.test(raw)) return { say: flags.castleDone ? "The gap is the area outside the gate." : "The gap is the unfinished job.", idea: pitch(world, profile, 60) };
  return { say: pitch(world, profile, 60).why, idea: pitch(world, profile, 60) };
}

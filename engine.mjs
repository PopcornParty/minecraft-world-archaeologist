export const KINDS = ["Builder", "Technical", "Explorer", "Adventure", "Collector", "Experimenter", "Chaos", "Redstone", "Decorator", "Project-focused"];
export const DONE = ["Dragon", "Dragon Egg", "Nether", "Wither", "Netherite", "Max Gear", "Elytra", "End Cities", "Major Farms", "Villager Infrastructure", "Large Storage"];
export const BASES = ["Castle", "Town", "City", "House", "Survival Base", "Industrial Base", "Underground", "Ocean", "Mountain", "Village", "Multiple Bases", "Custom"];
export const ASSETS = ["Mega farm", "Trading hall", "Storage system", "Railway", "Secret base", "Village", "Mob farm", "Industrial area", "Nether hub", "Road network", "Collection", "Arena"];
export const LOVES = ["Building", "Technical", "Exploring", "Collecting", "Decorating", "Automation", "Adventure", "Projects", "Challenges", "Chaos", "Planning", "Lore"];
export const NEVER = ["Mining", "Grinding", "Resource gathering", "Building", "Redstone", "Exploration", "Villagers", "Nether", "Fighting", "Farms", "Long projects", "Short projects", "Repetitive tasks", "Beginner progression"];

const GEAR = [/get netherite/i, /mine ancient debris/i, /get an? elytra/i, /find an? elytra/i, /defeat the (ender )?dragon/i, /kill the (ender )?dragon/i, /enter the nether/i, /go to the nether/i, /start getting diamond/i, /get diamond gear/i];

export function finished(world) {
  const text = `${world.gear || ""} ${world.finished || ""} ${(world.done || []).join(" ")} ${world.progress || ""}`.toLowerCase();
  const flags = {
    dragon: /dragon/.test(text),
    egg: /egg/.test(text),
    nether: /nether/.test(text),
    wither: /wither/.test(text),
    netherite: /netherite/.test(text),
    elytra: /elytra/.test(text),
    max: /max gear|maxed|full netherite/.test(text),
  };
  flags.endgame = world.progress === "Basically finished" || world.stage === "Endgame" || (flags.netherite && flags.elytra && flags.dragon);
  return flags;
}

export function blocked(text, world, never) {
  const flags = finished(world);
  if (flags.elytra && /elytra/i.test(text) && /get|find|obtain/i.test(text)) return true;
  if (flags.dragon && /dragon/i.test(text) && /defeat|kill|fight/i.test(text)) return true;
  if (flags.netherite && /netherite/i.test(text) && /get|mine|upgrade to/i.test(text)) return true;
  if (flags.nether && /enter the nether|go to the nether/i.test(text)) return true;
  if ((never || []).includes("Beginner progression") && /diamond gear|first pickaxe|starter base/i.test(text)) return true;
  if ((never || []).includes("Grinding") && /grind|farm for hours/i.test(text)) return true;
  if ((never || []).includes("Mining") && /^mine /i.test(text)) return true;
  return GEAR.some((rule) => rule.test(text));
}

export function phaseLabel(world, likes) {
  const flags = finished(world);
  const bits = [];
  if (flags.endgame) bits.push("Endgame");
  else if (world.stage) bits.push(world.stage);
  if ((likes || []).includes("Building") || /castle|city|town/i.test(world.baseType || world.base || "")) bits.push("Builder");
  if ((likes || []).includes("Technical") || (likes || []).includes("Automation")) bits.push("Technical");
  if ((likes || []).includes("Chaos")) bits.push("Chaos");
  return bits.length ? bits.join(" / ") : "In progress";
}

function ambitionLine(world, level) {
  const base = world.base || world.baseType || "the base";
  const lines = {
    0: `Improve the ${base} entrance.`,
    1: `Build a district around the ${base}.`,
    2: `Build a kingdom with the ${base} at the centre.`,
    3: `A kingdom with districts, roads, landmarks, and its own identity.`,
  };
  return lines[level] || lines[1];
}

export function recommend(world, profile) {
  const likes = profile.ranked || profile.kinds || [];
  const never = profile.never || [];
  const base = world.base || world.baseType || "your base";
  const flags = finished(world);
  const pool = [];
  if (world.doing) pool.push({ title: `Finish ${world.doing}`, why: "This is the thing you said you are building. It should come before a new world.", minutes: 45, type: "Build" });
  if (flags.endgame) pool.push({ title: `Turn ${base} into a settlement`, why: "Progression is done. The interesting work is identity around the place you already live.", minutes: 150, type: "Build" });
  if (world.problem) pool.push({ title: `Deal with: ${world.problem}`, why: "You named this as the annoying part. Fixing it beats a random project.", minutes: 60, type: "Plan" });
  if (world.legacy) pool.push({ title: world.legacy, why: "This is the long ambition you wrote down.", minutes: 240, type: "Legacy" });
  pool.push({ title: ambitionLine(world, profile.ambition ?? 1), why: "Matched to the ambition level you set.", minutes: 90, type: "Build" });
  if (!(never.includes("Exploration"))) pool.push({ title: "An outpost in a biome you do not live in", why: "A different session from the main build.", minutes: 40, type: "Explore" });
  if ((likes.includes("Chaos") || profile.boredom === "Do something stupid")) pool.push({ title: "A monument to a useless item", why: "You asked for chaos. This does not need new gear.", minutes: 50, type: "Chaos" });
  if (!flags.endgame) pool.push({ title: "A safe return point and a marked chest", why: "The world is not finished on gear yet. A bed and a chest still matter.", minutes: 15, type: "Survival" });
  return pool.filter((item) => !blocked(item.title + " " + item.why, world, never)).slice(0, 3);
}

export function analyse(world, profile) {
  const flags = finished(world);
  const lines = [];
  lines.push(flags.endgame ? "Progression is basically complete." : "Progression is still open, so early goals can stay.");
  if ((profile.ranked || [])[0]) lines.push(`You ranked ${(profile.ranked || [])[0]} first.`);
  if (world.doing) lines.push(`${world.doing} is the unfinished project.`);
  if ((profile.never || []).length) lines.push(`I will not suggest: ${profile.never.slice(0, 3).join(", ")}.`);
  if (flags.endgame) lines.push("Beginner gear goals are off.");
  return lines;
}

export function reply(text, world, profile) {
  const raw = text.toLowerCase();
  if (/30|minutes/.test(raw)) return { title: `A small landmark by ${world.base || "home"}`, why: "Half an hour. Not a new kingdom.", minutes: 30, type: "Quick" };
  if (/insane|unhinged|huge/.test(raw)) return { title: ambitionLine(world, 3), why: "Escalated from the base you already have.", minutes: 240, type: "Chaos" };
  if (/missing|gap/.test(raw)) return { title: world.problem ? `Fix ${world.problem}` : "Roads and a reason to leave the base", why: "The gap is experience, not another sword.", minutes: 70, type: "Plan" };
  if (/bored/.test(raw)) return recommend(world, { ...profile, boredom: "Do something stupid" })[0];
  return recommend(world, profile)[0];
}

export const INTERESTS = ["Building", "Farms", "Exploration", "Redstone", "Nether", "End", "Villages", "Storage"];

const BASES = ["plains", "forest", "desert", "jungle", "taiga", "snow", "swamp", "savanna", "mountains", "ocean", "cave", "island", "mesa", "cherry", "mangrove"];
const SCALES = ["watchtower", "gatehouse", "bridge", "harbor", "market", "library", "stable", "chapel", "warehouse", "inn", "lighthouse", "arena", "museum", "statue", "garden", "dock", "wall", "tower", "plaza", "crypt"];

export function ideas() {
  const list = [
    ["Nether transport hub", "Infrastructure", 120, "end", "A hub at the portal with tunnels toward your main places."],
    ["Item sorter", "Infrastructure", 90, "mid", "A small sorter so chests stop becoming a pile."],
    ["Trading hall", "Farm", 180, "mid", "A hall for librarians and other useful villagers."],
    ["Iron farm", "Farm", 120, "mid", "A quiet iron source so big builds do not stall."],
    ["Gold farm", "Farm", 180, "end", "A Nether roof or equivalent gold setup, if you want it."],
    ["Raid farm", "Farm", 240, "end", "Only if you already like village mechanics."],
    ["Storage wing", "Organisation", 60, "any", "One room with signs and categories."],
    ["Secret room", "Fun", 30, "any", "A room under the base that is not on the obvious path."],
    ["Monument to the first base", "Build", 90, "any", "A small memorial, not a second mega build."],
    ["One-palette build", "Challenge", 90, "any", "A build that uses one block family only."],
    ["Underground city start", "Build", 240, "end", "A street, a hall, and one finished room."],
    ["Enderman farm platform", "Farm", 120, "end", "Useful after the dragon if you want pearls and XP."],
    ["Shulker workshop", "Organisation", 60, "end", "A place to empty, dye, and store shulkers."],
    ["Ice road or horse path", "Infrastructure", 90, "mid", "A marked route between two places you already use."],
    ["Map wall", "Exploration", 45, "any", "Locator maps of places you care about."],
    ["Villager quarters", "Farm", 90, "mid", "Beds, workstations, and a door that is not a death trap."],
    ["Nether highway start", "Infrastructure", 60, "end", "Two hundred blocks in one direction, with a sign."],
    ["Base lighting pass", "Organisation", 20, "any", "Light the dark corners you already walk through."],
    ["Rooftop garden", "Build", 45, "any", "A small planted roof, not a new district."],
    ["Museum of finds", "Build", 120, "end", "Item frames for the things you actually remember."],
  ];
  const out = list.map(([title, type, minutes, stage, why]) => ({ title, type, minutes, stage, why, tag: "core" }));
  for (const biome of BASES) {
    out.push({ title: `A camp in a ${biome}`, type: "Exploration", minutes: 60, stage: "any", why: `A small place in a ${biome}, not a second castle.`, tag: "biome" });
    out.push({ title: `${biome[0].toUpperCase()}${biome.slice(1)} outpost`, type: "Build", minutes: 120, stage: "mid", why: `A marked outpost if you already travel through a ${biome}.`, tag: "biome" });
  }
  for (const scale of SCALES) {
    out.push({ title: `Castle ${scale}`, type: "Build", minutes: 90, stage: "end", why: `One finished ${scale} on the main build, instead of a new project.`, tag: "castle" });
    out.push({ title: `Town ${scale}`, type: "Build", minutes: 120, stage: "end", why: `A single ${scale} that makes the area feel lived in.`, tag: "town" });
  }
  for (const interest of ["redstone door", "hidden entrance", "item elevator", "clock", "note block corner", "sugarcane farm", "tree farm", "moss farm", "concrete works", "smelter array"]) {
    out.push({ title: interest[0].toUpperCase() + interest.slice(1), type: "Infrastructure", minutes: 45, stage: "any", why: "A small system you can finish in one sitting.", tag: "small" });
  }
  return out;
}

export const TIPS = [
  { stage: "end", text: "Gear is no longer the bottleneck. A path, a sorter, or a marked portal will save more time than another sword." },
  { stage: "end", text: "Finish one section of the current build before starting a second mega project." },
  { stage: "end", text: "Keep elytra, rockets, and a spare pick in one chest by the door." },
  { stage: "end", text: "A Nether hub with signs beats remembering coordinates for every trip." },
  { stage: "end", text: "Shulkers belong in one colour system. One colour for builds, one for exploring." },
  { stage: "mid", text: "A shield and a bed near the portal matter more than a bigger house." },
  { stage: "mid", text: "Name the chests you open every session. The rest can wait." },
  { stage: "early", text: "A bed and a chest at the first base is enough. Do not plan a city yet." },
  { stage: "any", text: "Copy coordinates when you find a place. Future you will not remember the cave." },
  { stage: "any", text: "Light the route you already walk. New builds can wait." },
  { stage: "any", text: "One finished room is better than five started rooms." },
  { stage: "farm", text: "Write what a farm is for. If you cannot say, it can wait." },
  { stage: "explore", text: "Mark the portal you used. The way home is the part people lose." },
];

export function stageOf(world) {
  const text = `${world.gear || ""} ${world.doing || ""} ${world.finished || ""} ${(world.flags || []).join(" ")}`.toLowerCase();
  if (world.stage && world.stage !== "auto") return world.stage;
  if (/netherite|elytra|dragon|endgame/.test(text) || (world.day || 0) >= 150) return "end";
  if (/diamond|nether|fortress/.test(text) || (world.day || 0) >= 30) return "mid";
  return "early";
}

export function stageLabel(stage) {
  return { early: "Early", mid: "Mid-game", end: "Endgame" }[stage] || "In progress";
}

export function flagsOf(world, events) {
  const text = `${world.gear || ""} ${world.finished || ""} ${world.doing || ""} ${events.map((e) => e.title).join(" ")}`.toLowerCase();
  return {
    dragon: /dragon/.test(text) || (world.flags || []).includes("dragon"),
    elytra: /elytra/.test(text) || (world.flags || []).includes("elytra"),
    netherite: /netherite/.test(text) || (world.flags || []).includes("netherite"),
    nether: /nether/.test(text) || (world.flags || []).includes("nether"),
    ancient: /ancient city/.test(text) || (world.flags || []).includes("ancient"),
  };
}

export function suggestions(world, records) {
  const stage = stageOf(world);
  const flags = flagsOf(world, records.events.filter((e) => e.worldId === world.id));
  const open = records.projects.filter((p) => p.worldId === world.id && p.status !== "done");
  const out = [];
  if (open[0]) out.push({ title: `Finish ${open[0].name}`, why: "It is already started. Another new build can wait.", minutes: 60, type: "Build" });
  if (world.doing) out.push({ title: world.doing, why: "This is what you said you are doing now.", minutes: 60, type: "Build" });
  if (stage === "end" && flags.netherite) out.push({ title: "Build a Nether transport hub", why: "You already have endgame gear. Travel will help the next projects more than more gear.", minutes: 90, type: "Infrastructure" });
  if (stage === "end" && !records.locations.some((l) => l.worldId === world.id && /portal/i.test(l.name))) out.push({ title: "Save the main portal", why: "No portal is in the location book yet.", minutes: 10, type: "Organisation" });
  if (flags.elytra) out.push({ title: "Make a rocket and elytra chest by the door", why: "You have elytra. The useful part is not losing them in a chest maze.", minutes: 15, type: "Organisation" });
  if (!flags.dragon && stage !== "early") out.push({ title: "Prepare an End trip", why: "The dragon is not marked done.", minutes: 60, type: "Progression" });
  if (stage === "early") out.push({ title: "Set a bed and a first chest", why: "The world is still early. A safe return point comes first.", minutes: 15, type: "Progression" });
  out.push({ title: world.base ? `Light and label ${world.base}` : "Label the main base chests", why: "A small organisation pass on the place you already use.", minutes: 30, type: "Organisation" });
  return out.slice(0, 5);
}

export function bored(world) {
  const base = world.base || "the base";
  return [
    { time: "10 min", title: `Fix one ugly corner of ${base}`, why: "Small, visible, and finished today." },
    { time: "30 min", title: `Hidden room under ${base}`, why: "Uses the base you already have." },
    { time: "1 hour", title: "Nether highway entrance with a sign", why: "Useful if you already travel. Silly if you decorate it." },
    { time: "2 hours", title: "One new building, one room only", why: "A start, not a second city." },
    { time: "Unnecessary", title: "A 40-block statue of a tool you like", why: "No purpose. That is the point." },
  ];
}

export function forTime(world, minutes) {
  const pool = ideas().filter((idea) => idea.minutes <= minutes + 15);
  const stage = stageOf(world);
  const ranked = pool.filter((idea) => idea.stage === stage || idea.stage === "any").concat(pool);
  return ranked.slice(0, 5);
}

export function tipFor(world) {
  const stage = stageOf(world);
  const match = TIPS.find((tip) => tip.stage === stage) || TIPS.find((tip) => tip.stage === "any");
  return match.text;
}

export function gaps(world, records) {
  const stage = stageOf(world);
  const locations = records.locations.filter((l) => l.worldId === world.id);
  const lines = [];
  if (stage === "end" && locations.length < 3) lines.push("Gear is ahead of the location book. Save the base, portal, and farm.");
  if (stage === "end" && !/highway|hub|road/i.test(`${world.doing} ${world.nextWant}`)) lines.push("Endgame gear is in. The gap is travel and storage, not another sword.");
  if (!world.doing) lines.push("There is no current project. Pick one so suggestions stay specific.");
  if (!lines.length) lines.push("The snapshot is enough to suggest work. Add a location only when you would hate to lose it.");
  return lines;
}

export function future(world, records) {
  const next = suggestions(world, records).slice(0, 2).map((item) => item.title);
  return {
    next,
    later: ["A proper storage wing", world.base ? `Finish the outside of ${world.base}` : "A second district"],
    eventually: ["Connect the places you care about", "A museum of world finds"],
    insane: ["A town that replaces the starter base", "A Nether road to every saved location"],
  };
}

export function story(world, records) {
  const events = records.events.filter((e) => e.worldId === world.id).sort((a, b) => (a.day || 0) - (b.day || 0));
  const lines = [`Day ${world.day || 0}. ${stageLabel(stageOf(world))}.`];
  if (world.base) lines.push(`The main place is ${world.base}.`);
  if (world.finished) lines.push(`Already done: ${world.finished}.`);
  if (world.doing) lines.push(`In progress: ${world.doing}.`);
  if (events[0]) lines.push(`Recorded history starts with “${events[0].title}”.`);
  if (events.length > 1) lines.push(`${events.length} important moments are saved.`);
  lines.push(stageOf(world) === "end" ? "This is past the gear grind. The world is in its building era." : "The world is still opening up.");
  return lines;
}

export function score(world, records) {
  const flags = flagsOf(world, records.events.filter((e) => e.worldId === world.id));
  let n = Math.min(world.day || 0, 400) / 4;
  n += Object.values(flags).filter(Boolean).length * 12;
  n += records.projects.filter((p) => p.worldId === world.id).length * 6;
  n += records.events.filter((e) => e.worldId === world.id).length * 4;
  return Math.round(n);
}

export function parseQuick(text) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Type the important part." };
  const day = raw.match(/\bday\s+(\d{1,6})\b/i);
  const coords = raw.match(/(-?\d{1,8})\s+(-?\d{1,4})\s+(-?\d{1,8})/);
  const found = /ancient city|elytra|dragon|netherite|village|stronghold|bastion|fortress/i.exec(raw);
  return { ok: true, source: "rules", title: raw.slice(0, 140), day: day ? Number(day[1]) : null, x: coords ? Number(coords[1]) : null, y: coords ? Number(coords[2]) : null, z: coords ? Number(coords[3]) : null, found: found ? found[0] : null };
}

export function eraName(world, events) {
  const flags = flagsOf(world, events);
  if (world.eraName) return world.eraName;
  if (stageOf(world) === "end" && (world.base || "").length) return "Empire";
  if (flags.dragon || flags.elytra) return "Endgame";
  if (flags.nether) return "Nether";
  if ((world.day || 0) > 20) return "Expansion";
  return "Survival";
}

export const STRUCTURES = ["Village", "Pillager outpost", "Ruined portal", "Desert pyramid", "Jungle pyramid", "Swamp hut", "Igloo", "Woodland mansion", "Ocean monument", "Shipwreck", "Buried treasure", "Mineshaft", "Stronghold", "Trail ruins", "Trial chambers", "Ancient city", "Nether fortress", "Bastion", "Ruined portal (Nether)", "End city", "End ship"];
export const BIOMES = ["Plains", "Forest", "Birch forest", "Dark forest", "Flower forest", "Taiga", "Snowy plains", "Desert", "Savanna", "Jungle", "Swamp", "Badlands", "Ocean", "Lush caves", "Dripstone caves", "Deep dark", "Cherry grove", "Mangrove swamp", "Mushroom fields", "Nether wastes", "Crimson forest", "Warped forest", "Soul sand valley", "Basalt deltas", "The End", "End highlands", "End midlands"];
export const RESOURCES = ["Diamond", "Iron", "Gold", "Coal", "Copper", "Redstone", "Lapis", "Emerald", "Ancient debris", "Quartz", "Obsidian", "Wood", "Stone", "Copper"];
export const ENCHANTS = ["Mending", "Unbreaking", "Efficiency", "Fortune", "Silk Touch", "Sharpness", "Protection", "Feather Falling", "Depth Strider", "Respiration", "Aqua Affinity", "Looting", "Power", "Infinity", "Flame", "Punch", "Loyalty", "Riptide", "Channeling", "Impaling", "Thorns", "Sweeping Edge"];
export const GEAR = ["Wooden pickaxe", "Stone pickaxe", "Iron pickaxe", "Diamond pickaxe", "Netherite pickaxe", "Diamond armour", "Netherite armour", "Elytra", "Shield", "Bow", "Trident", "Sword"];
export const CAUSES = ["Fall", "Mob", "Lava", "Creeper", "Drowned", "Phantom", "Wither", "Ender Dragon", "Void", "Suffocation", "Starved", "Other"];
export const DIMENSIONS = ["Overworld", "Nether", "End"];
export const BUILD_STATUS = ["idea", "planned", "building", "abandoned", "completed"];
export const COORD_KINDS = ["base", "farm", "village", "portal", "stronghold", "treasure", "build", "resource", "dangerous", "secret", "custom"];
export const MILESTONES = [
  ["first_diamond", "First diamond", 1],
  ["nether", "Enter the Nether", 2],
  ["fortress", "Find a Nether fortress", 3],
  ["stronghold", "Find a stronghold", 4],
  ["dragon", "Defeat the Ender Dragon", 5],
  ["elytra", "Obtain an Elytra", 6],
  ["netherite", "Obtain Netherite", 7],
  ["base", "First permanent base", 2],
  ["farm", "First major farm", 3],
  ["day100", "100 Minecraft days", 4],
  ["day500", "500 Minecraft days", 6],
  ["day1000", "1000 Minecraft days", 8],
];

export function parseQuick(text) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Type what happened." };
  const day = raw.match(/\bday\s+(\d{1,6})\b/i);
  const coords = raw.match(/(-?\d{1,8})\s+(-?\d{1,4})\s+(-?\d{1,8})/);
  const died = /\bdied\b|\bdeath\b/i.test(raw);
  const kind = died ? "death" : /\bmined\b|\bmining\b/i.test(raw) ? "mining" : /\bfound\b|\bdiscovered\b/i.test(raw) ? "discovery" : /\bbuilt\b|\bfinished\b|\bcastle\b|\bbase\b/i.test(raw) ? "build" : "event";
  const dimension = /nether/i.test(raw) ? "Nether" : /\bend\b/i.test(raw) ? "End" : "Overworld";
  return {
    ok: true,
    source: "rules",
    kind,
    title: raw.slice(0, 140),
    day: day ? Number(day[1]) : null,
    x: coords ? Number(coords[1]) : null,
    y: coords ? Number(coords[2]) : null,
    z: coords ? Number(coords[3]) : null,
    dimension,
    cause: died ? (CAUSES.find((cause) => raw.toLowerCase().includes(cause.toLowerCase())) || "Other") : null,
  };
}

export function eraFor(world, records) {
  const names = world.eraNames || {};
  const done = new Set(records.milestones.filter((row) => row.worldId === world.id && row.done).map((row) => row.key));
  const builds = records.builds.filter((row) => row.worldId === world.id && row.status === "completed").length;
  let key = "early";
  if (done.has("first_diamond")) key = "diamond";
  if (done.has("nether")) key = "nether";
  if (done.has("dragon") || done.has("elytra")) key = "endgame";
  if (builds >= 3) key = "empire";
  const labels = { early: "Early Survival", diamond: "Diamond Age", nether: "Nether Era", endgame: "Endgame", empire: "Empire Building" };
  return { key, label: names[key] || labels[key] };
}

export function recommendations(world, records) {
  const out = [];
  const projects = records.projects.filter((row) => row.worldId === world.id && row.status !== "completed");
  if (projects[0]) out.push({ title: projects[0].name, why: "This project is still unfinished." });
  const goals = records.goals.filter((row) => row.worldId === world.id && row.status === "active");
  if (goals[0]) out.push({ title: goals[0].title, why: "This goal is still open." });
  const missing = records.milestones.find((row) => row.worldId === world.id && !row.done);
  if (missing) out.push({ title: missing.name, why: "This milestone is not marked done." });
  const found = new Set(records.discoveries.filter((row) => row.worldId === world.id).map((row) => row.name));
  const unseen = STRUCTURES.find((name) => !found.has(name));
  if (unseen) out.push({ title: unseen, why: "No discovery is recorded for this structure." });
  if (!out.length) out.push({ title: "Record a session", why: "There is not enough recorded data to suggest anything else." });
  return out.slice(0, 4);
}

export function worldStats(world, records) {
  const id = world.id;
  const deaths = records.deaths.filter((row) => row.worldId === id);
  const sessions = records.sessions.filter((row) => row.worldId === id && row.endedAt);
  const minutes = sessions.reduce((sum, row) => sum + Math.max(0, (new Date(row.endedAt) - new Date(row.startedAt)) / 60000), 0);
  const day = Number(world.currentDay) || 0;
  const goals = records.goals.filter((row) => row.worldId === id);
  const doneGoals = goals.filter((row) => row.status === "completed").length;
  return {
    day,
    deaths: deaths.length,
    builds: records.builds.filter((row) => row.worldId === id).length,
    discoveries: records.discoveries.filter((row) => row.worldId === id).length,
    sessions: sessions.length,
    minutes,
    projects: records.projects.filter((row) => row.worldId === id).length,
    goalsPct: goals.length ? Math.round((doneGoals / goals.length) * 100) : 0,
    per100: day ? Math.round((deaths.length / day) * 1000) / 10 : 0,
    era: eraFor(world, records),
  };
}

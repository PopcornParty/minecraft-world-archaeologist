export const MOODS = ["Build", "Technical", "Explore", "Challenge", "Chaos", "Decorate", "Plan"];

const BANNED = [/get an? elytra/i, /defeat the (ender )?dragon/i, /get netherite/i, /enter the nether/i, /mine diamonds to make/i, /find your first diamond/i];

export function doneFlags(world) {
  const text = `${world.gear || ""} ${world.finished || ""} ${world.doing || ""} ${(world.flags || []).join(" ")}`.toLowerCase();
  return {
    dragon: /dragon/.test(text),
    elytra: /elytra/.test(text),
    netherite: /netherite/.test(text),
    nether: /nether/.test(text),
    egg: /egg/.test(text),
  };
}

export function phases(world, likes) {
  const flags = doneFlags(world);
  const list = [];
  if (flags.netherite && flags.elytra && flags.dragon) list.push("Endgame");
  else if ((world.day || 0) < 20) list.push("Early Survival");
  else list.push("Established");
  if ((likes || []).includes("Build") || /castle|base|city/i.test(world.base || "")) list.push("Builder");
  if ((likes || []).includes("Technical")) list.push("Technical");
  if ((likes || []).includes("Explore")) list.push("Explorer");
  if ((likes || []).includes("Chaos")) list.push("Chaos");
  if (flags.netherite) list.push("Empire Builder");
  return list;
}

export function allow(text, world) {
  const flags = doneFlags(world);
  if (flags.elytra && /elytra/i.test(text) && /get|find|obtain/i.test(text)) return false;
  if (flags.dragon && /defeat the dragon|fight the dragon|kill the dragon/i.test(text)) return false;
  if (flags.netherite && /get netherite|mine ancient debris for armour/i.test(text)) return false;
  if (flags.nether && /enter the nether/i.test(text)) return false;
  return !BANNED.some((rule) => rule.test(text));
}

export function recommend(world, likes, mood) {
  const base = world.base || "your base";
  const endgame = doneFlags(world).netherite && doneFlags(world).elytra;
  const pool = [
    { title: `Turn ${base} into a settlement`, why: "Gear is not the limit. The place you already have can become the capital.", minutes: 180, type: "Build", mood: "Build" },
    { title: "Nether capital", why: "You already travel. A signed hub beats another sword.", minutes: 120, type: "Infrastructure", mood: "Technical" },
    { title: "Industrial district", why: "Farms are more useful when they have a street and a purpose.", minutes: 150, type: "Technical", mood: "Technical" },
    { title: "Museum of this world", why: "Dragon egg, first elytra, named tools. Give them a room.", minutes: 90, type: "Collection", mood: "Decorate" },
    { title: `Hidden district under ${base}`, why: "Uses the build you already care about.", minutes: 60, type: "Build", mood: "Build" },
    { title: "Outpost in a biome you do not live in", why: "A different session from the main build.", minutes: 45, type: "Explore", mood: "Explore" },
    { title: "One-palette landmark", why: "A challenge that does not need new gear.", minutes: 40, type: "Challenge", mood: "Challenge" },
    { title: "A monument to a useless item", why: "No purpose. That is the point.", minutes: 50, type: "Chaos", mood: "Chaos" },
    { title: "Connect two saved places", why: "Big builds with no road between them feel separate.", minutes: 70, type: "Infrastructure", mood: "Plan" },
  ];
  const filtered = pool.filter((item) => allow(item.title + item.why, world));
  const preferred = filtered.filter((item) => !mood || item.mood === mood || (likes || []).includes(item.mood));
  const picked = (preferred.length ? preferred : filtered).slice(0, 4);
  if (endgame) picked.unshift({ title: "Stop chasing gear", why: "Netherite and elytra are done. The next interesting thing is what you build with that power.", minutes: 5, type: "Plan", mood: "Plan" });
  return picked.filter((item) => allow(item.title, world)).slice(0, 4);
}

export function forge(seed, tone) {
  const name = seed || "Castle";
  const insane = tone === "insane";
  const easy = tone === "easy";
  return {
    title: insane ? `${name} capital` : name,
    concept: insane ? `${name} becomes a walled city with roads, a station, and a reason to visit.` : `One finished ${name}, not a second unfinished world.`,
    sections: easy ? ["One room", "A door", "A sign"] : ["Walls", "Gate", "Hall", "Storage", "Courtyard", insane ? "Rail station" : "Path out"],
    effort: easy ? "30–60 min" : insane ? "Several sessions" : "1–3 hours",
  };
}

export function remix(name) {
  const base = name || "Castle";
  return [`${base} plus a rail hall`, `${base} over an underground street`, `${base} with a farm wing`, `${base} as a museum`, `${base} as the Nether gate`];
}

export function reply(text, world) {
  const raw = text.toLowerCase();
  if (/bored|nothing to do/.test(raw)) return recommend(world, world.likes, "Chaos")[0];
  if (/30|minutes|quick/.test(raw)) return { title: `A small landmark near ${world.base || "home"}`, why: "Sized for half an hour. No new mega project.", minutes: 30, type: "Quick" };
  if (/insane|huge|massive|bigger/.test(raw)) return forge(world.base || "the castle", "insane");
  if (/missing|gap|opportunity/.test(raw)) return { title: "Infrastructure, not gear", why: "If netherite and elytra are done, the gap is roads, storage, and a settlement around the base.", minutes: 90, type: "Plan" };
  if (/better|castle/.test(raw)) return { title: `Improve ${world.base || "the base"}`, why: "Courtyard, a road, a storage door, and one district. Do not start a new castle.", minutes: 80, type: "Build" };
  return recommend(world, world.likes)[0];
}

export function news(world) {
  const flags = doneFlags(world);
  const lines = [];
  if (flags.netherite && flags.elytra) lines.push("Gear progression is over. The world is in its building era.");
  if (world.base) lines.push(`${world.base} is the centre. The next story is what surrounds it.`);
  if (world.doing) lines.push(`Current work: ${world.doing}.`);
  if (!lines.length) lines.push("Add a base name and the director will stop speaking in generalities.");
  return lines;
}

export function story(world) {
  const flags = doneFlags(world);
  const bits = [`Day ${world.day || 0}.`];
  if (flags.netherite) bits.push("Gear is maxed.");
  if (flags.dragon) bits.push("The dragon is done.");
  if (flags.elytra) bits.push("Elytra is done.");
  if (world.base) bits.push(`${world.base} is the place this world is about.`);
  bits.push(flags.netherite ? "What happens next is construction, not loot." : "The world is still opening.");
  return bits.join(" ");
}

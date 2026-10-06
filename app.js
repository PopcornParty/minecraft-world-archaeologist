const INTERESTS = ["Building", "Farms", "Exploration", "Redstone", "Nether", "End", "Villages", "Storage"];

const BASES = ["plains", "forest", "desert", "jungle", "taiga", "snow", "swamp", "savanna", "mountains", "ocean", "cave", "island", "mesa", "cherry", "mangrove"];
const SCALES = ["watchtower", "gatehouse", "bridge", "harbor", "market", "library", "stable", "chapel", "warehouse", "inn", "lighthouse", "arena", "museum", "statue", "garden", "dock", "wall", "tower", "plaza", "crypt"];

function ideas() {
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

const TIPS = [
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

function stageOf(world) {
  const text = `${world.gear || ""} ${world.doing || ""} ${world.finished || ""} ${(world.flags || []).join(" ")}`.toLowerCase();
  if (world.stage && world.stage !== "auto") return world.stage;
  if (/netherite|elytra|dragon|endgame/.test(text) || (world.day || 0) >= 150) return "end";
  if (/diamond|nether|fortress/.test(text) || (world.day || 0) >= 30) return "mid";
  return "early";
}

function stageLabel(stage) {
  return { early: "Early", mid: "Mid-game", end: "Endgame" }[stage] || "In progress";
}

function flagsOf(world, events) {
  const text = `${world.gear || ""} ${world.finished || ""} ${world.doing || ""} ${events.map((e) => e.title).join(" ")}`.toLowerCase();
  return {
    dragon: /dragon/.test(text) || (world.flags || []).includes("dragon"),
    elytra: /elytra/.test(text) || (world.flags || []).includes("elytra"),
    netherite: /netherite/.test(text) || (world.flags || []).includes("netherite"),
    nether: /nether/.test(text) || (world.flags || []).includes("nether"),
    ancient: /ancient city/.test(text) || (world.flags || []).includes("ancient"),
  };
}

function suggestions(world, records) {
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

function bored(world) {
  const base = world.base || "the base";
  return [
    { time: "10 min", title: `Fix one ugly corner of ${base}`, why: "Small, visible, and finished today." },
    { time: "30 min", title: `Hidden room under ${base}`, why: "Uses the base you already have." },
    { time: "1 hour", title: "Nether highway entrance with a sign", why: "Useful if you already travel. Silly if you decorate it." },
    { time: "2 hours", title: "One new building, one room only", why: "A start, not a second city." },
    { time: "Unnecessary", title: "A 40-block statue of a tool you like", why: "No purpose. That is the point." },
  ];
}

function forTime(world, minutes) {
  const pool = ideas().filter((idea) => idea.minutes <= minutes + 15);
  const stage = stageOf(world);
  const ranked = pool.filter((idea) => idea.stage === stage || idea.stage === "any").concat(pool);
  return ranked.slice(0, 5);
}

function tipFor(world) {
  const stage = stageOf(world);
  const match = TIPS.find((tip) => tip.stage === stage) || TIPS.find((tip) => tip.stage === "any");
  return match.text;
}

function gaps(world, records) {
  const stage = stageOf(world);
  const locations = records.locations.filter((l) => l.worldId === world.id);
  const lines = [];
  if (stage === "end" && locations.length < 3) lines.push("Gear is ahead of the location book. Save the base, portal, and farm.");
  if (stage === "end" && !/highway|hub|road/i.test(`${world.doing} ${world.nextWant}`)) lines.push("Endgame gear is in. The gap is travel and storage, not another sword.");
  if (!world.doing) lines.push("There is no current project. Pick one so suggestions stay specific.");
  if (!lines.length) lines.push("The snapshot is enough to suggest work. Add a location only when you would hate to lose it.");
  return lines;
}

function future(world, records) {
  const next = suggestions(world, records).slice(0, 2).map((item) => item.title);
  return {
    next,
    later: ["A proper storage wing", world.base ? `Finish the outside of ${world.base}` : "A second district"],
    eventually: ["Connect the places you care about", "A museum of world finds"],
    insane: ["A town that replaces the starter base", "A Nether road to every saved location"],
  };
}

function story(world, records) {
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

function score(world, records) {
  const flags = flagsOf(world, records.events.filter((e) => e.worldId === world.id));
  let n = Math.min(world.day || 0, 400) / 4;
  n += Object.values(flags).filter(Boolean).length * 12;
  n += records.projects.filter((p) => p.worldId === world.id).length * 6;
  n += records.events.filter((e) => e.worldId === world.id).length * 4;
  return Math.round(n);
}

function parseQuick(text) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Type the important part." };
  const day = raw.match(/\bday\s+(\d{1,6})\b/i);
  const coords = raw.match(/(-?\d{1,8})\s+(-?\d{1,4})\s+(-?\d{1,8})/);
  const found = /ancient city|elytra|dragon|netherite|village|stronghold|bastion|fortress/i.exec(raw);
  return { ok: true, source: "rules", title: raw.slice(0, 140), day: day ? Number(day[1]) : null, x: coords ? Number(coords[1]) : null, y: coords ? Number(coords[2]) : null, z: coords ? Number(coords[3]) : null, found: found ? found[0] : null };
}

function eraName(world, events) {
  const flags = flagsOf(world, events);
  if (world.eraName) return world.eraName;
  if (stageOf(world) === "end" && (world.base || "").length) return "Empire";
  if (flags.dragon || flags.elytra) return "Endgame";
  if (flags.nether) return "Nether";
  if ((world.day || 0) > 20) return "Expansion";
  return "Survival";
}

const STORES = ["worlds", "events", "projects", "tasks", "locations", "goals", "memories", "items", "saved"];
const state = { route: "home", worldId: localStorage.getItem("mwa-world") || null, records: null };

function esc(value) {
  return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;");
}
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mwa-copilot", 1);
    request.onupgradeneeded = () => STORES.forEach((name) => { if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" }); });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function all(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function put(store, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
async function remove(store, id) {
  const db = await openDb();
  await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
async function load() {
  const records = {};
  for (const store of STORES) records[store] = await all(store);
  return records;
}
function world() { return state.records.worlds.find((item) => item.id === state.worldId) || null; }
function mine(store) { return state.records[store].filter((row) => row.worldId === state.worldId); }
async function go(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  state.records = await load();
  if (!state.worldId || !state.records.worlds.some((item) => item.id === state.worldId)) state.worldId = state.records.worlds[0]?.id || null;
  if (state.worldId) localStorage.setItem("mwa-world", state.worldId);
  const pages = { home, do: doPage, add, world: worldPage, more, places, projects, goals, ideas: ideaPage, backup, snapshot };
  await pages[route]();
}
function view(html) { document.querySelector("#view").innerHTML = html; }
function sheet(html) { document.querySelector("#sheet-card").innerHTML = html; document.querySelector("#sheet").classList.add("open"); document.querySelector("#sheet").onclick = (ev) => { if (ev.target.id === "sheet") document.querySelector("#sheet").classList.remove("open"); }; }

async function home() {
  if (!world()) return go("snapshot");
  const current = world();
  const events = mine("events");
  const next = suggestions(current, state.records)[0];
  const flags = flagsOf(current, events);
  const plan = future(current, state.records);
  view(`<p class="kicker">${esc(current.name)}</p><h2>Day ${current.day || 0}</h2><p>${esc(current.base || "No base named")} · ${esc(stageLabel(stageOf(current)))}</p>
    <section class="card"><p class="kicker">What should I do?</p><b>${esc(next.title)}</b><p>${esc(next.why)}</p><p class="muted">${next.minutes} min · ${esc(next.type)}</p><button class="primary" id="do">More ideas</button></section>
    <section class="card"><p class="kicker">I'm bored</p><b>${esc(bored(current)[1].title)}</b><button id="bored">New idea</button></section>
    <section class="card"><p class="kicker">Your world</p><p>${flags.dragon ? "Dragon done" : "Dragon not marked"} · ${flags.elytra ? "Elytra" : "No elytra marked"} · ${flags.netherite ? "Netherite" : "No netherite marked"}</p></section>
    <section class="card"><p class="kicker">The future</p>${plan.next.map((item) => `<p>${esc(item)}</p>`).join("")}</section>
    <section class="card"><p class="kicker">Tip</p><p>${esc(tipFor(current))}</p></section>`);
  document.querySelector("#do").onclick = () => go("do");
  document.querySelector("#bored").onclick = () => go("do");
}
async function doPage() {
  if (!world()) return go("snapshot");
  const current = world();
  const list = suggestions(current, state.records);
  view(`<p class="kicker">Do</p><h2>What should I do?</h2>
    <div class="chips"><button data-min="15">15 min</button><button data-min="30">30 min</button><button data-min="60">1 hour</button><button data-min="120">2 hours</button><button data-min="240">Evening</button></div>
    <div id="list">${list.map(card).join("")}</div>
    <section class="card"><p class="kicker">Gaps</p>${gaps(current, state.records).map((line) => `<p>${esc(line)}</p>`).join("")}</section>
    <button id="bored">I'm bored</button>`);
  document.querySelectorAll("[data-min]").forEach((btn) => btn.onclick = () => { document.querySelector("#list").innerHTML = forTime(current, Number(btn.dataset.min)).map(card).join(""); });
  document.querySelector("#bored").onclick = () => { document.querySelector("#list").innerHTML = bored(current).map((item) => `<section class="card"><p class="muted">${esc(item.time)}</p><b>${esc(item.title)}</b><p>${esc(item.why)}</p></section>`).join(""); };
}
function card(item) { return `<section class="card"><b>${esc(item.title)}</b><p>${esc(item.why)}</p><p class="muted">${item.minutes || ""} ${item.type ? "· " + esc(item.type) : ""}</p><button data-save="${esc(item.title)}">Save as project</button></section>`; }

async function add() {
  if (!world()) return go("snapshot");
  view(`<p class="kicker">Add</p><h2>Only the important bit</h2><textarea id="text" placeholder="Day 193, finished the castle and found an ancient city"></textarea><button class="primary" id="read">Read it</button><div id="form"></div>
    <div class="chips"><button data-k="event">Event</button><button data-k="project">Project</button><button data-k="place">Location</button><button data-k="goal">Goal</button><button data-k="idea">Idea</button><button data-k="memory">Memory</button><button data-k="item">Item</button></div>`);
  document.querySelector("#read").onclick = () => {
    const parsed = parseQuick(document.querySelector("#text").value);
    if (!parsed.ok) { document.querySelector("#form").innerHTML = `<p>${esc(parsed.error)}</p>`; return; }
    document.querySelector("#form").innerHTML = `<p class="muted">Rules only. Edit, then save.</p><input id="title" value="${esc(parsed.title)}"><input id="day" inputmode="numeric" placeholder="Day" value="${parsed.day ?? world().day ?? ""}">${parsed.found ? `<p>Also noticed: ${esc(parsed.found)}</p>` : ""}<button class="primary" id="save">Save event</button>`;
    document.querySelector("#save").onclick = async () => {
      const day = Number(document.querySelector("#day").value);
      await put("events", { id: uid(), worldId: state.worldId, title: document.querySelector("#title").value, day: Number.isFinite(day) ? day : null, at: new Date().toISOString() });
      if (Number.isFinite(day)) await put("worlds", { ...world(), day });
      go("world");
    };
  };
  document.querySelectorAll("[data-k]").forEach((btn) => btn.onclick = () => quick(btn.dataset.k));
}
function quick(kind) {
  const fields = { event: ["title", "day"], project: ["name", "note"], place: ["name", "x", "y", "z", "note"], goal: ["title"], idea: ["title"], memory: ["title", "note"], item: ["name", "note"] }[kind];
  sheet(`<h2>${kind}</h2>${fields.map((field) => `<input data-f="${field}" placeholder="${field}">`).join("")}<button class="primary" id="savef">Save</button>`);
  document.querySelector("#savef").onclick = async () => {
    const data = { id: uid(), worldId: state.worldId, at: new Date().toISOString() };
    fields.forEach((field) => { data[field] = document.querySelector(`[data-f="${field}"]`).value; });
    ["day", "x", "y", "z"].forEach((field) => { if (field in data && data[field] !== "") data[field] = Number(data[field]); });
    if (["x", "y", "z"].some((field) => field in data && data[field] !== "" && !Number.isFinite(Number(data[field])))) return;
    const store = { event: "events", project: "projects", place: "locations", goal: "goals", idea: "saved", memory: "memories", item: "items" }[kind];
    if (kind === "project") data.status = "open";
    if (kind === "goal") data.status = "open";
    await put(store, data);
    document.querySelector("#sheet").classList.remove("open");
    go("world");
  };
}
async function worldPage() {
  if (!world()) return go("snapshot");
  const current = world();
  const events = mine("events").sort((a, b) => (a.day || 0) - (b.day || 0));
  const plan = future(current, state.records);
  view(`<p class="kicker">${esc(eraName(current, events))}</p><h2>${esc(current.name)}</h2><p>Day ${current.day || 0} · ${esc(stageLabel(stageOf(current)))} · unofficial score ${score(current, state.records)}</p>
    ${story(current, state.records).map((line) => `<p>${esc(line)}</p>`).join("")}
    <section class="card"><p class="kicker">History</p>${events.map((event) => `<p>Day ${event.day ?? "—"} — ${esc(event.title)}</p>`).join("") || `<p class="muted">No important events yet. The snapshot still works.</p>`}</section>
    <section class="card"><p class="kicker">Later</p>${plan.later.map((item) => `<p>${esc(item)}</p>`).join("")}<p class="kicker">Someday</p>${plan.insane.map((item) => `<p>${esc(item)}</p>`).join("")}</section>
    <button id="snap">Edit snapshot</button>`);
  document.querySelector("#snap").onclick = () => go("snapshot");
}
async function snapshot() {
  const current = world() || { name: "", day: 193, base: "", gear: "Full Netherite", doing: "", finished: "", nextWant: "", flags: [], interests: [] };
  view(`<p class="kicker">Snapshot</p><h2>${current.id ? "Your world" : "Start here"}</h2><p class="muted">This is the only form that matters.</p>
    <input id="name" placeholder="World name" value="${esc(current.name)}">
    <input id="day" inputmode="numeric" placeholder="Minecraft day" value="${current.day ?? ""}">
    <input id="base" placeholder="Main base" value="${esc(current.base || "")}">
    <input id="gear" placeholder="Gear" value="${esc(current.gear || "")}">
    <input id="doing" placeholder="Currently building" value="${esc(current.doing || "")}">
    <input id="finished" placeholder="Already done" value="${esc(current.finished || "")}">
    <input id="next" placeholder="Want next" value="${esc(current.nextWant || "")}">
    <div class="chips">${["dragon", "elytra", "netherite", "nether"].map((flag) => `<button type="button" data-flag="${flag}">${flag}</button>`).join("")}</div>
    <button class="primary" id="save">Use this</button>`);
  const flags = new Set(current.flags || []);
  document.querySelectorAll("[data-flag]").forEach((btn) => { if (flags.has(btn.dataset.flag)) btn.classList.add("primary"); btn.onclick = () => { flags.has(btn.dataset.flag) ? flags.delete(btn.dataset.flag) : flags.add(btn.dataset.flag); btn.classList.toggle("primary"); }; });
  document.querySelector("#save").onclick = async () => {
    const day = Number(document.querySelector("#day").value);
    const saved = { ...current, id: current.id || uid(), name: document.querySelector("#name").value || "Survival world", day: Number.isFinite(day) ? day : 0, base: document.querySelector("#base").value, gear: document.querySelector("#gear").value, doing: document.querySelector("#doing").value, finished: document.querySelector("#finished").value, nextWant: document.querySelector("#next").value, flags: [...flags] };
    await put("worlds", saved);
    state.worldId = saved.id;
    go("home");
  };
}
async function more() {
  view(`<h2>More</h2><input id="q" placeholder="Where is that?"><div id="hits"></div><button data-go="places">Locations</button><button data-go="projects">Projects</button><button data-go="goals">Goals</button><button data-go="ideas">Idea library</button><button data-go="snapshot">Snapshot</button><button data-go="backup">Backup</button><button id="theme">Light</button>`);
  document.querySelectorAll("[data-go]").forEach((btn) => btn.onclick = () => go(btn.dataset.go));
  document.querySelector("#theme").onclick = () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; localStorage.setItem("mwa-theme", next); };
  document.querySelector("#q").oninput = () => {
    const q = document.querySelector("#q").value.toLowerCase();
    const hits = state.records.locations.filter((row) => `${row.name} ${row.note || ""}`.toLowerCase().includes(q));
    document.querySelector("#hits").innerHTML = hits.map((row) => `<p>${esc(row.name)} · ${esc(row.x)} ${esc(row.y)} ${esc(row.z)}</p>`).join("") || `<p class="muted">No saved place matches.</p>`;
  };
}
async function places() {
  view(`<h2>Places</h2><button id="addp">Add</button>${mine("locations").map((row) => `<section class="card"><b>${esc(row.name)}</b><p>${esc(row.x)} ${esc(row.y)} ${esc(row.z)}</p><button data-copy="${esc(row.x)} ${esc(row.y)} ${esc(row.z)}">Copy</button></section>`).join("") || `<p class="muted">Save a place only if you would hate to lose it.</p>`}`);
  document.querySelector("#addp").onclick = () => quick("place");
  document.querySelectorAll("[data-copy]").forEach((btn) => btn.onclick = async () => { try { await navigator.clipboard.writeText(btn.dataset.copy); } catch { /* show stays on button */ } });
}
async function projects() {
  view(`<h2>Projects</h2>${mine("projects").map((row) => `<section class="card"><b>${esc(row.name)}</b><p>${esc(row.note || "")}</p><button data-done="${row.id}">${row.status === "done" ? "Done" : "Mark done"}</button></section>`).join("") || `<p class="muted">No projects yet. Save one from Do.</p>`}<button id="addp">Add</button>`);
  document.querySelector("#addp").onclick = () => quick("project");
  document.querySelectorAll("[data-done]").forEach((btn) => btn.onclick = async () => { const row = state.records.projects.find((item) => item.id === btn.dataset.done); await put("projects", { ...row, status: row.status === "done" ? "open" : "done" }); go("projects"); });
}
async function goals() {
  const suggested = ["Reach day 500", "Finish the current build", "Save every portal", "One small project this week"];
  view(`<h2>Goals</h2>${suggested.map((title) => `<button data-s="${esc(title)}">Suggest: ${esc(title)}</button>`).join("")}${mine("goals").map((row) => `<p>${esc(row.title)}</p>`).join("")}`);
  document.querySelectorAll("[data-s]").forEach((btn) => btn.onclick = async () => { await put("goals", { id: uid(), worldId: state.worldId, title: btn.dataset.s, status: "open" }); go("goals"); });
}
async function ideaPage() {
  const list = ideas().slice(0, 40);
  view(`<h2>Ideas</h2><p class="muted">${ideas().length} ideas in the library. These fit a short sitting.</p>${list.map((idea) => `<section class="card"><b>${esc(idea.title)}</b><p>${esc(idea.why)}</p></section>`).join("")}`);
}
async function backup() {
  view(`<h2>Backup</h2><button class="primary" id="export">Export</button><input id="file" type="file" accept="application/json,.json"><button id="import">Import</button><p class="muted">Import asks before it replaces records on this phone.</p>`);
  document.querySelector("#export").onclick = async () => {
    const payload = { format: "mwa-copilot", version: 1, exportedAt: new Date().toISOString(), ...(await load()) };
    const file = new File([JSON.stringify(payload)], "world-copilot-backup.json", { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: "World backup" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  };
  document.querySelector("#import").onclick = async () => {
    const file = document.querySelector("#file").files[0];
    if (!file) return;
    const payload = JSON.parse(await file.text());
    if (payload.format !== "mwa-copilot") return;
    if (!confirm("Replace records in this browser with the backup?")) return;
    const db = await openDb();
    await new Promise((resolve, reject) => { const tx = db.transaction(STORES, "readwrite"); STORES.forEach((store) => { const objectStore = tx.objectStore(store); objectStore.clear(); (payload[store] || []).forEach((row) => objectStore.put(row)); }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    go("home");
  };
}
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
document.documentElement.dataset.theme = localStorage.getItem("mwa-theme") || "dark";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=9");
go("home");

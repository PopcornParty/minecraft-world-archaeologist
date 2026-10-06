const MOODS = ["Build", "Technical", "Explore", "Challenge", "Chaos", "Decorate", "Plan"];

const BANNED = [/get an? elytra/i, /defeat the (ender )?dragon/i, /get netherite/i, /enter the nether/i, /mine diamonds to make/i, /find your first diamond/i];

function doneFlags(world) {
  const text = `${world.gear || ""} ${world.finished || ""} ${world.doing || ""} ${(world.flags || []).join(" ")}`.toLowerCase();
  return {
    dragon: /dragon/.test(text),
    elytra: /elytra/.test(text),
    netherite: /netherite/.test(text),
    nether: /nether/.test(text),
    egg: /egg/.test(text),
  };
}

function phases(world, likes) {
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

function allow(text, world) {
  const flags = doneFlags(world);
  if (flags.elytra && /elytra/i.test(text) && /get|find|obtain/i.test(text)) return false;
  if (flags.dragon && /defeat the dragon|fight the dragon|kill the dragon/i.test(text)) return false;
  if (flags.netherite && /get netherite|mine ancient debris for armour/i.test(text)) return false;
  if (flags.nether && /enter the nether/i.test(text)) return false;
  return !BANNED.some((rule) => rule.test(text));
}

function recommend(world, likes, mood) {
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

function forge(seed, tone) {
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

function remix(name) {
  const base = name || "Castle";
  return [`${base} plus a rail hall`, `${base} over an underground street`, `${base} with a farm wing`, `${base} as a museum`, `${base} as the Nether gate`];
}

function reply(text, world) {
  const raw = text.toLowerCase();
  if (/bored|nothing to do/.test(raw)) return recommend(world, world.likes, "Chaos")[0];
  if (/30|minutes|quick/.test(raw)) return { title: `A small landmark near ${world.base || "home"}`, why: "Sized for half an hour. No new mega project.", minutes: 30, type: "Quick" };
  if (/insane|huge|massive|bigger/.test(raw)) return forge(world.base || "the castle", "insane");
  if (/missing|gap|opportunity/.test(raw)) return { title: "Infrastructure, not gear", why: "If netherite and elytra are done, the gap is roads, storage, and a settlement around the base.", minutes: 90, type: "Plan" };
  if (/better|castle/.test(raw)) return { title: `Improve ${world.base || "the base"}`, why: "Courtyard, a road, a storage door, and one district. Do not start a new castle.", minutes: 80, type: "Build" };
  return recommend(world, world.likes)[0];
}

function news(world) {
  const flags = doneFlags(world);
  const lines = [];
  if (flags.netherite && flags.elytra) lines.push("Gear progression is over. The world is in its building era.");
  if (world.base) lines.push(`${world.base} is the centre. The next story is what surrounds it.`);
  if (world.doing) lines.push(`Current work: ${world.doing}.`);
  if (!lines.length) lines.push("Add a base name and the director will stop speaking in generalities.");
  return lines;
}

function story(world) {
  const flags = doneFlags(world);
  const bits = [`Day ${world.day || 0}.`];
  if (flags.netherite) bits.push("Gear is maxed.");
  if (flags.dragon) bits.push("The dragon is done.");
  if (flags.elytra) bits.push("Elytra is done.");
  if (world.base) bits.push(`${world.base} is the place this world is about.`);
  bits.push(flags.netherite ? "What happens next is construction, not loot." : "The world is still opening.");
  return bits.join(" ");
}

const STORES = ["profiles", "worlds", "projects", "events", "locations", "memories", "items", "goals", "choices"];
const state = { route: "home", profileId: localStorage.getItem("mwa-profile") || null, worldId: localStorage.getItem("mwa-world") || null, records: null, mood: null };

function esc(value) { return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mwa-director", 1);
    request.onupgradeneeded = () => STORES.forEach((name) => { if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" }); });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const store of STORES) records[store] = await all(store); return records; }
function profile() { return state.records.profiles.find((item) => item.id === state.profileId) || null; }
function world() { return state.records.worlds.find((item) => item.id === state.worldId && item.profileId === state.profileId) || null; }
function mine(store) { return state.records[store].filter((row) => row.profileId === state.profileId && row.worldId === state.worldId); }
function view(html) { document.querySelector("#view").innerHTML = html; }
async function go(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  state.records = await load();
  if (!state.profileId || !profile()) state.profileId = state.records.profiles[0]?.id || null;
  if (!world()) state.worldId = state.records.worlds.find((item) => item.profileId === state.profileId)?.id || null;
  if (state.profileId) localStorage.setItem("mwa-profile", state.profileId);
  if (state.worldId) localStorage.setItem("mwa-world", state.worldId);
  const pages = { home, discover, talk, world: worldPage, me, setup };
  await pages[route]();
}
function card(item) { return `<section class="block"><b>${esc(item.title)}</b><p>${esc(item.why || item.concept || "")}</p><p class="muted">${esc(item.minutes || item.effort || "")} ${item.type ? "· " + esc(item.type) : ""}</p><button data-plan="${esc(item.title)}">Plan it</button> <button data-skip="${esc(item.type || "Build")}">Not for me</button></section>`; }
function bindPlans() {
  document.querySelectorAll("[data-plan]").forEach((btn) => btn.onclick = () => plan(btn.dataset.plan));
  document.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = async () => { await put("choices", { id: uid(), profileId: state.profileId, worldId: state.worldId, rejected: btn.dataset.skip, at: new Date().toISOString() }); go(state.route); });
}
function plan(title, tone) {
  const made = forge(title, tone || "normal");
  document.querySelector("#panel").innerHTML = `<p class="kicker">Plan</p><h2>${esc(made.title)}</h2><p>${esc(made.concept)}</p><p>${made.sections.map(esc).join(" · ")}</p><p class="muted">${esc(made.effort)}</p><div class="chips"><button data-tone="easy">Easier</button><button data-tone="insane">More insane</button><button id="keep">Save project</button></div>`;
  document.querySelector("#sheet").classList.add("open");
  document.querySelectorAll("[data-tone]").forEach((btn) => btn.onclick = () => plan(title, btn.dataset.tone));
  document.querySelector("#keep").onclick = async () => { await put("projects", { id: uid(), profileId: state.profileId, worldId: state.worldId, name: made.title, note: made.concept, status: "open" }); document.querySelector("#sheet").classList.remove("open"); go("world"); };
}

async function home() {
  if (!profile()) return go("me");
  if (!world()) return go("setup");
  const current = world();
  const likes = profile().likes || [];
  const top = recommend(current, likes, state.mood)[0];
  const bored = recommend(current, likes, "Chaos")[0];
  view(`<p class="kicker">${esc(profile().name)} · ${esc(current.name)}</p><h2>Day ${current.day || 0}</h2><p>${phases(current, likes).join(" · ")}</p><p>${esc(story(current))}</p>
    <section class="block"><p class="kicker">My recommendation</p><b>${esc(top.title)}</b><p>${esc(top.why)}</p><button class="primary" id="plan">Plan it</button></section>
    <section class="block"><p class="kicker">I'm bored</p><b>${esc(bored.title)}</b><button id="another">Another</button></section>
    <section class="block"><p class="kicker">30 minutes</p><b>A landmark near ${esc(current.base || "home")}</b><button id="half">Start</button></section>
    <div class="chips">${MOODS.map((mood) => `<button data-mood="${mood}">${mood}</button>`).join("")}</div>`);
  document.querySelector("#plan").onclick = () => plan(top.title);
  document.querySelector("#another").onclick = () => { state.mood = "Chaos"; go("discover"); };
  document.querySelector("#half").onclick = () => plan(`Landmark near ${current.base || "home"}`, "easy");
  document.querySelectorAll("[data-mood]").forEach((btn) => btn.onclick = () => { state.mood = btn.dataset.mood; go("discover"); });
}
async function discover() {
  if (!world()) return go("setup");
  const list = recommend(world(), profile().likes || [], state.mood);
  view(`<p class="kicker">${esc(state.mood || "For you")}</p><h2>Discover</h2><div class="chips">${["10", "30", "60", "120"].map((n) => `<button data-min="${n}">${n} min</button>`).join("")}<button id="chaos">Chaos</button></div><div id="list">${list.map(card).join("")}</div>`);
  bindPlans();
  document.querySelectorAll("[data-min]").forEach((btn) => btn.onclick = () => { const easy = recommend(world(), profile().likes, "Decorate").map((item) => ({ ...item, minutes: Number(btn.dataset.min) })); document.querySelector("#list").innerHTML = easy.map(card).join(""); bindPlans(); });
  document.querySelector("#chaos").onclick = () => { state.mood = "Chaos"; go("discover"); };
}
async function talk() {
  if (!world()) return go("setup");
  view(`<p class="kicker">Local rules, not a model</p><h2>Talk</h2><textarea id="text" placeholder="I'm bored. Make the castle insane."></textarea><button class="primary" id="ask">Answer</button><div id="out"></div>`);
  document.querySelector("#ask").onclick = () => {
    const answer = reply(document.querySelector("#text").value, { ...world(), likes: profile().likes });
    document.querySelector("#out").innerHTML = card(answer);
    bindPlans();
  };
}
async function worldPage() {
  if (!world()) return go("setup");
  const current = world();
  view(`<p class="kicker">World</p><h2>${esc(current.name)}</h2>${news(current).map((line) => `<p>${esc(line)}</p>`).join("")}
    <section class="block"><p class="kicker">Projects</p>${mine("projects").map((row) => `<p>${esc(row.name)}</p>`).join("") || `<p class="muted">None saved. Plan one from Home.</p>`}</section>
    <section class="block"><p class="kicker">Remix</p>${remix(current.base || "Castle").map((item) => `<button data-plan="${esc(item)}">${esc(item)}</button>`).join("")}</section>
    <button id="edit">Edit snapshot</button>`);
  bindPlans();
  document.querySelector("#edit").onclick = () => go("setup");
}
async function setup() {
  if (!profile()) return go("me");
  const current = world() || { name: "Survival", day: 193, base: "Castle", gear: "Full maxed Netherite, several Elytra", finished: "Dragon defeated, dragon egg, Nether done", doing: "" };
  view(`<p class="kicker">${esc(profile().name)}</p><h2>Snapshot</h2><p class="muted">Five facts. The director does the rest.</p>
    <input id="name" placeholder="World" value="${esc(current.name)}"><input id="day" inputmode="numeric" placeholder="Day" value="${current.day ?? ""}"><input id="base" placeholder="Base" value="${esc(current.base || "")}"><input id="gear" placeholder="Gear" value="${esc(current.gear || "")}"><input id="finished" placeholder="Already done" value="${esc(current.finished || "")}"><input id="doing" placeholder="Building now" value="${esc(current.doing || "")}"><button class="primary" id="save">Use this</button>`);
  document.querySelector("#save").onclick = async () => {
    const day = Number(document.querySelector("#day").value);
    const saved = { ...current, id: current.id || uid(), profileId: state.profileId, name: document.querySelector("#name").value || "Survival", day: Number.isFinite(day) ? day : 0, base: document.querySelector("#base").value, gear: document.querySelector("#gear").value, finished: document.querySelector("#finished").value, doing: document.querySelector("#doing").value };
    await put("worlds", saved);
    state.worldId = saved.id;
    go("home");
  };
}
async function me() {
  const people = state.records?.profiles || [];
  view(`<p class="kicker">On this phone</p><h2>Who is playing?</h2>${people.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}
    <form id="add"><input name="name" placeholder="Name" required><button class="primary">Add person</button></form>
    <div class="chips">${["Build", "Technical", "Explore", "Chaos"].map((like) => `<button data-like="${like}">${like}</button>`).join("")}</div>
    <button id="backup">Export this person</button><input id="file" type="file" accept="application/json,.json"><button id="restore">Restore</button>`);
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = null; go("home"); });
  document.querySelector("#add").onsubmit = async (ev) => { ev.preventDefault(); const id = uid(); await put("profiles", { id, name: new FormData(ev.target).get("name"), likes: [] }); state.profileId = id; state.worldId = null; go("setup"); };
  document.querySelectorAll("[data-like]").forEach((btn) => btn.onclick = async () => { if (!profile()) return; const likes = new Set(profile().likes || []); likes.has(btn.dataset.like) ? likes.delete(btn.dataset.like) : likes.add(btn.dataset.like); await put("profiles", { ...profile(), likes: [...likes] }); go("me"); });
  document.querySelector("#backup").onclick = async () => {
    if (!profile()) return;
    const payload = { format: "mwa-director", version: 1, profile: profile(), worlds: state.records.worlds.filter((row) => row.profileId === profile().id) };
    for (const store of ["projects", "events", "locations", "memories", "items", "goals", "choices"]) payload[store] = state.records[store].filter((row) => row.profileId === profile().id);
    const file = new File([JSON.stringify(payload)], `${profile().name}-world.json`, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] });
    const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  };
  document.querySelector("#restore").onclick = async () => {
    const file = document.querySelector("#file").files[0];
    if (!file || !confirm("Add this backup as its own person on this phone?")) return;
    const payload = JSON.parse(await file.text());
    if (payload.format !== "mwa-director") return;
    await put("profiles", payload.profile);
    for (const store of ["worlds", "projects", "events", "locations", "memories", "items", "goals", "choices"]) for (const row of payload[store] || []) await put(store, row);
    state.profileId = payload.profile.id;
    go("home");
  };
}
document.querySelector("#sheet").onclick = (ev) => { if (ev.target.id === "sheet") document.querySelector("#sheet").classList.remove("open"); };
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
document.documentElement.dataset.theme = localStorage.getItem("mwa-theme") || "dark";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=10");
go("home");

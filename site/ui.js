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

const STORES = ["worlds", "events", "deaths", "discoveries", "coordinates", "builds", "projects", "tasks", "resources", "resourceLogs", "mining", "farms", "farmLogs", "villagers", "gear", "enchants", "milestones", "stats", "sessions", "memories", "goals", "settings"];
const state = { route: "home", worldId: localStorage.getItem("mwa-world") || null, records: null, undo: null };

function esc(value) {
  return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;");
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mwa-vanilla", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((name) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" }); });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function all(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function put(store, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return value;
}
async function remove(store, id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function loadAll() {
  const records = {};
  for (const store of STORES) records[store] = await all(store);
  return records;
}
function world() { return state.records.worlds.find((item) => item.id === state.worldId) || null; }
function rows(store) { return state.records[store].filter((row) => row.worldId === state.worldId); }
function toast(text, undo) {
  const node = document.querySelector("#toast");
  node.style.display = "block";
  node.innerHTML = `${esc(text)} ${undo ? '<button id="undo">Undo</button>' : ""}`;
  if (undo) document.querySelector("#undo").onclick = async () => { await put(undo.store, undo.row); node.style.display = "none"; go(state.route); };
  setTimeout(() => { node.style.display = "none"; }, 4000);
}
async function refresh() {
  state.records = await loadAll();
  if (!state.worldId || !state.records.worlds.some((item) => item.id === state.worldId)) state.worldId = state.records.worlds[0]?.id || null;
  if (state.worldId) localStorage.setItem("mwa-world", state.worldId);
}
function need() {
  if (world()) return false;
  document.querySelector("#view").innerHTML = `<h2>Start a world</h2><p>Vanilla only. You type what happened. Nothing is read from a Minecraft save.</p><button class="primary" id="make">Create a world</button>`;
  document.querySelector("#make").onclick = () => go("worlds");
  return true;
}
async function go(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  await refresh();
  const pages = { home, add, time, explore, more, worlds, deaths, coords, builds, projects, resources, mining, farms, villagers, gear, enchants, milestones, stats: statsPage, sessions, heatmap, memories, goals, compare, search, backup, settings };
  try { await pages[route](); } catch (err) { document.querySelector("#view").innerHTML = `<h2>Could not open this</h2><p>${esc(err.message || err)}</p>`; }
}
function chart(points) {
  if (!points.length) return `<p class="empty">No recorded points yet.</p>`;
  const w = 320, h = 140, pad = 12;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = (w - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => [pad + i * step, h - pad - (p.value / max) * (h - pad * 2)]);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}"><path d="${coords.map((c, i) => `${i ? "L" : "M"}${c[0]},${c[1]}`).join(" ")}" fill="none" stroke="currentColor"/></svg>`;
}
function list(items, render, empty) {
  return items.length ? items.map(render).join("") : `<p class="empty">${empty}</p>`;
}

async function home() {
  if (need()) return;
  const current = world();
  const stats = worldStats(current, state.records);
  const next = recommendations(current, state.records);
  document.querySelector("#view").innerHTML = `<p class="muted">${esc(stats.era.label)}</p><h2>${esc(current.name)}</h2>
    <div class="grid">
      <div class="stat"><span class="muted">Day</span><b>${stats.day}</b></div>
      <div class="stat"><span class="muted">Deaths</span><b>${stats.deaths}</b></div>
      <div class="stat"><span class="muted">Builds</span><b>${stats.builds}</b></div>
      <div class="stat"><span class="muted">Finds</span><b>${stats.discoveries}</b></div>
      <div class="stat"><span class="muted">Sessions</span><b>${stats.sessions}</b></div>
      <div class="stat"><span class="muted">Goals</span><b>${stats.goalsPct}%</b></div>
    </div>
    <section class="panel"><h3>Current day</h3><div class="row"><input id="day" inputmode="numeric" value="${stats.day}"><button id="setday">Save day</button></div><p class="muted">${stats.per100} deaths per 100 recorded days.</p></section>
    <section class="panel"><h3>What next</h3>${next.map((item) => `<p><b>${esc(item.title)}</b><br><span class="muted">${esc(item.why)}</span></p>`).join("")}</section>
    <section class="panel"><h3>Recent</h3>${list(rows("events").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5), (event) => `<p>Day ${event.day || "—"} · ${esc(event.title)}</p>`, "No events yet.")}</section>`;
  document.querySelector("#setday").onclick = async () => {
    const day = Number(document.querySelector("#day").value);
    if (!Number.isFinite(day) || day < 0) return toast("Day must be 0 or more.");
    await put("worlds", { ...current, currentDay: day });
    go("home");
  };
}

async function add() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Add</h2><textarea id="text" placeholder="Day 247, found diamonds at -342 12 891"></textarea><button class="primary" id="read">Read it</button><div id="form"></div>
    <div class="chips"><button data-kind="death">Death</button><button data-kind="event">Event</button><button data-kind="mining">Mining</button><button data-kind="discovery">Find</button><button data-kind="build">Build</button><button data-kind="coord">Coords</button><button data-kind="goal">Goal</button></div>`;
  document.querySelector("#read").onclick = () => {
    const parsed = parseQuick(document.querySelector("#text").value);
    if (!parsed.ok) { document.querySelector("#form").innerHTML = `<p>${esc(parsed.error)}</p>`; return; }
    document.querySelector("#form").innerHTML = `<p class="muted">Rules only. Edit before saving.</p><input id="title" value="${esc(parsed.title)}"><div class="row"><input id="pday" inputmode="numeric" placeholder="Day" value="${parsed.day ?? ""}"><select id="dim">${DIMENSIONS.map((d) => `<option ${d === parsed.dimension ? "selected" : ""}>${d}</option>`).join("")}</select></div><button class="primary" id="save">Save</button>`;
    document.querySelector("#save").onclick = () => saveParsed(parsed);
  };
  document.querySelectorAll("[data-kind]").forEach((btn) => btn.onclick = () => openForm(btn.dataset.kind));
}
async function saveParsed(parsed) {
  const at = new Date().toISOString();
  const title = document.querySelector("#title").value.trim();
  const day = document.querySelector("#pday").value === "" ? null : Number(document.querySelector("#pday").value);
  const dimension = document.querySelector("#dim").value;
  if (parsed.kind === "death") await put("deaths", { id: uid(), worldId: state.worldId, day, dimension, cause: parsed.cause || "Other", x: parsed.x, y: parsed.y, z: parsed.z, doing: title, lost: "", recovered: "", notes: "", at });
  await put("events", { id: uid(), worldId: state.worldId, title, kind: parsed.kind, day, dimension, x: parsed.x, y: parsed.y, z: parsed.z, at });
  go("time");
}
function openForm(kind) {
  const card = document.querySelector("#sheet-card");
  const fields = {
    death: ["day", "dimension", "cause", "x", "y", "z", "doing", "lost", "notes"],
    event: ["title", "day", "dimension", "notes"],
    mining: ["day", "minutes", "y", "found", "blocks", "notes"],
    discovery: ["name", "kind", "day", "dimension", "x", "y", "z"],
    build: ["name", "status", "dayStart", "category", "notes"],
    coord: ["name", "kind", "dimension", "x", "y", "z", "notes"],
    goal: ["title", "priority", "targetDay", "notes"],
  }[kind];
  card.innerHTML = `<h2>${kind}</h2>${fields.map((field) => `<input data-f="${field}" placeholder="${field}">`).join("")}<button class="primary" id="savef">Save</button><button id="close">Close</button>`;
  document.querySelector("#sheet").classList.add("open");
  document.querySelector("#close").onclick = () => document.querySelector("#sheet").classList.remove("open");
  document.querySelector("#savef").onclick = async () => {
    const data = { id: uid(), worldId: state.worldId, at: new Date().toISOString() };
    fields.forEach((field) => { data[field] = document.querySelector(`[data-f="${field}"]`).value; });
    ["day", "x", "y", "z", "minutes", "blocks", "targetDay", "dayStart"].forEach((field) => { if (field in data && data[field] !== "") data[field] = Number(data[field]); });
    if (["x", "y", "z"].some((field) => field in data && data[field] !== "" && !Number.isFinite(Number(data[field])))) return toast("Coordinates must be numbers.");
    const store = { death: "deaths", event: "events", mining: "mining", discovery: "discoveries", build: "builds", coord: "coordinates", goal: "goals" }[kind];
    if (kind === "goal") data.status = "active";
    if (kind === "build" && !data.status) data.status = "planned";
    await put(store, data);
    if (kind !== "event") await put("events", { id: uid(), worldId: state.worldId, title: data.title || data.name || kind, kind, day: data.day || data.dayStart || null, at: data.at });
    document.querySelector("#sheet").classList.remove("open");
    toast("Saved");
    go("time");
  };
}

async function time() {
  if (need()) return;
  const events = rows("events").sort((a, b) => (b.day || 0) - (a.day || 0) || b.at.localeCompare(a.at));
  document.querySelector("#view").innerHTML = `<h2>Timeline</h2>${chart(events.slice().reverse().map((event) => ({ value: event.day || 0 })))}${list(events.slice(0, 40), (event) => `<article class="panel"><b>${esc(event.title)}</b><div class="muted">Day ${event.day ?? "—"} · ${esc(event.kind || "event")}</div><button data-del="${event.id}">Delete</button></article>`, "Nothing recorded.")}`;
  document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
    const row = events.find((event) => event.id === btn.dataset.del);
    await remove("events", row.id);
    toast("Deleted", { store: "events", row });
    go("time");
  });
}
async function explore() {
  if (need()) return;
  const found = new Set(rows("discoveries").map((row) => row.name));
  const pct = Math.round((STRUCTURES.filter((name) => found.has(name)).length / STRUCTURES.length) * 100);
  document.querySelector("#view").innerHTML = `<h2>Exploration</h2><p>${pct}% of the structure list is marked found.</p><div class="progress"><div style="width:${pct}%"></div></div>
    ${STRUCTURES.map((name) => `<button data-s="${esc(name)}">${found.has(name) ? "Found" : "Missing"} · ${esc(name)}</button>`).join("")}
    <section class="panel"><h3>Nether</h3><p>${rows("discoveries").filter((row) => row.dimension === "Nether").length} Nether finds · ${rows("deaths").filter((row) => row.dimension === "Nether").length} Nether deaths</p></section>
    <section class="panel"><h3>End</h3><p>${rows("discoveries").filter((row) => row.dimension === "End").length} End finds · ${rows("milestones").some((row) => row.key === "dragon" && row.done) ? "Dragon marked defeated" : "Dragon not marked"}</p></section>`;
  document.querySelectorAll("[data-s]").forEach((btn) => btn.onclick = async () => {
    if (found.has(btn.dataset.s)) return;
    await put("discoveries", { id: uid(), worldId: state.worldId, name: btn.dataset.s, kind: "structure", day: world().currentDay, dimension: btn.dataset.s.includes("Nether") || btn.dataset.s === "Bastion" ? "Nether" : btn.dataset.s.includes("End") ? "End" : "Overworld", at: new Date().toISOString() });
    go("explore");
  });
}
async function more() {
  const links = ["worlds", "deaths", "coords", "builds", "projects", "resources", "mining", "farms", "villagers", "gear", "enchants", "milestones", "stats", "sessions", "heatmap", "memories", "goals", "compare", "search", "backup", "settings"];
  document.querySelector("#view").innerHTML = `<h2>More</h2><input id="q" placeholder="Search everything"><div id="hits"></div>${links.map((link) => `<button data-go="${link}">${link}</button>`).join("")}`;
  document.querySelectorAll("[data-go]").forEach((btn) => btn.onclick = () => go(btn.dataset.go));
  document.querySelector("#q").oninput = () => {
    const q = document.querySelector("#q").value.toLowerCase();
    const hits = Object.values(state.records).flat().filter((row) => JSON.stringify(row).toLowerCase().includes(q)).slice(0, 20);
    document.querySelector("#hits").innerHTML = hits.map((row) => `<p>${esc(row.title || row.name || row.cause || row.id)}</p>`).join("") || `<p class="empty">No matches.</p>`;
  };
}
async function worlds() {
  document.querySelector("#view").innerHTML = `<h2>Worlds</h2><form id="world" class="panel"><input name="name" placeholder="World name" required><button class="primary">Save</button></form>${state.records.worlds.map((item) => `<button data-w="${item.id}">${esc(item.name)}</button>`).join("")}`;
  document.querySelector("#world").onsubmit = async (ev) => {
    ev.preventDefault();
    const id = uid();
    await put("worlds", { id, name: new FormData(ev.target).get("name"), currentDay: 0, accent: "#c4a46a", edition: "Vanilla", createdAt: new Date().toISOString() });
    for (const [key, name] of MILESTONES) await put("milestones", { id: uid(), worldId: id, key, name, done: false });
    state.worldId = id;
    go("home");
  };
  document.querySelectorAll("[data-w]").forEach((btn) => btn.onclick = () => { state.worldId = btn.dataset.w; go("home"); });
}
async function deaths() {
  if (need()) return;
  const items = rows("deaths");
  const byCause = {};
  items.forEach((row) => { byCause[row.cause || "Other"] = (byCause[row.cause || "Other"] || 0) + 1; });
  document.querySelector("#view").innerHTML = `<h2>Deaths</h2><p>${items.length} recorded</p>${Object.entries(byCause).map(([cause, count]) => `<p>${esc(cause)} · ${count}</p>`).join("")}${list(items, (row) => `<article class="panel">Day ${row.day ?? "—"} · ${esc(row.cause)} · ${esc(row.dimension || "")}<div class="muted">${esc(row.doing || "")}</div></article>`, "No deaths recorded.")}<button id="addd">Add death</button>`;
  document.querySelector("#addd").onclick = () => openForm("death");
}
async function coords() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Coordinates</h2><button id="addc">Add</button>${list(rows("coordinates"), (row) => `<article class="panel"><b>${esc(row.name)}</b><p>${esc(row.x)} ${esc(row.y)} ${esc(row.z)} · ${esc(row.dimension || "")}</p><button data-copy="${esc(row.x)} ${esc(row.y)} ${esc(row.z)}">Copy</button></article>`, "No coordinates yet.")}`;
  document.querySelector("#addc").onclick = () => openForm("coord");
  document.querySelectorAll("[data-copy]").forEach((btn) => btn.onclick = async () => { try { await navigator.clipboard.writeText(btn.dataset.copy); toast("Copied"); } catch { toast(btn.dataset.copy); } });
}
async function builds() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Builds</h2><button id="addb">Add</button>${list(rows("builds"), (row) => `<article class="panel"><b>${esc(row.name)}</b> ${esc(row.status || "")}<div class="muted">Day ${row.dayStart ?? "—"}</div></article>`, "No builds yet.")}`;
  document.querySelector("#addb").onclick = () => openForm("build");
}
async function projects() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Projects</h2><form id="p" class="panel"><input name="name" placeholder="Castle" required><button>Add project</button></form>${rows("projects").map((project) => `<section class="panel"><b>${esc(project.name)}</b><form data-task="${project.id}"><input name="name" placeholder="Walls"><button>Add task</button></form>${rows("tasks").filter((task) => task.projectId === project.id).map((task) => `<p><button data-done="${task.id}">${task.done ? "Done" : "Open"}</button> ${esc(task.name)}</p>`).join("")}</section>`).join("")}`;
  document.querySelector("#p").onsubmit = async (ev) => { ev.preventDefault(); await put("projects", { id: uid(), worldId: state.worldId, name: new FormData(ev.target).get("name"), status: "building" }); go("projects"); };
  document.querySelectorAll("[data-task]").forEach((form) => form.onsubmit = async (ev) => { ev.preventDefault(); await put("tasks", { id: uid(), worldId: state.worldId, projectId: form.dataset.task, name: new FormData(form).get("name"), done: false }); go("projects"); });
  document.querySelectorAll("[data-done]").forEach((btn) => btn.onclick = async () => { const task = state.records.tasks.find((row) => row.id === btn.dataset.done); await put("tasks", { ...task, done: !task.done }); go("projects"); });
}
async function resources() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Resources</h2>${RESOURCES.map((name) => `<button data-r="${name}">${name}</button>`).join("")}<div id="logs"></div>`;
  document.querySelectorAll("[data-r]").forEach((btn) => btn.onclick = async () => {
    const name = btn.dataset.r;
    const amount = Number(prompt(`Change in ${name}. Use a negative number if it went down.`) || 0);
    if (!Number.isFinite(amount)) return;
    let item = rows("resources").find((row) => row.name === name);
    if (!item) { item = { id: uid(), worldId: state.worldId, name, total: 0 }; }
    item.total += amount;
    await put("resources", item);
    await put("resourceLogs", { id: uid(), worldId: state.worldId, resourceId: item.id, delta: amount, total: item.total, at: new Date().toISOString() });
    const series = state.records.resourceLogs.filter((row) => row.resourceId === item.id).concat([{ total: item.total }]);
    document.querySelector("#logs").innerHTML = `<h3>${esc(name)} · ${item.total}</h3>${chart(series.map((row) => ({ value: row.total })))}`;
  });
}
async function mining() {
  if (need()) return;
  const items = rows("mining");
  document.querySelector("#view").innerHTML = `<h2>Mining</h2><button id="addm">Add session</button>${list(items, (row) => `<article class="panel">Day ${row.day ?? "—"} · Y ${row.y ?? "—"} · ${esc(row.found || "")}</article>`, "No mining sessions.")}`;
  document.querySelector("#addm").onclick = () => openForm("mining");
}
async function farms() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Farms</h2><form id="f"><input name="name" placeholder="Iron farm"><button>Add</button></form>${list(rows("farms"), (row) => `<p>${esc(row.name)} · ${esc(row.output || "no output recorded")}</p>`, "No farms.")}`;
  document.querySelector("#f").onsubmit = async (ev) => { ev.preventDefault(); await put("farms", { id: uid(), worldId: state.worldId, name: new FormData(ev.target).get("name"), output: "" }); go("farms"); };
}
async function villagers() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Villagers</h2><form id="v"><input name="name" placeholder="Name"><input name="job" placeholder="Librarian"><button>Add</button></form>${list(rows("villagers"), (row) => `<p>${esc(row.name)} · ${esc(row.job)}</p>`, "No villagers.")}`;
  document.querySelector("#v").onsubmit = async (ev) => { ev.preventDefault(); const form = new FormData(ev.target); await put("villagers", { id: uid(), worldId: state.worldId, name: form.get("name"), job: form.get("job"), notes: "" }); go("villagers"); };
}
async function gear() {
  if (need()) return;
  const have = new Set(rows("gear").map((row) => row.name));
  document.querySelector("#view").innerHTML = `<h2>Gear</h2>${GEAR.map((name) => `<button data-g="${name}">${have.has(name) ? "Have" : "Missing"} · ${name}</button>`).join("")}`;
  document.querySelectorAll("[data-g]").forEach((btn) => btn.onclick = async () => { if (!have.has(btn.dataset.g)) await put("gear", { id: uid(), worldId: state.worldId, name: btn.dataset.g, day: world().currentDay, at: new Date().toISOString() }); go("gear"); });
}
async function enchants() {
  if (need()) return;
  const have = new Set(rows("enchants").map((row) => row.name));
  document.querySelector("#view").innerHTML = `<h2>Enchantments</h2><p>${have.size} of ${ENCHANTS.length} marked</p>${ENCHANTS.map((name) => `<button data-e="${name}">${have.has(name) ? "Have" : "Missing"} · ${name}</button>`).join("")}`;
  document.querySelectorAll("[data-e]").forEach((btn) => btn.onclick = async () => { if (!have.has(btn.dataset.e)) await put("enchants", { id: uid(), worldId: state.worldId, name: btn.dataset.e, at: new Date().toISOString() }); go("enchants"); });
}
async function milestones() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Milestones</h2>${rows("milestones").map((row) => `<button data-m="${row.id}">${row.done ? "Done" : "Open"} · ${esc(row.name)}</button>`).join("")}<form id="custom"><input name="name" placeholder="Custom milestone"><button>Add</button></form>`;
  document.querySelectorAll("[data-m]").forEach((btn) => btn.onclick = async () => { const row = state.records.milestones.find((item) => item.id === btn.dataset.m); await put("milestones", { ...row, done: !row.done, at: new Date().toISOString() }); go("milestones"); });
  document.querySelector("#custom").onsubmit = async (ev) => { ev.preventDefault(); await put("milestones", { id: uid(), worldId: state.worldId, key: "custom", name: new FormData(ev.target).get("name"), done: false }); go("milestones"); };
}
async function statsPage() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Statistics</h2><p class="muted">Only numbers you enter.</p><form id="s"><input name="name" placeholder="Blocks mined"><input name="value" inputmode="decimal" placeholder="0"><button>Add</button></form>${list(rows("stats"), (row) => `<p>${esc(row.name)} · ${esc(row.value)}</p>`, "No statistics entered.")}`;
  document.querySelector("#s").onsubmit = async (ev) => { ev.preventDefault(); const form = new FormData(ev.target); await put("stats", { id: uid(), worldId: state.worldId, name: form.get("name"), value: Number(form.get("value")), at: new Date().toISOString() }); go("stats"); };
}
async function sessions() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Sessions</h2><button id="start">Start</button><button id="end">End</button>${list(rows("sessions"), (row) => `<p>${esc(row.startedAt)} → ${esc(row.endedAt || "open")}</p>`, "No sessions.")}`;
  document.querySelector("#start").onclick = async () => { await put("sessions", { id: uid(), worldId: state.worldId, startedAt: new Date().toISOString(), endedAt: null, day: world().currentDay }); go("sessions"); };
  document.querySelector("#end").onclick = async () => { const open = rows("sessions").find((row) => !row.endedAt); if (open) await put("sessions", { ...open, endedAt: new Date().toISOString() }); go("sessions"); };
}
async function heatmap() {
  if (need()) return;
  const counts = {};
  rows("events").forEach((row) => { const day = row.at.slice(0, 10); counts[day] = (counts[day] || 0) + 1; });
  const days = [];
  for (let i = 83; i >= 0; i -= 1) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const max = Math.max(...Object.values(counts), 1);
  document.querySelector("#view").innerHTML = `<h2>Activity</h2><div class="heat">${days.map((day) => `<i title="${day}" style="opacity:${0.15 + 0.85 * ((counts[day] || 0) / max)}"></i>`).join("")}</div>`;
}
async function memories() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Memories</h2><form id="m"><input name="title" placeholder="First night" required><button>Save</button></form>${list(rows("memories"), (row) => `<p>${esc(row.title)}</p>`, "No memories.")}`;
  document.querySelector("#m").onsubmit = async (ev) => { ev.preventDefault(); await put("memories", { id: uid(), worldId: state.worldId, title: new FormData(ev.target).get("title"), day: world().currentDay, at: new Date().toISOString() }); go("memories"); };
}
async function goals() {
  if (need()) return;
  document.querySelector("#view").innerHTML = `<h2>Goals</h2><button id="addg">Add</button>${list(rows("goals"), (row) => `<p>${esc(row.title)} · ${esc(row.status || "active")}</p>`, "No goals.")}`;
  document.querySelector("#addg").onclick = () => openForm("goal");
}
async function compare() {
  document.querySelector("#view").innerHTML = `<h2>Worlds compared</h2>${state.records.worlds.map((item) => { const stats = worldStats(item, state.records); return `<article class="panel"><b>${esc(item.name)}</b><p>Day ${stats.day} · ${stats.deaths} deaths · ${stats.builds} builds · ${stats.discoveries} finds</p></article>`; }).join("") || `<p class="empty">Create more than one world to compare.</p>`}`;
}
async function search() { go("more"); }
async function backup() {
  document.querySelector("#view").innerHTML = `<h2>Backup</h2><button class="primary" id="export">Export backup</button><input id="file" type="file" accept="application/json,.json"><select id="mode"><option>merge</option><option>replace</option></select><button id="import">Import</button><button id="clear">Clear this world</button><p class="muted">Replace and clear ask before they delete records on this phone.</p>`;
  document.querySelector("#export").onclick = async () => {
    const payload = { format: "mwa-vanilla", version: 1, exportedAt: new Date().toISOString(), ...(await loadAll()) };
    const file = new File([JSON.stringify(payload)], "world-archaeologist-backup.json", { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "World backup" }); return; }
    const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  };
  document.querySelector("#import").onclick = async () => {
    const file = document.querySelector("#file").files[0];
    if (!file) return;
    const payload = JSON.parse(await file.text());
    if (payload.format !== "mwa-vanilla" || payload.version !== 1) return toast("Not a World Archaeologist backup.");
    const mode = document.querySelector("#mode").value;
    if (mode === "replace" && !confirm("Replace deletes records stored in this browser. Continue?")) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, "readwrite");
      STORES.forEach((store) => { const objectStore = tx.objectStore(store); if (mode === "replace") objectStore.clear(); (payload[store] || []).forEach((row) => objectStore.put(row)); });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    go("home");
  };
  document.querySelector("#clear").onclick = async () => {
    if (!world() || !confirm(`Delete records for ${world().name}?`)) return;
    for (const store of STORES) for (const row of rows(store)) await remove(store, row.id);
    await remove("worlds", state.worldId);
    state.worldId = null;
    go("worlds");
  };
}
async function settings() {
  document.querySelector("#view").innerHTML = `<h2>Settings</h2><button id="theme">Toggle light</button><p class="muted">Safari: Share, then Add to Home Screen. After one visit, records still save offline.</p>`;
  document.querySelector("#theme").onclick = () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; localStorage.setItem("mwa-theme", next); };
}

document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
document.querySelector("#boot")?.addEventListener("click", () => go("worlds"));
document.documentElement.dataset.theme = localStorage.getItem("mwa-theme") || "dark";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=8");
go("home");

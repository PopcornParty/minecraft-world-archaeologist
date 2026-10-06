const $ = (sel) => document.querySelector(sel);
const app = $("#view");
const state = { worldId: null, route: "dashboard", map: { x: 0, z: 0, scale: 2 } };
const tip = document.createElement("div");
tip.className = "tooltip";
document.body.appendChild(tip);

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const type = res.headers.get("content-type") || "";
  return type.includes("application/json") ? res.json() : res.text();
}

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  if (typeof n === "number") return n.toLocaleString();
  return String(n);
}
function when(value) {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value * 1000).toLocaleString();
  return value.replace("T", " ").replace("+00:00", " UTC");
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&", "<": "<", ">": ">", '"': """ }[ch]));
}

function navTo(route) {
  state.route = route;
  document.querySelectorAll("nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  const views = { dashboard: renderDashboard, worlds: renderWorlds, import: renderImport, timeline: renderTimeline, analytics: renderAnalytics, compare: renderCompare, map: renderMap, journal: renderJournal, search: renderSearch, achievements: renderAchievements };
  views[route]();
}

async function renderDashboard() {
  const data = await api("/api/dashboard" + (state.worldId ? `?world_id=${state.worldId}` : ""));
  if (data.current) state.worldId = data.current.id;
  const latest = data.current?.latest_snapshot;
  app.innerHTML = `
    <header class="bar"><h2>Dashboard</h2><div class="grow"></div>
      <select id="world-pick">${data.worlds.map((w) => `<option value="${w.id}" ${w.id === state.worldId ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>
    </header>
    ${data.current ? `<div class="grid">
      <div class="stat"><span class="muted">World</span><b>${esc(data.current.name)}</b></div>
      <div class="stat"><span class="muted">Snapshots</span><b>${fmt(data.current.snapshot_count)}</b></div>
      <div class="stat"><span class="muted">Last import</span><b>${when(latest?.imported_at)}</b></div>
      <div class="stat"><span class="muted">Game version</span><b>${esc(latest?.game_version || "unknown")}</b></div>
      <div class="stat"><span class="muted">Chunk keys</span><b>${latest?.chunk_count == null ? "unavailable" : fmt(latest.chunk_count)}</b><span class="muted">${esc(latest?.chunk_count_quality || "")}</span></div>
      <div class="stat"><span class="muted">Unique items</span><b>${fmt(latest?.unique_item_count)}</b></div>
    </div>
    <div class="split">
      <section class="panel"><h3>From the data</h3>${data.insights.map((line) => `<p>${esc(line)}</p>`).join("") || "<p class='muted'>No derived insights yet.</p>"}</section>
      <section class="panel"><h3>Unusual changes</h3>${data.anomalies.map((a) => `<p><b>${esc(a.title)}</b><br>${esc(a.detail)} <button data-dismiss="${a.id}">Dismiss</button></p>`).join("") || "<p class='muted'>None open.</p>"}</section>
    </div>
    <section class="panel"><h3>Recent events</h3>${eventTable(data.events)}</section>` : "<p>Import a Bedrock world folder or .mcworld to start a record.</p>"}`;
  $("#world-pick")?.addEventListener("change", (ev) => { state.worldId = ev.target.value; renderDashboard(); });
  app.querySelectorAll("[data-dismiss]").forEach((btn) => btn.addEventListener("click", async () => {
    await api(`/api/anomalies/${btn.dataset.dismiss}/dismiss`, { method: "POST" });
    renderDashboard();
  }));
}

function eventTable(events) {
  if (!events.length) return "<p class='muted'>No events.</p>";
  return `<table><tr><th>When</th><th>Type</th><th>Event</th></tr>${events.map((e) => `<tr class="clickable" data-snap="${e.snapshot_id || ""}"><td>${when(e.occurred_at)}</td><td>${esc(e.event_type)}</td><td>${esc(e.title)}<div class="muted">${esc(e.detail || "")}</div></td></tr>`).join("")}</table>`;
}

async function renderWorlds() {
  const worlds = await api("/api/worlds");
  app.innerHTML = `<header class="bar"><h2>Worlds</h2></header>
    <table><tr><th>Name</th><th>Platform</th><th>Seed</th><th>Snapshots</th><th>Last seen</th></tr>
    ${worlds.map((w) => `<tr class="clickable" data-world="${w.id}"><td>${esc(w.name)}</td><td>${esc(w.platform)}</td><td class="muted">${esc(w.seed)}</td><td>${w.snapshot_count}</td><td>${when(w.last_seen_at)}</td></tr>`).join("") || "<tr><td colspan='5'>No worlds yet.</td></tr>"}</table>`;
  app.querySelectorAll("[data-world]").forEach((row) => row.addEventListener("click", () => openWorld(row.dataset.world)));
}

async function openWorld(id) {
  state.worldId = id;
  const data = await api(`/api/worlds/${id}`);
  app.innerHTML = `<header class="bar"><h2>${esc(data.world.name)}</h2><div class="grow"></div><button id="back">Worlds</button></header>
    <p class="muted">Stable key ${esc(data.world.stable_key)}. Platform ${esc(data.world.platform)}. Seed ${esc(data.world.seed)}.</p>
    <section class="panel"><h3>Snapshots</h3>
      <table><tr><th>Imported</th><th>Last played</th><th>Version</th><th>Chunk keys</th><th>Items</th><th></th></tr>
      ${data.snapshots.map((s) => `<tr><td>${when(s.imported_at)}</td><td>${when(s.last_played)}</td><td>${esc(s.game_version)}</td><td>${s.chunk_count == null ? "unavailable" : fmt(s.chunk_count)} <span class="tag">${esc(s.chunk_count_quality)}</span></td><td>${fmt(s.unique_item_count)}</td><td><button data-snap="${s.id}">Open</button></td></tr>`).join("")}</table>
    </section>
    <section class="panel"><h3>Players</h3>${data.players.map((p) => `<div>${esc(p.display_name)} <span class="tag">${esc(p.player_key)}</span></div>`).join("") || "<p class='muted'>No player records extracted.</p>"}</section>`;
  $("#back").onclick = renderWorlds;
  app.querySelectorAll("[data-snap]").forEach((btn) => btn.addEventListener("click", () => openSnapshot(btn.dataset.snap)));
}

async function openSnapshot(id) {
  const data = await api(`/api/snapshots/${id}`);
  const s = data.snapshot;
  const meta = JSON.parse(s.metadata_json || "{}");
  app.innerHTML = `<header class="bar"><h2>Snapshot</h2><div class="grow"></div><a href="/api/export/snapshot/${s.id}.csv">CSV</a> <a href="/api/export/snapshot/${s.id}.json">JSON</a></header>
    <div class="grid">
      <div class="stat"><span class="muted">Imported</span><b>${when(s.imported_at)}</b></div>
      <div class="stat"><span class="muted">World time</span><b>${fmt(s.world_time)} ticks</b><span class="muted">stored, not estimated playtime</span></div>
      <div class="stat"><span class="muted">LevelDB bytes</span><b>${fmt(s.db_bytes)}</b></div>
      <div class="stat"><span class="muted">Chunk keys</span><b>${s.chunk_count == null ? "unavailable" : fmt(s.chunk_count)}</b></div>
    </div>
    <section class="panel"><h3>Limits of this snapshot</h3><p>${esc(meta.db_note || "")}</p>${(meta.warnings || []).map((w) => `<p>${esc(w)}</p>`).join("")}</section>
    <section class="panel"><h3>Players</h3>${data.players.map((p) => `<p>${esc(p.display_name)} level ${fmt(p.level)} at ${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)} ${esc(p.dimension || "")}</p>`).join("") || "<p class='muted'>No player state.</p>"}</section>
    <section class="panel"><h3>Items</h3><table><tr><th>Item</th><th>Category</th><th>Source</th><th>Qty</th></tr>${data.items.map((i) => `<tr><td>${esc(i.item_id)}</td><td>${esc(i.category)}</td><td>${esc(i.source)}</td><td>${fmt(i.quantity)}</td></tr>`).join("")}</table></section>`;
}

function renderImport() {
  app.innerHTML = `<header class="bar"><h2>Import</h2></header>
    <section class="panel"><h3>World folder on this machine</h3>
      <p class="muted">Point at a Bedrock world directory or a .mcworld file. The source is only read. Small metadata copies are kept beside the database; the terrain database is hashed, not duplicated.</p>
      <div class="row"><input id="path" placeholder="/path/to/world or world.mcworld"><button id="go">Import path</button></div>
    </section>
    <section class="panel"><h3>.mcworld upload</h3>
      <div class="row"><input id="file" type="file" accept=".mcworld,.zip"><button id="upload">Upload</button></div>
    </section>
    <section class="panel"><h3>Job</h3>
      <div class="progress"><div id="bar"></div></div>
      <p id="job">Waiting.</p>
    </section>`;
  $("#go").onclick = async () => startJob(await api("/api/import/path", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: $("#path").value }) }));
  $("#upload").onclick = async () => {
    const body = new FormData();
    body.append("file", $("#file").files[0]);
    startJob(await api("/api/import/upload", { method: "POST", body }));
  };
}

async function startJob(result) {
  const tick = async () => {
    const job = await api(`/api/jobs/${result.job_id}`);
    $("#bar").style.width = `${job.progress}%`;
    $("#job").textContent = `${job.status} ${job.progress}% — ${job.stage}: ${job.message}${job.error ? " — " + job.error : ""}`;
    if (job.status === "done") {
      state.worldId = job.world_id;
      return;
    }
    if (job.status !== "failed") setTimeout(tick, 400);
  };
  tick();
}

async function renderTimeline() {
  const q = state.timelineQ || "";
  const type = state.timelineType || "";
  const events = await api(`/api/timeline?limit=200${state.worldId ? `&world_id=${state.worldId}` : ""}${type ? `&event_type=${type}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  app.innerHTML = `<header class="bar"><h2>Timeline</h2></header>
    <div class="row"><input id="tq" placeholder="Filter text" value="${esc(q)}"><select id="tt">
      ${["", "snapshot_created", "world_imported", "inventory_change", "exploration_change", "journal", "location", "comparison", "import_duplicate"].map((t) => `<option ${t === type ? "selected" : ""}>${t || "all types"}</option>`).join("")}
    </select><button id="tf">Filter</button></div>
    <section class="panel">${eventTable(events)}</section>`;
  $("#tf").onclick = () => { state.timelineQ = $("#tq").value; state.timelineType = $("#tt").value === "all types" ? "" : $("#tt").value; renderTimeline(); };
  app.querySelectorAll("[data-snap]").forEach((row) => row.addEventListener("click", () => row.dataset.snap && openSnapshot(row.dataset.snap)));
}

async function renderAnalytics() {
  if (!state.worldId) { app.innerHTML = "<p>Import a world first.</p>"; return; }
  const data = await api(`/api/analytics/${state.worldId}`);
  app.innerHTML = `<header class="bar"><h2>Analytics · ${esc(data.world.name)}</h2><div class="grow"></div><a href="/api/export/${state.worldId}/report">HTML report</a></header>
    <p class="muted">${data.notes.map(esc).join(" ")}</p>
    <section class="panel"><h3>Unique items by snapshot</h3><div id="c1"></div></section>
    <section class="panel"><h3>LevelDB size by snapshot</h3><div id="c2"></div></section>
    <section class="panel"><h3>Chunk keys, when measured</h3><div id="c3"></div></section>
    <section class="panel"><h3>Item quantities</h3><div id="items"></div></section>`;
  drawChart($("#c1"), data.series.map((s) => ({ id: s.snapshot_id, label: s.imported_at.slice(0, 10), value: s.unique_item_count || 0 })));
  drawChart($("#c2"), data.series.map((s) => ({ id: s.snapshot_id, label: s.imported_at.slice(0, 10), value: s.db_bytes || 0 })));
  drawChart($("#c3"), data.series.filter((s) => s.chunk_count != null).map((s) => ({ id: s.snapshot_id, label: s.imported_at.slice(0, 10), value: s.chunk_count })));
  const latest = {};
  data.items.forEach((row) => { latest[row.item_id] = row.quantity; });
  const top = Object.entries(latest).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $("#items").innerHTML = `<table><tr><th>Item</th><th>Latest quantity</th></tr>${top.map(([id, qty]) => `<tr><td>${esc(id)}</td><td>${fmt(qty)}</td></tr>`).join("")}</table>`;
}

function drawChart(host, points) {
  if (!points.length) { host.innerHTML = "<p class='muted'>No measured points.</p>"; return; }
  const w = 640, h = 220, pad = 28;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = (w - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => [pad + i * step, h - pad - (p.value / max) * (h - pad * 2)]);
  const d = coords.map((c, i) => `${i ? "L" : "M"}${c[0]},${c[1]}`).join(" ");
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${coords.map((c, i) => `<circle data-i="${i}" cx="${c[0]}" cy="${c[1]}" r="4" fill="#c4a35a"></circle>`).join("")}<path d="${d}" fill="none" stroke="#8c7340" stroke-width="2"></path></svg>`;
  host.querySelectorAll("circle").forEach((node) => {
    node.addEventListener("mouseenter", (ev) => {
      const p = points[node.dataset.i];
      tip.style.display = "block";
      tip.style.left = ev.clientX + 8 + "px";
      tip.style.top = ev.clientY + 8 + "px";
      tip.textContent = `${p.label}: ${p.value}`;
    });
    node.addEventListener("mouseleave", () => { tip.style.display = "none"; });
    node.addEventListener("click", () => openSnapshot(points[node.dataset.i].id));
  });
}

async function renderCompare() {
  if (!state.worldId) { app.innerHTML = "<p>Import a world first.</p>"; return; }
  const world = await api(`/api/worlds/${state.worldId}`);
  const opts = world.snapshots.map((s) => `<option value="${s.id}">${when(s.imported_at)} · ${s.id.slice(0, 8)}</option>`).join("");
  app.innerHTML = `<header class="bar"><h2>Compare</h2></header>
    <div class="row"><select id="left">${opts}</select><select id="right">${opts}</select><select id="sort"><option value="abs">Largest change</option><option value="inc">Largest increase</option><option value="dec">Largest decrease</option><option value="new">New</option><option value="removed">Removed</option></select><button id="run">Diff</button></div>
    <div id="diff"></div>`;
  if (world.snapshots[1]) $("#left").selectedIndex = 1;
  $("#run").onclick = async () => {
    const data = await api(`/api/compare?left=${$("#left").value}&right=${$("#right").value}`);
    const mode = $("#sort").value;
    let items = data.items.filter((row) => row.status !== "unchanged");
    if (mode === "new") items = items.filter((row) => row.status === "new");
    if (mode === "removed") items = items.filter((row) => row.status === "removed");
    if (mode === "inc") items = items.filter((row) => row.change > 0).sort((a, b) => b.change - a.change);
    else if (mode === "dec") items = items.filter((row) => row.change < 0).sort((a, b) => a.change - b.change);
    else items.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    $("#diff").innerHTML = `<section class="panel"><h3>World</h3><table><tr><th>Field</th><th>Before</th><th>After</th><th>Change</th></tr>${data.world.map((row) => `<tr><td>${esc(row.label)}</td><td>${fmt(row.before)}</td><td>${fmt(row.after)}</td><td class="${(row.change || 0) < 0 ? "neg" : "pos"}">${row.change == null ? "" : fmt(row.change)}</td></tr>`).join("")}</table></section>
      <section class="panel"><h3>Players</h3><table><tr><th>Player</th><th>Level</th><th>Position after</th></tr>${data.players.map((p) => `<tr><td>${esc(p.display_name)} <span class="tag">${esc(p.status)}</span></td><td>${fmt(p.level_before)} → ${fmt(p.level_after)} (${fmt(p.level_change)})</td><td>${p.position_after.map(fmt).join(", ")}</td></tr>`).join("")}</table></section>
      <section class="panel"><h3>Items</h3><table><tr><th>Item</th><th>Before</th><th>After</th><th>Change</th></tr>${items.map((row) => `<tr><td>${esc(row.item_id)} <span class="tag">${esc(row.status)}</span></td><td>${fmt(row.before)}</td><td>${fmt(row.after)}</td><td class="${row.change < 0 ? "neg" : "pos"}">${row.change > 0 ? "+" : ""}${fmt(row.change)}</td></tr>`).join("")}</table></section>`;
  };
}

async function renderMap() {
  if (!state.worldId) { app.innerHTML = "<p>Import a world first.</p>"; return; }
  const world = await api(`/api/worlds/${state.worldId}`);
  app.innerHTML = `<header class="bar"><h2>Locations</h2></header>
    <div class="split"><div class="map-wrap"><canvas id="map"></canvas></div>
      <form id="loc" class="panel"><h3>Custom location</h3>
        <input name="name" placeholder="Name" required>
        <div class="row"><input name="x" placeholder="X" required><input name="y" placeholder="Y" required><input name="z" placeholder="Z" required></div>
        <select name="dimension"><option>overworld</option><option>nether</option><option>the_end</option></select>
        <textarea name="description" placeholder="Description"></textarea>
        <input name="tags" placeholder="tags">
        <button>Save location</button>
        <div id="locs"></div>
      </form></div>`;
  const canvas = $("#map");
  const locations = world.locations;
  const players = [];
  if (world.snapshots[0]) {
    const snap = await api(`/api/snapshots/${world.snapshots[0].id}`);
    snap.players.forEach((p) => players.push(p));
  }
  drawMap(canvas, locations, players);
  canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); state.map.scale *= ev.deltaY < 0 ? 1.1 : 0.9; drawMap(canvas, locations, players); });
  let drag = null;
  canvas.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, z: ev.clientY, ox: state.map.x, oz: state.map.z }; });
  canvas.addEventListener("pointermove", (ev) => { if (!drag) return; state.map.x = drag.ox - (ev.clientX - drag.x) / state.map.scale; state.map.z = drag.oz - (ev.clientY - drag.z) / state.map.scale; drawMap(canvas, locations, players); });
  canvas.addEventListener("pointerup", () => { drag = null; });
  $("#loc").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await api("/api/locations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, name: form.get("name"), x: Number(form.get("x")), y: Number(form.get("y")), z: Number(form.get("z")), dimension: form.get("dimension"), description: form.get("description"), tags: form.get("tags") }) });
    renderMap();
  };
  $("#locs").innerHTML = locations.map((loc) => `<p><b>${esc(loc.name)}</b> ${fmt(loc.x)} ${fmt(loc.y)} ${fmt(loc.z)} <span class="tag">${esc(loc.dimension)}</span><br><span class="muted">${esc(loc.description || "")}</span></p>`).join("");
}

function drawMap(canvas, locations, players) {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#10130f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const project = (x, z) => [canvas.width / 2 + (x - state.map.x) * state.map.scale, canvas.height / 2 + (z - state.map.z) * state.map.scale];
  ctx.strokeStyle = "#2a3126";
  ctx.beginPath();
  const origin = project(0, 0);
  ctx.moveTo(origin[0], 0); ctx.lineTo(origin[0], canvas.height);
  ctx.moveTo(0, origin[1]); ctx.lineTo(canvas.width, origin[1]);
  ctx.stroke();
  ctx.fillStyle = "#c4a35a";
  locations.forEach((loc) => {
    const [px, py] = project(loc.x, loc.z);
    ctx.fillRect(px - 3, py - 3, 6, 6);
    ctx.fillText(loc.name, px + 6, py);
  });
  ctx.fillStyle = "#8aa56e";
  players.forEach((p) => {
    if (p.x == null) return;
    const [px, py] = project(p.x, p.z);
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(p.display_name || "player", px + 6, py - 6);
  });
}

async function renderJournal() {
  const entries = await api("/api/journal" + (state.worldId ? `?world_id=${state.worldId}` : ""));
  app.innerHTML = `<header class="bar"><h2>Journal</h2></header>
    <form id="note" class="panel"><h3>Note</h3>
      <input name="title" placeholder="Built the castle today" required>
      <textarea name="body" placeholder="What happened" required></textarea>
      <input name="tags" placeholder="build, farm">
      <button>Save note</button>
    </form>
    <section class="panel">${entries.map((e) => `<article><b>${esc(e.title)}</b> <span class="muted">${when(e.written_at)}</span><p>${esc(e.body)}</p></article>`).join("") || "<p class='muted'>No notes.</p>"}</section>`;
  $("#note").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await api("/api/journal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, title: form.get("title"), body: form.get("body"), tags: form.get("tags") }) });
    renderJournal();
  };
}

async function renderSearch() {
  app.innerHTML = `<header class="bar"><h2>Search</h2></header>
    <div class="row"><input id="q" placeholder="Worlds, items, locations, notes"><button id="find">Search</button></div>
    <div id="hits"></div>`;
  $("#find").onclick = runSearch;
  $("#q").addEventListener("keydown", (ev) => { if (ev.key === "Enter") runSearch(); });
  $("#q").focus();
}
async function runSearch() {
  const hits = await api("/api/search?q=" + encodeURIComponent($("#q").value));
  $("#hits").innerHTML = `<table><tr><th>Type</th><th>Title</th><th>Match</th></tr>${hits.map((h) => `<tr><td>${esc(h.entity_type)}</td><td>${esc(h.title)}</td><td class="muted">${esc(h.body)}</td></tr>`).join("")}</table>`;
}

async function renderAchievements() {
  const rows = await api("/api/achievements");
  app.innerHTML = `<header class="bar"><h2>Achievements</h2></header>
    <table><tr><th>Name</th><th>Requirement</th><th>Unlocked</th></tr>${rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.description)}</td><td>${row.unlocked_at ? when(row.unlocked_at) : "locked"}</td></tr>`).join("")}</table>`;
}

document.querySelectorAll("nav button").forEach((btn) => btn.addEventListener("click", () => navTo(btn.dataset.route)));
let chord = null;
document.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input, textarea")) {
    if (ev.key === "Escape") ev.target.blur();
    return;
  }
  if (ev.key === "/") { ev.preventDefault(); navTo("search"); return; }
  if (ev.key === "?") { $("#help").classList.toggle("open"); return; }
  if (ev.key === "g") { chord = "g"; return; }
  if (chord === "g") {
    const map = { d: "dashboard", w: "worlds", t: "timeline", j: "journal", a: "analytics", i: "import" };
    if (map[ev.key]) navTo(map[ev.key]);
    chord = null;
  }
});
$("#help").addEventListener("click", () => $("#help").classList.remove("open"));
navTo("dashboard");

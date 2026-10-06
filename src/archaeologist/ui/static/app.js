const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const state = { route: "dashboard", worldId: null, draft: null };
const tip = $("#tip");

async function api(path, options) {
  const res = await fetch(path, options);
  const type = res.headers.get("content-type") || "";
  const body = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body.detail || body || res.statusText);
  return body;
}
const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&", "<": "<", ">": ">", '"': """ }[ch]));
const money = (n) => n == null || n === "" ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const when = (value) => value ? String(value).replace("T", " ").replace("+00:00", " UTC") : "—";

function setActive(route) {
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
}
async function go(route) {
  state.route = route;
  setActive(route);
  const pages = { dashboard, add, timeline, economy, items, goals, players, sessions, analytics, heatmap, worlds, more, search };
  await pages[route]();
}

async function ensureWorld() {
  const worlds = await api("/api/worlds");
  if (!state.worldId && worlds[0]) state.worldId = worlds[0].id;
  return worlds;
}

async function dashboard() {
  const data = await api("/api/dashboard" + (state.worldId ? `?world_id=${state.worldId}` : ""));
  if (data.current) state.worldId = data.current.id;
  if (!data.current) {
    view.innerHTML = `<header class="bar"><h2>Start a world</h2></header><p>This app stores what you write down. It does not read Minecraft files.</p><button class="primary" id="make">Create a world</button>`;
    $("#make").onclick = () => go("worlds");
    return;
  }
  const c = data.current;
  const a = c.analytics;
  view.innerHTML = `<header class="bar"><div><p class="muted">${esc(c.edition)} · ${esc(c.status)}</p><h2>${esc(c.name)}</h2></div><div class="grow"></div>
    <select id="world">${data.worlds.map((w) => `<option value="${w.id}" ${w.id === c.id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>
    <button class="primary" id="add">Add event</button></header>
    <div class="grid">
      <div class="stat"><span class="muted">Balance</span><b>${money(c.balance)}</b><span class="muted">${esc(c.currency_name)}</span></div>
      <div class="stat"><span class="muted">Events</span><b>${a.events}</b></div>
      <div class="stat"><span class="muted">Streak</span><b>${a.streak.current}</b><span class="muted">longest ${a.streak.longest}</span></div>
      <div class="stat"><span class="muted">Score</span><b>${money(a.progression.score)}</b><span class="muted">your weights</span></div>
    </div>
    <section class="panel"><h3>From your records</h3>${c.insights.map((line) => `<p>${esc(line)}</p>`).join("")}</section>
    <section class="panel"><h3>World health</h3><p>Activity ${esc(c.health.activity)} · Economy ${esc(c.health.economy)} · ${c.health.goals_active} active goals · last session ${when(c.health.last_session)}</p>
      ${(c.reminders || []).map((line) => `<p>${esc(line)}</p>`).join("")}</section>
    <section class="panel"><h3>Recent</h3>${eventRows(c.recent)}</section>`;
  $("#world").onchange = (ev) => { state.worldId = ev.target.value; dashboard(); };
  $("#add").onclick = () => go("add");
}

function eventRows(events) {
  if (!events.length) return `<p class="empty">No events yet.</p>`;
  return `<table><tr><th>When</th><th>Type</th><th>What happened</th><th></th></tr>${events.map((e) => `<tr class="click" data-id="${e.id}"><td>${when(e.occurred_at)}</td><td>${esc(e.event_type)}</td><td>${esc(e.title)}<div class="muted">${e.amount ? money(e.amount) : ""} ${esc(e.item_name || "")} ${e.item_delta ? e.item_delta : ""}</div></td><td><button data-del="${e.id}">Delete</button></td></tr>`).join("")}</table>`;
}

async function add() {
  await ensureWorld();
  const types = await api("/api/meta");
  view.innerHTML = `<header class="bar"><h2>Add event</h2></header>
    <section class="panel"><h3>What happened</h3>
      <textarea id="text" placeholder="Built castle and spent 120k on materials"></textarea>
      <div class="chips">${types.event_types.map((t) => `<button data-type="${t.key}">${esc(t.label)}</button>`).join("")}</div>
      <button id="preview">Read it</button>
      <div id="form"></div>
    </section>`;
  $("#text").focus();
  view.querySelectorAll("[data-type]").forEach((btn) => btn.onclick = () => { $("#text").value = btn.dataset.type + ": " + $("#text").value; preview(); });
  $("#preview").onclick = preview;
  $("#text").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) preview(); });
}

async function preview() {
  const parsed = await api("/api/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: $("#text").value, world_id: state.worldId }) });
  if (!parsed.ok) { $("#form").innerHTML = `<p>${esc(parsed.error)}</p>`; return; }
  state.draft = parsed;
  $("#form").innerHTML = `<p class="muted">Suggested by rules. Edit before saving.</p>
    <div class="row"><input id="title" value="${esc(parsed.title)}"><select id="type">${(await api("/api/meta")).event_types.map((t) => `<option ${t.key === parsed.event_type ? "selected" : ""}>${t.key}</option>`).join("")}</select></div>
    <div class="row"><input id="category" value="${esc(parsed.category)}"><input id="amount" placeholder="Money change" value="${parsed.amount ?? ""}"><input id="item" placeholder="Item" value="${esc(parsed.item_name || "")}"><input id="delta" placeholder="Item change" value="${parsed.item_delta ?? ""}"></div>
    <input id="player" placeholder="Player" value="${esc(parsed.player_name || "")}">
    <button class="primary" id="save">Save event</button>`;
  $("#save").onclick = async () => {
    await api("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      world_id: state.worldId,
      title: $("#title").value,
      description: $("#text").value,
      event_type: $("#type").value,
      category: $("#category").value,
      amount: $("#amount").value === "" ? null : Number($("#amount").value),
      item_name: $("#item").value || null,
      item_delta: $("#delta").value === "" ? null : Number($("#delta").value),
      player_name: $("#player").value || null,
      death_count: parsed.death_count,
    }) });
    go("timeline");
  };
}

async function timeline() {
  await ensureWorld();
  const data = await api(`/api/events?world_id=${state.worldId}&limit=50`);
  view.innerHTML = `<header class="bar"><h2>Timeline</h2><div class="grow"></div><input id="q" placeholder="Filter"><select id="type"><option value="">All</option><option>building</option><option>money</option><option>mining</option><option>combat</option><option>death</option><option>trade</option><option>player</option><option>note</option></select></header><div id="list">${eventRows(data.events)}</div><p class="muted">${data.total} recorded</p>`;
  const reload = async () => {
    const next = await api(`/api/events?world_id=${state.worldId}&limit=50&q=${encodeURIComponent($("#q").value)}&event_type=${$("#type").value}`);
    $("#list").innerHTML = eventRows(next.events);
    bindDeletes();
  };
  $("#q").onchange = reload;
  $("#type").onchange = reload;
  bindDeletes();
}
function bindDeletes() {
  view.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async (ev) => {
    ev.stopPropagation();
    await api(`/api/events/${btn.dataset.del}`, { method: "DELETE" });
    go(state.route);
  });
}

async function economy() {
  const data = await api(`/api/analytics/${state.worldId}`);
  view.innerHTML = `<header class="bar"><h2>Economy</h2></header>
    <div class="grid"><div class="stat"><span class="muted">Balance</span><b>${money(data.balance)}</b></div><div class="stat"><span class="muted">Income</span><b class="pos">${money(data.income)}</b></div><div class="stat"><span class="muted">Spending</span><b class="neg">${money(data.spending)}</b></div><div class="stat"><span class="muted">Net</span><b>${money(data.net)}</b></div></div>
    <section class="panel"><h3>Balance history</h3><div id="chart"></div></section>
    <section class="panel"><h3>Spending categories</h3>${data.spending_categories.map((row) => `<p>${esc(row.category)} ${money(row.total)}</p>`).join("") || "<p class='empty'>No spending recorded.</p>"}</section>
    <section class="panel"><h3>Largest transactions</h3><table><tr><th>When</th><th>Amount</th></tr>${[...data.balance_series].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 8).map((row) => `<tr><td>${when(row.at)}</td><td class="${row.amount < 0 ? "neg" : "pos"}">${money(row.amount)}</td></tr>`).join("")}</table></section>`;
  draw($("#chart"), data.balance_series.map((row) => ({ label: row.at.slice(0, 10), value: row.balance })));
}

async function items() {
  const data = await api(`/api/analytics/${state.worldId}`);
  view.innerHTML = `<header class="bar"><h2>Items</h2></header>${data.items.map((item) => `<section class="panel"><h3>${esc(item.name)}</h3><p>Now ${money(item.current)} · high ${money(item.highest)} · low ${money(item.lowest)} · gained ${money(item.gained)} · lost ${money(item.lost)}</p><div class="chart-host" data-name="${esc(item.name)}"></div></section>`).join("") || "<p class='empty'>Item counts appear when an event includes an item change, such as made 4,000 diamonds.</p>"}`;
  view.querySelectorAll(".chart-host").forEach((host) => {
    const item = data.items.find((row) => row.name === host.dataset.name);
    draw(host, item.series.map((row) => ({ label: row.occurred_at.slice(0, 10), value: row.quantity })));
  });
}

async function goals() {
  const rows = await api(`/api/goals?world_id=${state.worldId}`);
  view.innerHTML = `<header class="bar"><h2>Goals</h2></header>
    <form id="goal" class="panel"><div class="row"><input name="title" placeholder="Reach 10M" required><input name="target" placeholder="Target" value="1"></div><input name="category" placeholder="Category"><button class="primary">Add goal</button></form>
    ${rows.map((g) => `<section class="panel"><b>${esc(g.title)}</b> <span class="muted">${esc(g.status)}</span><div class="progress"><div style="width:${Math.min(100, (g.current / g.target) * 100)}%"></div></div><p>${money(g.current)} / ${money(g.target)}</p><button data-done="${g.id}">Add 1</button></section>`).join("") || "<p class='empty'>No goals.</p>"}`;
  $("#goal").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await api("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, title: form.get("title"), target: Number(form.get("target")), category: form.get("category") || "General" }) });
    goals();
  };
  view.querySelectorAll("[data-done]").forEach((btn) => btn.onclick = async () => {
    const row = rows.find((g) => g.id === btn.dataset.done);
    await api(`/api/goals/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: row.current + 1 }) });
    goals();
  });
}

async function players() {
  const rows = await api(`/api/players?world_id=${state.worldId}`);
  const board = (await api(`/api/analytics/${state.worldId}`)).players;
  view.innerHTML = `<header class="bar"><h2>Players</h2></header>
    <form id="player" class="panel"><div class="row"><input name="name" placeholder="Name" required><input name="relationship" placeholder="friend"></div><button class="primary">Add player</button></form>
    <table><tr><th>Player</th><th>Events</th><th>Money</th><th>Builds</th><th>Deaths</th></tr>${board.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.events}</td><td>${money(p.money)}</td><td>${p.builds}</td><td>${p.deaths}</td></tr>`).join("")}</table>`;
  $("#player").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await api("/api/players", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, name: form.get("name"), relationship: form.get("relationship") || "friend" }) });
    players();
  };
}

async function sessions() {
  const rows = await api(`/api/sessions?world_id=${state.worldId}`);
  const data = await api(`/api/analytics/${state.worldId}`);
  view.innerHTML = `<header class="bar"><h2>Sessions</h2></header>
    <div class="row"><button id="start" class="primary">Start session</button><button id="end">End session</button></div>
    <p>Recorded playtime ${Math.round(data.sessions.total_seconds / 60)} minutes · average ${Math.round(data.sessions.average_seconds / 60)} · longest ${Math.round(data.sessions.longest_seconds / 60)}</p>
    <form id="manual" class="panel"><h3>Manual session</h3><div class="row"><input name="started_at" type="datetime-local"><input name="ended_at" type="datetime-local"></div><button>Save manual session</button></form>
    ${rows.map((s) => `<p>${when(s.started_at)} → ${when(s.ended_at)} ${s.manual ? "<span class='muted'>manual</span>" : ""}</p>`).join("") || "<p class='empty'>No sessions.</p>"}`;
  $("#start").onclick = async () => { await api("/api/sessions/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId }) }); sessions(); };
  $("#end").onclick = async () => { await api("/api/sessions/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId }) }); sessions(); };
  $("#manual").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const started = new Date(form.get("started_at")).toISOString();
    const id = await api("/api/sessions/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, started_at: started, manual: true }) });
    await api("/api/sessions/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, ended_at: new Date(form.get("ended_at")).toISOString() }) });
    sessions();
  };
}

async function analytics() {
  const data = await api(`/api/analytics/${state.worldId}`);
  view.innerHTML = `<header class="bar"><h2>Analytics</h2></header>
    <section class="panel"><h3>Events by day</h3><div id="c1"></div></section>
    <section class="panel"><h3>Events by type</h3><div id="c2"></div></section>
    <section class="panel"><h3>Combat</h3><p>Wins ${data.combat.wins} · losses ${data.combat.losses} · deaths ${data.combat.deaths} · win rate ${data.combat.win_rate == null ? "not enough recorded fights" : Math.round(data.combat.win_rate * 100) + "%"}</p></section>
    <section class="panel"><h3>Progression weights</h3><form id="weight"><div class="row"><input name="label" placeholder="Elytra"><input name="points" placeholder="100"><input name="match_value" placeholder="elytra"></div><button>Add weight</button></form><p class="muted">${esc(data.progression.note)}</p>${data.progression.matched.map((row) => `<p>${esc(row.label)} ${row.points}</p>`).join("")}</section>`;
  draw($("#c1"), data.by_day.map((row) => ({ label: row.day, value: row.count })));
  draw($("#c2"), data.by_type.map((row) => ({ label: row.event_type, value: row.count })));
  $("#weight").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await api("/api/weights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, label: form.get("label"), points: Number(form.get("points")), match_field: "title", match_value: form.get("match_value") }) });
    analytics();
  };
}

function draw(host, points) {
  if (!points.length) { host.innerHTML = `<p class="empty">Nothing recorded for this chart.</p>`; return; }
  const w = 640, h = 200, pad = 24;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const step = (w - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((p, i) => [pad + i * step, h - pad - ((p.value - min) / span) * (h - pad * 2)]);
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${coords.map((c, i) => `<circle data-i="${i}" cx="${c[0]}" cy="${c[1]}" r="4" fill="currentColor"></circle>`).join("")}<path d="${coords.map((c, i) => `${i ? "L" : "M"}${c[0]},${c[1]}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="2"></path></svg>`;
  host.querySelectorAll("circle").forEach((node) => {
    node.onmouseenter = (ev) => { const p = points[node.dataset.i]; tip.style.display = "block"; tip.style.left = ev.clientX + 8 + "px"; tip.style.top = ev.clientY + 8 + "px"; tip.textContent = `${p.label}: ${p.value}`; };
    node.onmouseleave = () => { tip.style.display = "none"; };
  });
}

async function heatmap() {
  const metric = state.metric || "events";
  const cells = await api(`/api/heatmap/${state.worldId}?metric=${metric}`);
  const map = Object.fromEntries(cells.map((cell) => [cell.day, cell.value]));
  const days = [];
  const today = new Date();
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const max = Math.max(...cells.map((c) => c.value), 1);
  view.innerHTML = `<header class="bar"><h2>Heatmap</h2></header>
    <div class="chips">${["events", "sessions", "money", "goals", "building", "combat"].map((m) => `<button data-m="${m}" class="${m === metric ? "active" : ""}">${m}</button>`).join("")}</div>
    <div class="heat">${days.map((day) => `<i title="${day}: ${map[day] || 0}" data-day="${day}" style="opacity:${0.15 + 0.85 * ((map[day] || 0) / max)}"></i>`).join("")}</div>
    <div id="day"></div>`;
  view.querySelectorAll("[data-m]").forEach((btn) => btn.onclick = () => { state.metric = btn.dataset.m; heatmap(); });
  view.querySelectorAll("[data-day]").forEach((cell) => cell.onclick = async () => {
    const data = await api(`/api/day?world_id=${state.worldId}&day=${cell.dataset.day}`);
    $("#day").innerHTML = `<section class="panel"><h3>${cell.dataset.day}</h3>${eventRows(data.events)}</section>`;
  });
}

async function worlds() {
  const rows = await api("/api/worlds");
  view.innerHTML = `<header class="bar"><h2>Worlds</h2></header>
    <form id="world" class="panel"><div class="row"><input name="name" placeholder="Donut SMP" required><input name="edition" value="Bedrock"></div><div class="row"><input name="currency_name" value="coins"><input name="seed" placeholder="Seed, optional"></div><textarea name="description" placeholder="Description"></textarea><button class="primary">Save world</button></form>
    ${rows.map((w) => `<p class="click" data-w="${w.id}"><b>${esc(w.name)}</b> · ${w.events} events · ${money(w.balance)} ${esc(w.currency_name)}</p>`).join("")}`;
  $("#world").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const created = await api("/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    state.worldId = created.id;
    worlds();
  };
  view.querySelectorAll("[data-w]").forEach((row) => row.onclick = () => { state.worldId = row.dataset.w; go("dashboard"); });
}

async function more() {
  const achievements = await api("/api/achievements");
  const settings = await api("/api/settings");
  view.innerHTML = `<header class="bar"><h2>More</h2></header>
    <section class="panel"><h3>Search</h3><div class="row"><input id="q" placeholder="Worlds, events, players, goals"><button id="find">Search</button></div><div id="hits"></div></section>
    <section class="panel"><h3>Achievements</h3>${achievements.map((a) => `<p>${esc(a.name)} — ${a.unlocked_at ? when(a.unlocked_at) : "locked"}<br><span class="muted">${esc(a.description)}</span></p>`).join("")}</section>
    <section class="panel"><h3>Milestone</h3><form id="ms"><input name="title" placeholder="First million"><button>Add</button></form><button id="theme">Theme: ${settings.theme || "dark"}</button>
      <button id="remind">${settings.reminders_enabled === "1" ? "Reminders on" : "Reminders off"}</button></section>
    <section class="panel"><h3>Backup</h3><button id="export">Export everything</button><input id="file" type="file" accept="application/json"><select id="mode"><option>merge</option><option>replace</option></select><button id="import">Import backup</button><p class="muted">Replace asks for confirmation and deletes current records first.</p></section>
    <div class="more"><button data-route="players">Players</button><button data-route="sessions">Sessions</button><button data-route="analytics">Analytics</button><button data-route="heatmap">Heatmap</button><button data-route="items">Items</button><button data-route="goals">Goals</button><button data-route="worlds">Worlds</button></div>`;
  $("#find").onclick = async () => {
    const hits = await api("/api/search?q=" + encodeURIComponent($("#q").value));
    $("#hits").innerHTML = hits.map((h) => `<p>${esc(h.entity_type)} · ${esc(h.title)}</p>`).join("") || "<p class='empty'>No matches.</p>";
  };
  $("#ms").onsubmit = async (ev) => { ev.preventDefault(); await api("/api/milestones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ world_id: state.worldId, title: new FormData(ev.target).get("title") }) }); more(); };
  $("#theme").onclick = async () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; await api("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme }) }); more(); };
  $("#remind").onclick = async () => { const on = settings.reminders_enabled === "1" ? "0" : "1"; await api("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reminders_enabled: on }) }); more(); };
  $("#export").onclick = async () => {
    const data = await api("/api/backup");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "world-archaeologist-backup.json";
    link.click();
  };
  $("#import").onclick = async () => {
    const file = $("#file").files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    const mode = $("#mode").value;
    if (mode === "replace" && !confirm("Replace deletes current worlds, events, and settings. Continue?")) return;
    await api("/api/backup/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, confirm: true, data }) });
    state.worldId = null;
    go("dashboard");
  };
  view.querySelectorAll("[data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
}

async function search() { await more(); $("#q")?.focus(); }

function palette() {
  const box = $("#palette-box");
  const commands = [
    ["Add event", "add"], ["Start session", "sessions"], ["Goals", "goals"], ["Players", "players"],
    ["Analytics", "analytics"], ["Timeline", "timeline"], ["Search", "search"], ["Worlds", "worlds"], ["Economy", "economy"],
  ];
  box.innerHTML = `<input id="cmd" placeholder="Command"><div id="cmds">${commands.map((c) => `<button data-go="${c[1]}">${c[0]}</button>`).join("")}</div>`;
  $("#palette").classList.add("open");
  $("#cmd").focus();
  box.querySelectorAll("[data-go]").forEach((btn) => btn.onclick = () => { $("#palette").classList.remove("open"); go(btn.dataset.go); });
}

document.querySelectorAll(".side [data-route], .bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
document.addEventListener("keydown", (ev) => {
  if (ev.key === "/" && !ev.target.matches("input, textarea")) { ev.preventDefault(); go("search"); }
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); palette(); }
  if (ev.key === "Escape") $("#palette").classList.remove("open");
});
api("/api/settings").then((settings) => { if (settings.theme) document.documentElement.dataset.theme = settings.theme; }).finally(() => go("dashboard"));

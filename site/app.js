import { ACHIEVEMENTS, analytics, health, insights } from "./analytics.js";
import { all, exportBackup, id, importBackup, loadAll, put, remove, validateBackup } from "./db.js";
import { EVENT_TYPES, parseQuick } from "./parse.js";

const view = document.querySelector("#view");
const tip = document.querySelector("#tip");
const state = { route: "dashboard", worldId: localStorage.getItem("mwa-world") || null, records: null };

const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const money = (n) => n == null || n === "" ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const when = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";

async function refresh() {
  state.records = await loadAll();
  if (!state.worldId || !state.records.worlds.some((world) => world.id === state.worldId)) {
    state.worldId = state.records.worlds[0]?.id || null;
  }
  if (state.worldId) localStorage.setItem("mwa-world", state.worldId);
  await unlockAchievements();
}

function world() {
  return state.records.worlds.find((item) => item.id === state.worldId) || null;
}

function setActive(route) {
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
}

async function go(route) {
  state.route = route;
  setActive(route);
  try {
    await refresh();
    if (!world() && route !== "worlds" && route !== "more" && route !== "dashboard") {
      view.innerHTML = `<h2>No world yet</h2><p>Create a world first. The other screens read that record.</p><button class="primary" id="make">Create a world</button>`;
      document.querySelector("#make").onclick = () => go("worlds");
      return;
    }
    const pages = { dashboard, add, timeline, economy, items, goals, players, sessions, analytics: analyticsPage, heatmap, worlds, more };
    await pages[route]();
  } catch (err) {
    view.innerHTML = `<h2>Could not open this screen</h2><p>${esc(err.message || err)}</p>`;
  }
}

async function unlockAchievements() {
  const events = state.records.events;
  const facts = {
    events: events.length,
    streak: analytics(world() || { id: "" }, state.records).streak.longest,
    balance: Math.max(0, ...state.records.worlds.map((item) => analytics(item, state.records).balance), 0),
    goals: state.records.goals.filter((goal) => goal.status === "completed").length,
    sessions: state.records.sessions.filter((session) => session.endedAt).length,
    builds: events.filter((event) => event.eventType === "building").length,
    trades: events.filter((event) => event.eventType === "trade").length,
  };
  for (const [key, name, description, rule, threshold] of ACHIEVEMENTS) {
    const existing = state.records.achievements.find((row) => row.id === key);
    if (existing?.unlockedAt) continue;
    if ((facts[rule] || 0) >= threshold) {
      await put("achievements", { id: key, name, description, rule, threshold, unlockedAt: new Date().toISOString() });
    } else if (!existing) {
      await put("achievements", { id: key, name, description, rule, threshold, unlockedAt: null });
    }
  }
}

function eventList(events) {
  if (!events.length) return `<p class="empty">Nothing recorded yet.</p>`;
  return events.map((event) => `<article class="panel"><b>${esc(event.title)}</b><div class="muted">${when(event.occurredAt)} · ${esc(event.eventType)} ${event.amount ? money(event.amount) : ""} ${esc(event.itemName || "")}</div><button data-del="${event.id}">Delete</button></article>`).join("");
}

function bindDeletes() {
  view.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
    await remove("events", btn.dataset.del);
    const tx = (await all("transactions")).find((row) => row.eventId === btn.dataset.del);
    if (tx) await remove("transactions", tx.id);
    go(state.route);
  });
}

async function dashboard() {
  const current = world();
  if (!current) {
    view.innerHTML = `<h2>Start a world</h2><p>Records stay in this browser. The site does not read Minecraft files or need an account.</p><button class="primary" id="make">Create a world</button>`;
    document.querySelector("#make").onclick = () => go("worlds");
    return;
  }
  const stats = analytics(current, state.records);
  const lines = insights(current, state.records, stats);
  const status = health(current, state.records, stats);
  view.innerHTML = `<div class="bar"><div class="grow"><p class="muted">${esc(current.edition)} · ${esc(current.status)}</p><h2>${esc(current.name)}</h2></div><button class="primary" id="add">Add</button></div>
    <div class="grid"><div class="stat"><span class="muted">Balance</span><b>${money(stats.balance)}</b></div><div class="stat"><span class="muted">Events</span><b>${stats.events}</b></div><div class="stat"><span class="muted">Streak</span><b>${stats.streak.current}</b></div><div class="stat"><span class="muted">Score</span><b>${money(stats.progression.score)}</b></div></div>
    <section class="panel"><h3>From your records</h3>${lines.map((line) => `<p>${esc(line)}</p>`).join("")}</section>
    <section class="panel"><h3>World health</h3><p>Activity ${esc(status.activity)} · Economy ${esc(status.economy)} · ${status.goalsActive} active goals</p></section>
    <section class="panel"><h3>Recent</h3>${eventList(state.records.events.filter((event) => event.worldId === current.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6))}</section>`;
  document.querySelector("#add").onclick = () => go("add");
  bindDeletes();
}

async function add() {
  if (!world()) return go("worlds");
  view.innerHTML = `<h2>Add event</h2><textarea id="text" placeholder="Built castle and spent 120k on materials"></textarea>
    <div class="chips">${EVENT_TYPES.map(([key, label]) => `<button data-type="${key}">${label}</button>`).join("")}</div>
    <button id="preview" class="primary">Read it</button><div id="form"></div>`;
  document.querySelector("#text").focus();
  view.querySelectorAll("[data-type]").forEach((btn) => btn.onclick = () => { document.querySelector("#text").value = `${btn.dataset.type}: ${document.querySelector("#text").value}`; preview(); });
  document.querySelector("#preview").onclick = preview;
}

async function preview() {
  const names = state.records.players.filter((player) => player.worldId === state.worldId).map((player) => player.name);
  const parsed = parseQuick(document.querySelector("#text").value, names);
  if (!parsed.ok) { document.querySelector("#form").innerHTML = `<p>${esc(parsed.error)}</p>`; return; }
  document.querySelector("#form").innerHTML = `<p class="muted">Suggested by rules. Edit before saving.</p>
    <input id="title" value="${esc(parsed.title)}">
    <div class="row"><select id="type">${EVENT_TYPES.map(([key]) => `<option ${key === parsed.eventType ? "selected" : ""}>${key}</option>`).join("")}</select><input id="category" value="${esc(parsed.category)}"></div>
    <div class="row"><input id="amount" inputmode="decimal" placeholder="Money" value="${parsed.amount ?? ""}"><input id="item" placeholder="Item" value="${esc(parsed.itemName || "")}"><input id="delta" inputmode="decimal" placeholder="Item change" value="${parsed.itemDelta ?? ""}"></div>
    <input id="player" placeholder="Player" value="${esc(parsed.playerName || "")}">
    <button class="primary" id="save">Save on this phone</button>`;
  document.querySelector("#save").onclick = () => saveEvent(parsed);
}

async function saveEvent(parsed) {
  const now = new Date().toISOString();
  const playerName = document.querySelector("#player").value.trim();
  let playerId = null;
  if (playerName) {
    const existing = state.records.players.find((player) => player.worldId === state.worldId && player.name.toLowerCase() === playerName.toLowerCase());
    playerId = existing?.id || id();
    await put("players", { id: playerId, worldId: state.worldId, name: playerName, relationship: existing?.relationship || "friend", firstSeen: existing?.firstSeen || now.slice(0, 10), lastSeen: now.slice(0, 10), notes: existing?.notes || "" });
  }
  const amount = document.querySelector("#amount").value === "" ? null : Number(document.querySelector("#amount").value);
  const itemName = document.querySelector("#item").value.trim();
  const itemDelta = document.querySelector("#delta").value === "" ? null : Number(document.querySelector("#delta").value);
  const eventId = id();
  const open = state.records.sessions.find((session) => session.worldId === state.worldId && !session.endedAt);
  await put("events", {
    id: eventId, worldId: state.worldId, title: document.querySelector("#title").value.trim(), description: document.querySelector("#text").value,
    eventType: document.querySelector("#type").value, category: document.querySelector("#category").value, occurredAt: now, playerId, amount, itemName: itemName || null, itemDelta, sessionId: open?.id || null,
  });
  if (amount) await put("transactions", { id: id(), worldId: state.worldId, eventId, playerId, kind: amount > 0 ? "income" : "spending", category: document.querySelector("#category").value, amount, occurredAt: now, note: document.querySelector("#title").value });
  if (itemName && itemDelta != null) {
    const item = state.records.items.find((row) => row.worldId === state.worldId && row.name.toLowerCase() === itemName.toLowerCase()) || { id: id(), worldId: state.worldId, name: itemName };
    await put("items", item);
    const previous = state.records.itemRecords.filter((row) => row.itemId === item.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1);
    await put("itemRecords", { id: id(), itemId: item.id, eventId, delta: itemDelta, quantity: (previous?.quantity || 0) + itemDelta, occurredAt: now, note: document.querySelector("#title").value });
  }
  if (parsed.deathCount > 1) {
    for (let i = 1; i < parsed.deathCount; i += 1) await put("events", { id: id(), worldId: state.worldId, title: document.querySelector("#title").value, description: "", eventType: "death", category: "Combat", occurredAt: now, playerId });
  }
  go("timeline");
}

async function timeline() {
  const events = state.records.events.filter((event) => event.worldId === state.worldId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  view.innerHTML = `<h2>Timeline</h2><input id="q" placeholder="Filter"><div id="list">${eventList(events.slice(0, 40))}</div>`;
  document.querySelector("#q").oninput = () => {
    const q = document.querySelector("#q").value.toLowerCase();
    document.querySelector("#list").innerHTML = eventList(events.filter((event) => event.title.toLowerCase().includes(q)).slice(0, 40));
    bindDeletes();
  };
  bindDeletes();
}

async function economy() {
  const stats = analytics(world(), state.records);
  view.innerHTML = `<h2>Economy</h2><div class="grid"><div class="stat"><span class="muted">Balance</span><b>${money(stats.balance)}</b></div><div class="stat"><span class="muted">Income</span><b class="pos">${money(stats.income)}</b></div><div class="stat"><span class="muted">Spending</span><b class="neg">${money(stats.spending)}</b></div><div class="stat"><span class="muted">Net</span><b>${money(stats.net)}</b></div></div>
    <section class="panel"><h3>Balance</h3><div id="chart"></div></section>
    <section class="panel"><h3>Largest</h3>${[...stats.balanceSeries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6).map((row) => `<p class="${row.amount < 0 ? "neg" : "pos"}">${money(row.amount)} <span class="muted">${when(row.at)}</span></p>`).join("") || `<p class="empty">No money recorded.</p>`}</section>`;
  draw(document.querySelector("#chart"), stats.balanceSeries.map((row) => ({ label: row.at.slice(0, 10), value: row.balance })));
}

async function items() {
  const stats = analytics(world(), state.records);
  view.innerHTML = `<h2>Items</h2>${stats.items.map((item) => `<section class="panel"><h3>${esc(item.name)}</h3><p>Now ${money(item.current)} · high ${money(item.highest)} · low ${money(item.lowest)}</p></section>`).join("") || `<p class="empty">Add an item change, such as made 4,000 diamonds.</p>`}`;
}

async function goals() {
  const rows = state.records.goals.filter((goal) => goal.worldId === state.worldId);
  view.innerHTML = `<h2>Goals</h2><form id="goal" class="panel"><input name="title" placeholder="Reach 10M" required><input name="target" inputmode="decimal" value="1"><button class="primary">Add goal</button></form>
    ${rows.map((goal) => `<section class="panel"><b>${esc(goal.title)}</b> ${esc(goal.status)}<div class="progress"><div style="width:${Math.min(100, (goal.current / goal.target) * 100)}%"></div></div><p>${money(goal.current)} / ${money(goal.target)}</p><button data-goal="${goal.id}">Add 1</button></section>`).join("")}`;
  document.querySelector("#goal").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await put("goals", { id: id(), worldId: state.worldId, title: form.get("title"), target: Number(form.get("target") || 1), current: 0, status: "active", category: "General", priority: 2, createdAt: new Date().toISOString() });
    go("goals");
  };
  view.querySelectorAll("[data-goal]").forEach((btn) => btn.onclick = async () => {
    const goal = rows.find((row) => row.id === btn.dataset.goal);
    const current = goal.current + 1;
    await put("goals", { ...goal, current, status: current >= goal.target ? "completed" : goal.status, completedAt: current >= goal.target ? new Date().toISOString() : goal.completedAt });
    go("goals");
  });
}

async function players() {
  const stats = analytics(world(), state.records);
  view.innerHTML = `<h2>Players</h2><form id="player" class="panel"><input name="name" placeholder="Name" required><button class="primary">Add player</button></form>
    <table><tr><th>Player</th><th>Events</th><th>Money</th><th>Deaths</th></tr>${stats.players.map((player) => `<tr><td>${esc(player.name)}</td><td>${player.events}</td><td>${money(player.money)}</td><td>${player.deaths}</td></tr>`).join("")}</table>`;
  document.querySelector("#player").onsubmit = async (ev) => {
    ev.preventDefault();
    await put("players", { id: id(), worldId: state.worldId, name: new FormData(ev.target).get("name"), relationship: "friend", firstSeen: new Date().toISOString().slice(0, 10), lastSeen: new Date().toISOString().slice(0, 10), notes: "" });
    go("players");
  };
}

async function sessions() {
  const rows = state.records.sessions.filter((session) => session.worldId === state.worldId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const stats = analytics(world(), state.records);
  view.innerHTML = `<h2>Sessions</h2><div class="row"><button class="primary" id="start">Start</button><button id="end">End</button></div>
    <p>Recorded ${Math.round(stats.sessions.totalSeconds / 60)} minutes</p>
    ${rows.map((session) => `<p>${when(session.startedAt)} → ${when(session.endedAt)}</p>`).join("") || `<p class="empty">No sessions.</p>`}`;
  document.querySelector("#start").onclick = async () => { await put("sessions", { id: id(), worldId: state.worldId, startedAt: new Date().toISOString(), endedAt: null, notes: "" }); go("sessions"); };
  document.querySelector("#end").onclick = async () => {
    const open = rows.find((session) => !session.endedAt);
    if (!open) return;
    await put("sessions", { ...open, endedAt: new Date().toISOString() });
    go("sessions");
  };
}

async function analyticsPage() {
  const stats = analytics(world(), state.records);
  view.innerHTML = `<h2>Analytics</h2><section class="panel"><h3>Events by day</h3><div id="c1"></div></section><section class="panel"><h3>Combat</h3><p>Wins ${stats.combat.wins} · losses ${stats.combat.losses} · deaths ${stats.combat.deaths}</p></section>
    <form id="weight" class="panel"><h3>Progression weight</h3><input name="label" placeholder="Elytra"><input name="points" inputmode="decimal" placeholder="100"><input name="match" placeholder="elytra"><button>Add weight</button><p class="muted">${esc(stats.progression.note)}</p></form>`;
  draw(document.querySelector("#c1"), stats.byDay.map((row) => ({ label: row.day, value: row.count })));
  document.querySelector("#weight").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    await put("weights", { id: id(), worldId: state.worldId, label: form.get("label"), points: Number(form.get("points")), matchField: "title", matchValue: form.get("match") });
    go("analytics");
  };
}

function draw(host, points) {
  if (!host || !points.length) { if (host) host.innerHTML = `<p class="empty">Nothing recorded for this chart.</p>`; return; }
  const w = 320, h = 160, pad = 16;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const span = max - min || 1;
  const step = (w - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => [pad + index * step, h - pad - ((point.value - min) / span) * (h - pad * 2)]);
  host.innerHTML = `<svg class="chart" viewBox="0 0 ${w} ${h}">${coords.map((c, i) => `<circle data-i="${i}" cx="${c[0]}" cy="${c[1]}" r="4" fill="currentColor"></circle>`).join("")}<path d="${coords.map((c, i) => `${i ? "L" : "M"}${c[0]},${c[1]}`).join(" ")}" fill="none" stroke="currentColor"></path></svg>`;
  host.querySelectorAll("circle").forEach((node) => {
    node.onpointerdown = (ev) => { const point = points[node.dataset.i]; tip.style.display = "block"; tip.style.left = `${ev.clientX}px`; tip.style.top = `${ev.clientY - 28}px`; tip.textContent = `${point.label}: ${point.value}`; };
  });
}

async function heatmap() {
  const events = state.records.events.filter((event) => event.worldId === state.worldId);
  const counts = events.reduce((acc, event) => { const day = event.occurredAt.slice(0, 10); acc[day] = (acc[day] || 0) + 1; return acc; }, {});
  const days = [];
  for (let i = 83; i >= 0; i -= 1) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const max = Math.max(...Object.values(counts), 1);
  view.innerHTML = `<h2>Heatmap</h2><div class="heat">${days.map((day) => `<i data-day="${day}" style="opacity:${0.15 + 0.85 * ((counts[day] || 0) / max)}"></i>`).join("")}</div><div id="day"></div>`;
  view.querySelectorAll("[data-day]").forEach((cell) => cell.onclick = () => {
    document.querySelector("#day").innerHTML = eventList(events.filter((event) => event.occurredAt.slice(0, 10) === cell.dataset.day));
  });
}

async function worlds() {
  view.innerHTML = `<h2>Worlds</h2><form id="world" class="panel"><input name="name" placeholder="Donut SMP" required><input name="edition" value="Bedrock"><input name="currencyName" value="coins"><button class="primary">Save world</button></form>
    ${state.records.worlds.map((item) => `<button data-w="${item.id}">${esc(item.name)}</button>`).join("")}`;
  document.querySelector("#world").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const worldId = id();
    await put("worlds", { id: worldId, name: form.get("name"), edition: form.get("edition") || "Bedrock", currencyName: form.get("currencyName") || "coins", status: "active", description: "", notes: "", tags: "", createdAt: new Date().toISOString() });
    state.worldId = worldId;
    go("dashboard");
  };
  view.querySelectorAll("[data-w]").forEach((btn) => btn.onclick = () => { state.worldId = btn.dataset.w; go("dashboard"); });
}

async function more() {
  view.innerHTML = `<h2>More</h2>
    <section class="panel"><h3>Search</h3><input id="q" placeholder="Events, players, goals"><div id="hits"></div></section>
    <section class="panel"><button data-go="players">Players</button><button data-go="goals">Goals</button><button data-go="items">Items</button><button data-go="sessions">Sessions</button><button data-go="analytics">Analytics</button><button data-go="heatmap">Heatmap</button><button data-go="worlds">Worlds</button></section>
    <section class="panel"><h3>Backup</h3><button id="export" class="primary">Export backup</button><input id="file" type="file" accept="application/json,.json"><select id="mode"><option>merge</option><option>replace</option></select><button id="import">Import backup</button><p class="muted">Replace asks before it deletes records on this phone.</p></section>
    <section class="panel"><button id="theme">Toggle light</button><p class="muted">Safari: Share, then Add to Home Screen. After one online visit, records still save offline.</p></section>
    <section class="panel"><h3>Achievements</h3>${state.records.achievements.map((row) => `<p>${esc(row.name)} — ${row.unlockedAt ? "unlocked" : "locked"}</p>`).join("")}</section>`;
  document.querySelector("#q").oninput = () => {
    const q = document.querySelector("#q").value.toLowerCase();
    const hits = [...state.records.events, ...state.records.players, ...state.records.goals, ...state.records.worlds].filter((row) => `${row.title || ""} ${row.name || ""}`.toLowerCase().includes(q)).slice(0, 20);
    document.querySelector("#hits").innerHTML = hits.map((row) => `<p>${esc(row.title || row.name)}</p>`).join("") || `<p class="empty">No matches.</p>`;
  };
  view.querySelectorAll("[data-go]").forEach((btn) => btn.onclick = () => go(btn.dataset.go));
  document.querySelector("#theme").onclick = () => { const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = next; localStorage.setItem("mwa-theme", next); };
  document.querySelector("#export").onclick = async () => {
    const payload = await exportBackup();
    const file = new File([JSON.stringify(payload, null, 2)], "world-archaeologist-backup.json", { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "World Archaeologist backup" }); return; }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
  };
  document.querySelector("#import").onclick = async () => {
    const file = document.querySelector("#file").files[0];
    if (!file) return;
    const payload = JSON.parse(await file.text());
    validateBackup(payload);
    const mode = document.querySelector("#mode").value;
    if (mode === "replace" && !confirm("Replace deletes the records stored in this browser. Continue?")) return;
    await importBackup(payload, mode);
    state.worldId = null;
    go("dashboard");
  };
}

document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=5");
document.documentElement.dataset.theme = localStorage.getItem("mwa-theme") || "dark";
go("dashboard");

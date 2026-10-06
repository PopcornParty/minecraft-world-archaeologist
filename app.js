const EVENT_TYPES = [
  ["money", "Money"],
  ["mining", "Mining"],
  ["building", "Building"],
  ["combat", "Combat"],
  ["exploration", "Exploration"],
  ["inventory", "Inventory"],
  ["achievement", "Achievement"],
  ["death", "Death"],
  ["player", "Player"],
  ["trade", "Trade"],
  ["note", "Note"],
  ["goal", "Goal"],
];

const TYPE_CATEGORY = {
  money: "Miscellaneous",
  mining: "Mining",
  building: "Construction",
  combat: "Combat",
  exploration: "Exploration",
  inventory: "Inventory",
  achievement: "Progress",
  death: "Combat",
  player: "Social",
  trade: "Trading",
  note: "Notes",
  goal: "Goals",
};

const AMOUNT = /(?<sign>\+|-)?(?<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?<suffix>[kKmMbB])?/;
const STACKS = /(?<num>\d+)\s+stacks?\s+of\s+(?<item>[a-zA-Z][a-zA-Z0-9_ ]{0,40})/i;
const ITEM_QTY = /(?<verb>made|mined|found|got|collected|gained|sold|used|spent|lost)\s+(?<num>\d{1,3}(?:,\d{3})+|\d+)\s+(?<item>[a-zA-Z][a-zA-Z0-9_ ]{0,32})/i;
const COUNT_WORDS = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3 };

function scale(number, suffix) {
  let value = Number(String(number).replace(/,/g, ""));
  if (suffix) value *= { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffix.toLowerCase()];
  return value;
}

function moneyAmount(text) {
  const spend = /\b(spent|spend|paid|bought|cost|lost)\b/i.test(text);
  const income = /\b(earned|sold for|received|gained|profit|income)\b/i.test(text);
  const match = text.match(AMOUNT);
  if (!match) return null;
  if (!spend && !income && !match.groups.suffix && !match.groups.sign) return null;
  let value = scale(match.groups.num, match.groups.suffix);
  if (match.groups.sign === "-") return -value;
  if (match.groups.sign === "+") return value;
  if (spend && !income) return -value;
  if (income && !spend) return value;
  return spend ? -value : value;
}

function eventType(text) {
  const lowered = text.toLowerCase();
  const rules = [
    ["death", ["died", "death", "deaths"]],
    ["player", ["joined", "left the", "logged on"]],
    ["trade", ["sold", "bought", "traded", "trade"]],
    ["building", ["built", "build", "expanded", "constructed", "castle", "farm", "base"]],
    ["mining", ["mined", "mining", "diamonds", "ancient debris"]],
    ["combat", ["pvp", "won", "lost a fight", "killed"]],
    ["exploration", ["found a", "explored", "discovered", "location", "nether", "the end"]],
    ["achievement", ["elytra", "unlocked", "achievement"]],
    ["goal", ["goal"]],
    ["inventory", ["inventory", "picked up"]],
    ["money", ["spent", "earned", "paid", "balance"]],
  ];
  for (const [name, words] of rules) {
    if (words.some((word) => lowered.includes(word))) return name;
  }
  return "note";
}

function item(text) {
  const stacks = text.match(STACKS);
  if (stacks) {
    let delta = Number(stacks.groups.num) * 64;
    if (/\b(sold|used|spent|lost)\b/i.test(text)) delta = -delta;
    return [stacks.groups.item.trim().replace(/\.$/, ""), delta];
  }
  const found = text.match(ITEM_QTY);
  if (!found) return /\belytra\b/i.test(text) ? ["Elytra", 1] : [null, null];
  let delta = Number(found.groups.num.replace(/,/g, ""));
  if (["sold", "used", "spent", "lost"].includes(found.groups.verb.toLowerCase())) delta = -delta;
  return [found.groups.item.trim().replace(/\.$/, ""), delta];
}

function player(text, known = []) {
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    if (name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return name;
  }
  const joined = text.match(/\b([A-Z][A-Za-z0-9_]{1,20})\s+(joined|left)\b/);
  return joined ? joined[1] : null;
}

function deaths(text) {
  if (!/\b(died|death|deaths)\b/i.test(text)) return null;
  const numbered = text.match(/\b(\d+)\b/);
  if (numbered) return Number(numbered[1]);
  for (const [word, count] of Object.entries(COUNT_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return count;
  }
  return 1;
}

function parseQuick(text, players = []) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Enter what happened." };
  let type = eventType(raw);
  const amount = moneyAmount(raw);
  const [itemName, itemDelta] = item(raw);
  if (amount != null && type === "note") type = "money";
  if (itemDelta != null && (type === "note" || type === "money")) type = itemDelta > 0 ? "mining" : "inventory";
  return {
    ok: true,
    source: "rules",
    eventType: type,
    category: TYPE_CATEGORY[type],
    title: raw.slice(0, 120),
    description: raw,
    amount,
    itemName,
    itemDelta,
    playerName: player(raw, players),
    deathCount: deaths(raw),
  };
}
function dayOf(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function streakInfo(events) {
  const days = [...new Set(events.map((event) => dayOf(event.occurredAt)).filter(Boolean))].sort();
  if (!days.length) return { current: 0, longest: 0, activeDays: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = new Date(`${days[i - 1]}T00:00:00`);
    const next = new Date(`${days[i]}T00:00:00`);
    const diff = (next - prev) / 86400000;
    if (diff === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (diff !== 0) run = 1;
  }
  const today = new Date();
  const key = today.toISOString().slice(0, 10);
  const set = new Set(days);
  let cursor = set.has(key) ? today : new Date(today.getTime() - 86400000);
  let current = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return { current, longest, activeDays: days.length };
}

function analytics(world, records) {
  const events = records.events.filter((event) => event.worldId === world.id);
  const txs = records.transactions.filter((tx) => tx.worldId === world.id);
  const income = txs.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const spending = txs.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0);
  let running = 0;
  const balanceSeries = [...txs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((tx) => {
    running += tx.amount;
    return { at: tx.occurredAt, amount: tx.amount, balance: running };
  });
  const byType = Object.entries(events.reduce((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
    return acc;
  }, {})).map(([eventType, count]) => ({ eventType, count })).sort((a, b) => b.count - a.count);
  const byDay = Object.entries(events.reduce((acc, event) => {
    const day = dayOf(event.occurredAt);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {})).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));
  const sessions = records.sessions.filter((session) => session.worldId === world.id);
  const durations = sessions.filter((session) => session.endedAt).map((session) => (new Date(session.endedAt) - new Date(session.startedAt)) / 1000);
  const items = records.items.filter((item) => item.worldId === world.id).map((item) => {
    const series = records.itemRecords.filter((row) => row.itemId === item.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const quantities = series.map((row) => row.quantity).filter((value) => value != null);
    return {
      ...item,
      current: quantities.at(-1) || 0,
      highest: quantities.length ? Math.max(...quantities) : 0,
      lowest: quantities.length ? Math.min(...quantities) : 0,
      gained: series.filter((row) => row.delta > 0).reduce((sum, row) => sum + row.delta, 0),
      lost: series.filter((row) => row.delta < 0).reduce((sum, row) => sum + row.delta, 0),
      series,
    };
  });
  const players = records.players.filter((player) => player.worldId === world.id).map((player) => ({
    ...player,
    events: events.filter((event) => event.playerId === player.id).length,
    money: txs.filter((tx) => tx.playerId === player.id).reduce((sum, tx) => sum + tx.amount, 0),
    builds: events.filter((event) => event.playerId === player.id && event.eventType === "building").length,
    deaths: events.filter((event) => event.playerId === player.id && event.eventType === "death").length,
  }));
  const weights = records.weights.filter((weight) => !weight.worldId || weight.worldId === world.id);
  const matched = weights.map((weight) => {
    const hits = events.filter((event) => String(event[weight.matchField] || "").toLowerCase().includes(weight.matchValue.toLowerCase())).length;
    return { ...weight, hits, points: hits * weight.points };
  }).filter((row) => row.hits);
  const wins = events.filter((event) => event.eventType === "combat" && /won/i.test(event.title)).length;
  const losses = events.filter((event) => event.eventType === "combat" && /lost/i.test(event.title)).length;
  return {
    events: events.length,
    income,
    spending,
    net: income + spending,
    balance: running,
    balanceSeries,
    byType,
    byDay,
    items,
    players,
    sessions: {
      count: durations.length,
      totalSeconds: durations.reduce((sum, value) => sum + value, 0),
      averageSeconds: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
      longestSeconds: durations.length ? Math.max(...durations) : 0,
    },
    streak: streakInfo(events),
    progression: { score: matched.reduce((sum, row) => sum + row.points, 0), matched, note: "Score uses only the weights you configured." },
    combat: { wins, losses, deaths: events.filter((event) => event.eventType === "death").length, winRate: wins + losses ? wins / (wins + losses) : null },
    spendingCategories: Object.entries(txs.filter((tx) => tx.amount < 0).reduce((acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    }, {})).map(([category, total]) => ({ category, total })),
  };
}

function insights(world, records, stats) {
  const lines = [];
  if (stats.byType[0]) lines.push(`${stats.byType[0].eventType} is the most common recorded event type (${stats.byType[0].count}).`);
  if (stats.income || stats.spending) lines.push(`Recorded net change is ${Math.round(stats.net).toLocaleString()} ${world.currencyName || "coins"}.`);
  const completed = records.goals.filter((goal) => goal.worldId === world.id && goal.status === "completed").length;
  if (completed) lines.push(`${completed} goals are marked completed.`);
  if (!lines.length) lines.push("Record a few events and these lines will be calculated from them.");
  return lines;
}

function health(world, records, stats) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recent = records.events.filter((event) => event.worldId === world.id && dayOf(event.occurredAt) >= weekAgo).length;
  const last = records.sessions.filter((session) => session.worldId === world.id).map((session) => session.startedAt).sort().at(-1) || null;
  return {
    activity: recent >= 5 ? "high" : recent >= 1 ? "medium" : "low",
    recentEvents: recent,
    goalsActive: records.goals.filter((goal) => goal.worldId === world.id && goal.status === "active").length,
    economy: stats.net > 0 ? "growing" : stats.net < 0 ? "down" : "flat",
    lastSession: last,
    streak: stats.streak.current,
  };
}

const ACHIEVEMENTS = [
  ["first_event", "First event", "Record one event.", "events", 1],
  ["events_10", "Ten events", "Record 10 events.", "events", 10],
  ["events_100", "Hundred events", "Record 100 events.", "events", 100],
  ["streak_7", "Seven-day streak", "Record activity on 7 consecutive days.", "streak", 7],
  ["streak_30", "Thirty-day streak", "Record activity on 30 consecutive days.", "streak", 30],
  ["first_million", "First million", "Reach a recorded balance of 1,000,000.", "balance", 1000000],
  ["ten_million", "Ten million", "Reach a recorded balance of 10,000,000.", "balance", 10000000],
  ["goals_10", "Ten goals", "Complete 10 goals.", "goals", 10],
  ["sessions_10", "Ten sessions", "Record 10 finished sessions.", "sessions", 10],
  ["builds_100", "Hundred builds", "Record 100 building events.", "builds", 100],
  ["trades_100", "Hundred trades", "Record 100 trade events.", "trades", 100],
];
const STORES = ["worlds", "players", "events", "transactions", "items", "itemRecords", "goals", "sessions", "locations", "journal", "milestones", "achievements", "weights", "settings"];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mwa", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
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
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}

async function remove(store, id) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

async function loadAll() {
  const records = {};
  for (const store of STORES) records[store] = await all(store);
  return records;
}

async function exportBackup() {
  const records = await loadAll();
  return { format: "mwa-backup", version: 3, exportedAt: new Date().toISOString(), ...records };
}

function validateBackup(payload) {
  if (!payload || payload.format !== "mwa-backup" || payload.version !== 3) {
    throw new Error("This file is not a World Archaeologist backup.");
  }
  for (const store of ["worlds", "events", "players", "goals"]) {
    if (!Array.isArray(payload[store])) throw new Error(`Backup is missing ${store}.`);
  }
  return true;
}

async function importBackup(payload, mode) {
  validateBackup(payload);
  if (mode !== "merge" && mode !== "replace") throw new Error("Choose merge or replace.");
  const db = await openDb();
  const tx = db.transaction(STORES, "readwrite");
  for (const store of STORES) {
    const objectStore = tx.objectStore(store);
    if (mode === "replace") objectStore.clear();
    for (const row of payload[store] || []) objectStore.put(row);
  }
  await txDone(tx);
  return { worlds: (payload.worlds || []).length };
}

function id() {
  return crypto.randomUUID().replace(/-/g, "");
}

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
/* service worker reset is handled by the already installed worker */
document.documentElement.dataset.theme = localStorage.getItem("mwa-theme") || "dark";
go("dashboard");

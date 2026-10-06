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

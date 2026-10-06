const KINDS = ["Builder", "Technical", "Explorer", "Adventure", "Collector", "Experimenter", "Chaos", "Redstone", "Decorator", "Project-focused"];
const DONE = ["Dragon", "Dragon Egg", "Nether", "Wither", "Netherite", "Max Gear", "Elytra", "End Cities", "Major Farms", "Villager Infrastructure", "Large Storage"];
const BASES = ["Castle", "Town", "City", "House", "Survival Base", "Industrial Base", "Underground", "Ocean", "Mountain", "Village", "Multiple Bases", "Custom"];
const ASSETS = ["Mega farm", "Trading hall", "Storage system", "Railway", "Secret base", "Village", "Mob farm", "Industrial area", "Nether hub", "Road network", "Collection", "Arena"];
const LOVES = ["Building", "Technical", "Exploring", "Collecting", "Decorating", "Automation", "Adventure", "Projects", "Challenges", "Chaos", "Planning", "Lore"];
const NEVER = ["Mining", "Grinding", "Resource gathering", "Building", "Redstone", "Exploration", "Villagers", "Nether", "Fighting", "Farms", "Long projects", "Short projects", "Repetitive tasks", "Beginner progression"];

const GEAR = [/get netherite/i, /mine ancient debris/i, /get an? elytra/i, /find an? elytra/i, /defeat the (ender )?dragon/i, /kill the (ender )?dragon/i, /enter the nether/i, /go to the nether/i, /start getting diamond/i, /get diamond gear/i];

function finished(world) {
  const text = `${world.gear || ""} ${world.finished || ""} ${(world.done || []).join(" ")} ${world.progress || ""}`.toLowerCase();
  const flags = {
    dragon: /dragon/.test(text),
    egg: /egg/.test(text),
    nether: /nether/.test(text),
    wither: /wither/.test(text),
    netherite: /netherite/.test(text),
    elytra: /elytra/.test(text),
    max: /max gear|maxed|full netherite/.test(text),
  };
  flags.endgame = world.progress === "Basically finished" || world.stage === "Endgame" || (flags.netherite && flags.elytra && flags.dragon);
  return flags;
}

function blocked(text, world, never) {
  const flags = finished(world);
  if (flags.elytra && /elytra/i.test(text) && /get|find|obtain/i.test(text)) return true;
  if (flags.dragon && /dragon/i.test(text) && /defeat|kill|fight/i.test(text)) return true;
  if (flags.netherite && /netherite/i.test(text) && /get|mine|upgrade to/i.test(text)) return true;
  if (flags.nether && /enter the nether|go to the nether/i.test(text)) return true;
  if ((never || []).includes("Beginner progression") && /diamond gear|first pickaxe|starter base/i.test(text)) return true;
  if ((never || []).includes("Grinding") && /grind|farm for hours/i.test(text)) return true;
  if ((never || []).includes("Mining") && /^mine /i.test(text)) return true;
  return GEAR.some((rule) => rule.test(text));
}

function phaseLabel(world, likes) {
  const flags = finished(world);
  const bits = [];
  if (flags.endgame) bits.push("Endgame");
  else if (world.stage) bits.push(world.stage);
  if ((likes || []).includes("Building") || /castle|city|town/i.test(world.baseType || world.base || "")) bits.push("Builder");
  if ((likes || []).includes("Technical") || (likes || []).includes("Automation")) bits.push("Technical");
  if ((likes || []).includes("Chaos")) bits.push("Chaos");
  return bits.length ? bits.join(" / ") : "In progress";
}

function ambitionLine(world, level) {
  const base = world.base || world.baseType || "the base";
  const lines = {
    0: `Improve the ${base} entrance.`,
    1: `Build a district around the ${base}.`,
    2: `Build a kingdom with the ${base} at the centre.`,
    3: `A kingdom with districts, roads, landmarks, and its own identity.`,
  };
  return lines[level] || lines[1];
}

function recommend(world, profile) {
  const likes = profile.ranked || profile.kinds || [];
  const never = profile.never || [];
  const base = world.base || world.baseType || "your base";
  const flags = finished(world);
  const pool = [];
  if (world.doing) pool.push({ title: `Finish ${world.doing}`, why: "This is the thing you said you are building. It should come before a new world.", minutes: 45, type: "Build" });
  if (flags.endgame) pool.push({ title: `Turn ${base} into a settlement`, why: "Progression is done. The interesting work is identity around the place you already live.", minutes: 150, type: "Build" });
  if (world.problem) pool.push({ title: `Deal with: ${world.problem}`, why: "You named this as the annoying part. Fixing it beats a random project.", minutes: 60, type: "Plan" });
  if (world.legacy) pool.push({ title: world.legacy, why: "This is the long ambition you wrote down.", minutes: 240, type: "Legacy" });
  pool.push({ title: ambitionLine(world, profile.ambition ?? 1), why: "Matched to the ambition level you set.", minutes: 90, type: "Build" });
  if (!(never.includes("Exploration"))) pool.push({ title: "An outpost in a biome you do not live in", why: "A different session from the main build.", minutes: 40, type: "Explore" });
  if ((likes.includes("Chaos") || profile.boredom === "Do something stupid")) pool.push({ title: "A monument to a useless item", why: "You asked for chaos. This does not need new gear.", minutes: 50, type: "Chaos" });
  if (!flags.endgame) pool.push({ title: "A safe return point and a marked chest", why: "The world is not finished on gear yet. A bed and a chest still matter.", minutes: 15, type: "Survival" });
  return pool.filter((item) => !blocked(item.title + " " + item.why, world, never)).slice(0, 3);
}

function analyse(world, profile) {
  const flags = finished(world);
  const lines = [];
  lines.push(flags.endgame ? "Progression is basically complete." : "Progression is still open, so early goals can stay.");
  if ((profile.ranked || [])[0]) lines.push(`You ranked ${(profile.ranked || [])[0]} first.`);
  if (world.doing) lines.push(`${world.doing} is the unfinished project.`);
  if ((profile.never || []).length) lines.push(`I will not suggest: ${profile.never.slice(0, 3).join(", ")}.`);
  if (flags.endgame) lines.push("Beginner gear goals are off.");
  return lines;
}

function reply(text, world, profile) {
  const raw = text.toLowerCase();
  if (/30|minutes/.test(raw)) return { title: `A small landmark by ${world.base || "home"}`, why: "Half an hour. Not a new kingdom.", minutes: 30, type: "Quick" };
  if (/insane|unhinged|huge/.test(raw)) return { title: ambitionLine(world, 3), why: "Escalated from the base you already have.", minutes: 240, type: "Chaos" };
  if (/missing|gap/.test(raw)) return { title: world.problem ? `Fix ${world.problem}` : "Roads and a reason to leave the base", why: "The gap is experience, not another sword.", minutes: 70, type: "Plan" };
  if (/bored/.test(raw)) return recommend(world, { ...profile, boredom: "Do something stupid" })[0];
  return recommend(world, profile)[0];
}

const STORES = ["profiles", "worlds", "projects", "events", "locations", "memories", "items", "goals", "choices"];
const state = { route: "home", profileId: localStorage.getItem("mwa-profile"), worldId: localStorage.getItem("mwa-world"), records: null, step: 0, draft: null };

function esc(value) { return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("mwa-director", 1); request.onupgradeneeded = () => STORES.forEach((name) => { if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" }); }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const store of STORES) records[store] = await all(store); return records; }
function profile() { return state.records.profiles.find((item) => item.id === state.profileId) || null; }
function world() { return state.records.worlds.find((item) => item.id === state.worldId && item.profileId === state.profileId) || null; }
function view(html) { document.querySelector("#view").innerHTML = html; }
function chips(list, selected, key) { return `<div class="chips">${list.map((item) => `<button type="button" data-${key}="${esc(item)}" class="${selected.has(item) ? "primary" : ""}">${esc(item)}</button>`).join("")}</div>`; }
function bindSet(key, selected) { document.querySelectorAll(`[data-${key}]`).forEach((btn) => btn.onclick = () => { selected.has(btn.dataset[key]) ? selected.delete(btn.dataset[key]) : selected.add(btn.dataset[key]); btn.classList.toggle("primary"); }); }

async function go(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  state.records = await load();
  if (!state.profileId || !profile()) { state.profileId = null; return interview(); }
  if (!world() || !world().onboarded) return interview();
  const pages = { home, discover, talk, world: worldPage, me };
  await pages[route]();
}

function interview() {
  const draft = state.draft || { kinds: [], done: [], assets: [], ranked: [], never: [], ambition: 1, memories: "" };
  state.draft = draft;
  const steps = [meet, who, worldStep, progress, base, assets, loves, neverStep, timeStep, ambition, problem, legacy, memory, thinking, result];
  steps[Math.min(state.step, steps.length - 1)](draft);
}
function next(draft) { state.draft = draft; state.step += 1; interview(); }
function bar() { return `<p class="kicker">Step ${state.step + 1} of 15</p>`; }

function meet() { view(`${bar()}<h2>Let’s get to know your world.</h2><p>Answers stay on this phone. They stop the director suggesting things you have already finished.</p><button class="primary" id="go">Let’s go</button>`); document.querySelector("#go").onclick = () => next(state.draft); }
function who(draft) {
  const kinds = new Set(draft.kinds);
  view(`${bar()}<h2>Who’s playing?</h2><input id="name" placeholder="Name" value="${esc(draft.name || "")}"><p class="muted">More than one is fine.</p>${chips(KINDS, kinds, "k")}<button class="primary" id="go">Next</button>`);
  bindSet("k", kinds);
  document.querySelector("#go").onclick = () => next({ ...draft, name: document.querySelector("#name").value || "Player", kinds: [...kinds] });
}
function worldStep(draft) {
  view(`${bar()}<h2>Tell me about your world.</h2><input id="wname" placeholder="World name" value="${esc(draft.worldName || "")}"><input id="day" inputmode="numeric" placeholder="Minecraft day" value="${draft.day ?? ""}"><input id="desc" placeholder="One line about it" value="${esc(draft.description || "")}"><p class="muted">How does it feel right now?</p>${["Early Survival", "Established", "Developed", "Endgame", "Completely ridiculous"].map((item) => `<button data-s="${item}">${item}</button>`).join("")}`);
  document.querySelectorAll("[data-s]").forEach((btn) => btn.onclick = () => next({ ...draft, worldName: document.querySelector("#wname").value || "Survival", day: Number(document.querySelector("#day").value) || 0, description: document.querySelector("#desc").value, stage: btn.dataset.s }));
}
function progress(draft) {
  if (draft.stage === "Early Survival") return next({ ...draft, progress: "Still upgrading", done: [] });
  view(`${bar()}<h2>How far have you pushed progression?</h2><p class="muted">This only decides what I must not suggest.</p>${["Still upgrading", "Mostly maxed", "Basically finished"].map((item) => `<button data-p="${item}">${item}</button>`).join("")}`);
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { draft.progress = btn.dataset.p; if (btn.dataset.p === "Still upgrading") next(draft); else donePick(draft); });
}
function donePick(draft) {
  const done = new Set(draft.done);
  view(`${bar()}<h2>Mark what is finished.</h2><p class="muted">Finished means I will not tell you to go get it.</p>${chips(DONE, done, "d")}<button class="primary" id="go">Next</button>`);
  bindSet("d", done);
  document.querySelector("#go").onclick = () => next({ ...draft, done: [...done] });
}
function base(draft) {
  view(`${bar()}<h2>Where do you actually live?</h2>${BASES.map((item) => `<button data-b="${item}">${item}</button>`).join("")}`);
  document.querySelectorAll("[data-b]").forEach((btn) => btn.onclick = () => { draft.baseType = btn.dataset.b; finishSlider(draft); });
}
function finishSlider(draft) {
  view(`${bar()}<h2>How finished is the ${esc(draft.baseType)}?</h2><input id="fin" type="range" min="0" max="100" value="${draft.baseFinish || 40}"><p id="pct"></p><input id="doing" placeholder="What are you building now?" value="${esc(draft.doing || "")}"><button class="primary" id="go">Next</button>`);
  const show = () => { document.querySelector("#pct").textContent = `${document.querySelector("#fin").value}% finished`; }; show();
  document.querySelector("#fin").oninput = show;
  document.querySelector("#go").onclick = () => next({ ...draft, baseFinish: Number(document.querySelector("#fin").value), doing: document.querySelector("#doing").value });
}
function assets(draft) {
  const assets = new Set(draft.assets);
  view(`${bar()}<h2>What else matters?</h2><p class="muted">Only important things. Skip is fine.</p>${chips(ASSETS, assets, "a")}<button id="skip">Skip for now</button><button class="primary" id="go">Next</button>`);
  bindSet("a", assets);
  document.querySelector("#skip").onclick = () => next({ ...draft, assets: [] });
  document.querySelector("#go").onclick = () => next({ ...draft, assets: [...assets] });
}
function loves(draft) {
  view(`${bar()}<h2>What do you actually enjoy?</h2><p class="muted">Tap in order. First tap is the favourite.</p><div id="rank"></div>${LOVES.map((item) => `<button data-l="${item}">${item}</button>`).join("")}<button class="primary" id="go">Next</button>`);
  const ranked = [...draft.ranked];
  const paint = () => { document.querySelector("#rank").innerHTML = ranked.map((item, i) => `<p>${i + 1}. ${esc(item)}</p>`).join(""); };
  document.querySelectorAll("[data-l]").forEach((btn) => btn.onclick = () => { if (!ranked.includes(btn.dataset.l)) ranked.push(btn.dataset.l); paint(); });
  document.querySelector("#go").onclick = () => next({ ...draft, ranked });
}
function neverStep(draft) {
  const never = new Set(draft.never);
  view(`${bar()}<h2>What should I stop suggesting?</h2>${chips(NEVER, never, "n")}<input id="custom" placeholder="Don’t give me beginner stuff"><button class="primary" id="go">Next</button>`);
  bindSet("n", never);
  document.querySelector("#go").onclick = () => { const custom = document.querySelector("#custom").value; if (custom) never.add(custom); next({ ...draft, never: [...never] }); };
}
function timeStep(draft) {
  view(`${bar()}<h2>How much time do you normally have?</h2>${["10 minutes", "30 minutes", "1 hour", "2+ hours", "Depends"].map((item) => `<button data-t="${item}">${item}</button>`).join("")}`);
  document.querySelectorAll("[data-t]").forEach((btn) => btn.onclick = () => { draft.time = btn.dataset.t; boredom(draft); });
}
function boredom(draft) {
  view(`${bar()}<h2>When you don’t know what to do?</h2>${["Quick win", "Improve something", "Start something huge", "Explore", "Do something stupid", "Plan a project", "Just give me something random"].map((item) => `<button data-b="${item}">${item}</button>`).join("")}`);
  document.querySelectorAll("[data-b]").forEach((btn) => btn.onclick = () => next({ ...draft, boredom: btn.dataset.b }));
}
function ambition(draft) {
  const examples = ["Improve the castle entrance.", "Build a full district around the castle.", "Build an entire kingdom.", "A kingdom with districts, roads, landmarks, and its own identity."];
  view(`${bar()}<h2>How ambitious should I be?</h2><input id="amb" type="range" min="0" max="3" value="${draft.ambition || 1}"><p id="ex"></p><button class="primary" id="go">Next</button>`);
  const show = () => { document.querySelector("#ex").textContent = examples[Number(document.querySelector("#amb").value)]; }; show();
  document.querySelector("#amb").oninput = show;
  document.querySelector("#go").onclick = () => next({ ...draft, ambition: Number(document.querySelector("#amb").value) });
}
function problem(draft) { view(`${bar()}<h2>What’s annoying you?</h2><textarea id="problem" placeholder="My castle feels empty.">${esc(draft.problem || "")}</textarea><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => next({ ...draft, problem: document.querySelector("#problem").value }); }
function legacy(draft) { view(`${bar()}<h2>If you could eventually do anything?</h2><p class="muted">Leave blank if you don’t know.</p><textarea id="legacy" placeholder="Build a giant kingdom.">${esc(draft.legacy || "")}</textarea><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => next({ ...draft, legacy: document.querySelector("#legacy").value }); }
function memory(draft) { view(`${bar()}<h2>Anything you don’t want to forget?</h2><p class="muted">Optional.</p><textarea id="mem" placeholder="The dragon fight. A secret room.">${esc(draft.memories || "")}</textarea><button class="primary" id="go">Build the brain</button>`); document.querySelector("#go").onclick = () => next({ ...draft, memories: document.querySelector("#mem").value }); }

async function thinking(draft) {
  view(`<p class="kicker">Building your world brain</p><h2>Reading what you said.</h2><div id="log"></div>`);
  const lines = ["Understanding progression", "Learning playstyle", "Finding world gaps", "Learning preferences", "Building recommendations"];
  const log = document.querySelector("#log");
  for (const line of lines) { log.innerHTML += `<p>${esc(line)}</p>`; await new Promise((resolve) => setTimeout(resolve, 180)); }
  const profileId = state.profileId || uid();
  const worldId = uid();
  await put("profiles", { id: profileId, name: draft.name, kinds: draft.kinds, ranked: draft.ranked, never: draft.never, time: draft.time, boredom: draft.boredom, ambition: draft.ambition });
  const saved = { id: worldId, profileId, name: draft.worldName, day: draft.day, description: draft.description, stage: draft.stage, progress: draft.progress, done: draft.done, baseType: draft.baseType, base: draft.baseType, baseFinish: draft.baseFinish, doing: draft.doing, assets: draft.assets, problem: draft.problem, legacy: draft.legacy, gear: (draft.done || []).join(", "), finished: (draft.done || []).join(", "), onboarded: true };
  await put("worlds", saved);
  if (draft.doing) await put("projects", { id: uid(), profileId, worldId, name: draft.doing, status: "open", note: "From the interview" });
  if (draft.legacy) await put("goals", { id: uid(), profileId, worldId, title: draft.legacy, status: "open" });
  if (draft.memories) await put("memories", { id: uid(), profileId, worldId, title: draft.memories, at: new Date().toISOString() });
  state.profileId = profileId;
  state.worldId = worldId;
  state.records = await load();
  result(draft);
}
function result() {
  const current = world();
  const person = profile();
  const list = recommend(current, person);
  view(`<p class="kicker">${esc(phaseLabel(current, person.ranked))}</p><h2>${esc(current.name)}</h2><p>Day ${current.day}</p>${analyse(current, person).map((line) => `<p>${esc(line)}</p>`).join("")}<div id="recs">${list.map(card).join("")}</div><button id="bored">I’m bored.</button><button id="miss">What is my world missing?</button><div id="extra"></div><button class="primary" id="enter">Open the director</button>`);
  bindPlans();
  document.querySelector("#bored").onclick = () => { document.querySelector("#extra").innerHTML = card(reply("I'm bored", current, person)); bindPlans(); };
  document.querySelector("#miss").onclick = () => { document.querySelector("#extra").innerHTML = card(reply("what is missing", current, person)); bindPlans(); };
  document.querySelector("#enter").onclick = () => { state.step = 0; go("home"); };
}
function card(item) { return `<section class="block"><b>${esc(item.title)}</b><p>${esc(item.why)}</p><p class="muted">${item.minutes || ""} min · ${esc(item.type || "")}</p><button data-plan="${esc(item.title)}">Do it</button> <button data-insane="${esc(item.title)}">Make it insane</button> <button data-skip="${esc(item.type || "Build")}">Not for me</button></section>`; }
function bindPlans() {
  document.querySelectorAll("[data-plan]").forEach((btn) => btn.onclick = () => saveProject(btn.dataset.plan, "normal"));
  document.querySelectorAll("[data-insane]").forEach((btn) => btn.onclick = () => saveProject(`${btn.dataset.insane} — kingdom scale`, "insane"));
  document.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = async () => { await put("choices", { id: uid(), profileId: state.profileId, worldId: state.worldId, rejected: btn.dataset.skip }); btn.closest("section").remove(); });
}
async function saveProject(name) { await put("projects", { id: uid(), profileId: state.profileId, worldId: state.worldId, name, status: "open" }); document.querySelector("#panel").innerHTML = `<h2>Saved</h2><p>${esc(name)}</p><button id="close">Close</button>`; document.querySelector("#sheet").classList.add("open"); document.querySelector("#close").onclick = () => document.querySelector("#sheet").classList.remove("open"); }

async function home() {
  const current = world();
  const person = profile();
  const top = recommend(current, person)[0];
  view(`<p class="kicker">${esc(person.name)} · ${esc(current.name)}</p><h2>Day ${current.day || 0}</h2><p>${esc(phaseLabel(current, person.ranked))}</p><section class="block"><p class="kicker">Right now</p><b>${esc(top.title)}</b><p>${esc(top.why)}</p><button class="primary" id="do">Do it</button></section><div class="chips"><button data-q="I'm bored">I’m bored</button><button data-q="30 minutes">30 min</button><button data-q="make it insane">Make it insane</button><button data-q="what is missing">Surprise me</button></div><div id="out"></div>`);
  document.querySelector("#do").onclick = () => saveProject(top.title);
  document.querySelectorAll("[data-q]").forEach((btn) => btn.onclick = () => { document.querySelector("#out").innerHTML = card(reply(btn.dataset.q, current, person)); bindPlans(); });
}
async function discover() { if (!world()) return go("home"); const list = recommend(world(), profile()); view(`<h2>Discover</h2>${list.map(card).join("")}`); bindPlans(); }
async function talk() { view(`<h2>Talk</h2><p class="muted">Local rules. No online model.</p><textarea id="text" placeholder="I’m bored. Make the castle insane."></textarea><button class="primary" id="ask">Answer</button><div id="out"></div>`); document.querySelector("#ask").onclick = () => { document.querySelector("#out").innerHTML = card(reply(document.querySelector("#text").value, world(), profile())); bindPlans(); }; }
async function worldPage() { const current = world(); view(`<h2>${esc(current.name)}</h2>${analyse(current, profile()).map((line) => `<p>${esc(line)}</p>`).join("")}<p class="muted">${(state.records.projects.filter((row) => row.worldId === current.id)).map((row) => row.name).join(" · ") || "No saved projects yet."}</p><button id="again">Interview again</button>`); document.querySelector("#again").onclick = () => { state.step = 0; state.draft = null; interview(); }; }
async function me() {
  view(`<h2>Who’s playing?</h2>${state.records.profiles.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}<button id="new">Add person</button><button id="export">Export this person</button><input id="file" type="file" accept="application/json,.json"><button id="import">Import</button>`);
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = state.records.worlds.find((item) => item.profileId === btn.dataset.p)?.id || null; go("home"); });
  document.querySelector("#new").onclick = () => { state.profileId = null; state.worldId = null; state.step = 0; state.draft = null; interview(); };
  document.querySelector("#export").onclick = async () => { const payload = { format: "mwa-director", version: 2, profile: profile() }; for (const store of STORES) payload[store] = state.records[store].filter((row) => row.profileId === state.profileId || row.id === state.profileId); const file = new File([JSON.stringify(payload)], `${profile().name}.json`, { type: "application/json" }); if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] }); const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = file.name; link.click(); };
  document.querySelector("#import").onclick = async () => { const file = document.querySelector("#file").files[0]; if (!file || !confirm("Add this backup as its own person?")) return; const payload = JSON.parse(await file.text()); if (payload.format !== "mwa-director") return; for (const store of STORES) for (const row of payload[store] || []) await put(store, row); state.profileId = payload.profile.id; go("home"); };
}
document.querySelector("#sheet").onclick = (ev) => { if (ev.target.id === "sheet") document.querySelector("#sheet").classList.remove("open"); };
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=11");
go("home");

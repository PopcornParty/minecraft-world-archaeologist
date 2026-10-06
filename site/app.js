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
const state = { route: "home", profileId: localStorage.getItem("mwa-profile"), worldId: localStorage.getItem("mwa-world"), records: null, step: 0, draft: null, reaction: "" };

function esc(value) { return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("mwa-director", 1); request.onupgradeneeded = () => STORES.forEach((name) => { if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" }); }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const store of STORES) records[store] = await all(store); return records; }
function profile() { return state.records.profiles.find((item) => item.id === state.profileId) || null; }
function world() { return state.records.worlds.find((item) => item.id === state.worldId && item.profileId === state.profileId) || null; }
function view(html) { document.querySelector("#view").innerHTML = html; }
function ask(question, body) { view(`<p class="kicker">${esc(state.reaction)}</p><h2>${question}</h2>${body}`); document.querySelector("nav").style.display = "none"; }
function choices(items, attr) { return `<div class="choices">${items.map((item) => `<button data-${attr}="${esc(item)}">${esc(item)}</button>`).join("")}</div>`; }
function pick(attr, fn) { document.querySelectorAll(`[data-${attr}]`).forEach((btn) => btn.onclick = () => fn(btn.dataset[attr], btn)); }

async function go(route) {
  state.route = route;
  document.querySelector("nav").style.display = "";
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  state.records = await load();
  if (!state.profileId || !profile() || !world() || !world().onboarded) { state.profileId = state.profileId && profile() ? state.profileId : null; return interview(); }
  await ({ home, discover, talk, world: worldPage, me })[route]();
}

function interview() {
  state.draft = state.draft || { kinds: [], done: [], assets: [], ranked: [], never: [] };
  const steps = flow(state.draft);
  steps[Math.min(state.step, steps.length - 1)](state.draft);
}
function next(draft, reaction) { state.draft = draft; state.reaction = reaction; state.step += 1; interview(); }
function flow(d) {
  const steps = [qName, qKind, qWorld, qDay, qStage];
  if (d.stage === "Endgame" || d.stage === "Ridiculous") steps.push(qDone, qGap);
  else steps.push(qProgress);
  steps.push(qBase, qFinish, qDoing);
  if ((d.kinds || []).includes("Technical") || (d.kinds || []).includes("Redstone")) steps.push(qMachines);
  if ((d.kinds || []).includes("Builder") || d.baseType === "Castle") steps.push(qStyle);
  steps.push(qAssets, qRank, qNever, qTime, qBored, qAmbition, qProblem, qLegacy, qMemory, qSave);
  return steps;
}

function qName() { ask("Who’s playing?", `<input id="name" placeholder="Name" autofocus><button class="primary" id="go">That’s me</button>`); document.querySelector("#go").onclick = () => { const name = document.querySelector("#name").value.trim() || "Player"; next({ ...state.draft, name }, `${name}.`); }; }
function qKind(d) { const picked = new Set(d.kinds); ask("What kind of player?", `${choices(KINDS, "k")}<button class="primary" id="go">That’s me</button>`); document.querySelectorAll("[data-k]").forEach((btn) => btn.onclick = () => { picked.has(btn.dataset.k) ? picked.delete(btn.dataset.k) : picked.add(btn.dataset.k); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, kinds: [...picked] }, picked.has("Builder") ? "Builder. I’ll ask about the build." : "Got it."); }
function qWorld(d) { ask("What’s the world called?", `<input id="w" placeholder="World" value="${esc(d.worldName || "")}"><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => { const worldName = document.querySelector("#w").value.trim() || "Survival"; next({ ...d, worldName }, `${worldName}.`); }; }
function qDay(d) { ask("What day is it?", `<input id="day" inputmode="numeric" placeholder="193"><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => { const day = Number(document.querySelector("#day").value) || 0; next({ ...d, day }, day ? `Day ${day}.` : "No day yet."); }; }
function qStage(d) { ask("Where is this world?", choices(["Early Survival", "Established", "Developed", "Endgame", "Ridiculous"], "s")); pick("s", (stage) => next({ ...d, stage }, stage === "Endgame" ? "Endgame. Gear questions are done." : stage + ".")); }
function qDone(d) { const done = new Set(d.done); ask("What’s already finished?", `${choices(DONE, "d")}<button class="primary" id="go">That’s all</button>`); document.querySelectorAll("[data-d]").forEach((btn) => btn.onclick = () => { done.has(btn.dataset.d) ? done.delete(btn.dataset.d) : done.add(btn.dataset.d); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, done: [...done], progress: "Basically finished" }, done.size ? "Those are finished. I won’t bring them back." : "Nothing marked finished."); }
function qGap(d) { ask("What’s the castle missing?", choices(["Walls", "Interior", "Districts", "Roads", "It feels empty", "Nothing, I want something new"], "g")); pick("g", (gap) => next({ ...d, gap }, gap === "It feels empty" ? "Empty, not unfinished gear." : gap + ".")); }
function qProgress(d) { ask("Still upgrading gear?", choices(["Still upgrading", "Mostly maxed", "Basically finished"], "p")); pick("p", (progress) => { if (progress === "Basically finished") { d.progress = progress; d.stage = d.stage || "Endgame"; state.draft = d; state.reaction = "Then gear is not the job."; state.step += 1; interview(); } else next({ ...d, progress }, progress + "."); }); }
function qBase(d) { ask("Where do you live?", choices(BASES, "b")); pick("b", (baseType) => next({ ...d, baseType, base: baseType }, `You live in a ${baseType.toLowerCase()}.`)); }
function qFinish(d) { ask(`How finished is the ${esc(d.baseType || "base")}?`, `<input id="fin" type="range" min="0" max="100" value="40"><p id="pct"></p><button class="primary" id="go">Next</button>`); const show = () => { document.querySelector("#pct").textContent = `${document.querySelector("#fin").value}%`; }; show(); document.querySelector("#fin").oninput = show; document.querySelector("#go").onclick = () => { const baseFinish = Number(document.querySelector("#fin").value); next({ ...d, baseFinish }, `${baseFinish}% done.`); }; }
function qDoing(d) { ask("What are you building right now?", `<input id="doing" placeholder="Castle walls"><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => { const doing = document.querySelector("#doing").value.trim(); next({ ...d, doing }, doing ? `${doing} is the open job.` : "No open job."); }; }
function qMachines(d) { const assets = new Set(d.assets); ask("Which machines already exist?", `${choices(["Iron farm", "Mob farm", "Trading hall", "Sorter", "Nether hub", "None yet"], "a")}<button class="primary" id="go">Next</button>`); document.querySelectorAll("[data-a]").forEach((btn) => btn.onclick = () => { assets.has(btn.dataset.a) ? assets.delete(btn.dataset.a) : assets.add(btn.dataset.a); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, assets: [...assets] }, "Machines noted."); }
function qStyle(d) { ask("What should the build feel like?", choices(["Fortress", "City", "Cosy", "Empty and grand", "Industrial", "Ridiculous"], "y")); pick("y", (style) => next({ ...d, style }, style + ".")); }
function qAssets(d) { const assets = new Set(d.assets); ask("Anything else that matters?", `${choices(ASSETS, "a")}<button id="skip">Nothing else</button>`); document.querySelectorAll("[data-a]").forEach((btn) => btn.onclick = () => { assets.has(btn.dataset.a) ? assets.delete(btn.dataset.a) : assets.add(btn.dataset.a); btn.classList.toggle("on"); next({ ...d, assets: [...assets] }, `${btn.dataset.a}.`); }); document.querySelector("#skip").onclick = () => next(d, "Only the important stuff."); }
function qRank(d) { ask("Tap favourites in order.", `<div id="rank"></div>${choices(LOVES, "l")}<button class="primary" id="go">That’s the order</button>`); const ranked = [...d.ranked]; const paint = () => { document.querySelector("#rank").textContent = ranked.join(" · "); }; document.querySelectorAll("[data-l]").forEach((btn) => btn.onclick = () => { if (!ranked.includes(btn.dataset.l)) ranked.push(btn.dataset.l); btn.classList.add("on"); paint(); }); document.querySelector("#go").onclick = () => next({ ...d, ranked }, ranked[0] ? `${ranked[0]} first.` : "No favourite."); }
function qNever(d) { const never = new Set(d.never); ask("What should I never suggest?", `${choices(NEVER, "n")}<button class="primary" id="go">Never those</button>`); document.querySelectorAll("[data-n]").forEach((btn) => btn.onclick = () => { never.has(btn.dataset.n) ? never.delete(btn.dataset.n) : never.add(btn.dataset.n); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, never: [...never] }, never.has("Grinding") ? "No grinding." : "Noted."); }
function qTime(d) { ask("How long is a normal session?", choices(["10 minutes", "30 minutes", "1 hour", "2+ hours", "Depends"], "t")); pick("t", (time) => next({ ...d, time }, time + ".")); }
function qBored(d) { ask("When you’re stuck, what do you want?", choices(["Quick win", "Improve something", "Start something huge", "Explore", "Do something stupid", "Plan"], "b")); pick("b", (boredom) => next({ ...d, boredom }, boredom + ".")); }
function qAmbition(d) { const examples = ["Improve the entrance.", "A district around it.", "A kingdom.", "A kingdom with roads, districts, and a name."]; ask("How ambitious?", `<input id="amb" type="range" min="0" max="3" value="1"><p id="ex"></p><button class="primary" id="go">That</button>`); const show = () => { document.querySelector("#ex").textContent = examples[Number(document.querySelector("#amb").value)]; }; show(); document.querySelector("#amb").oninput = show; document.querySelector("#go").onclick = () => { const ambition = Number(document.querySelector("#amb").value); next({ ...d, ambition }, ambition > 1 ? "Unhinged is allowed." : "Kept grounded."); }; }
function qProblem(d) { ask("What’s annoying?", `<input id="problem" placeholder="The castle feels empty"><button class="primary" id="go">Next</button>`); document.querySelector("#go").onclick = () => { const problem = document.querySelector("#problem").value.trim(); next({ ...d, problem }, problem ? "That’s the gap." : "No complaint."); }; }
function qLegacy(d) { ask("If you could eventually do anything?", `<input id="legacy" placeholder="A giant kingdom"><button class="primary" id="go">Next</button><button id="skip">I don’t know</button>`); const goOn = (legacy) => next({ ...d, legacy }, legacy ? "That’s the long game." : "No long game yet."); document.querySelector("#go").onclick = () => goOn(document.querySelector("#legacy").value.trim()); document.querySelector("#skip").onclick = () => goOn(""); }
function qMemory(d) { ask("Anything you refuse to forget?", `<input id="mem" placeholder="The dragon fight"><button class="primary" id="go">Show me</button><button id="skip">Skip</button>`); const goOn = (memories) => next({ ...d, memories }, "Enough."); document.querySelector("#go").onclick = () => goOn(document.querySelector("#mem").value.trim()); document.querySelector("#skip").onclick = () => goOn(""); }

async function qSave(d) {
  ask("What should we do?", `<p class="muted">Reading your answers.</p>`);
  const profileId = uid();
  const worldId = uid();
  await put("profiles", { id: profileId, name: d.name, kinds: d.kinds, ranked: d.ranked, never: d.never, time: d.time, boredom: d.boredom, ambition: d.ambition });
  await put("worlds", { id: worldId, profileId, name: d.worldName, day: d.day, stage: d.stage, progress: d.progress || d.stage, done: d.done, baseType: d.baseType, base: d.baseType, baseFinish: d.baseFinish, doing: d.doing, assets: d.assets, problem: d.problem, legacy: d.legacy, gap: d.gap, style: d.style, gear: (d.done || []).join(", "), finished: (d.done || []).join(", "), onboarded: true });
  if (d.doing) await put("projects", { id: uid(), profileId, worldId, name: d.doing, status: "open" });
  if (d.legacy) await put("goals", { id: uid(), profileId, worldId, title: d.legacy, status: "open" });
  if (d.memories) await put("memories", { id: uid(), profileId, worldId, title: d.memories, at: new Date().toISOString() });
  state.profileId = profileId;
  state.worldId = worldId;
  state.records = await load();
  prove();
}
function prove() {
  const current = world();
  const person = profile();
  const flags = finished(current);
  const lines = [];
  lines.push(flags.endgame ? "You’re an endgame builder." : `You’re in ${current.stage || "the early world"}.`);
  lines.push(flags.endgame ? "Gear isn’t your problem anymore." : "Gear can still be a job.");
  lines.push(current.doing ? `${current.doing} is.` : `${current.base || "The base"} is.`);
  const list = recommend(current, person);
  document.querySelector("nav").style.display = "";
  view(`${lines.map((line) => `<h2>${esc(line)}</h2>`).join("")}<p class="kicker">What should we do?</p>${list.map(card).join("")}`);
  bindPlans();
}
function card(item) { return `<section class="block"><b>${esc(item.title)}</b><p class="muted">${item.minutes || ""} min</p><button data-plan="${esc(item.title)}">Do it</button> <button data-insane="${esc(item.title)}">Make it insane</button> <button data-skip="${esc(item.type || "Build")}">Not for me</button></section>`; }
function bindPlans() {
  document.querySelectorAll("[data-plan]").forEach((btn) => btn.onclick = () => keep(btn.dataset.plan));
  document.querySelectorAll("[data-insane]").forEach((btn) => btn.onclick = () => keep(`${btn.dataset.insane}, kingdom scale`));
  document.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = async () => { await put("choices", { id: uid(), profileId: state.profileId, worldId: state.worldId, rejected: btn.dataset.skip }); const person = profile(); await put("profiles", { ...person, never: [...new Set([...(person.never || []), btn.dataset.skip])] }); btn.closest("section").remove(); });
}
async function keep(name) { await put("projects", { id: uid(), profileId: state.profileId, worldId: state.worldId, name, status: "open" }); state.step = 0; go("home"); }

async function home() {
  const current = world();
  const person = profile();
  const top = recommend(current, person)[0];
  view(`<p class="kicker">${esc(person.name)}</p><h2>Day ${current.day || 0}</h2><p>${esc(phaseLabel(current, person.ranked))}</p><section class="block"><b>${esc(top.title)}</b><p>${esc(top.why)}</p><button class="primary" id="do">Do it</button></section><div class="choices"><button data-q="I'm bored">I’m bored</button><button data-q="30 minutes">30 minutes</button><button data-q="make it insane">Make it insane</button></div><div id="out"></div>`);
  document.querySelector("#do").onclick = () => keep(top.title);
  document.querySelectorAll("[data-q]").forEach((btn) => btn.onclick = () => { document.querySelector("#out").innerHTML = card(reply(btn.dataset.q, current, person)); bindPlans(); });
}
async function discover() { view(`<h2>Again.</h2>${recommend(world(), profile()).map(card).join("")}`); bindPlans(); }
async function talk() { view(`<h2>Say it.</h2><input id="text" placeholder="I’m bored"><button class="primary" id="ask">Answer</button><div id="out"></div>`); document.querySelector("#ask").onclick = () => { document.querySelector("#out").innerHTML = card(reply(document.querySelector("#text").value, world(), profile())); bindPlans(); }; }
async function worldPage() { view(`<h2>${esc(world().name)}</h2><p>${esc(world().doing || world().base || "")}</p><button id="again">Interview again</button>`); document.querySelector("#again").onclick = () => { state.step = 0; state.draft = null; state.reaction = ""; interview(); }; }
async function me() {
  view(`<h2>Who?</h2><div class="choices">${state.records.profiles.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}<button id="new">Someone else</button><button id="export">Export</button></div><input id="file" type="file" accept="application/json,.json"><button id="import">Import</button>`);
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = state.records.worlds.find((item) => item.profileId === btn.dataset.p)?.id || null; go("home"); });
  document.querySelector("#new").onclick = () => { state.profileId = null; state.worldId = null; state.step = 0; state.draft = null; state.reaction = ""; interview(); };
  document.querySelector("#export").onclick = async () => { const payload = { format: "mwa-director", version: 2, profile: profile() }; for (const store of STORES) payload[store] = state.records[store].filter((row) => row.profileId === state.profileId || row.id === state.profileId); const file = new File([JSON.stringify(payload)], `${profile().name}.json`, { type: "application/json" }); if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] }); const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = file.name; link.click(); };
  document.querySelector("#import").onclick = async () => { const file = document.querySelector("#file").files[0]; if (!file) return; const payload = JSON.parse(await file.text()); if (payload.format !== "mwa-director" || !confirm("Add this person on this phone?")) return; for (const store of STORES) for (const row of payload[store] || []) await put(store, row); state.profileId = payload.profile.id; go("home"); };
}
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=12");
go("home");

const DONE = ["Netherite", "Elytra", "Dragon", "Wither", "Nether", "End Cities", "Major Farms", "Trading", "Storage"];

function finished(world) {
  const text = `${(world.done || []).join(" ")} ${world.stage || ""} ${world.progress || ""}`.toLowerCase();
  const flags = {
    netherite: /netherite|max gear/.test(text),
    elytra: /elytra/.test(text),
    dragon: /dragon/.test(text),
    wither: /wither/.test(text),
    nether: /nether/.test(text),
  };
  flags.endgame = world.stage === "Endgame" || world.stage === "Completely insane" || (flags.netherite && flags.elytra && flags.dragon);
  flags.castleDone = Number(world.baseFinish) >= 100 || /finished/.test(String(world.doingDone || ""));
  return flags;
}

function blocked(text, world, never = []) {
  const flags = finished(world);
  const value = String(text);
  if (flags.netherite && /get netherite|mine ancient debris/i.test(value)) return true;
  if (flags.elytra && /get an? elytra|find an? elytra/i.test(value)) return true;
  if (flags.dragon && /kill the dragon|defeat the dragon/i.test(value)) return true;
  if (flags.castleDone && /^build a castle$/i.test(value)) return true;
  if ((never || []).includes("Grinding") && /grind/i.test(value)) return true;
  if ((never || []).includes("Beginner progression") && /diamond gear/i.test(value)) return true;
  return false;
}

function interviewSteps(d) {
  const steps = ["name", "world", "day", "stage"];
  if (d.stage === "Endgame" || d.stage === "Completely insane") steps.push("done", "going");
  else steps.push("going");
  if (d.going === "Current mega project" || d.going === "Building") steps.push("making");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`)) steps.push("castleFinish");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`) && Number(d.baseFinish) < 100 && d.baseFinish != null) steps.push("castleLeft");
  if (Number(d.baseFinish) >= 100) steps.push("nextOpportunity");
  steps.push("play");
  if ((d.kinds || []).includes("Technical")) steps.push("farms");
  if ((d.kinds || []).includes("Explorer")) steps.push("explored");
  if ((d.kinds || []).includes("Chaos")) steps.push("chaos");
  if ((d.kinds || []).includes("Builder") && Number(d.baseFinish) >= 100) steps.push("scale");
  if ((d.kinds || []).includes("Builder") && Number(d.baseFinish) < 100) steps.push("style");
  steps.push("hate", "ambition", "annoy");
  return steps;
}

function pitch(world, profile, scale) {
  const flags = finished(world);
  const base = world.base || "base";
  const never = profile.never || [];
  const rejected = new Set(profile.rejected || []);
  let idea = { type: "WORLD DEVELOPMENT", title: `A road out of the ${base}`, why: "One path gives the place a direction.", phases: ["Mark the gate", "Lay the first road", "Add one stop"] };
  if (flags.endgame && flags.castleDone) {
    idea = { type: "WORLD DEVELOPMENT", title: "Capital district outside the main gate", why: "The castle is done. The next opportunity is the world around it, not another castle.", phases: ["Main road", "Residential district", "Market", "Defensive wall", "Landmarks"] };
  } else if (world.doing && !flags.castleDone) {
    idea = { type: "PROJECT", title: `Finish ${world.doing}`, why: "This is the open job.", phases: ["Close the current section", "Add the missing piece", "Stop"] };
  } else if ((profile.kinds || []).includes("Technical") && !rejected.has("TECHNICAL")) {
    idea = { type: "TECHNICAL", title: "A storage hall that the farms feed", why: "Machines without a place to land stay unused.", phases: ["Pick the farm", "Build the hall", "Connect one line"] };
  }
  if (rejected.has(idea.type) || never.includes("Building")) idea = { type: "EXPLORATION", title: "An outpost in a biome you do not live in", why: "A different session from the main build.", phases: ["Pick a direction", "Place a bed", "Mark it"] };
  if (blocked(idea.title, world, never)) idea = { type: "INFRASTRUCTURE", title: "A named road between two places", why: "Connection, not gear.", phases: ["Name the ends", "Build the road"] };
  const scopes = { 10: "Plan the road layout.", 30: "Build the first road section.", 60: "Create the first district.", 120: "Build the complete district." };
  return { ...idea, scope: scopes[scale] || scopes[60], minutes: scale || 60, lead: flags.castleDone ? "The castle is done. The next opportunity isn’t another building." : "Start from what is already open." };
}

function remix(idea) { return { ...idea, title: `${idea.title} with a rail hall`, why: "Same place, a second reason to visit." }; }
function escalate(idea) { return { ...idea, title: `${idea.title}, kingdom scale`, why: "Roads, districts, a wall, and a name.", phases: ["Road", "District", "Wall", "Name", "Second district"] }; }

function parseEvent(text, day) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  let type = "Custom";
  let title = raw;
  if (/castle/.test(lower) && /finish|done|completed/.test(lower)) { type = "Build"; title = "Castle completed"; }
  else if (/elytra/.test(lower)) { type = "Item"; title = "Elytra"; }
  else if (/farm/.test(lower)) { type = "Build"; title = "Farm"; }
  else if (/storage/.test(lower)) { type = "World change"; title = "Storage moved"; }
  else if (/city|kingdom|district/.test(lower)) { type = "Project started"; title = raw; }
  else if (/nether/.test(lower)) { type = "Milestone"; title = "Nether"; }
  return { day, type, title };
}

function reply(text, world, profile) {
  const raw = text.toLowerCase();
  const flags = finished(world);
  if (/finished the castle/.test(raw)) return { say: "Castle marked finished. I won’t ask what’s left on it.", event: parseEvent(text, world.day), patch: { baseFinish: 100, doingDone: "finished" } };
  if (/bored/.test(raw)) return { say: flags.castleDone ? "Your world isn’t missing gear. It’s missing a reason to leave the castle." : "Pick the open job, not a new world.", idea: pitch(world, profile, 60) };
  if (/insane|absurd/.test(raw)) return { say: flags.castleDone ? "Don’t rebuild the castle. Give the east side a district and a fortified road." : "Scale the open job up, don’t start a second one.", idea: escalate(pitch(world, profile, 120)) };
  if (/30|minutes/.test(raw)) return { say: "Same idea. Smaller scope.", idea: pitch(world, profile, 30) };
  if (/missing/.test(raw)) return { say: flags.castleDone ? "The gap is the area outside the gate." : "The gap is the unfinished job.", idea: pitch(world, profile, 60) };
  return { say: pitch(world, profile, 60).why, idea: pitch(world, profile, 60) };
}

const STORES = ["profiles", "worlds", "projects", "events", "memories", "choices"];
const state = { route: "home", profileId: localStorage.getItem("mwa-profile"), worldId: localStorage.getItem("mwa-world"), records: null, step: 0, draft: null, reaction: "Let’s figure out what kind of world this is." };
function esc(v) { return String(v ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() { return new Promise((resolve, reject) => { const req = indexedDB.open("mwa-director", 2); req.onupgradeneeded = () => STORES.forEach((n) => { if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n, { keyPath: "id" }); }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function remove(store, id) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const s of STORES) records[s] = await all(s); return records; }
function profile() { return state.records.profiles.find((x) => x.id === state.profileId) || null; }
function world() { return state.records.worlds.find((x) => x.id === state.worldId && x.profileId === state.profileId) || null; }
function mine(store) { return state.records[store].filter((x) => x.profileId === state.profileId && x.worldId === state.worldId); }
function screen(question, body) { const steps = interviewSteps(state.draft || {}); const n = Math.min(steps.length, state.step + 1); document.querySelector("#view").innerHTML = `<div class="bar" aria-hidden="true"><span style="width:${Math.round(n / steps.length * 100)}%"></span></div><p class="react">${esc(state.reaction)}</p><h2>${question}</h2>${body}<p class="meta">${n} / ${steps.length}</p>`; document.querySelector("nav").hidden = true; }
function cards(items) { return `<div class="choices">${items.map((item) => `<button type="button" data-c="${esc(item)}">${esc(item)}</button>`).join("")}</div>`; }
function one(fn) { document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { btn.classList.add("on"); setTimeout(() => fn(btn.dataset.c), 250); }); }
function next(draft, reaction) { state.draft = draft; state.reaction = reaction; state.step += 1; interview(); }
function interview() { state.draft = state.draft || {}; const steps = interviewSteps(state.draft); const id = steps[Math.min(state.step, steps.length - 1)]; ({ name: qName, world: qWorld, day: qDay, stage: qStage, done: qDone, going: qGoing, making: qMaking, castleFinish: qCastle, castleLeft: qLeft, nextOpportunity: qNext, play: qPlay, farms: qFarms, explored: qExplored, chaos: qChaos, scale: qScale, style: qStyle, hate: qHate, ambition: qAmbition, annoy: qAnnoy }[id])(state.draft); }
function qName() { screen("Who’s playing?", `<input id="name" aria-label="Name" placeholder="Name"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => { const name = document.querySelector("#name").value.trim() || "Player"; next({ ...state.draft, name }, `Alright, ${name}.`); }; }
function qWorld(d) { screen("What’s this world called?", `<input id="w" aria-label="World name" placeholder="The Kingdom"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => next({ ...d, worldName: document.querySelector("#w").value.trim() || "Survival" }, "Let’s place it."); }
function qDay(d) { screen("What day is it?", `<input id="day" inputmode="numeric" aria-label="Day" placeholder="193"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => next({ ...d, day: Number(document.querySelector("#day").value) || 0 }, `Day ${document.querySelector("#day").value || 0}.`); }
function qStage(d) { screen("How far along is it?", cards(["Still starting", "Established", "Endgame", "Completely insane"])); one((stage) => next({ ...d, stage }, stage === "Endgame" ? "The boring progression is already behind you." : `${stage}.`)); }
function qDone(d) { const done = new Set(d.done || []); screen("What have you already finished?", `${cards(DONE)}<button class="go" id="go">That’s finished</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { done.has(btn.dataset.c) ? done.delete(btn.dataset.c) : done.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, done: [...done] }, done.has("Netherite") ? "Right. I’m not sending you back for Netherite." : "Those stay finished."); }
function qGoing(d) { screen("What’s actually going on?", cards(["Current mega project", "Building", "Technical project", "Exploration", "Collecting", "Nothing right now"])); one((going) => next({ ...d, going }, going === "Nothing right now" ? "Then we look for the next opportunity." : "Tell me the thing.")); }
function qMaking(d) { screen("What are you making?", `<input id="making" aria-label="Project" placeholder="Castle"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => { const making = document.querySelector("#making").value.trim(); next({ ...d, making, base: /castle/i.test(making) ? "Castle" : d.base }, /castle/i.test(making) ? "Castle." : `${making || "That"}.`); }; }
function qCastle(d) { screen("How finished is the castle?", `<input id="fin" type="range" min="0" max="100" value="40" aria-label="Castle finished"><p class="react" id="pct"></p><button class="go" id="go">Continue</button>`); const show = () => { document.querySelector("#pct").textContent = `${document.querySelector("#fin").value}%`; }; show(); document.querySelector("#fin").oninput = show; document.querySelector("#go").onclick = () => { const baseFinish = Number(document.querySelector("#fin").value); next({ ...d, base: "Castle", baseFinish, doingDone: baseFinish >= 100 ? "finished" : "" }, baseFinish >= 100 ? "Got it. The castle isn’t a project anymore." : "Still open."); }; }
function qLeft(d) { screen("What’s left on it?", cards(["Walls", "Interior", "Gate", "One wing"])); one((left) => next({ ...d, doing: `Castle ${left.toLowerCase()}` }, `${left} left.`)); }
function qNext(d) { screen("What should the world grow into?", cards(["A capital around it", "A road network", "A second place", "Something ridiculous"])); one((nextOpportunity) => next({ ...d, nextOpportunity }, "Outward, not backward.")); }
function qPlay(d) { const kinds = new Set(d.kinds || []); screen("What do you play for?", `${cards(["Builder", "Technical", "Explorer", "Chaos"])}<button class="go" id="go">Continue</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { kinds.has(btn.dataset.c) ? kinds.delete(btn.dataset.c) : kinds.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, kinds: [...kinds] }, (d.kinds = [...kinds], kinds.has("Builder") ? "Builder." : "Noted.")); }
function qFarms() { screen("What already runs?", cards(["Iron farm", "Mob farm", "Trading hall", "Nothing yet"])); one((farm) => next({ ...state.draft, farm }, `${farm}.`)); }
function qExplored() { screen("Where have you actually been?", cards(["Nether", "End cities", "A far biome", "Mostly home"])); one((explored) => next({ ...state.draft, explored }, `${explored}.`)); }
function qChaos() { screen("How far should a stupid idea go?", cards(["A bit", "Very", "Unhinged"])); one((chaos) => next({ ...state.draft, chaos, ambition: chaos === "Unhinged" ? 3 : 2 }, chaos + ".")); }
function qScale(d) { screen("How big should the next thing be?", cards(["A district", "A capital", "A kingdom"])); one((scale) => next({ ...d, scalePref: scale }, scale + ".")); }
function qStyle(d) { screen("What should it feel like?", cards(["Fortress", "City", "Cosy", "Empty and grand"])); one((style) => next({ ...d, style }, style + ".")); }
function qHate(d) { const never = new Set(d.never || []); screen("What should I never suggest?", `${cards(["Grinding", "Mining", "Beginner progression", "Nether", "Fighting"])}<button class="go" id="go">Never those</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { never.has(btn.dataset.c) ? never.delete(btn.dataset.c) : never.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, never: [...never] }, never.has("Grinding") ? "No grinding." : "Noted."); }
function qAmbition(d) { const lines = ["Keep it small.", "A real district.", "A capital.", "Unhinged."]; screen("How ambitious?", `<input id="amb" type="range" min="0" max="3" value="${d.ambition || 1}" aria-label="Ambition"><p class="react" id="ex"></p><button class="go" id="go">That</button>`); const show = () => { document.querySelector("#ex").textContent = lines[Number(document.querySelector("#amb").value)]; }; show(); document.querySelector("#amb").oninput = show; document.querySelector("#go").onclick = () => next({ ...d, ambition: Number(document.querySelector("#amb").value) }, "Locked."); }
function qAnnoy(d) { screen("What’s annoying?", `<input id="problem" aria-label="Problem" placeholder="I don’t know what to build next"><button class="go" id="go">Show me</button>`); document.querySelector("#go").onclick = () => saveBrain({ ...d, problem: document.querySelector("#problem").value.trim() }); }
async function saveBrain(d) {
  const profileId = uid(); const worldId = uid();
  await put("profiles", { id: profileId, name: d.name, kinds: d.kinds || [], never: d.never || [], ambition: d.ambition || 1, rejected: [] });
  await put("worlds", { id: worldId, profileId, name: d.worldName, day: d.day || 0, stage: d.stage, done: d.done || [], base: d.base || "", baseFinish: d.baseFinish ?? null, doing: d.doing || "", doingDone: d.doingDone || "", nextOpportunity: d.nextOpportunity || "", problem: d.problem || "", onboarded: true });
  state.profileId = profileId; state.worldId = worldId; localStorage.setItem("mwa-profile", profileId); localStorage.setItem("mwa-world", worldId); state.records = await load(); prove();
}
function prove() { document.querySelector("nav").hidden = false; const idea = pitch(world(), profile(), 60); document.querySelector("#view").innerHTML = `<p class="react">I get it.</p><h2>${esc(idea.lead)}</h2><p>${esc(idea.why)}</p>${card(idea)}`; bind(); }
function card(idea) { return `<section class="block"><p class="meta">${esc(idea.type)} · ${idea.minutes} min</p><b>${esc(idea.title)}</b><p class="muted">${esc(idea.scope || idea.why)}</p><div class="choices"><button data-plan="${esc(idea.title)}">Do it</button><button data-insane="${esc(idea.title)}">Make it insane</button><button data-remix="${esc(idea.title)}">Remix</button><button data-skip="${esc(idea.type)}">Not for me</button></div></section>`; }
function bind() {
  document.querySelectorAll("[data-plan]").forEach((btn) => btn.onclick = () => openPlan(pitch(world(), profile(), 60)));
  document.querySelectorAll("[data-insane]").forEach((btn) => btn.onclick = () => openPlan(escalate(pitch(world(), profile(), 120))));
  document.querySelectorAll("[data-remix]").forEach((btn) => btn.onclick = () => openPlan(remix(pitch(world(), profile(), 60))));
  document.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = async () => { const person = profile(); await put("profiles", { ...person, rejected: [...new Set([...(person.rejected || []), btn.dataset.skip])] }); await put("choices", { id: uid(), profileId: state.profileId, worldId: state.worldId, rejected: btn.dataset.skip }); btn.closest("section").remove(); });
}
function openPlan(idea) { document.querySelector("#panel").innerHTML = `<p class="meta">Plan</p><h2>${esc(idea.title)}</h2><p>${esc(idea.why)}</p>${(idea.phases || []).map((phase) => `<p>${esc(phase)}</p>`).join("")}<button class="go" id="keep">Save project</button>`; document.querySelector("#sheet").classList.add("open"); document.querySelector("#keep").onclick = async () => { await put("projects", { id: uid(), profileId: state.profileId, worldId: state.worldId, name: idea.title, why: idea.why, phases: (idea.phases || []).map((name) => ({ name, done: false })), status: "open" }); await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, day: world().day || 0, type: "Project", title: idea.title }); document.querySelector("#sheet").classList.remove("open"); go("plan"); }; }
async function go(route) { state.route = route; document.querySelector("nav").hidden = false; document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route)); state.records = await load(); if (!profile() || !world()?.onboarded) return interview(); await ({ home, discover, plan, talk, me })[route](); }
async function home() {
  const current = world(); const person = profile(); const idea = pitch(current, person, 60); const events = mine("events").sort((a, b) => b.day - a.day).slice(0, 4);
  document.querySelector("#view").innerHTML = `<p class="meta">${esc(current.name)} · Day ${current.day || 0}</p><h2>${esc(idea.lead)}</h2>${card(idea)}<div class="choices"><button data-q="I'm bored">I’m bored</button><button data-scale="10">10 min</button><button data-scale="30">30 min</button><button data-scale="60">1 hour</button><button data-scale="120">2+ hours</button><button data-q="surprise">Surprise me</button></div><div id="out"></div><h2>Log</h2><p class="muted">Only when something important happens.</p>${events.map(ev).join("") || `<p class="muted">Nothing logged.</p>`}<input id="quick" aria-label="Add event" placeholder="Finished the castle"><button class="go" id="add">Add</button>`;
  bind();
  document.querySelectorAll("[data-scale]").forEach((btn) => btn.onclick = () => { document.querySelector("#out").innerHTML = card(pitch(current, person, Number(btn.dataset.scale))); bind(); });
  document.querySelectorAll("[data-q]").forEach((btn) => btn.onclick = () => showReply(reply(btn.dataset.q, current, person)));
  document.querySelector("#add").onclick = () => addEvent(document.querySelector("#quick").value);
  document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => { await remove("events", btn.dataset.del); go("home"); });
}
function ev(row) { return `<article class="block"><p class="meta">Day ${row.day} · ${esc(row.type)}</p><b>${esc(row.title)}</b><button data-del="${row.id}">Delete</button></article>`; }
async function addEvent(text) { if (!text.trim()) return; const parsed = parseEvent(text, world().day || 0); await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...parsed }); if (/castle completed/i.test(parsed.title)) await put("worlds", { ...world(), baseFinish: 100, doingDone: "finished", base: "Castle" }); go("home"); }
function showReply(result) { document.querySelector("#out").innerHTML = `<p class="dir">${esc(result.say)}</p>${result.idea ? card(result.idea) : ""}`; bind(); if (result.patch) put("worlds", { ...world(), ...result.patch }); if (result.event) put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...result.event }); }
async function discover() { document.querySelector("#view").innerHTML = `<h2>What are you in the mood for?</h2><div class="choices"><button data-m="Build">Build</button><button data-m="Technical">Technical</button><button data-m="Explore">Explore</button><button data-m="Chaos">Chaos</button></div><div class="choices"><button data-scale="10">10m</button><button data-scale="30">30m</button><button data-scale="60">1h</button><button data-scale="120">2h+</button></div><div id="out"></div>`; document.querySelectorAll("[data-m]").forEach((btn) => btn.onclick = () => { const person = { ...profile(), kinds: [btn.dataset.m === "Explore" ? "Explorer" : btn.dataset.m] }; document.querySelector("#out").innerHTML = card(pitch(world(), person, 60)); bind(); }); document.querySelectorAll("[data-scale]").forEach((btn) => btn.onclick = () => { document.querySelector("#out").innerHTML = card(pitch(world(), profile(), Number(btn.dataset.scale))); bind(); }); }
async function plan() { const rows = mine("projects"); document.querySelector("#view").innerHTML = `<h2>Plan</h2>${rows.map((row) => `<section class="block"><b>${esc(row.name)}</b><p class="muted">${esc(row.why || "")}</p>${(row.phases || []).map((phase, i) => `<button data-phase="${row.id}:${i}">${phase.done ? "Done" : "Open"} · ${esc(phase.name)}</button>`).join("")}</section>`).join("") || `<p class="muted">No project yet.</p>`}`; document.querySelectorAll("[data-phase]").forEach((btn) => btn.onclick = async () => { const [id, index] = btn.dataset.phase.split(":"); const row = rows.find((item) => item.id === id); row.phases[Number(index)].done = !row.phases[Number(index)].done; await put("projects", row); go("plan"); }); }
async function talk() { document.querySelector("#view").innerHTML = `<h2>Talk</h2><div class="talk" id="log"></div><input id="text" aria-label="Message" placeholder="I’m bored"><button class="go" id="ask">Send</button>`; document.querySelector("#ask").onclick = async () => { const text = document.querySelector("#text").value.trim(); if (!text) return; const result = reply(text, world(), profile()); document.querySelector("#log").insertAdjacentHTML("beforeend", `<p class="me">${esc(text)}</p><p class="dir">${esc(result.say)}</p>`); document.querySelector("#text").value = ""; if (result.idea) { document.querySelector("#log").insertAdjacentHTML("beforeend", card(result.idea)); bind(); } if (result.patch) await put("worlds", { ...world(), ...result.patch }); if (result.event) await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...result.event }); }; }
async function me() { document.querySelector("#view").innerHTML = `<h2>Who?</h2><div class="choices">${state.records.profiles.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}<button id="new">Someone else</button><button id="export">Export</button></div><input id="file" type="file" accept="application/json,.json" aria-label="Import file"><button class="go" id="import">Import</button>`; document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = state.records.worlds.find((item) => item.profileId === btn.dataset.p)?.id || null; localStorage.setItem("mwa-profile", state.profileId); go("home"); }); document.querySelector("#new").onclick = () => { state.profileId = null; state.worldId = null; state.step = 0; state.draft = null; state.reaction = "Let’s figure out what kind of world this is."; interview(); }; document.querySelector("#export").onclick = async () => { const payload = { format: "mwa-director", version: 4, profile: profile() }; for (const store of STORES) payload[store] = state.records[store].filter((row) => row.profileId === state.profileId || row.id === state.profileId); const file = new File([JSON.stringify(payload)], `${profile().name}.json`, { type: "application/json" }); if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] }); const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }; document.querySelector("#import").onclick = async () => { const file = document.querySelector("#file").files[0]; if (!file || !confirm("Add this person on this phone?")) return; const payload = JSON.parse(await file.text()); if (payload.format !== "mwa-director") return; for (const store of STORES) for (const row of payload[store] || []) await put(store, row); state.profileId = payload.profile.id; go("home"); }; }
document.querySelector("#sheet").onclick = (ev) => { if (ev.target.id === "sheet") document.querySelector("#sheet").classList.remove("open"); };
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=14");
go("home");

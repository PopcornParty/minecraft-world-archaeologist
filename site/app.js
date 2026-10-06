function finished(world) {
  const text = `${(world.done || []).join(" ")} ${world.stage || ""}`.toLowerCase();
  return {
    netherite: /netherite|max gear/.test(text),
    elytra: /elytra/.test(text),
    dragon: /dragon/.test(text),
    wither: /wither/.test(text),
    nether: /nether/.test(text),
    endgame: world.stage === "Endgame" || world.stage === "Completely insane",
    castleDone: Number(world.baseFinish) >= 100 || world.doingDone === "finished",
  };
}

function blocked(text, world) {
  const flags = finished(world);
  if (flags.netherite && /get netherite|mine ancient debris/i.test(text)) return true;
  if (flags.elytra && /get an? elytra/i.test(text)) return true;
  if (flags.dragon && /kill the dragon|defeat the dragon/i.test(text)) return true;
  if (flags.castleDone && /build a castle|what.s unfinished about your castle/i.test(text)) return true;
  return false;
}

function interviewSteps(d) {
  const steps = ["name", "world", "day", "stage"];
  if (d.stage === "Endgame" || d.stage === "Completely insane") steps.push("done");
  steps.push("going");
  if (d.going === "Current mega project" || d.going === "Building") steps.push("making");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`)) steps.push("castleFinish");
  if (/castle/i.test(`${d.making || ""} ${d.base || ""}`) && d.baseFinish != null && Number(d.baseFinish) < 100) steps.push("castleLeft");
  if (Number(d.baseFinish) >= 100) steps.push("nextOpportunity");
  steps.push("play");
  if ((d.kinds || []).includes("Technical")) steps.push("farms");
  if ((d.kinds || []).includes("Explorer")) steps.push("explored");
  steps.push("hate", "ambition", "annoy");
  return steps;
}

function openTask(project) {
  for (const phase of project.phases || []) for (const task of phase.tasks || []) if (!task.done && !task.skipped) return { phase, task };
  return null;
}

function progress(project) {
  const tasks = (project.phases || []).flatMap((phase) => phase.tasks || []);
  if (!tasks.length) return 0;
  return Math.round(tasks.filter((task) => task.done).length / tasks.length * 100);
}

function roadProject(from, to) {
  return {
    name: `Connect ${from} to ${to}`,
    why: `${from} and ${to} are recorded. Nothing connects them.`,
    type: "INFRASTRUCTURE",
    status: "active",
    phases: [
      { name: "Connection", tasks: [{ name: `Mark the route from ${from} to ${to}`, minutes: 15 }, { name: "Clear a 7-block path", minutes: 20 }, { name: "Lay the foundation", minutes: 30 }, { name: "Add lighting", minutes: 15 }] },
      { name: "Use", tasks: [{ name: "Walk it once and name the ends", minutes: 10 }] },
    ],
  };
}

function outsideProject(world) {
  const name = world.nextOpportunity || "Area outside the castle";
  return {
    name,
    why: "The castle is done. Nothing else is recorded around it.",
    type: "WORLD DEVELOPMENT",
    status: "active",
    phases: [
      { name: "First move", tasks: [{ name: "Mark the first place outside the gate", minutes: 15 }, { name: "Name that place", minutes: 5 }, { name: "Lay a short path from the gate", minutes: 25 }] },
      { name: "Use", tasks: [{ name: "Give that place one job", minutes: 30 }] },
    ],
  };
}

function decide(world, profile, bag) {
  const flags = finished(world);
  const projects = bag.projects || [];
  const locations = bag.locations || [];
  const active = projects.find((item) => item.status === "active");
  if (active) {
    const next = openTask(active);
    return { lead: "You already have a project open. Finish the current step before starting another.", project: active, task: next?.task || null, create: null };
  }
  const others = locations.filter((item) => !/castle/i.test(item.name));
  if (flags.castleDone && locations.length >= 2) return { lead: "The castle is done. The recorded places are not connected.", create: roadProject(locations[0].name, locations[1].name) };
  if (flags.castleDone) return { lead: "The castle is done. Nothing else is recorded around it.", create: outsideProject(world) };
  if (world.doing) return { lead: "The open job is still the one you named.", create: { name: world.doing, why: "Named in the interview.", type: "PROJECT", status: "active", phases: [{ name: "Next", tasks: [{ name: `Work on ${world.doing}`, minutes: 30 }] }] } };
  return { lead: "No current focus.", create: null };
}

function scaleProject(project, mode) {
  const copy = JSON.parse(JSON.stringify(project));
  if (mode === "insane") copy.phases.push({ name: "Kingdom scale", tasks: [{ name: "Add a gate", minutes: 40 }, { name: "Add a second district", minutes: 60 }, { name: "Name the road", minutes: 10 }] });
  if (mode === "remix") { copy.name = `Underground link: ${copy.name}`; copy.why = "Same two places, under the ground."; copy.phases = [{ name: "Tunnel", tasks: [{ name: "Pick the two ends", minutes: 10 }, { name: "Dig the first stretch", minutes: 30 }] }]; }
  return copy;
}

function parseLog(text, day) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (/finish|completed|done/.test(lower) && /castle/.test(lower)) return { event: { day, type: "Build", title: "Castle completed" }, patch: { baseFinish: 100, doingDone: "finished", base: "Castle" } };
  if (/start/.test(lower) && /city|district|kingdom/.test(lower)) return { event: { day, type: "Project", title: raw }, projectName: raw };
  if (/iron farm/.test(lower)) return { event: { day, type: "Location", title: "Iron farm" }, location: { name: "Iron farm", type: "Farm" } };
  if (/storage/.test(lower)) return { event: { day, type: "Location", title: "Storage" }, location: { name: "Storage", type: "Storage" } };
  return { event: { day, type: "Other", title: raw } };
}

function answer(text, world, profile, bag) {
  const lower = text.toLowerCase();
  if (lower.startsWith("/search ") || /where/.test(lower)) {
    const q = lower.replace("/search ", "").replace("where is my ", "").replace("where is ", "").replace("where's ", "");
    const hits = [...(bag.locations || []), ...(bag.items || [])].filter((item) => item.name.toLowerCase().includes(q.trim()));
    return { say: hits.length ? hits.map((item) => item.name).join(", ") : "Nothing stored under that name.", hits };
  }
  if (/finished the castle/.test(lower)) return { say: "Castle marked finished.", ...parseLog(text, world.day) };
  if (/finished the market|market entrance/.test(lower)) return { say: "Market entrance marked done.", completeName: "market" };
  if (/unfinished|what should i work/.test(lower)) { const decision = decide(world, profile, bag); return { say: decision.lead, decision }; }
  if (/bored|missing|after this/.test(lower)) { const decision = decide(world, profile, bag); return { say: decision.lead, decision }; }
  if (/bigger|insane/.test(lower)) return { say: "Scope increased on the open project.", scale: "insane" };
  return { say: decide(world, profile, bag).lead, decision: decide(world, profile, bag) };
}

function gaps(world, bag) {
  const list = [];
  const flags = finished(world);
  if (flags.castleDone && (bag.locations || []).length < 2) list.push("No other location is recorded around the castle.");
  if ((bag.locations || []).length >= 2 && !(bag.projects || []).some((item) => item.type === "INFRASTRUCTURE")) list.push("Recorded places have no connecting project.");
  if (!(bag.goals || []).length) list.push("No current goal.");
  return list;
}

const STORES = ["profiles", "worlds", "projects", "events", "locations", "items", "memories", "goals", "choices"];
const state = { route: "home", profileId: localStorage.getItem("mwa-profile"), worldId: localStorage.getItem("mwa-world"), records: null, step: 0, draft: null, reaction: "Let’s figure out what kind of world this is.", focus: null };
function esc(v) { return String(v ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() { return new Promise((resolve, reject) => { const req = indexedDB.open("mwa-director", 3); req.onupgradeneeded = () => STORES.forEach((n) => { if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n, { keyPath: "id" }); }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const store of STORES) records[store] = await all(store); return records; }
function profile() { return state.records.profiles.find((x) => x.id === state.profileId) || null; }
function world() { return state.records.worlds.find((x) => x.id === state.worldId && x.profileId === state.profileId) || null; }
function mine(store) { return state.records[store].filter((x) => x.profileId === state.profileId && (!x.worldId || x.worldId === state.worldId)); }
function bag() { return { projects: mine("projects"), locations: mine("locations"), items: mine("items"), goals: mine("goals"), events: mine("events") }; }
function screen(question, body) { const steps = interviewSteps(state.draft || {}); document.querySelector("#view").innerHTML = `<div class="bar"><span style="width:${Math.round((state.step + 1) / steps.length * 100)}%"></span></div><p class="react">${esc(state.reaction)}</p><h2>${question}</h2>${body}<p class="meta">${state.step + 1} / ${steps.length}</p>`; document.querySelector("nav").hidden = true; }
function cards(items) { return `<div class="choices">${items.map((item) => `<button type="button" data-c="${esc(item)}">${esc(item)}</button>`).join("")}</div>`; }
function one(fn) { document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { btn.classList.add("on"); setTimeout(() => fn(btn.dataset.c), 250); }); }
function next(draft, reaction) { state.draft = draft; state.reaction = reaction; state.step += 1; interview(); }
function interview() { state.draft = state.draft || {}; const id = interviewSteps(state.draft)[state.step]; if (!id) return saveBrain(state.draft); ({ name: qName, world: qWorld, day: qDay, stage: qStage, done: qDone, going: qGoing, making: qMaking, castleFinish: qCastle, castleLeft: qLeft, nextOpportunity: qNext, play: qPlay, farms: qFarms, explored: qExplored, hate: qHate, ambition: qAmbition, annoy: qAnnoy }[id])(state.draft); }
function qName() { screen("Who’s playing?", `<input id="name" aria-label="Name" placeholder="Name"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => { const name = document.querySelector("#name").value.trim() || "Player"; next({ name }, `Alright, ${name}.`); }; }
function qWorld(d) { screen("What’s this world called?", `<input id="w" aria-label="World" placeholder="The Kingdom"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => next({ ...d, worldName: document.querySelector("#w").value.trim() || "Survival" }, "Let’s place it."); }
function qDay(d) { screen("What day is it?", `<input id="day" inputmode="numeric" aria-label="Day" placeholder="193"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => next({ ...d, day: Number(document.querySelector("#day").value) || 0 }, `Day ${document.querySelector("#day").value || 0}.`); }
function qStage(d) { screen("How far along is it?", cards(["Still starting", "Established", "Endgame", "Completely insane"])); one((stage) => next({ ...d, stage }, stage === "Endgame" ? "The boring progression is already behind you." : stage + ".")); }
function qDone(d) { const done = new Set(d.done || []); screen("What have you already finished?", `${cards(["Netherite", "Elytra", "Dragon", "Wither", "Nether", "End Cities", "Major Farms"])}<button class="go" id="go">That’s finished</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { done.has(btn.dataset.c) ? done.delete(btn.dataset.c) : done.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, done: [...done] }, done.has("Netherite") ? "Right. I’m not sending you back for Netherite." : "Those stay finished."); }
function qGoing(d) { screen("What’s actually going on?", cards(["Current mega project", "Building", "Technical project", "Nothing right now"])); one((going) => next({ ...d, going }, "Tell me the thing.")); }
function qMaking(d) { screen("What are you making?", `<input id="making" aria-label="Project" placeholder="Castle"><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => { const making = document.querySelector("#making").value.trim(); next({ ...d, making, base: /castle/i.test(making) ? "Castle" : d.base }, /castle/i.test(making) ? "Castle." : making); }; }
function qCastle(d) { screen("How finished is the castle?", `<input id="fin" type="range" min="0" max="100" value="40" aria-label="Finished"><p class="react" id="pct"></p><button class="go" id="go">Continue</button>`); const show = () => { document.querySelector("#pct").textContent = document.querySelector("#fin").value + "%"; }; show(); document.querySelector("#fin").oninput = show; document.querySelector("#go").onclick = () => { const baseFinish = Number(document.querySelector("#fin").value); next({ ...d, base: "Castle", baseFinish, doingDone: baseFinish >= 100 ? "finished" : "" }, baseFinish >= 100 ? "Got it. The castle isn’t a project anymore." : "Still open."); }; }
function qLeft(d) { screen("What’s left on it?", cards(["Walls", "Interior", "Gate"])); one((left) => next({ ...d, doing: "Castle " + left.toLowerCase() }, left + " left.")); }
function qNext(d) { screen("What should grow outside it?", cards(["A place outside the gate", "A road to somewhere else", "A second base", "I don’t know yet"])); one((nextOpportunity) => next({ ...d, nextOpportunity }, "Outward, not backward.")); }
function qPlay(d) { const kinds = new Set(d.kinds || []); screen("What do you play for?", `${cards(["Builder", "Technical", "Explorer", "Chaos"])}<button class="go" id="go">Continue</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { kinds.has(btn.dataset.c) ? kinds.delete(btn.dataset.c) : kinds.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, kinds: [...kinds] }, "Noted."); }
function qFarms(d) { screen("What already runs?", cards(["Iron farm", "Mob farm", "Trading hall", "Nothing yet"])); one((farm) => next({ ...d, farm }, farm + ".")); }
function qExplored(d) { screen("Where have you been?", cards(["Nether", "Far biome", "Mostly home"])); one((explored) => next({ ...d, explored }, explored + ".")); }
function qHate(d) { const never = new Set(d.never || []); screen("What should I never suggest?", `${cards(["Grinding", "Mining", "Beginner progression", "Fighting"])}<button class="go" id="go">Never those</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { never.has(btn.dataset.c) ? never.delete(btn.dataset.c) : never.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, never: [...never] }, "Noted."); }
function qAmbition(d) { screen("How ambitious?", `<input id="amb" type="range" min="0" max="3" value="1" aria-label="Ambition"><button class="go" id="go">That</button>`); document.querySelector("#go").onclick = () => next({ ...d, ambition: Number(document.querySelector("#amb").value) }, "Locked."); }
function qAnnoy(d) { screen("What’s annoying?", `<input id="problem" aria-label="Problem" placeholder="I don’t know what to do"><button class="go" id="go">Show me</button>`); document.querySelector("#go").onclick = () => saveBrain({ ...d, problem: document.querySelector("#problem").value.trim() }); }
async function saveBrain(d) {
  const profileId = uid(); const worldId = uid();
  await put("profiles", { id: profileId, name: d.name, kinds: d.kinds || [], never: d.never || [], ambition: d.ambition || 1, rejected: [] });
  await put("worlds", { id: worldId, profileId, name: d.worldName, day: d.day || 0, stage: d.stage, done: d.done || [], base: d.base || "", baseFinish: d.baseFinish ?? null, doing: d.doing || "", doingDone: d.doingDone || "", nextOpportunity: d.nextOpportunity || "", problem: d.problem || "", onboarded: true });
  if (d.base === "Castle") await put("locations", { id: uid(), profileId, worldId, name: "Castle", type: "Base" });
  state.profileId = profileId; state.worldId = worldId; localStorage.setItem("mwa-profile", profileId); localStorage.setItem("mwa-world", worldId); state.records = await load();
  document.querySelector("nav").hidden = false; state.step = 0; go("home");
}
function stamp(project) { return { ...project, id: uid(), profileId: state.profileId, worldId: state.worldId, phases: project.phases.map((phase) => ({ ...phase, tasks: phase.tasks.map((task) => ({ ...task, done: false, id: uid() })) })) }; }
async function startProject(raw) { const project = stamp(raw); await put("projects", project); await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, day: world().day || 0, type: "Project", title: project.name + " started" }); state.focus = project.id; return project; }
async function completeTask(projectId, taskId, logIt) {
  const project = mine("projects").find((item) => item.id === projectId);
  for (const phase of project.phases) for (const task of phase.tasks) if (task.id === taskId) task.done = true;
  project.status = progress(project) === 100 ? "completed" : "active";
  await put("projects", project);
  if (logIt) await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, day: world().day || 0, type: "Build", title: "Task completed" });
}
function focusCard(decision) {
  if (decision.project) { const next = openTask(decision.project); return `<section class="block"><p class="meta">Current project · ${progress(decision.project)}%</p><b>${esc(decision.project.name)}</b><p>${esc(next ? next.task.name : "No open task")}</p><div class="meter"><span style="width:${progress(decision.project)}%"></span></div><button class="go" id="cont">Continue</button></section>`; }
  if (decision.create) return `<section class="block"><p class="meta">${esc(decision.create.type)}</p><b>${esc(decision.create.name)}</b><p>${esc(decision.create.why)}</p><p class="meta">First action</p><p>${esc(decision.create.phases[0].tasks[0].name)}</p><button class="go" id="start">Start project</button></section>`;
  return `<p class="react">Nothing to start.</p>`;
}
async function go(route) { state.route = route; document.querySelector("nav").hidden = false; document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route)); state.records = await load(); if (!profile() || !world()?.onboarded) return interview(); await ({ home, world: worldPage, projects, talk, me })[route](); }
async function home() {
  const current = world(); const decision = decide(current, profile(), bag()); const events = mine("events").sort((a, b) => b.day - a.day).slice(0, 3);
  document.querySelector("#view").innerHTML = `<p class="meta">${esc(current.name)} · Day ${current.day || 0}</p><h2>${esc(decision.lead)}</h2>${focusCard(decision)}<p class="meta">${mine("projects").filter((item) => item.status === "active").length} active · ${mine("locations").length} locations · ${mine("events").length} events</p>${events.map((row) => `<article class="block"><p class="meta">Day ${row.day} · ${esc(row.type)}</p>${esc(row.title)}</article>`).join("")}<p class="meta">Only log what matters.</p><input id="quick" aria-label="Log" placeholder="Finished the castle"><button class="ghost" id="add">Log something</button><div class="choices"><button id="loc">Add location</button><button id="goal">Add goal</button></div><div id="gaps">${gaps(current, bag()).map((gap) => `<p class="react">${esc(gap)}</p>`).join("")}</div>`;
  const start = document.querySelector("#start"); if (start) start.onclick = async () => { await startProject(decision.create); go("projects"); };
  const cont = document.querySelector("#cont"); if (cont) cont.onclick = () => { state.focus = decision.project.id; go("projects"); };
  document.querySelector("#add").onclick = () => logText(document.querySelector("#quick").value);
  document.querySelector("#loc").onclick = () => addSimple("locations", "Location");
  document.querySelector("#goal").onclick = () => addSimple("goals", "Goal");
}
async function logText(text) { if (!text.trim()) return; const parsed = parseLog(text, world().day || 0); await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...parsed.event }); if (parsed.patch) await put("worlds", { ...world(), ...parsed.patch }); if (parsed.location) await put("locations", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...parsed.location }); if (parsed.projectName) await startProject({ name: parsed.projectName, why: "From the log.", type: "PROJECT", status: "active", phases: [{ name: "Start", tasks: [{ name: "Name the first step", minutes: 10 }] }] }); go("home"); }
function addSimple(store, label) { document.querySelector("#panel").innerHTML = `<h2>${label}</h2><input id="n" aria-label="${label}"><button class="go" id="save">Save</button>`; document.querySelector("#sheet").classList.add("open"); document.querySelector("#save").onclick = async () => { const name = document.querySelector("#n").value.trim(); if (!name) return; await put(store, { id: uid(), profileId: state.profileId, worldId: state.worldId, name, type: label, title: name }); document.querySelector("#sheet").classList.remove("open"); go(state.route); }; }
async function worldPage() {
  const q = state.query || ""; const hits = q ? [...mine("locations"), ...mine("items"), ...mine("projects"), ...mine("events"), ...mine("goals")].filter((item) => JSON.stringify(item).toLowerCase().includes(q.toLowerCase())) : [];
  document.querySelector("#view").innerHTML = `<h2>${esc(world().name)}</h2><input id="search" aria-label="Search" placeholder="Search" value="${esc(q)}"><div>${hits.map((item) => `<p>${esc(item.name || item.title)}</p>`).join("")}</div><h2>Log</h2>${mine("events").map((row) => `<article class="block"><p class="meta">Day ${row.day}</p>${esc(row.title)}</article>`).join("") || `<p class="react">Your important moments will appear here.</p>`}<h2>Locations</h2>${mine("locations").map((row) => `<p>${esc(row.name)}</p>`).join("") || `<button class="ghost" id="loc">Add location</button>`}<h2>Items</h2><button class="ghost" id="item">Add item</button><h2>Goals</h2>${mine("goals").map((row) => `<p>${esc(row.name || row.title)}</p>`).join("")}`;
  document.querySelector("#search").oninput = (ev) => { state.query = ev.target.value; worldPage(); };
  const loc = document.querySelector("#loc"); if (loc) loc.onclick = () => addSimple("locations", "Location");
  document.querySelector("#item").onclick = () => addSimple("items", "Item");
}
async function projects() {
  const rows = mine("projects"); const open = rows.find((item) => item.id === state.focus) || rows.find((item) => item.status === "active");
  document.querySelector("#view").innerHTML = `<h2>Projects</h2>${rows.map((row) => `<section class="block"><p class="meta">${esc(row.status)} · ${progress(row)}%</p><b>${esc(row.name)}</b><p>${esc(row.why || "")}</p><div class="meter"><span style="width:${progress(row)}%"></span></div><button data-open="${row.id}">Open</button></section>`).join("") || `<p class="react">No active projects yet.</p>`}${open ? `<h2>${esc(open.name)}</h2>${open.phases.map((phase) => `<section class="block"><p class="meta">${esc(phase.name)}</p>${phase.tasks.map((task) => `<button data-task="${open.id}:${task.id}">${task.done ? "Done" : "Open"} · ${esc(task.name)}</button>`).join("")}</section>`).join("")}<button class="ghost" id="insane">Make it insane</button><button class="ghost" id="pause">Pause</button>` : ""}`;
  document.querySelectorAll("[data-open]").forEach((btn) => btn.onclick = () => { state.focus = btn.dataset.open; projects(); });
  document.querySelectorAll("[data-task]").forEach((btn) => btn.onclick = async () => { const [projectId, taskId] = btn.dataset.task.split(":"); if (confirm("Add this to the world history?")) await completeTask(projectId, taskId, true); else await completeTask(projectId, taskId, false); go("projects"); });
  const insane = document.querySelector("#insane"); if (insane) insane.onclick = async () => { await put("projects", scaleProject(open, "insane")); go("projects"); };
  const pause = document.querySelector("#pause"); if (pause) pause.onclick = async () => { open.status = "paused"; await put("projects", open); go("projects"); };
}
async function talk() {
  document.querySelector("#view").innerHTML = `<h2>Talk</h2><div id="log"></div><input id="text" aria-label="Message" placeholder="I finished the market"><button class="go" id="ask">Send</button>`;
  document.querySelector("#ask").onclick = async () => {
    const text = document.querySelector("#text").value.trim(); if (!text) return;
    const result = answer(text, world(), profile(), bag());
    document.querySelector("#log").insertAdjacentHTML("beforeend", `<p class="react">${esc(text)}</p><p>${esc(result.say)}</p>`);
    document.querySelector("#text").value = "";
    if (result.patch) await put("worlds", { ...world(), ...result.patch });
    if (result.event) await put("events", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...result.event });
    if (result.location) await put("locations", { id: uid(), profileId: state.profileId, worldId: state.worldId, ...result.location });
    if (result.completeName) { const project = mine("projects").find((item) => item.status === "active"); const task = project && openTask(project); if (task) await completeTask(project.id, task.task.id, true); }
    if (result.scale) { const project = mine("projects").find((item) => item.status === "active"); if (project) await put("projects", scaleProject(project, result.scale)); }
    if (result.decision?.create) document.querySelector("#log").insertAdjacentHTML("beforeend", `<button class="go" id="start">Start ${esc(result.decision.create.name)}</button>`);
    const start = document.querySelector("#start"); if (start) start.onclick = async () => { await startProject(result.decision.create); go("projects"); };
    state.records = await load();
  };
}
async function me() {
  document.querySelector("#view").innerHTML = `<h2>Who?</h2><div class="choices">${state.records.profiles.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}<button id="new">Someone else</button><button id="export">Export</button></div><input id="file" type="file" accept="application/json,.json" aria-label="Import"><button class="go" id="import">Import</button><button class="danger" id="reset">Reset this world</button>`;
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = state.records.worlds.find((item) => item.profileId === btn.dataset.p)?.id || null; localStorage.setItem("mwa-profile", state.profileId); go("home"); });
  document.querySelector("#new").onclick = () => { state.profileId = null; state.worldId = null; state.step = 0; state.draft = null; state.reaction = "Let’s figure out what kind of world this is."; interview(); };
  document.querySelector("#export").onclick = async () => { const payload = { formatVersion: 2, format: "mwa-director", profile: profile() }; for (const store of STORES) payload[store] = state.records[store].filter((row) => row.profileId === state.profileId || row.id === state.profileId); const file = new File([JSON.stringify(payload)], `${profile().name}.json`, { type: "application/json" }); if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] }); const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); };
  document.querySelector("#import").onclick = async () => { const file = document.querySelector("#file").files[0]; if (!file || !confirm("Add this person on this phone?")) return; const payload = JSON.parse(await file.text()); if (payload.format !== "mwa-director") return; for (const store of STORES) for (const row of payload[store] || []) await put(store, row); state.profileId = payload.profile.id; go("home"); };
  document.querySelector("#reset").onclick = async () => { if (!confirm("Delete this world’s projects and log on this phone?")) return; for (const store of ["projects", "events", "locations", "items", "memories", "goals"]) for (const row of mine(store)) { const db = await openDb(); await new Promise((resolve) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(row.id); tx.oncomplete = resolve; }); } go("home"); };
}
document.querySelector("#sheet").onclick = (ev) => { if (ev.target.id === "sheet") document.querySelector("#sheet").classList.remove("open"); };
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=15");
go("home");

const STORES = ["profiles", "worlds", "projects", "events", "locations", "memories", "items", "goals", "choices"];
const state = { route: "home", profileId: localStorage.getItem("mwa-profile"), worldId: localStorage.getItem("mwa-world"), records: null, step: 0, draft: null, reaction: "" };
function esc(value) { return String(value ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function openDb() { return new Promise((resolve, reject) => { const req = indexedDB.open("mwa-director", 1); req.onupgradeneeded = () => STORES.forEach((n) => { if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n, { keyPath: "id" }); }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function all(store) { const db = await openDb(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function put(store, value) { const db = await openDb(); await new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function load() { const records = {}; for (const store of STORES) records[store] = await all(store); return records; }
function profile() { return state.records.profiles.find((item) => item.id === state.profileId) || null; }
function world() { return state.records.worlds.find((item) => item.id === state.worldId && item.profileId === state.profileId) || null; }
function screen(question, body) { const pct = Math.min(96, 8 + state.step * 7); document.querySelector("#view").innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div><p class="react">${esc(state.reaction)}</p><h2>${question}</h2>${body}`; document.querySelector("nav").hidden = true; }
function cards(items) { return `<div class="choices">${items.map((item) => `<button data-c="${esc(item)}">${esc(item)}</button>`).join("")}</div>`; }
function one(fn) { document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { btn.classList.add("on"); setTimeout(() => fn(btn.dataset.c), 140); }); }
function next(draft, reaction) { state.draft = draft; state.reaction = reaction; state.step += 1; interview(); }
function flow(d) {
  const steps = [qName, qStage];
  if (d.stage === "Endgame" || d.stage === "Completely insane") steps.push(qDone);
  else steps.push(qGear);
  steps.push(qLive, qKind);
  if ((d.kinds || []).includes("Builder")) steps.push(qBuild);
  if ((d.kinds || []).includes("Technical") || (d.kinds || []).includes("Redstone")) steps.push(qTech);
  if ((d.kinds || []).includes("Explorer")) steps.push(qExplore);
  if ((d.kinds || []).includes("Chaos")) steps.push(qChaos);
  steps.push(qHate, qTime, qAmbition, qAnnoy, qDream, qSave);
  return steps;
}
function interview() { state.draft = state.draft || { kinds: [], done: [], never: [] }; flow(state.draft)[Math.min(state.step, flow(state.draft).length - 1)](state.draft); }
function qName() { screen("Who’s playing?", `<input id="name" placeholder="Name" autofocus><button class="go" id="go">Continue</button>`); document.querySelector("#go").onclick = () => { const name = document.querySelector("#name").value.trim() || "Player"; next({ ...state.draft, name }, `Nice. ${name}’s world next.`); }; }
function qStage(d) { screen("How far along is your world?", cards(["Still starting", "Established", "Endgame", "Completely insane"])); one((stage) => next({ ...d, stage, progress: stage === "Endgame" || stage === "Completely insane" ? "Basically finished" : stage }, stage === "Endgame" ? "Okay, we’re past the boring progression stuff." : `${stage}.`)); }
function qDone(d) { const done = new Set(d.done); screen("What’s already finished?", `${cards(["Netherite", "Elytra", "Dragon", "Wither", "Dragon Egg", "Nether"])}<button class="go" id="go">That’s done</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { done.has(btn.dataset.c) ? done.delete(btn.dataset.c) : done.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, done: [...done] }, "Good. I’m not going to send you backwards."); }
function qGear(d) { screen("Still working on gear?", cards(["Yes", "Mostly done", "Finished"])); one((gear) => next({ ...d, gearState: gear, progress: gear === "Finished" ? "Basically finished" : gear }, gear === "Finished" ? "Then gear is off the list." : "Alright.")); }
function qLive(d) { screen("Where do you actually live?", cards(["Castle", "City", "Town", "Base", "Underground", "Other"])); one((base) => next({ ...d, baseType: base, base }, `${base}.`)); }
function qKind(d) { const kinds = new Set(d.kinds); screen("What do you play for?", `${cards(["Builder", "Technical", "Explorer", "Chaos", "Redstone", "Collector"])}<button class="go" id="go">Continue</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { kinds.has(btn.dataset.c) ? kinds.delete(btn.dataset.c) : kinds.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, kinds: [...kinds] }, kinds.has("Builder") ? "Castle questions next." : "Next question changes."); }
function qBuild(d) { screen("What’s unfinished on the build?", cards(["Walls", "Interior", "It feels empty", "No districts", "I want it huge"])); one((doing) => next({ ...d, doing: d.baseType ? `${d.baseType} ${doing.toLowerCase()}` : doing, gap: doing }, `${doing}. That’s the job.`)); }
function qTech(d) { screen("What already runs?", cards(["Iron farm", "Mob farm", "Trading hall", "Sorter", "Nothing yet"])); one((machine) => next({ ...d, machine }, machine === "Nothing yet" ? "Room for a first machine." : `${machine} exists.`)); }
function qExplore(d) { screen("Last place you actually went?", cards(["Nether", "Ocean", "A new biome", "I stay home"])); one((went) => next({ ...d, went }, went === "I stay home" ? "Then leaving is the interesting bit." : `${went}.`)); }
function qChaos(d) { screen("How stupid should ideas get?", cards(["A bit", "Very", "Unhinged"])); one((chaos) => next({ ...d, chaos, ambition: chaos === "Unhinged" ? 3 : 2 }, chaos + ".")); }
function qHate(d) { const never = new Set(d.never); screen("What should I never suggest?", `${cards(["Grinding", "Mining", "Beginner progression", "Long projects", "Nether", "Fighting"])}<button class="go" id="go">Never those</button>`); document.querySelectorAll("[data-c]").forEach((btn) => btn.onclick = () => { never.has(btn.dataset.c) ? never.delete(btn.dataset.c) : never.add(btn.dataset.c); btn.classList.toggle("on"); }); document.querySelector("#go").onclick = () => next({ ...d, never: [...never] }, never.has("Grinding") ? "No grinding." : "Noted."); }
function qTime(d) { screen("How long do you usually have?", cards(["10 minutes", "30 minutes", "1 hour", "2+ hours"])); one((time) => next({ ...d, time }, time + ".")); }
function qAmbition(d) { const lines = ["Fix the entrance.", "A district around it.", "A kingdom.", "A kingdom with roads and a name."]; screen("How ambitious?", `<input id="amb" type="range" min="0" max="3" value="${d.ambition || 1}"><p class="react" id="ex"></p><button class="go" id="go">That</button>`); const show = () => { document.querySelector("#ex").textContent = lines[Number(document.querySelector("#amb").value)]; }; show(); document.querySelector("#amb").oninput = show; document.querySelector("#go").onclick = () => next({ ...d, ambition: Number(document.querySelector("#amb").value) }, "Locked in."); }
function qAnnoy(d) { screen("What’s annoying?", `<input id="problem" placeholder="The castle feels empty"><button class="go" id="go">Continue</button><button class="choices" id="skip" style="margin-top:8px">Skip</button>`); const goOn = (problem) => next({ ...d, problem }, problem ? "That’s the gap." : ""); document.querySelector("#go").onclick = () => goOn(document.querySelector("#problem").value.trim()); document.querySelector("#skip").onclick = () => goOn(""); }
function qDream(d) { screen("If you could eventually do anything?", `<input id="legacy" placeholder="A giant kingdom"><button class="go" id="go">Show me</button>`); document.querySelector("#go").onclick = () => next({ ...d, legacy: document.querySelector("#legacy").value.trim() }, "Enough."); }
async function qSave(d) {
  const profileId = uid(); const worldId = uid();
  await put("profiles", { id: profileId, name: d.name, kinds: d.kinds, ranked: d.kinds, never: d.never, time: d.time, ambition: d.ambition || 1 });
  await put("worlds", { id: worldId, profileId, name: `${d.name}’s world`, day: d.day || 0, stage: d.stage, progress: d.progress, done: d.done || [], baseType: d.baseType, base: d.baseType, doing: d.doing, problem: d.problem, legacy: d.legacy, gear: (d.done || []).join(", "), finished: (d.done || []).join(", "), onboarded: true });
  if (d.doing) await put("projects", { id: uid(), profileId, worldId, name: d.doing, status: "open" });
  state.profileId = profileId; state.worldId = worldId; state.records = await load(); prove();
}
function prove() {
  const current = world(); const person = profile(); const flags = finished(current);
  const lines = [flags.endgame ? "Endgame world." : `${current.stage}.`, `${current.base || "Base"}-focused.`, (person.kinds || []).includes("Builder") ? "You like huge builds." : (person.kinds || [])[0] ? `You play ${person.kinds[0].toLowerCase()}.` : "No single play style.", (person.never || []).includes("Grinding") ? "You hate grinding." : ""].filter(Boolean);
  document.querySelector("nav").hidden = false;
  document.querySelector("#view").innerHTML = `<p class="react">I get it.</p>${lines.map((line) => `<h2>${esc(line)}</h2>`).join("")}<p class="react">What should we do?</p>${recommend(current, person).map(card).join("")}`;
  bind();
}
function card(item) { return `<section class="block"><b>${esc(item.title)}</b><p class="muted">${item.minutes} min</p><div class="choices"><button data-plan="${esc(item.title)}">Do it</button><button data-insane="${esc(item.title)}">Make it insane</button><button data-skip="${esc(item.type)}">Not for me</button></div></section>`; }
function bind() {
  document.querySelectorAll("[data-plan]").forEach((btn) => btn.onclick = () => keep(btn.dataset.plan));
  document.querySelectorAll("[data-insane]").forEach((btn) => btn.onclick = () => keep(`${btn.dataset.insane}, kingdom scale`));
  document.querySelectorAll("[data-skip]").forEach((btn) => btn.onclick = async () => { const person = profile(); await put("profiles", { ...person, never: [...new Set([...(person.never || []), btn.dataset.skip])] }); await put("choices", { id: uid(), profileId: state.profileId, worldId: state.worldId, rejected: btn.dataset.skip }); btn.closest("section").remove(); });
}
async function keep(name) { await put("projects", { id: uid(), profileId: state.profileId, worldId: state.worldId, name, status: "open" }); state.step = 0; go("home"); }
async function go(route) {
  state.route = route; document.querySelector("nav").hidden = false;
  document.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
  state.records = await load();
  if (!profile() || !world() || !world().onboarded) return interview();
  await ({ home, discover, talk, world: worldPage, me })[route]();
}
async function home() {
  const current = world(); const person = profile(); const top = recommend(current, person)[0];
  document.querySelector("#view").innerHTML = `<p class="react">${esc(person.name)}</p><h2>What are we doing?</h2><section class="block"><b>${esc(top.title)}</b><p class="muted">${top.minutes} min</p><button class="go" id="do">Do it</button></section><div class="choices"><button data-q="I'm bored">I’m bored</button><button data-q="10 minutes">10 min</button><button data-q="30 minutes">30 min</button><button data-q="1 hour">1 hour</button><button data-q="make it insane">Make it insane</button><button data-q="surprise">Surprise me</button></div><div id="out"></div>`;
  document.querySelector("#do").onclick = () => keep(top.title);
  document.querySelectorAll("[data-q]").forEach((btn) => btn.onclick = () => { document.querySelector("#out").innerHTML = card(reply(btn.dataset.q, current, person)); bind(); });
}
async function discover() { document.querySelector("#view").innerHTML = `<h2>Again.</h2>${recommend(world(), profile()).map(card).join("")}`; bind(); }
async function talk() { document.querySelector("#view").innerHTML = `<h2>Say it.</h2><input id="text" placeholder="I’m bored"><button class="go" id="ask">Answer</button><div id="out"></div>`; document.querySelector("#ask").onclick = () => { document.querySelector("#out").innerHTML = card(reply(document.querySelector("#text").value, world(), profile())); bind(); }; }
async function worldPage() { document.querySelector("#view").innerHTML = `<h2>${esc(world().base || world().name)}</h2><p class="muted">${esc(world().doing || "")}</p><button class="go" id="again">Again</button>`; document.querySelector("#again").onclick = () => { state.step = 0; state.draft = null; state.reaction = ""; interview(); }; }
async function me() {
  document.querySelector("#view").innerHTML = `<h2>Who?</h2><div class="choices">${state.records.profiles.map((person) => `<button data-p="${person.id}">${esc(person.name)}</button>`).join("")}<button id="new">Someone else</button><button id="export">Export</button></div><input id="file" type="file" accept="application/json,.json"><button class="go" id="import">Import</button>`;
  document.querySelectorAll("[data-p]").forEach((btn) => btn.onclick = () => { state.profileId = btn.dataset.p; state.worldId = state.records.worlds.find((item) => item.profileId === btn.dataset.p)?.id || null; go("home"); });
  document.querySelector("#new").onclick = () => { state.profileId = null; state.worldId = null; state.step = 0; state.draft = null; state.reaction = ""; interview(); };
  document.querySelector("#export").onclick = async () => { const payload = { format: "mwa-director", version: 3, profile: profile() }; for (const store of STORES) payload[store] = state.records[store].filter((row) => row.profileId === state.profileId || row.id === state.profileId); const file = new File([JSON.stringify(payload)], `${profile().name}.json`, { type: "application/json" }); if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] }); const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); };
  document.querySelector("#import").onclick = async () => { const file = document.querySelector("#file").files[0]; if (!file) return; const payload = JSON.parse(await file.text()); if (payload.format !== "mwa-director" || !confirm("Add this person?")) return; for (const store of STORES) for (const row of payload[store] || []) await put(store, row); state.profileId = payload.profile.id; go("home"); };
}
document.querySelectorAll(".bottom [data-route]").forEach((btn) => btn.onclick = () => go(btn.dataset.route));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=13");
go("home");

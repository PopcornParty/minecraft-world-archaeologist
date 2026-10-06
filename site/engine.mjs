export function finished(world) {
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

export function blocked(text, world) {
  const flags = finished(world);
  if (flags.netherite && /get netherite|mine ancient debris/i.test(text)) return true;
  if (flags.elytra && /get an? elytra/i.test(text)) return true;
  if (flags.dragon && /kill the dragon|defeat the dragon/i.test(text)) return true;
  if (flags.castleDone && /build a castle|what.s unfinished about your castle/i.test(text)) return true;
  return false;
}

export function interviewSteps(d) {
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

export function openTask(project) {
  for (const phase of project.phases || []) for (const task of phase.tasks || []) if (!task.done && !task.skipped) return { phase, task };
  return null;
}

export function progress(project) {
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

export function decide(world, profile, bag) {
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

export function scaleProject(project, mode) {
  const copy = JSON.parse(JSON.stringify(project));
  if (mode === "insane") copy.phases.push({ name: "Kingdom scale", tasks: [{ name: "Add a gate", minutes: 40 }, { name: "Add a second district", minutes: 60 }, { name: "Name the road", minutes: 10 }] });
  if (mode === "remix") { copy.name = `Underground link: ${copy.name}`; copy.why = "Same two places, under the ground."; copy.phases = [{ name: "Tunnel", tasks: [{ name: "Pick the two ends", minutes: 10 }, { name: "Dig the first stretch", minutes: 30 }] }]; }
  return copy;
}

export function parseLog(text, day) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (/finish|completed|done/.test(lower) && /castle/.test(lower)) return { event: { day, type: "Build", title: "Castle completed" }, patch: { baseFinish: 100, doingDone: "finished", base: "Castle" } };
  if (/start/.test(lower) && /city|district|kingdom/.test(lower)) return { event: { day, type: "Project", title: raw }, projectName: raw };
  if (/iron farm/.test(lower)) return { event: { day, type: "Location", title: "Iron farm" }, location: { name: "Iron farm", type: "Farm" } };
  if (/storage/.test(lower)) return { event: { day, type: "Location", title: "Storage" }, location: { name: "Storage", type: "Storage" } };
  return { event: { day, type: "Other", title: raw } };
}

export function answer(text, world, profile, bag) {
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

export function gaps(world, bag) {
  const list = [];
  const flags = finished(world);
  if (flags.castleDone && (bag.locations || []).length < 2) list.push("No other location is recorded around the castle.");
  if ((bag.locations || []).length >= 2 && !(bag.projects || []).some((item) => item.type === "INFRASTRUCTURE")) list.push("Recorded places have no connecting project.");
  if (!(bag.goals || []).length) list.push("No current goal.");
  return list;
}

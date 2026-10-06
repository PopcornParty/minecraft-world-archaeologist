export function dayOf(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

export function streakInfo(events) {
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

export function analytics(world, records) {
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

export function insights(world, records, stats) {
  const lines = [];
  if (stats.byType[0]) lines.push(`${stats.byType[0].eventType} is the most common recorded event type (${stats.byType[0].count}).`);
  if (stats.income || stats.spending) lines.push(`Recorded net change is ${Math.round(stats.net).toLocaleString()} ${world.currencyName || "coins"}.`);
  const completed = records.goals.filter((goal) => goal.worldId === world.id && goal.status === "completed").length;
  if (completed) lines.push(`${completed} goals are marked completed.`);
  if (!lines.length) lines.push("Record a few events and these lines will be calculated from them.");
  return lines;
}

export function health(world, records, stats) {
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

export const ACHIEVEMENTS = [
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

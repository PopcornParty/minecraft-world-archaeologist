"""Analytics, insights, streaks, and achievements from recorded rows only."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta


def _day(value: str) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def streak_info(conn: sqlite3.Connection, world_id: str | None = None) -> dict:
    sql = "SELECT occurred_at FROM events"
    args: list = []
    if world_id:
        sql += " WHERE world_id = ?"
        args.append(world_id)
    days = sorted({day for row in conn.execute(sql, args) if (day := _day(row["occurred_at"]))})
    if not days:
        return {"current": 0, "longest": 0, "active_days": 0}
    longest = current = 1
    for earlier, later in zip(days, days[1:]):
        if later == earlier + timedelta(days=1):
            current += 1
            longest = max(longest, current)
        elif later != earlier:
            current = 1
    today = datetime.now().astimezone().date()
    running = 0
    cursor = today if today in days else today - timedelta(days=1)
    while cursor in days:
        running += 1
        cursor -= timedelta(days=1)
    return {"current": running, "longest": longest, "active_days": len(days)}


def evaluate_achievements(conn: sqlite3.Connection) -> list[str]:
    events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    builds = conn.execute("SELECT COUNT(*) FROM events WHERE event_type = 'building'").fetchone()[0]
    trades = conn.execute("SELECT COUNT(*) FROM events WHERE event_type = 'trade'").fetchone()[0]
    sessions = conn.execute("SELECT COUNT(*) FROM sessions WHERE ended_at IS NOT NULL").fetchone()[0]
    goals = conn.execute("SELECT COUNT(*) FROM goals WHERE status = 'completed'").fetchone()[0]
    balance = conn.execute("SELECT COALESCE(MAX(total), 0) FROM (SELECT SUM(amount) AS total FROM transactions GROUP BY world_id)").fetchone()[0]
    streak = streak_info(conn)["longest"]
    facts = {
        "events": events,
        "builds": builds,
        "trades": trades,
        "sessions": sessions,
        "goals_completed": goals,
        "balance": balance or 0,
        "streak": streak,
    }
    unlocked = []
    now = datetime.now().astimezone().replace(microsecond=0).isoformat()
    for row in conn.execute("SELECT * FROM achievements"):
        if row["unlocked_at"]:
            continue
        if facts.get(row["rule_key"], 0) >= row["threshold"]:
            conn.execute(
                "UPDATE achievements SET unlocked_at = ?, evidence_json = ? WHERE id = ?",
                (now, json.dumps(facts), row["id"]),
            )
            unlocked.append(row["id"])
    return unlocked


def world_analytics(conn: sqlite3.Connection, world_id: str) -> dict:
    world = conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone()
    if world is None:
        raise KeyError("world not found")
    events = conn.execute("SELECT COUNT(*) FROM events WHERE world_id = ?", (world_id,)).fetchone()[0]
    income = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE world_id = ? AND amount > 0",
        (world_id,),
    ).fetchone()[0]
    spending = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE world_id = ? AND amount < 0",
        (world_id,),
    ).fetchone()[0]
    by_type = [
        dict(row)
        for row in conn.execute(
            "SELECT event_type, COUNT(*) AS count FROM events WHERE world_id = ? GROUP BY event_type ORDER BY count DESC",
            (world_id,),
        )
    ]
    by_day = [
        dict(row)
        for row in conn.execute(
            """SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS count
               FROM events WHERE world_id = ? GROUP BY day ORDER BY day""",
            (world_id,),
        )
    ]
    balance_series = []
    running = 0.0
    for row in conn.execute(
        "SELECT occurred_at, amount FROM transactions WHERE world_id = ? ORDER BY occurred_at, id",
        (world_id,),
    ):
        running += row["amount"]
        balance_series.append({"at": row["occurred_at"], "balance": running, "amount": row["amount"]})
    categories = [
        dict(row)
        for row in conn.execute(
            """SELECT category, SUM(amount) AS total FROM transactions
               WHERE world_id = ? AND amount < 0 GROUP BY category ORDER BY total""",
            (world_id,),
        )
    ]
    sessions = [dict(row) for row in conn.execute("SELECT * FROM sessions WHERE world_id = ? ORDER BY started_at", (world_id,))]
    durations = []
    for session in sessions:
        if session["ended_at"]:
            start = datetime.fromisoformat(session["started_at"])
            end = datetime.fromisoformat(session["ended_at"])
            durations.append((end - start).total_seconds())
    items = item_summaries(conn, world_id)
    players = player_board(conn, world_id)
    score = progression_score(conn, world_id)
    return {
        "world": dict(world),
        "events": events,
        "income": income,
        "spending": spending,
        "net": income + spending,
        "balance": running,
        "by_type": by_type,
        "by_day": by_day,
        "balance_series": balance_series,
        "spending_categories": categories,
        "sessions": {
            "count": len([s for s in sessions if s["ended_at"]]),
            "open": len([s for s in sessions if not s["ended_at"]]),
            "total_seconds": sum(durations),
            "average_seconds": (sum(durations) / len(durations)) if durations else 0,
            "longest_seconds": max(durations) if durations else 0,
        },
        "streak": streak_info(conn, world_id),
        "items": items,
        "players": players,
        "progression": score,
        "combat": combat_stats(conn, world_id),
        "building": conn.execute(
            "SELECT COUNT(*) FROM events WHERE world_id = ? AND event_type = 'building'",
            (world_id,),
        ).fetchone()[0],
    }


def item_summaries(conn, world_id: str) -> list[dict]:
    out = []
    for item in conn.execute("SELECT * FROM items WHERE world_id = ? ORDER BY name", (world_id,)):
        records = [
            dict(row)
            for row in conn.execute(
                "SELECT quantity, delta, occurred_at FROM item_records WHERE item_id = ? ORDER BY occurred_at",
                (item["id"],),
            )
        ]
        quantities = [row["quantity"] for row in records if row["quantity"] is not None]
        gained = sum(row["delta"] for row in records if row["delta"] > 0)
        lost = sum(row["delta"] for row in records if row["delta"] < 0)
        out.append(
            {
                "id": item["id"],
                "name": item["name"],
                "current": quantities[-1] if quantities else 0,
                "highest": max(quantities) if quantities else 0,
                "lowest": min(quantities) if quantities else 0,
                "gained": gained,
                "lost": lost,
                "last_update": records[-1]["occurred_at"] if records else None,
                "series": records,
            }
        )
    return out


def player_board(conn, world_id: str) -> list[dict]:
    rows = []
    for player in conn.execute("SELECT * FROM players WHERE world_id = ? ORDER BY name", (world_id,)):
        events = conn.execute("SELECT COUNT(*) FROM events WHERE player_id = ?", (player["id"],)).fetchone()[0]
        money = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE player_id = ?",
            (player["id"],),
        ).fetchone()[0]
        builds = conn.execute(
            "SELECT COUNT(*) FROM events WHERE player_id = ? AND event_type = 'building'",
            (player["id"],),
        ).fetchone()[0]
        deaths = conn.execute(
            "SELECT COUNT(*) FROM events WHERE player_id = ? AND event_type = 'death'",
            (player["id"],),
        ).fetchone()[0]
        rows.append({**dict(player), "events": events, "money": money, "builds": builds, "deaths": deaths})
    return rows


def combat_stats(conn, world_id: str) -> dict:
    wins = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND event_type = 'combat' AND lower(title) LIKE '%won%'",
        (world_id,),
    ).fetchone()[0]
    losses = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND event_type = 'combat' AND lower(title) LIKE '%lost%'",
        (world_id,),
    ).fetchone()[0]
    deaths = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND event_type = 'death'",
        (world_id,),
    ).fetchone()[0]
    fights = wins + losses
    return {
        "wins": wins,
        "losses": losses,
        "deaths": deaths,
        "win_rate": (wins / fights) if fights else None,
    }


def progression_score(conn, world_id: str) -> dict:
    weights = [dict(row) for row in conn.execute(
        "SELECT * FROM progression_weights WHERE world_id IS NULL OR world_id = ?",
        (world_id,),
    )]
    total = 0.0
    matched = []
    events = [dict(row) for row in conn.execute("SELECT * FROM events WHERE world_id = ?", (world_id,))]
    for weight in weights:
        hits = 0
        for event in events:
            haystack = str(event.get(weight["match_field"]) or "")
            if weight["match_value"].lower() in haystack.lower():
                hits += 1
        if hits:
            points = hits * weight["points"]
            total += points
            matched.append({"label": weight["label"], "hits": hits, "points": points})
    return {"score": total, "weights": weights, "matched": matched, "note": "Score uses only the weights you configured."}


def insights(conn, world_id: str) -> list[str]:
    lines = []
    week = datetime.now().astimezone().date() - timedelta(days=7)
    this_week = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND substr(occurred_at, 1, 10) >= ?",
        (world_id, week.isoformat()),
    ).fetchone()[0]
    prior = conn.execute(
        """SELECT COUNT(*) FROM events WHERE world_id = ? AND substr(occurred_at, 1, 10) >= ?
           AND substr(occurred_at, 1, 10) < ?""",
        (world_id, (week - timedelta(days=7)).isoformat(), week.isoformat()),
    ).fetchone()[0]
    if this_week and this_week > prior:
        lines.append(f"This week has {this_week} recorded events, more than the previous week's {prior}.")
    analytics = world_analytics(conn, world_id)
    if analytics["income"] or analytics["spending"]:
        net = analytics["net"]
        lines.append(f"Recorded net change is {net:,.0f} {analytics['world']['currency_name']}.")
    if analytics["by_type"]:
        top = analytics["by_type"][0]
        lines.append(f"{top['event_type']} is the most common recorded event type ({top['count']}).")
    last_mining = conn.execute(
        "SELECT MAX(occurred_at) FROM events WHERE world_id = ? AND event_type = 'mining'",
        (world_id,),
    ).fetchone()[0]
    if last_mining:
        gap = (datetime.now().astimezone().date() - _day(last_mining)).days
        if gap >= 12:
            lines.append(f"No mining event has been recorded in {gap} days.")
    completed = conn.execute(
        "SELECT COUNT(*) FROM goals WHERE world_id = ? AND status = 'completed'",
        (world_id,),
    ).fetchone()[0]
    if completed:
        lines.append(f"{completed} goals are marked completed.")
    if not lines:
        lines.append("Record a few events and these lines will be calculated from them.")
    return lines


def heatmap(conn, world_id: str, metric: str) -> list[dict]:
    if metric == "money":
        rows = conn.execute(
            """SELECT substr(occurred_at, 1, 10) AS day, SUM(ABS(amount)) AS value
               FROM transactions WHERE world_id = ? GROUP BY day""",
            (world_id,),
        )
    elif metric == "sessions":
        rows = conn.execute(
            """SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS value
               FROM sessions WHERE world_id = ? GROUP BY day""",
            (world_id,),
        )
    elif metric == "goals":
        rows = conn.execute(
            """SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS value
               FROM goals WHERE world_id = ? AND completed_at IS NOT NULL GROUP BY day""",
            (world_id,),
        )
    elif metric == "building":
        rows = conn.execute(
            """SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS value
               FROM events WHERE world_id = ? AND event_type = 'building' GROUP BY day""",
            (world_id,),
        )
    elif metric == "combat":
        rows = conn.execute(
            """SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS value
               FROM events WHERE world_id = ? AND event_type IN ('combat', 'death') GROUP BY day""",
            (world_id,),
        )
    else:
        rows = conn.execute(
            """SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS value
               FROM events WHERE world_id = ? GROUP BY day""",
            (world_id,),
        )
    return [dict(row) for row in rows if row["day"]]


def world_health(conn, world_id: str) -> dict:
    analytics = world_analytics(conn, world_id)
    recent = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND substr(occurred_at, 1, 10) >= ?",
        (world_id, (datetime.now().astimezone().date() - timedelta(days=7)).isoformat()),
    ).fetchone()[0]
    activity = "high" if recent >= 5 else "medium" if recent >= 1 else "low"
    economy = "growing" if analytics["net"] > 0 else "flat" if analytics["net"] == 0 else "down"
    goals = conn.execute(
        "SELECT COUNT(*) FROM goals WHERE world_id = ? AND status = 'active'",
        (world_id,),
    ).fetchone()[0]
    last = conn.execute(
        "SELECT MAX(started_at) FROM sessions WHERE world_id = ?",
        (world_id,),
    ).fetchone()[0]
    return {
        "activity": activity,
        "recent_events": recent,
        "goals_active": goals,
        "economy": economy,
        "last_session": last,
        "streak": analytics["streak"]["current"],
    }


def reminders(conn, world_id: str | None) -> list[str]:
    enabled = conn.execute("SELECT value FROM settings WHERE key = 'reminders_enabled'").fetchone()
    if not enabled or enabled["value"] != "1" or not world_id:
        return []
    notes = []
    streak = streak_info(conn, world_id)
    today = datetime.now().astimezone().date().isoformat()
    logged_today = conn.execute(
        "SELECT COUNT(*) FROM events WHERE world_id = ? AND substr(occurred_at, 1, 10) = ?",
        (world_id, today),
    ).fetchone()[0]
    if streak["current"] >= 3 and not logged_today:
        notes.append(f"The {streak['current']}-day recording streak has no event today.")
    last = conn.execute("SELECT MAX(occurred_at) FROM events WHERE world_id = ?", (world_id,)).fetchone()[0]
    if last and _day(last) and (datetime.now().astimezone().date() - _day(last)).days >= 7:
        notes.append("This world has no recorded event in the last 7 days.")
    goal = conn.execute(
        "SELECT title FROM goals WHERE world_id = ? AND status = 'active' ORDER BY priority LIMIT 1",
        (world_id,),
    ).fetchone()
    if goal:
        notes.append(f"Active goal: {goal['title']}.")
    return notes

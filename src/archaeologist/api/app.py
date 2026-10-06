"""HTTP API for recorded Minecraft history. No world files are read."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from archaeologist.db.connection import get_connection
from archaeologist.services.analytics import heatmap, insights, reminders, world_analytics, world_health
from archaeologist.services.parse import EVENT_TYPES, parse_quick
from archaeologist.services.store import (
    StoreError,
    balance,
    create_event,
    create_goal,
    create_player,
    create_world,
    delete_event,
    end_session,
    export_backup,
    import_backup,
    new_id,
    search,
    seed,
    start_session,
    update_event,
    update_goal,
    update_world,
    utcnow,
)

STATIC = Path(__file__).resolve().parent.parent / "ui" / "static"


class WorldIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    edition: str = "Bedrock"
    seed: str | None = None
    created_on: str | None = None
    status: str = "active"
    currency_name: str = "coins"
    main_location: str = ""
    tags: str = ""
    notes: str = ""
    image: str | None = None


class PlayerIn(BaseModel):
    world_id: str
    name: str
    nickname: str = ""
    first_seen: str | None = None
    last_seen: str | None = None
    notes: str = ""
    relationship: str = "friend"


class ParseIn(BaseModel):
    text: str
    world_id: str | None = None


class EventIn(BaseModel):
    world_id: str
    event_type: str = "note"
    category: str = "General"
    title: str
    description: str = ""
    occurred_at: str | None = None
    player_id: str | None = None
    player_name: str | None = None
    amount: float | None = None
    item_name: str | None = None
    item_delta: float | None = None
    goal_id: str | None = None
    location_id: str | None = None
    death_count: int | None = None
    custom_type: bool = False


class GoalIn(BaseModel):
    world_id: str
    title: str
    description: str = ""
    category: str = "General"
    target: float = 1
    current: float = 0
    deadline: str | None = None
    priority: int = 2
    player_id: str | None = None
    auto_event_type: str | None = None
    notes: str = ""


class SessionIn(BaseModel):
    world_id: str
    notes: str = ""
    started_at: str | None = None
    ended_at: str | None = None
    manual: bool = False


class BackupIn(BaseModel):
    mode: str
    confirm: bool = False
    data: dict


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        conn = get_connection()
        seed(conn)
        conn.commit()
        yield

    app = FastAPI(title="Minecraft World Archaeologist", version="0.2.0", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    def fail(exc: StoreError) -> None:
        raise HTTPException(400, str(exc)) from exc

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return (STATIC / "index.html").read_text(encoding="utf-8")

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "source": "manual records", "world_files": False}

    @app.get("/api/meta")
    def meta() -> dict:
        return {"event_types": [{"key": key, "label": label} for key, label in EVENT_TYPES]}

    @app.get("/api/dashboard")
    def dashboard(world_id: str | None = None) -> dict:
        conn = get_connection()
        worlds = [dict(row) for row in conn.execute("SELECT * FROM worlds ORDER BY updated_at DESC")]
        if world_id is None and worlds:
            world_id = worlds[0]["id"]
        current = None
        if world_id:
            current = dict(conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone() or {})
            if current:
                current["balance"] = balance(conn, world_id)
                current["analytics"] = world_analytics(conn, world_id)
                current["insights"] = insights(conn, world_id)
                current["health"] = world_health(conn, world_id)
                current["reminders"] = reminders(conn, world_id)
                current["recent"] = [
                    dict(row)
                    for row in conn.execute(
                        "SELECT * FROM events WHERE world_id = ? ORDER BY occurred_at DESC LIMIT 8",
                        (world_id,),
                    )
                ]
        return {"worlds": worlds, "current": current}

    @app.get("/api/worlds")
    def worlds() -> list[dict]:
        conn = get_connection()
        rows = []
        for world in conn.execute("SELECT * FROM worlds ORDER BY name"):
            item = dict(world)
            item["balance"] = balance(conn, world["id"])
            item["events"] = conn.execute("SELECT COUNT(*) FROM events WHERE world_id = ?", (world["id"],)).fetchone()[0]
            rows.append(item)
        return rows

    @app.post("/api/worlds")
    def world_create(body: WorldIn) -> dict:
        try:
            return {"id": create_world(get_connection(), body.model_dump())}
        except StoreError as exc:
            fail(exc)

    @app.patch("/api/worlds/{world_id}")
    def world_patch(world_id: str, body: dict) -> dict:
        try:
            update_world(get_connection(), world_id, body)
        except StoreError as exc:
            fail(exc)
        return {"ok": True}

    @app.get("/api/players")
    def players(world_id: str) -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM players WHERE world_id = ? ORDER BY name", (world_id,))]

    @app.post("/api/players")
    def player_create(body: PlayerIn) -> dict:
        try:
            return {"id": create_player(get_connection(), body.model_dump())}
        except StoreError as exc:
            fail(exc)

    @app.post("/api/parse")
    def parse(body: ParseIn) -> dict:
        names = []
        if body.world_id:
            names = [row["name"] for row in get_connection().execute("SELECT name FROM players WHERE world_id = ?", (body.world_id,))]
        return parse_quick(body.text, names)

    @app.get("/api/events")
    def events(
        world_id: str | None = None,
        event_type: str | None = None,
        q: str | None = None,
        player_id: str | None = None,
        start: str | None = None,
        end: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        sql = "SELECT * FROM events WHERE 1=1"
        args: list = []
        if world_id:
            sql += " AND world_id = ?"
            args.append(world_id)
        if event_type:
            sql += " AND event_type = ?"
            args.append(event_type)
        if player_id:
            sql += " AND player_id = ?"
            args.append(player_id)
        if q:
            sql += " AND (title LIKE ? OR description LIKE ?)"
            args.extend([f"%{q}%", f"%{q}%"])
        if start:
            sql += " AND occurred_at >= ?"
            args.append(start)
        if end:
            sql += " AND occurred_at <= ?"
            args.append(end)
        total = get_connection().execute(f"SELECT COUNT(*) FROM ({sql})", args).fetchone()[0]
        sql += " ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?"
        args.extend([min(limit, 100), offset])
        return {"total": total, "events": [dict(row) for row in get_connection().execute(sql, args)]}

    @app.post("/api/events")
    def event_create(body: EventIn) -> dict:
        try:
            return {"id": create_event(get_connection(), body.model_dump())}
        except StoreError as exc:
            fail(exc)

    @app.patch("/api/events/{event_id}")
    def event_patch(event_id: str, body: dict) -> dict:
        try:
            update_event(get_connection(), event_id, body)
        except StoreError as exc:
            fail(exc)
        return {"ok": True}

    @app.delete("/api/events/{event_id}")
    def event_delete(event_id: str) -> dict:
        delete_event(get_connection(), event_id)
        return {"ok": True}

    @app.get("/api/analytics/{world_id}")
    def analytics(world_id: str) -> dict:
        try:
            return world_analytics(get_connection(), world_id)
        except KeyError as exc:
            raise HTTPException(404, "world not found") from exc

    @app.get("/api/insights/{world_id}")
    def insight_route(world_id: str) -> dict:
        return {"insights": insights(get_connection(), world_id), "health": world_health(get_connection(), world_id)}

    @app.get("/api/heatmap/{world_id}")
    def heat(world_id: str, metric: str = "events") -> list[dict]:
        return heatmap(get_connection(), world_id, metric)

    @app.get("/api/goals")
    def goals(world_id: str) -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM goals WHERE world_id = ? ORDER BY status, priority", (world_id,))]

    @app.post("/api/goals")
    def goal_create(body: GoalIn) -> dict:
        try:
            return {"id": create_goal(get_connection(), body.model_dump())}
        except StoreError as exc:
            fail(exc)

    @app.patch("/api/goals/{goal_id}")
    def goal_patch(goal_id: str, body: dict) -> dict:
        try:
            update_goal(get_connection(), goal_id, body)
        except StoreError as exc:
            fail(exc)
        return {"ok": True}

    @app.post("/api/sessions/start")
    def session_start(body: SessionIn) -> dict:
        return {"id": start_session(get_connection(), body.world_id, body.notes, body.started_at, 1 if body.manual else 0)}

    @app.post("/api/sessions/end")
    def session_end(body: SessionIn) -> dict:
        try:
            return {"id": end_session(get_connection(), body.world_id, body.ended_at)}
        except StoreError as exc:
            fail(exc)

    @app.get("/api/sessions")
    def sessions(world_id: str) -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM sessions WHERE world_id = ? ORDER BY started_at DESC", (world_id,))]

    @app.get("/api/search")
    def search_route(q: str = "", limit: int = 40) -> list[dict]:
        return search(get_connection(), q, min(limit, 80))

    @app.get("/api/achievements")
    def achievements() -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM achievements ORDER BY unlocked_at IS NULL, name")]

    @app.post("/api/achievements")
    def achievement_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            """INSERT INTO achievements(id, name, description, rule_key, threshold)
               VALUES (?, ?, ?, ?, ?)""",
            (ident, body["name"], body.get("description") or "", body["rule_key"], float(body["threshold"])),
        )
        get_connection().commit()
        return {"id": ident}

    @app.get("/api/milestones")
    def milestones(world_id: str | None = None) -> list[dict]:
        if world_id:
            rows = get_connection().execute("SELECT * FROM milestones WHERE world_id = ? OR world_id IS NULL ORDER BY created_at DESC", (world_id,))
        else:
            rows = get_connection().execute("SELECT * FROM milestones ORDER BY created_at DESC")
        return [dict(row) for row in rows]

    @app.post("/api/milestones")
    def milestone_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            "INSERT INTO milestones(id, world_id, title, description, unlocked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (ident, body.get("world_id"), body["title"], body.get("description") or "", body.get("unlocked_at"), utcnow()),
        )
        get_connection().commit()
        return {"id": ident}

    @app.post("/api/milestones/{milestone_id}/unlock")
    def milestone_unlock(milestone_id: str) -> dict:
        get_connection().execute("UPDATE milestones SET unlocked_at = ? WHERE id = ?", (utcnow(), milestone_id))
        get_connection().commit()
        return {"ok": True}

    @app.get("/api/weights")
    def weights(world_id: str | None = None) -> list[dict]:
        if world_id:
            rows = get_connection().execute(
                "SELECT * FROM progression_weights WHERE world_id IS NULL OR world_id = ?",
                (world_id,),
            )
        else:
            rows = get_connection().execute("SELECT * FROM progression_weights")
        return [dict(row) for row in rows]

    @app.post("/api/weights")
    def weight_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            """INSERT INTO progression_weights(id, world_id, label, points, match_field, match_value)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (ident, body.get("world_id"), body["label"], float(body["points"]), body.get("match_field") or "title", body["match_value"]),
        )
        get_connection().commit()
        return {"id": ident}

    @app.post("/api/categories")
    def category_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            "INSERT INTO categories(id, world_id, name, kind) VALUES (?, ?, ?, ?)",
            (ident, body.get("world_id"), body["name"], body.get("kind") or "spending"),
        )
        get_connection().commit()
        return {"id": ident}

    @app.get("/api/categories")
    def categories(world_id: str | None = None) -> list[dict]:
        rows = get_connection().execute("SELECT * FROM categories ORDER BY name")
        return [dict(row) for row in rows]

    @app.post("/api/locations")
    def location_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            """INSERT INTO locations(id, world_id, name, dimension, x, y, z, description, tags, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ident, body["world_id"], body["name"], body.get("dimension") or "overworld", body.get("x"), body.get("y"), body.get("z"), body.get("description") or "", body.get("tags") or "", utcnow()),
        )
        get_connection().commit()
        return {"id": ident}

    @app.get("/api/locations")
    def locations(world_id: str) -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM locations WHERE world_id = ?", (world_id,))]

    @app.post("/api/journal")
    def journal_create(body: dict) -> dict:
        ident = new_id()
        get_connection().execute(
            "INSERT INTO journal_entries(id, world_id, title, body, tags, written_at) VALUES (?, ?, ?, ?, ?, ?)",
            (ident, body["world_id"], body["title"], body["body"], body.get("tags") or "", body.get("written_at") or utcnow()),
        )
        from archaeologist.services.store import index_row

        index_row(get_connection(), "journal", ident, body["world_id"], body["title"], body["body"])
        get_connection().commit()
        return {"id": ident}

    @app.get("/api/journal")
    def journal(world_id: str | None = None) -> list[dict]:
        if world_id:
            rows = get_connection().execute("SELECT * FROM journal_entries WHERE world_id = ? ORDER BY written_at DESC", (world_id,))
        else:
            rows = get_connection().execute("SELECT * FROM journal_entries ORDER BY written_at DESC")
        return [dict(row) for row in rows]

    @app.get("/api/settings")
    def settings() -> dict:
        return {row["key"]: row["value"] for row in get_connection().execute("SELECT key, value FROM settings")}

    @app.put("/api/settings")
    def settings_put(body: dict) -> dict:
        for key, value in body.items():
            get_connection().execute(
                "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )
        get_connection().commit()
        return settings()

    @app.get("/api/backup")
    def backup() -> dict:
        return export_backup(get_connection())

    @app.post("/api/backup/import")
    def backup_import(body: BackupIn) -> dict:
        if not body.confirm:
            raise HTTPException(400, "Set confirm to true. Replace mode deletes current records.")
        try:
            return import_backup(get_connection(), body.data, body.mode)
        except StoreError as exc:
            fail(exc)

    @app.get("/api/day")
    def day(world_id: str, day: str = Query(...)) -> dict:
        events_rows = [
            dict(row)
            for row in get_connection().execute(
                "SELECT * FROM events WHERE world_id = ? AND substr(occurred_at, 1, 10) = ? ORDER BY occurred_at",
                (world_id, day),
            )
        ]
        return {"day": day, "events": events_rows}

    return app

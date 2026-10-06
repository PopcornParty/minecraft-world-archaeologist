"""HTTP API. The UI talks only to this layer, never to the parser."""

from __future__ import annotations

import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from archaeologist.db.connection import get_connection
from archaeologist.services.achievements import evaluate, seed
from archaeologist.services.analysis import compare, dashboard, world_analytics
from archaeologist.services.import_service import ImportService
from archaeologist.services.records import (
    add_journal,
    add_location,
    export_items_csv,
    export_report_html,
    search,
)

STATIC = Path(__file__).resolve().parent.parent / "ui" / "static"


class PathImport(BaseModel):
    path: str


class JournalIn(BaseModel):
    world_id: str | None = None
    snapshot_id: str | None = None
    player_id: str | None = None
    location_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    tags: str = ""
    written_at: str | None = None


class LocationIn(BaseModel):
    world_id: str
    name: str = Field(min_length=1, max_length=120)
    dimension: str = "overworld"
    x: float
    y: float
    z: float
    description: str = ""
    tags: str = ""


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        conn = get_connection()
        seed(conn)
        evaluate(conn)
        conn.commit()
        yield

    app = FastAPI(title="Minecraft World Archaeologist", version="0.1.0", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return (STATIC / "index.html").read_text(encoding="utf-8")

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "platform_supported": ["bedrock"], "platform_unsupported": ["java"]}

    @app.get("/api/dashboard")
    def dash(world_id: str | None = None) -> dict:
        return dashboard(get_connection(), world_id)

    @app.get("/api/worlds")
    def worlds() -> list[dict]:
        conn = get_connection()
        rows = []
        for world in conn.execute("SELECT * FROM worlds ORDER BY last_seen_at DESC"):
            item = dict(world)
            item["snapshot_count"] = conn.execute("SELECT COUNT(*) FROM snapshots WHERE world_id = ?", (world["id"],)).fetchone()[0]
            rows.append(item)
        return rows

    @app.get("/api/worlds/{world_id}")
    def world_detail(world_id: str) -> dict:
        conn = get_connection()
        world = conn.execute("SELECT * FROM worlds WHERE id = ?", (world_id,)).fetchone()
        if world is None:
            raise HTTPException(404, "world not found")
        snapshots = [dict(row) for row in conn.execute("SELECT * FROM snapshots WHERE world_id = ? ORDER BY imported_at DESC", (world_id,))]
        players = [dict(row) for row in conn.execute("SELECT * FROM players WHERE world_id = ?", (world_id,))]
        locations = [dict(row) for row in conn.execute("SELECT * FROM locations WHERE world_id = ? ORDER BY name", (world_id,))]
        return {"world": dict(world), "snapshots": snapshots, "players": players, "locations": locations}

    @app.get("/api/snapshots/{snapshot_id}")
    def snapshot_detail(snapshot_id: str) -> dict:
        conn = get_connection()
        snap = conn.execute("SELECT * FROM snapshots WHERE id = ?", (snapshot_id,)).fetchone()
        if snap is None:
            raise HTTPException(404, "snapshot not found")
        players = [
            dict(row)
            for row in conn.execute(
                """SELECT p.display_name, p.player_key, s.* FROM player_states s
                   JOIN players p ON p.id = s.player_id WHERE s.snapshot_id = ?""",
                (snapshot_id,),
            )
        ]
        items = [
            dict(row)
            for row in conn.execute(
                "SELECT item_id, category, source, player_id, quantity, stack_count FROM item_totals WHERE snapshot_id = ? ORDER BY quantity DESC",
                (snapshot_id,),
            )
        ]
        return {"snapshot": dict(snap), "players": players, "items": items}

    @app.post("/api/import/path")
    def import_path(body: PathImport) -> dict:
        path = Path(body.path).expanduser()
        job_id = ImportService(get_connection()).start(path)
        return {"job_id": job_id}

    @app.post("/api/import/upload")
    async def import_upload(file: UploadFile = File(...)) -> dict:
        suffix = Path(file.filename or "world.mcworld").suffix or ".mcworld"
        temp = Path(tempfile.mkdtemp(prefix="mwa-upload-"))
        dest = temp / f"upload{suffix}"
        with dest.open("wb") as handle:
            shutil.copyfileobj(file.file, handle)
        job_id = ImportService(get_connection()).start(dest)
        return {"job_id": job_id, "note": "Upload is copied before parsing. The original file is not modified."}

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str) -> dict:
        row = ImportService(get_connection()).job(job_id)
        if row is None:
            raise HTTPException(404, "job not found")
        return row

    @app.get("/api/compare")
    def compare_route(left: str = Query(...), right: str = Query(...)) -> dict:
        try:
            return compare(get_connection(), left, right)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/timeline")
    def timeline(
        world_id: str | None = None,
        event_type: str | None = None,
        q: str | None = None,
        limit: int = 200,
    ) -> list[dict]:
        sql = "SELECT * FROM events WHERE 1=1"
        args: list = []
        if world_id:
            sql += " AND world_id = ?"
            args.append(world_id)
        if event_type:
            sql += " AND event_type = ?"
            args.append(event_type)
        if q:
            sql += " AND (title LIKE ? OR detail LIKE ?)"
            args.extend([f"%{q}%", f"%{q}%"])
        sql += " ORDER BY occurred_at DESC, id DESC LIMIT ?"
        args.append(min(limit, 500))
        return [dict(row) for row in get_connection().execute(sql, args)]

    @app.get("/api/analytics/{world_id}")
    def analytics(world_id: str) -> dict:
        try:
            return world_analytics(get_connection(), world_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/search")
    def search_route(q: str = "", limit: int = 40) -> list[dict]:
        return search(get_connection(), q, min(limit, 100))

    @app.get("/api/journal")
    def journal(world_id: str | None = None) -> list[dict]:
        if world_id:
            rows = get_connection().execute("SELECT * FROM journal_entries WHERE world_id = ? ORDER BY written_at DESC", (world_id,))
        else:
            rows = get_connection().execute("SELECT * FROM journal_entries ORDER BY written_at DESC")
        return [dict(row) for row in rows]

    @app.post("/api/journal")
    def journal_create(body: JournalIn) -> dict:
        return {"id": add_journal(get_connection(), body.model_dump())}

    @app.post("/api/locations")
    def location_create(body: LocationIn) -> dict:
        return {"id": add_location(get_connection(), body.model_dump())}

    @app.get("/api/locations")
    def locations(world_id: str) -> list[dict]:
        return [dict(row) for row in get_connection().execute("SELECT * FROM locations WHERE world_id = ? ORDER BY name", (world_id,))]

    @app.get("/api/achievements")
    def achievements() -> list[dict]:
        evaluate(get_connection())
        get_connection().commit()
        return [dict(row) for row in get_connection().execute("SELECT * FROM achievements ORDER BY unlocked_at IS NULL, name")]

    @app.post("/api/anomalies/{anomaly_id}/dismiss")
    def dismiss(anomaly_id: int) -> dict:
        get_connection().execute("UPDATE anomalies SET dismissed = 1 WHERE id = ?", (anomaly_id,))
        get_connection().commit()
        return {"ok": True}

    @app.get("/api/export/{world_id}/report", response_class=HTMLResponse)
    def report(world_id: str) -> str:
        try:
            return export_report_html(get_connection(), world_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get("/api/export/snapshot/{snapshot_id}.csv", response_class=PlainTextResponse)
    def csv_export(snapshot_id: str) -> str:
        return export_items_csv(get_connection(), snapshot_id)

    @app.get("/api/export/snapshot/{snapshot_id}.json")
    def json_export(snapshot_id: str) -> dict:
        return snapshot_detail(snapshot_id)

    return app

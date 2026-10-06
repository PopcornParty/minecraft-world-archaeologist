"""SQLite schema and versioned migrations. No giant JSON document store."""

from __future__ import annotations

import sqlite3
from pathlib import Path

MIGRATIONS: list[tuple[int, str]] = [
    (
        1,
        """
        CREATE TABLE worlds (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            stable_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            seed TEXT,
            game_type INTEGER,
            difficulty INTEGER,
            generator INTEGER,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE snapshots (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id),
            fingerprint TEXT NOT NULL,
            source_path TEXT,
            source_kind TEXT,
            imported_at TEXT NOT NULL,
            world_time INTEGER,
            last_played INTEGER,
            storage_version INTEGER,
            network_version INTEGER,
            game_version TEXT,
            spawn_x INTEGER,
            spawn_y INTEGER,
            spawn_z INTEGER,
            db_bytes INTEGER,
            chunk_count INTEGER,
            chunk_count_quality TEXT,
            player_count INTEGER,
            unique_item_count INTEGER,
            metadata_json TEXT NOT NULL,
            warnings_json TEXT,
            UNIQUE(world_id, fingerprint)
        );
        CREATE TABLE players (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL,
            player_key TEXT NOT NULL,
            display_name TEXT,
            first_seen_at TEXT,
            last_seen_at TEXT,
            UNIQUE(world_id, player_key)
        );
        CREATE TABLE player_states (
            id INTEGER PRIMARY KEY,
            snapshot_id TEXT NOT NULL,
            player_id TEXT NOT NULL,
            dimension TEXT,
            x REAL,
            y REAL,
            z REAL,
            level INTEGER,
            xp_progress REAL,
            health REAL,
            game_mode INTEGER,
            deaths INTEGER,
            raw_json TEXT,
            UNIQUE(snapshot_id, player_id)
        );
        CREATE TABLE item_totals (
            id INTEGER PRIMARY KEY,
            snapshot_id TEXT NOT NULL,
            player_id TEXT NOT NULL DEFAULT '',
            item_id TEXT NOT NULL,
            category TEXT,
            quantity INTEGER NOT NULL,
            stack_count INTEGER NOT NULL,
            source TEXT NOT NULL,
            UNIQUE(snapshot_id, player_id, item_id, source)
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            world_id TEXT NOT NULL,
            snapshot_id TEXT,
            player_id TEXT,
            location_id INTEGER,
            event_type TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 1,
            occurred_at TEXT NOT NULL,
            title TEXT NOT NULL,
            detail TEXT,
            payload_json TEXT
        );
        CREATE TABLE locations (
            id INTEGER PRIMARY KEY,
            world_id TEXT NOT NULL,
            name TEXT NOT NULL,
            dimension TEXT NOT NULL DEFAULT 'overworld',
            x REAL NOT NULL,
            y REAL NOT NULL,
            z REAL NOT NULL,
            description TEXT,
            tags TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE journal_entries (
            id INTEGER PRIMARY KEY,
            world_id TEXT,
            snapshot_id TEXT,
            player_id TEXT,
            location_id INTEGER,
            written_at TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            tags TEXT
        );
        CREATE TABLE achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            unlocked_at TEXT,
            evidence_json TEXT
        );
        CREATE TABLE import_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            progress REAL NOT NULL,
            message TEXT,
            stage TEXT,
            source TEXT,
            world_id TEXT,
            snapshot_id TEXT,
            duplicate INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE anomalies (
            id INTEGER PRIMARY KEY,
            world_id TEXT NOT NULL,
            snapshot_id TEXT,
            compared_to TEXT,
            kind TEXT NOT NULL,
            severity INTEGER NOT NULL,
            title TEXT NOT NULL,
            detail TEXT NOT NULL,
            payload_json TEXT,
            created_at TEXT NOT NULL,
            dismissed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_snapshots_world ON snapshots(world_id, imported_at);
        CREATE INDEX idx_events_world ON events(world_id, occurred_at);
        CREATE INDEX idx_events_type ON events(event_type);
        CREATE INDEX idx_items_snapshot ON item_totals(snapshot_id, item_id);
        CREATE INDEX idx_items_item ON item_totals(item_id);
        CREATE INDEX idx_players_world ON players(world_id);
        CREATE INDEX idx_anomalies_world ON anomalies(world_id, dismissed);
        CREATE VIRTUAL TABLE search_fts USING fts5(
            entity_type,
            entity_id UNINDEXED,
            world_id UNINDEXED,
            title,
            body,
            tags
        );
        """,
    )
]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    migrate(conn)
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for version, sql in MIGRATIONS:
        if version in applied:
            continue
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
            (version,),
        )
    conn.commit()

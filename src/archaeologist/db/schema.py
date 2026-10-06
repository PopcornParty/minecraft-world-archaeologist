"""SQLite schema. Version 1 was the retired world-file importer.

Version 2 drops that model and stores only records the user enters.
"""

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
        """,
    ),
    (
        2,
        """
        DROP TABLE IF EXISTS search_fts;
        DROP TABLE IF EXISTS anomalies;
        DROP TABLE IF EXISTS import_jobs;
        DROP TABLE IF EXISTS item_totals;
        DROP TABLE IF EXISTS player_states;
        DROP TABLE IF EXISTS journal_entries;
        DROP TABLE IF EXISTS locations;
        DROP TABLE IF EXISTS events;
        DROP TABLE IF EXISTS snapshots;
        DROP TABLE IF EXISTS players;
        DROP TABLE IF EXISTS achievements;
        DROP TABLE IF EXISTS worlds;

        CREATE TABLE worlds (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            edition TEXT NOT NULL DEFAULT 'Bedrock',
            seed TEXT,
            created_on TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            currency_name TEXT NOT NULL DEFAULT 'coins',
            main_location TEXT,
            tags TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            image TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE players (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            nickname TEXT,
            first_seen TEXT,
            last_seen TEXT,
            notes TEXT NOT NULL DEFAULT '',
            relationship TEXT NOT NULL DEFAULT 'friend',
            created_at TEXT NOT NULL,
            UNIQUE(world_id, name)
        );
        CREATE TABLE categories (
            id TEXT PRIMARY KEY,
            world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'event'
        );
        CREATE TABLE events (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'General',
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            occurred_at TEXT NOT NULL,
            player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
            amount REAL,
            item_name TEXT,
            item_delta REAL,
            session_id TEXT,
            goal_id TEXT,
            location_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE transactions (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
            player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
            kind TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            occurred_at TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE items (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(world_id, name)
        );
        CREATE TABLE item_records (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
            quantity REAL,
            delta REAL NOT NULL,
            occurred_at TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE goals (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'General',
            target REAL NOT NULL DEFAULT 1,
            current REAL NOT NULL DEFAULT 0,
            deadline TEXT,
            priority INTEGER NOT NULL DEFAULT 2,
            status TEXT NOT NULL DEFAULT 'active',
            auto_event_type TEXT,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            notes TEXT NOT NULL DEFAULT '',
            manual INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE locations (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            dimension TEXT NOT NULL DEFAULT 'overworld',
            x REAL,
            y REAL,
            z REAL,
            description TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE journal_entries (
            id TEXT PRIMARY KEY,
            world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            written_at TEXT NOT NULL
        );
        CREATE TABLE milestones (
            id TEXT PRIMARY KEY,
            world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            unlocked_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            rule_key TEXT NOT NULL,
            threshold REAL NOT NULL,
            unlocked_at TEXT,
            evidence_json TEXT
        );
        CREATE TABLE progression_weights (
            id TEXT PRIMARY KEY,
            world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            points REAL NOT NULL,
            match_field TEXT NOT NULL,
            match_value TEXT NOT NULL
        );
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE INDEX idx_events_world_time ON events(world_id, occurred_at);
        CREATE INDEX idx_events_type ON events(event_type);
        CREATE INDEX idx_tx_world_time ON transactions(world_id, occurred_at);
        CREATE INDEX idx_items_world ON items(world_id);
        CREATE INDEX idx_goals_world ON goals(world_id, status);
        CREATE INDEX idx_sessions_world ON sessions(world_id, started_at);
        CREATE VIRTUAL TABLE search_fts USING fts5(
            entity_type,
            entity_id UNINDEXED,
            world_id UNINDEXED,
            title,
            body
        );
        """,
    ),
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

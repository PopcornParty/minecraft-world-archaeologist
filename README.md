# Minecraft World Archaeologist

A local journal and analytics tool for Minecraft worlds you describe yourself.

You write what happened. The app stores it, charts it, and keeps the history. It does not read, import, or modify Minecraft world files.

## What you can record

- Worlds, with edition, optional seed, currency name, and notes
- Events, entered as a sentence and checked before saving
- Players, trades, deaths, builds, and item counts
- Goals, sessions, locations, journal notes, and milestones
- Custom categories, currencies, and progression weights

Quick entry is a rule parser, not a language model. "Built castle and spent 120k on materials" becomes a building event with a money change of -120,000. You can edit every field before it is saved.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
archaeologist
```

Open `http://127.0.0.1:8765`. Data stays in `~/.local/share/minecraft-world-archaeologist/` unless `MWA_DATA_DIR` is set. No account, API key, or network is required.

On a phone, use the bottom bar. On a desktop, use the side list. `/` opens search. Ctrl or Command K opens the command list.

## Backup

Export everything writes a JSON file (`mwa-backup` version 2). Import can merge or replace. Replace requires confirmation and does not run if confirmation is missing.

## Database

SQLite with versioned migrations. Version 1 was the retired world-file importer. Version 2 drops those tables and stores manual records. A database created by 0.1.0 loses imported snapshot rows on upgrade, because those rows came from save files this version no longer reads.

## Development

```bash
pytest
ruff check src tests
```

## Limits

- Money, items, deaths, and playtime exist only if you record them.
- Progression score uses weights you add. It is not an official Minecraft value.
- Reminders are in-app lines when enabled. There are no push notifications.
- The sentence parser covers common phrases. Unusual wording should be corrected in the preview.

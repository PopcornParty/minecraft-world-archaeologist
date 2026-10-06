# Minecraft World Archaeologist

A local tool for turning Minecraft Bedrock saves into a history you can search, compare, and annotate.

It reads a world folder or `.mcworld`, extracts what the files actually contain, and stores a snapshot. Importing the same world later adds another snapshot when the content fingerprint changes. The original world is not modified.

Java Edition is recognised and refused. There is an adapter slot for it. This build does not parse region files.

## What it answers

- What was in this save when it was imported?
- What changed between two snapshots?
- Which items increased or decreased in the extracted inventories?
- Which players were present in the extracted player records?
- What did I write down on a given date?
- How many snapshots exist, and how far apart are they?

It does not invent block censuses, playtime, or chest contents the save did not yield.

## Supported formats

Supported:

- Minecraft Bedrock world folders containing `level.dat`
- `.mcworld` and `.zip` archives of that folder
- Bedrock `level.dat` (8-byte header, then uncompressed little-endian NBT)
- LevelDB `db/` size, and chunk-key counts when a table index is uncompressed or zlib-compressed

Not supported:

- Java Edition (`level.dat` gzip, `region/*.mca`)
- Full block palettes and container contents inside chunks
- Snappy-compressed LevelDB index blocks, unless a future build adds a Snappy reader
- Realms, Marketplace packs, and behaviour-pack behaviour beyond noting that the files exist

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and [docs/BEDROCK_FORMAT.md](docs/BEDROCK_FORMAT.md).

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Python 3.10 or newer.

## Run

```bash
archaeologist
```

The app listens on `http://127.0.0.1:8765`. Data is stored in `~/.local/share/minecraft-world-archaeologist/` unless `MWA_DATA_DIR` is set.

## Import a world

Bedrock worlds on this machine usually live under the game's `minecraftWorlds` folder. Import the world directory, or export a `.mcworld` from the game and import that.

The import screen accepts a filesystem path or an upload. Progress is polled while the job runs. A matching fingerprint is recorded as a duplicate and is not parsed again.

Copies kept by the app are `level.dat`, `levelname.txt`, and `world_icon.jpeg` when present. The LevelDB database is hashed in a stream and is not copied. The source path is only opened for reading.

## Snapshots, analytics, comparison

Each distinct fingerprint becomes a snapshot: world metadata, extracted players, item totals, LevelDB byte size, and chunk-key coverage when the index could be read.

Compare two snapshots to see item deltas, player level and position deltas, and metadata deltas. Sort by largest increase, decrease, new, or removed.

Charts plot stored series. A point opens the snapshot. Chunk charts omit snapshots whose index could not be read, rather than drawing a zero.

## Journal, locations, search, export

Journal notes and custom locations are attached to the timeline and the search index. Search uses SQLite FTS5, not a scan of world files.

Export a snapshot as CSV or JSON, or a world as a self-contained HTML report.

## Backup behaviour

Before parsing, the importer does not write into the source world. Metadata copies go to `preserved/<world>/<snapshot>/` inside the data directory. SQLite uses WAL. A failed import marks the job failed and deletes any temporary extract. It does not delete previous snapshots.

## Database

SQLite, migrated in `src/archaeologist/db/schema.py`. Tables include worlds, snapshots, players, player states, item totals, events, locations, journal entries, achievements, import jobs, anomalies, and an FTS5 search table. There is no single JSON dump of the world.

## Development

```bash
pytest
ruff check src tests
```

Architecture notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests

Parser fixtures are generated in the tests, including a Bedrock `level.dat`, a `.mcworld`, a truncated file, a non-zip archive, a path-traversal zip, a Java-shaped world, a duplicate import, and a 5,000-row item lookup.

## Limitations

Player inventories are read when they are embedded in `level.dat` or when a player NBT blob is found beside a player key. Modern Bedrock often keeps the local player only in LevelDB. If that value is inside a Snappy block, this build reports the gap instead of guessing items.

Chest, barrel, and shulker contents are not decoded. Block composition charts are not shown, because that data is not extracted. World time in ticks is stored as written; it is not real-world playtime.

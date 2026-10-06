# Architecture

The UI calls the HTTP API. The API calls services. Services call adapters. Adapters call parsers. Parsers do not import the UI.

```
MinecraftSource
├── BedrockAdapter     implemented
└── JavaAdapter        detect and refuse
```

Import flow:

1. Open a folder, or extract a `.mcworld` into a temp directory.
2. Select an adapter. Java-shaped worlds stop here.
3. Hash `level.dat` and each `db/` file while streaming.
4. Parse `level.dat`. Scan LevelDB indexes when the block compression is readable.
5. If the fingerprint already exists, record a duplicate event and stop.
6. Otherwise store a snapshot, item totals, events, and anomalies in one transaction.
7. Copy small metadata aside. Delete the temp extract.

Comparison, dashboard insights, and achievements are queries over those rows.

Search is FTS5, updated when worlds, snapshots, journal entries, and locations are written.

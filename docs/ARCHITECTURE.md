# Architecture

Input is typed or uploaded as a backup. Nothing in the request path opens a Minecraft directory.

```
quick entry / forms
        ↓
validation and rule parser
        ↓
events, transactions, items, goals, sessions
        ↓
SQLite
        ↓
analytics, insights, achievements
        ↓
HTTP API
        ↓
local UI
```

The 0.1 Bedrock adapter, LevelDB scanner, and `.mcworld` importer have been removed.

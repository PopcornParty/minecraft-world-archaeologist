# Changelog

## 0.1.0

- Bedrock world folder and `.mcworld` import.
- Little-endian `level.dat` parser and best-effort LevelDB index scan.
- Snapshot storage in SQLite, duplicate detection by content fingerprint.
- Comparison, timeline, search, journal, locations, achievements, anomaly notes, CSV and HTML export.
- Java Edition is detected and rejected. It is not parsed.

# Bedrock files this app reads

`level.dat`

- 4-byte little-endian storage version
- 4-byte little-endian payload length
- uncompressed little-endian NBT compound

Fields used when present: LevelName, RandomSeed, LastPlayed, Time, GameType, Difficulty, Generator, SpawnX/Y/Z, lastOpenedWithVersion, NetworkVersion, commandsEnabled, experiments, and a Player compound with Inventory, Armor, Offhand, EnderChestInventory, Pos, DimensionId, PlayerLevel.

`levelname.txt` is a fallback name.

`db/`

- file sizes and hashes for the snapshot fingerprint
- LevelDB table footer magic `0xdb4775248b80fb57`
- index block when compression is none or zlib
- chunk keys of 9 or 13 bytes with a known subchunk tag
- a bounded scan for `~local_player` and `player_` keys

Java `level.dat` starts with gzip magic `1f 8b` and is not parsed.

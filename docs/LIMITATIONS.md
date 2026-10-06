# Limitations

Known unsupported data:

- Java Edition region files and player `.dat` files
- Chunk block palettes, biomes per chunk, and heightmaps
- Block-entity inventories (chests, barrels, furnaces)
- Entity counts, unless a future actor-prefix decoder is added
- Snappy-compressed LevelDB table blocks
- Real playtime. `Time` is world ticks. `LastPlayed` is a unix timestamp from the save.
- Education and experiment flags are stored, not interpreted

Chunk counts are distinct chunk keys in readable indexes. A world whose tables are all Snappy-compressed will show chunk coverage as unavailable and still store database byte size.

Anomaly text says "unusual change detected". It does not claim the save was edited outside the game.

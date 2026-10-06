const STORES = ["worlds", "players", "events", "transactions", "items", "itemRecords", "goals", "sessions", "locations", "journal", "milestones", "achievements", "weights", "settings"];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mwa", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function all(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(store, value) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}

export async function remove(store, id) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function loadAll() {
  const records = {};
  for (const store of STORES) records[store] = await all(store);
  return records;
}

export async function exportBackup() {
  const records = await loadAll();
  return { format: "mwa-backup", version: 3, exportedAt: new Date().toISOString(), ...records };
}

export function validateBackup(payload) {
  if (!payload || payload.format !== "mwa-backup" || payload.version !== 3) {
    throw new Error("This file is not a World Archaeologist backup.");
  }
  for (const store of ["worlds", "events", "players", "goals"]) {
    if (!Array.isArray(payload[store])) throw new Error(`Backup is missing ${store}.`);
  }
  return true;
}

export async function importBackup(payload, mode) {
  validateBackup(payload);
  if (mode !== "merge" && mode !== "replace") throw new Error("Choose merge or replace.");
  const db = await openDb();
  const tx = db.transaction(STORES, "readwrite");
  for (const store of STORES) {
    const objectStore = tx.objectStore(store);
    if (mode === "replace") objectStore.clear();
    for (const row of payload[store] || []) objectStore.put(row);
  }
  await txDone(tx);
  return { worlds: (payload.worlds || []).length };
}

export function id() {
  return crypto.randomUUID().replace(/-/g, "");
}

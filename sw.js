self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.filter((client) => !client.url.includes("fresh=6")).map((client) => client.navigate(client.url.split("?")[0] + "?fresh=6")));
    await self.registration.unregister();
  })());
});

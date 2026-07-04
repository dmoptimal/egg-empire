// Egg Empire service worker (README step 7). Keeps the installed app
// working offline without a build-time precache manifest:
//  - navigations: network-first, falling back to the cached shell;
//  - everything else same-origin (hashed /assets/*, icons, manifest):
//    cache-first, populated on first fetch — hashed filenames make
//    staleness a non-issue, and "/" stays fresh via network-first.
// Bump CACHE to invalidate everything after a breaking change.

const CACHE = "egg-empire-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          await cache.put("/", fresh.clone());
          return fresh;
        } catch {
          return (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    })(),
  );
});

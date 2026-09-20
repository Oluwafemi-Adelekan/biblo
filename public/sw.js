/* Biblo's service worker. It exists for one job: receiving files
   from the phone's share sheet. Everything else - caching, offline -
   is deliberately left to the browser; the app must never serve a
   stale page of someone's money.

   When Biblo is picked in a share sheet, the browser POSTs the shared
   files to /share. That request is answered here, before it reaches
   the network: the files are parked in a cache under a fixed key and
   the chat opens with ?shared=1, where it collects them. */

const STASH = "biblo-share-stash";
const KEY = "/__shared__";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share") return;

  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const files = form.getAll("files").filter((f) => f && typeof f === "object" && "name" in f);
      const text = [form.get("title"), form.get("text"), form.get("url")]
        .filter((v) => typeof v === "string" && v.trim())
        .join(" ");

      /* One Response per file, keyed by index; a manifest entry
         records how many and what they were called. */
      const cache = await caches.open(STASH);
      const keys = await cache.keys();
      await Promise.all(keys.map((k) => cache.delete(k)));
      const meta = [];
      let i = 0;
      for (const f of files) {
        await cache.put(
          new Request(`${KEY}/${i}`),
          new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }),
        );
        meta.push({ name: f.name, type: f.type });
        i++;
      }
      await cache.put(
        new Request(`${KEY}/meta`),
        new Response(JSON.stringify({ files: meta, text }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
      return Response.redirect("/chat?shared=1", 303);
    })(),
  );
});

/*
 * Be Care Compliant: the service worker for Clock in (Rota and Visits Stage 3, Phil 2026-10-16;
 * docs/project/rota-offline-design.md, section 1).
 *
 * Registered only by the Clock in page, so only phones that have opened it have one. It does as
 * little as possible:
 *
 *  - It keeps a copy of the Clock in page and the script files that page loaded (sent to it by
 *    the page), so the page opens with no signal.
 *  - With signal, every page loads from the network exactly as before; the copy is used only when
 *    the network fails.
 *  - With no signal, opening the app, the Clock in page or a scanned QR link (/c/<code>) shows the
 *    kept Clock in page. The page itself reads the code from the address.
 *
 * It stores no visit, service user or clock in data: those live in the page's own storage
 * (IndexedDB), per carer. Script files are content hashed, so a kept one is never stale.
 */

const CACHE = "bcc-clock-v1";
const PAGE = "/clock";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("bcc-clock-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function keep(urls) {
  const cache = await caches.open(CACHE);
  for (const u of urls) {
    try {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin) continue;
      if (url.pathname !== PAGE && !url.pathname.startsWith("/_next/static/")) continue;
      const res = await fetch(url.pathname === PAGE ? PAGE : url.href, { credentials: "same-origin", cache: "no-store" });
      if (res.ok && !res.redirected && res.type === "basic") await cache.put(url.pathname === PAGE ? PAGE : url.href, res);
    } catch (_) {
      // No signal right now: kept next time the page opens with signal.
    }
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "keep" && Array.isArray(data.urls)) event.waitUntil(keep(data.urls));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Script and style files: the kept copy if there is one (they never change), else the network.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req.url).then((hit) => hit || fetch(req)));
    return;
  }

  // Pages: always the network; only when it fails, the kept Clock in page.
  if (req.mode === "navigate") {
    const isClock = url.pathname === PAGE;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isClock && res.ok && !res.redirected && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(PAGE, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(async () => (await caches.match(PAGE)) || Response.error()),
    );
  }
});

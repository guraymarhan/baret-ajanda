// Baret Ajanda – service worker: çevrimdışı açılış + push bildirimleri
const CACHE = "baret-v8";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Kendi dosyalarımız: önce ağ (güncel kalsın), ağ yoksa önbellek
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./"))),
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Baret Ajanda", body: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "Baret Ajanda", {
      body: data.body || "",
      tag: data.tag,
      renotify: !!data.tag,
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      data: { url: data.url || "./" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope)) {
          w.postMessage({ type: "open", url: target });
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

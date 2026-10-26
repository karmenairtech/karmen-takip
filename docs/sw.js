// Kar-Men Proje Takip — uygulama kabuğu önbelleği
const CACHE = "karmen-takip-v28";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "logo.jpg", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase veri ve giriş istekleri önbelleğe alınmaz (veritabanı kendi çevrimdışı önbelleğini kullanır)
  if (/googleapis\.com$|firebaseapp\.com$/.test(url.hostname) && !url.hostname.startsWith("fonts.")) return;
  const sameOrigin = url.origin === location.origin;
  const isSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (sameOrigin) {
    // Önce ağ: güncel sürüm gelsin, bağlantı yoksa önbellek
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
  } else if (isSdk || isFont) {
    // Sürümlü dosyalar: önce önbellek
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(CACHE).then(x => x.put(req, c)); return n; })));
  }
});

// Bildirime tıklanınca uygulamayı öne getir ve ilgili kaydı aç
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.postMessage({ type: "open", mod: d.mod, ref: d.ref }); return c.focus(); }
    return self.clients.openWindow("./#" + (d.mod === "disis" ? "disis" : d.mod ? "proje" : "home"));
  }));
});

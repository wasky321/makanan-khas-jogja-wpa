const CACHE_VERSION = "v2"; // ← ubah saat ada perubahan
const CACHE_NAME = `rasa-jogja-cache-${CACHE_VERSION}`;

// Daftar App‑Shell (aset inti yang wajib offline)
const APP_SHELL = [
  /* Halaman */
  "index.html",
  "gudeg.html",
  "bakpia.html",
  "sate_klatak.html",
  "kopi-joss.html",
  "jelajahi.html",
  "kontak.html",

  /* Gambar */
  "gudeg2.jpg",
  "bakpia.jpg",
  "sate-klatak.jpg",
  "kopi-joss.jpg",
  "Profil.JPG",

  /* Skrip & font */
  "tailwind.min.js",
  "indexeddb.js",
  "fonts.css",
  "fonts/merriweather-v32-latin-700.woff2",
  "fonts/merriweather-v32-latin-regular.woff2",
];

/* ─────────────────── INSTALL ─────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.error("❌ Gagal caching:", err))
  );

  // Langsung aktif tanpa menunggu tab lama ditutup
  self.skipWaiting();
});

/* ─────────────────── ACTIVATE ─────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // buang cache versi lama
          .map((key) => caches.delete(key))
      )
    )
  );

  // Paksa kendali SW baru ke semua tab
  self.clients.claim();
});

/* ─────────────────── FETCH ─────────────────── */
/* Strategi: offline‑first ‑► jatuh ke jaringan ‑► simpan respons OK ke cache */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    // Biarkan permintaan non‑GET atau cross‑origin lewat begitu saja
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached; // 1️⃣ Aset sudah ada di cache

      return fetch(event.request) // 2️⃣ Ambil dari jaringan
        .then((response) => {
          // Simpan respons OK (status 200) bertipe basic (same‑origin)
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // 3️⃣ Fallback saat offline total
          return event.request.mode === "navigate"
            ? caches.match("index.html") // tampilkan halaman awal
            : undefined; // atau diam‑diam gagal
        });
    })
  );
});

/* ─────────────────── BACKGROUND SYNC ─────────────────── */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reviews") {
    event.waitUntil(
      self.clients.matchAll().then((clientsArr) => {
        if (clientsArr.length) {
          /* Panggil fungsi syncReviews() di salah satu tab */
          clientsArr[0].postMessage({ type: "SYNC_REVIEWS" });
        }
      })
    );
  }
});

const CACHE_VERSION = "v2"; 
const CACHE_NAME = `rasa-jogja-cache-${CACHE_VERSION}`;

// Daftar file penting yang harus bisa diakses meski offline (App Shell)
const APP_SHELL = [
  "index.html",
  "gudeg.html",
  "bakpia.html",
  "sate_klatak.html",
  "kopi-joss.html",
  "jelajahi.html",
  "kontak.html",
  "gudeg2.jpg",
  "bakpia.jpg",
  "sate-klatak.jpg",
  "kopi-joss.jpg",
  "Profil.JPG",
  "tailwind.min.js",
  "indexeddb.js",
  "fonts.css",
  "fonts/merriweather-v32-latin-700.woff2",
  "fonts/merriweather-v32-latin-regular.woff2",
];

//  INSTALL 
// Saat pertama kali Service Worker dipasang
self.addEventListener("install", (event) => {
  event.waitUntil(
  // Simpan semua file dari APP_SHELL ke dalam cache
      caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.error("❌ Gagal caching:", err))
  );

  // Langsung aktif tanpa menunggu tab lama ditutup
  self.skipWaiting();
});

/*  ACTIVATE  */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Hapus cache versi lama supaya tidak numpuk
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

// FETCH 
// Menangani permintaan file dari aplikasi (misal gambar, HTML, CSS, js)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    // Biarkan permintaan non‑GET atau cross‑origin lewat begitu saja
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached; // Kalau file sudah ada di cache, langsung pakai

      return fetch(event.request) // Kalau belum, ambil dari internet
        .then((response) => {
          // Simpan file ke cache kalau berhasil dan berasal dari domain sendiri
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Kalau sedang offline total, tampilkan index.html untuk navigasi
          return event.request.mode === "navigate"
            ? caches.match("index.html") // tampilkan halaman awal
            : undefined; // atau diam‑diam gagal
        });
    })
  );
});

/* BACKGROUND SYNC */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reviews") {
    event.waitUntil(
      self.clients.matchAll().then((clientsArr) => {
        if (clientsArr.length) {
          // Kirim pesan ke tab yang aktif agar memicu syncReviews() dari sisi app
          clientsArr[0].postMessage({ type: "SYNC_REVIEWS" });
        }
      })
    );
  }
});

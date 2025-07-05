let db;
const foodIds = ["gudeg", "bakpia", "sate-klatak", "kopi-joss"]; // membuat ID makanan

document.addEventListener("DOMContentLoaded", () => {
  const req = indexedDB.open("UlasanMakananDB", 3); // Membuat database bernama "UlasanMakananDB" dengan versi 3.

  req.onupgradeneeded = (e) => {
    db = e.target.result;
    // Hapus store lama (jika masih pakai keyPath 'id')
    if (db.objectStoreNames.contains("reviews")) {
      db.deleteObjectStore("reviews");
    }
    // Buat objectStore "reviews" dengan key otomatis
    const reviewStore = db.createObjectStore("reviews", { autoIncrement: true });
    reviewStore.createIndex("foodId", "foodId", { unique: false });

    // pending untuk sync
    if (!db.objectStoreNames.contains("pending")) {
      db.createObjectStore("pending", { autoIncrement: true });
    }
  };

  // Jika database berhasil dibuka
  req.onsuccess = (e) => {
    db = e.target.result;
    displayAllReviews(); // Tampilkan semua ulasan makanan
    if (navigator.onLine) syncReviews(); // Sinkronisasi jika sedang online
  };
  // Jika terjadi error saat membuka database
  req.onerror = (e) => console.error("❌ IndexedDB error", e);
});

// CRUD ULASAN
// Simpan ulasan baru atau edit ulasan yang sudah ada
function saveReview(foodId) {
  if (!db) return;
  const textarea = document.getElementById(`review-${foodId}`);
  if (!textarea) return;
  const text = textarea.value.trim(); // Ambil teks ulasan
  if (!text) return;

  const editKey = textarea.dataset.editingKey ? Number(textarea.dataset.editingKey) : null;
  const tx = db.transaction("reviews", "readwrite");
  const store = tx.objectStore("reviews");
  const data = { foodId, text, created: Date.now() };

  if (editKey !== null) {
    // Jika sedang mengedit, gunakan put
    store.put(data, editKey);
  } else {
    // Jika ulasan baru, gunakan add
    store.add(data);
  }

  // Setelah transaksi selesai
  tx.oncomplete = () => {
    textarea.value = "";
    delete textarea.dataset.editingKey; // Reset mode edit
    displayReviews(foodId); // Refresh tampilan ulasan

    // Simpan ke daftar untuk disinkron nanti
    queueSync({ action: editKey !== null ? "edit" : "save", key: editKey, foodId, text });
  };
  tx.onerror = (e) => console.error("❌ Gagal simpan", e);
}

function startEdit(foodId, key) {
  if (!db) return;
  const tx = db.transaction("reviews", "readonly");
  const req = tx.objectStore("reviews").get(Number(key));
  req.onsuccess = () => {
    if (!req.result) return;
    const textarea = document.getElementById(`review-${foodId}`);
    textarea.value = req.result.text; // Tampilkan teks ulasan
    textarea.dataset.editingKey = key; // Tandai sebagai mode edit
    textarea.focus();
  };
}

// Hapus ulasan berdasarkan key
function deleteReview(foodId, key) {
  if (!db) return;
  const tx = db.transaction("reviews", "readwrite");
  tx.objectStore("reviews").delete(Number(key));
  tx.oncomplete = () => {
    displayReviews(foodId); // Refresh tampilan ulasan
    queueSync({ action: "delete", key: Number(key), foodId }); // Tandai untuk sinkronsasi
  };
}

// Buat fungsi-fungsi ini bisa diakses dari HTML (global)
Object.assign(window, { saveReview, startEdit, deleteReview });

//  MENAMPILKAN ULASAN
// Tampilkan ulasan untuk satu jenis makanan
function displayReviews(foodId) {
  if (!db) return;
  const container = document.getElementById(`display-review-${foodId}`);
  if (!container) return;
  container.innerHTML = "(Memuat...)";

  const tx = db.transaction("reviews", "readonly");
  const index = tx.objectStore("reviews").index("foodId");
  const range = IDBKeyRange.only(foodId);
  const cursorReq = index.openCursor(range, "prev"); // Tampilkan yang terbaru dulu
  const items = [];
  cursorReq.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const { text, created } = cursor.value;
      const key = cursor.primaryKey;
      const dateStr = new Date(created).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" });
      // Format tampilan tiap ulasan
      items.push(
        `<div class="mb-2"><span>${text}</span> <span class="text-xs text-gray-400">(${dateStr})</span><br><button class="text-blue-600 text-xs underline" onclick="startEdit('${foodId}', ${key})">Edit</button> <button class="text-red-600 text-xs underline" onclick="deleteReview('${foodId}', ${key})">Hapus</button></div>`
      );
      cursor.continue();
    } else {
      // Jika tidak ada ulasan
      container.innerHTML = items.length ? items.join("") : "(Belum ada ulasan)";
    }
  };
}

// Tampilkan ulasan untuk semua makanan
function displayAllReviews() {
  foodIds.forEach(displayReviews);
}

// SINKRONISASI ULASAN SAAT ONLINE

// Masukkan perubahan ulasan ke antrian sinkronisasi
function queueSync(entry) {
  const tx = db.transaction("pending", "readwrite");
  tx.objectStore("pending").add(entry);
  tx.oncomplete = () => {
    // Jika browser mendukung Background Sync
    if (navigator.serviceWorker && "SyncManager" in window) {
      navigator.serviceWorker.ready.then((reg) => reg.sync.register("sync-reviews"));
    } else if (navigator.onLine) {
      // Jika online, langsung sinkronkan
      syncReviews();
    }
  };
}

// Kirim data yang tertunda ke server
async function syncReviews() {
  const tx = db.transaction("pending", "readwrite");
  const store = tx.objectStore("pending");
  const all = await store.getAll();
  if (!all.length) return;
  try {
    // Kirim data ke server
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all),
    });
    if (res.ok) store.clear(); // Hapus data yang sudah berhasil dikirim
  } catch (err) {
    console.warn("🔌 Offline / server error", err);
  }
}

// Saat kembali online, coba sinkronkan ulang
window.addEventListener("online", syncReviews);

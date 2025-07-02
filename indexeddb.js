/* indexeddb.js — v3 (multi‑review per makanan)
   ────────────────────────────────────────────────
   Fitur:
   • Simpan banyak ulasan per makanan (record autoIncrement)
   • Edit / Hapus tiap ulasan
   • Sinkronisasi online (queue pending)
*/

let db;
const foodIds = ["gudeg", "bakpia", "sate-klatak", "kopi-joss"];

// === IndexedDB INIT =========================================================

document.addEventListener("DOMContentLoaded", () => {
  const req = indexedDB.open("UlasanMakananDB", 3); // Membuka atau membuat database bernama "UlasanMakananDB" dengan versi 3.

  req.onupgradeneeded = (e) => {
    db = e.target.result;
    // Hapus store lama (jika masih pakai keyPath 'id')
    if (db.objectStoreNames.contains("reviews")) {
      db.deleteObjectStore("reviews");
    }
    // reviews: autoIncrement + index foodId
    const reviewStore = db.createObjectStore("reviews", { autoIncrement: true });
    reviewStore.createIndex("foodId", "foodId", { unique: false });

    // pending untuk sync
    if (!db.objectStoreNames.contains("pending")) {
      db.createObjectStore("pending", { autoIncrement: true });
    }
  };

  req.onsuccess = (e) => {
    db = e.target.result;
    displayAllReviews();
    if (navigator.onLine) syncReviews();
  };
  req.onerror = (e) => console.error("❌ IndexedDB error", e);
});

// === CRUD ULASAN ============================================================
function saveReview(foodId) {
  if (!db) return;
  const textarea = document.getElementById(`review-${foodId}`);
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) return;

  const editKey = textarea.dataset.editingKey ? Number(textarea.dataset.editingKey) : null;
  const tx = db.transaction("reviews", "readwrite");
  const store = tx.objectStore("reviews");
  const data = { foodId, text, created: Date.now() };

  if (editKey !== null) {
    store.put(data, editKey);
  } else {
    store.add(data);
  }

  tx.oncomplete = () => {
    textarea.value = "";
    delete textarea.dataset.editingKey;
    displayReviews(foodId);

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
    textarea.value = req.result.text;
    textarea.dataset.editingKey = key;
    textarea.focus();
  };
}

function deleteReview(foodId, key) {
  if (!db) return;
  const tx = db.transaction("reviews", "readwrite");
  tx.objectStore("reviews").delete(Number(key));
  tx.oncomplete = () => {
    displayReviews(foodId);
    queueSync({ action: "delete", key: Number(key), foodId });
  };
}

// Expose globally
Object.assign(window, { saveReview, startEdit, deleteReview });

// === DISPLAY ================================================================
function displayReviews(foodId) {
  if (!db) return;
  const container = document.getElementById(`display-review-${foodId}`);
  if (!container) return;
  container.innerHTML = "(Memuat...)";

  const tx = db.transaction("reviews", "readonly");
  const index = tx.objectStore("reviews").index("foodId");
  const range = IDBKeyRange.only(foodId);
  const cursorReq = index.openCursor(range, "prev"); // newest first
  const items = [];
  cursorReq.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const { text, created } = cursor.value;
      const key = cursor.primaryKey;
      const dateStr = new Date(created).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" });
      items.push(
        `<div class="mb-2"><span>${text}</span> <span class="text-xs text-gray-400">(${dateStr})</span><br><button class="text-blue-600 text-xs underline" onclick="startEdit('${foodId}', ${key})">Edit</button> <button class="text-red-600 text-xs underline" onclick="deleteReview('${foodId}', ${key})">Hapus</button></div>`
      );
      cursor.continue();
    } else {
      container.innerHTML = items.length ? items.join("") : "(Belum ada ulasan)";
    }
  };
}

function displayAllReviews() {
  foodIds.forEach(displayReviews);
}

// === SYNC ONLINE ============================================================
function queueSync(entry) {
  const tx = db.transaction("pending", "readwrite");
  tx.objectStore("pending").add(entry);
  tx.oncomplete = () => {
    if (navigator.serviceWorker && "SyncManager" in window) {
      navigator.serviceWorker.ready.then((reg) => reg.sync.register("sync-reviews"));
    } else if (navigator.onLine) {
      syncReviews();
    }
  };
}

async function syncReviews() {
  const tx = db.transaction("pending", "readwrite");
  const store = tx.objectStore("pending");
  const all = await store.getAll();
  if (!all.length) return;
  // Ganti endpoint di bawah sesuai API‑mu
  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all),
    });
    if (res.ok) store.clear();
  } catch (err) {
    console.warn("🔌 Offline / server error", err);
  }
}

window.addEventListener("online", syncReviews);

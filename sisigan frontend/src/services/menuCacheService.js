// src/services/menuCacheService.js
// Production-grade persistent offline-first menu cache using IndexedDB
// with localStorage fallback. Eliminates Render cold-start delays.

const DB_NAME = 'sisigan_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'menu_cache';

let dbPromise = null;

/**
 * Initializes and returns the IndexedDB database instance.
 * Gracefully handles browsers with disabled or corrupted IndexedDB.
 */
function getDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };

        req.onsuccess = (event) => {
          resolve(event.target.result);
        };

        req.onerror = () => {
          console.warn('[MenuCache] Failed to open IndexedDB, falling back to localStorage');
          resolve(null);
        };
      } catch (err) {
        console.warn('[MenuCache] IndexedDB initialization exception:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Builds a deterministic branch-aware cache key.
 */
export function buildCacheKey(params = {}) {
  const branchId = params.branchId != null ? String(params.branchId) : 'all';
  const includePhoto = Boolean(params.includePhoto);
  const includeUnavailable = Boolean(params.includeUnavailable);
  const enforceStock = Boolean(params.enforceStock);
  return `menu_b${branchId}_p${includePhoto ? 1 : 0}_u${includeUnavailable ? 1 : 0}_e${enforceStock ? 1 : 0}`;
}

/**
 * Retrieves cached menu snapshot from IndexedDB or localStorage.
 * Returns { data, timestamp } or null.
 */
export async function getCachedMenu(params = {}) {
  const key = buildCacheKey(params);

  try {
    const db = await getDb();
    if (db) {
      const result = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

      if (result && Array.isArray(result.data)) {
        return {
          data: result.data,
          timestamp: result.timestamp || Date.now(),
          key: result.key,
          fromCache: true,
        };
      }
    }
  } catch (err) {
    console.warn('[MenuCache] Error reading from IndexedDB:', err.message);
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(`sisigan_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data)) {
        return {
          data: parsed.data,
          timestamp: parsed.timestamp || Date.now(),
          key,
          fromCache: true,
        };
      }
    }
  } catch (err) {
    console.warn('[MenuCache] Error reading from localStorage:', err.message);
  }

  return null;
}

/**
 * Persists menu snapshot to IndexedDB and lightweight fallback to localStorage.
 */
export async function setCachedMenu(params = {}, data = []) {
  if (!Array.isArray(data)) return;

  const key = buildCacheKey(params);
  const record = {
    key,
    branchId: params.branchId || null,
    data,
    timestamp: Date.now(),
    version: 1,
  };

  try {
    const db = await getDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(record);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
  } catch (err) {
    console.warn('[MenuCache] Failed saving to IndexedDB:', err.message);
  }

  // Save lightweight version (strip huge base64 photos to stay within 5MB quota) to localStorage as emergency backup
  try {
    const safeData = data.map((cat) => ({
      ...cat,
      items: (cat.items || []).map((item) => {
        // eslint-disable-next-line no-unused-vars
        const { photo, ...cleanItem } = item;
        return cleanItem;
      }),
    }));
    localStorage.setItem(
      `sisigan_cache_${key}`,
      JSON.stringify({ data: safeData, timestamp: record.timestamp })
    );
  } catch {
    // Quota reached or private mode — ignore safely
  }
}

/**
 * Purges cache for a specific branch or all cached records.
 */
export async function clearMenuCache(branchId = null) {
  try {
    const db = await getDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (branchId == null) {
        store.clear();
      } else {
        const req = store.openCursor();
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            if (cursor.value.branchId === branchId || String(cursor.value.branchId) === String(branchId)) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }
    }
  } catch (err) {
    console.warn('[MenuCache] Error clearing IndexedDB cache:', err.message);
  }

  // Clear matching localStorage keys
  try {
    const prefix = branchId != null ? `sisigan_cache_menu_b${branchId}_` : 'sisigan_cache_';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.warn('[MenuCache] Error clearing localStorage:', e.message);
  }
}

/**
 * Compares two menu category arrays to detect actual changes (pricing, availability, items, categories).
 * Returns true if meaningful differences exist.
 */
export function hasMenuChanged(cachedMenu, freshMenu) {
  if (!Array.isArray(cachedMenu) || !Array.isArray(freshMenu)) return true;
  if (cachedMenu.length !== freshMenu.length) return true;

  for (let c = 0; c < cachedMenu.length; c++) {
    const cCat = cachedMenu[c];
    const fCat = freshMenu[c];
    if (cCat.id !== fCat.id || cCat.name !== fCat.name) return true;

    const cItems = cCat.items || [];
    const fItems = fCat.items || [];
    if (cItems.length !== fItems.length) return true;

    for (let i = 0; i < cItems.length; i++) {
      const ci = cItems[i];
      const fi = fItems[i];
      if (
        ci.id !== fi.id ||
        ci.name !== fi.name ||
        Number(ci.price) !== Number(fi.price) ||
        Boolean(ci.isAvailable) !== Boolean(fi.isAvailable) ||
        ci.availableServings !== fi.availableServings ||
        ci.imageUrl !== fi.imageUrl
      ) {
        return true;
      }
    }
  }

  return false;
}

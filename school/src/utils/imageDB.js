/**
 * Image Storage Utility using IndexedDB
 * Stores generated images to avoid bloating the save file
 * Migrated to store Blobs instead of Base64 for efficiency
 */

const DB_NAME = 'SchoolSimulator_Images';
const STORE_NAME = 'images';
const DB_VERSION = 1;

let dbPromise = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject('ImageDB error: ' + event.target.error);

      request.onsuccess = (event) => resolve(event.target.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }
  return dbPromise;
};

/**
 * Convert Base64 string to Blob
 * @param {string} base64
 * @returns {Promise<Blob>}
 */
const base64ToBlob = async (base64) => {
  const res = await fetch(base64);
  return await res.blob();
};

/**
 * Save image to DB (Stores as Blob)
 * @param {string} id
 * @param {string|Blob} data - Base64 string or Blob
 * @returns {Promise<Blob>} The stored blob
 */
export const saveImageToDB = async (id, data) => {
  try {
    let blob = data;
    // If data is base64 string, convert to Blob
    if (typeof data === 'string') {
        blob = await base64ToBlob(data);
    }

    const db = await getDB();
    // We don't await the transaction completion for the return, but we await the put request
    // to ensure data is at least queued for writing.
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, data: blob, timestamp: Date.now() });

      request.onsuccess = () => resolve(blob);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.error('[ImageDB] Save failed:', e);
    throw e;
  }
};

/**
 * Get image from DB
 * auto-migrates Base64 to Blob if old format is found
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export const getImageFromDB = async (id) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = async () => {
        const result = request.result;
        if (!result) {
            resolve(null);
            return;
        }

        let data = result.data;

        // Lazy Migration: If data is string (Base64), convert to Blob and update DB in background
        if (typeof data === 'string') {
            // console.log(`[ImageDB] Migrating image ${id} from Base64 to Blob...`);
            try {
                const blob = await base64ToBlob(data);
                
                // Return immediately to UI
                resolve(blob);

                // Update DB in background (Non-blocking)
                // We open a NEW readwrite transaction for the update
                saveImageToDB(id, blob).catch(err => {
                    console.error(`[ImageDB] Background migration failed for ${id}:`, err);
                });
            } catch (err) {
                console.error(`[ImageDB] Failed to convert legacy Base64 for ${id}:`, err);
                // Fallback: return original string if conversion fails? 
                // Better to reject or return null as UI expects Blob usually, 
                // but if UI can handle both, we could return data.
                // Assuming UI expects Blob or URL compatible object.
                // If fetch fails, the string might be invalid anyway.
                reject(err);
            }
        } else {
            // Already a Blob
            resolve(data);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.error('[ImageDB] Load failed:', e);
    return null;
  }
};

export const deleteImageFromDB = async (id) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
  } catch (e) {
    console.error('[ImageDB] Delete failed:', e);
  }
};

/**
 * Image Storage Utility using IndexedDB
 * Stores generated images to avoid bloating the save file
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

export const saveImageToDB = async (id, base64Data) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, data: base64Data, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.error('[ImageDB] Save failed:', e);
  }
};

export const getImageFromDB = async (id) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result ? request.result.data : null);
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

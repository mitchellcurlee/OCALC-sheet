/**
 * IndexedDB wrapper for offline data storage
 * 
 * Stores jobs, poles, and underground items locally for offline access.
 * Also manages a sync queue for pending changes.
 */

const DB_NAME = 'PoleDataOffline';
const DB_VERSION = 2;

const STORES = {
  JOBS: 'jobs',
  POLES: 'poles',
  UNDERGROUND: 'underground',
  SYNC_QUEUE: 'syncQueue',
  META: 'meta',
  PHOTO_QUEUE: 'photoQueue'
};

let dbInstance = null;

/**
 * Initialize IndexedDB
 */
export async function initDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Jobs store
      if (!db.objectStoreNames.contains(STORES.JOBS)) {
        const jobsStore = db.createObjectStore(STORES.JOBS, { keyPath: 'id' });
        jobsStore.createIndex('user_id', 'user_id', { unique: false });
        jobsStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Poles store
      if (!db.objectStoreNames.contains(STORES.POLES)) {
        const polesStore = db.createObjectStore(STORES.POLES, { keyPath: 'id' });
        polesStore.createIndex('job_id', 'job_id', { unique: false });
        polesStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Underground store
      if (!db.objectStoreNames.contains(STORES.UNDERGROUND)) {
        const ugStore = db.createObjectStore(STORES.UNDERGROUND, { keyPath: 'id' });
        ugStore.createIndex('job_id', 'job_id', { unique: false });
        ugStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Sync queue for pending changes
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('entity', 'entity', { unique: false });
      }

      // Metadata store (last sync time, etc.)
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }

      // Queued photo blobs captured while offline
      if (!db.objectStoreNames.contains(STORES.PHOTO_QUEUE)) {
        db.createObjectStore(STORES.PHOTO_QUEUE, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Get the database instance
 */
async function getDB() {
  if (!dbInstance) {
    await initDB();
  }
  return dbInstance;
}

/**
 * Generic store operations
 */
async function putItem(storeName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getItem(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllItems(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getItemsByIndex(storeName, indexName, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============== JOBS ==============

export async function saveJob(job) {
  return putItem(STORES.JOBS, job);
}

export async function getJob(id) {
  return getItem(STORES.JOBS, id);
}

export async function getAllJobs() {
  return getAllItems(STORES.JOBS);
}

export async function deleteJob(id) {
  // Also delete associated poles and underground items
  const poles = await getPolesByJob(id);
  const underground = await getUndergroundByJob(id);
  
  for (const pole of poles) {
    await deleteItem(STORES.POLES, pole.id);
  }
  for (const ug of underground) {
    await deleteItem(STORES.UNDERGROUND, ug.id);
  }
  
  return deleteItem(STORES.JOBS, id);
}

// ============== POLES ==============

export async function savePole(pole) {
  return putItem(STORES.POLES, pole);
}

export async function getPole(id) {
  return getItem(STORES.POLES, id);
}

export async function getPolesByJob(jobId) {
  return getItemsByIndex(STORES.POLES, 'job_id', jobId);
}

export async function getAllPoles() {
  return getAllItems(STORES.POLES);
}

export async function deletePole(id) {
  return deleteItem(STORES.POLES, id);
}

// ============== UNDERGROUND ==============

export async function saveUnderground(item) {
  return putItem(STORES.UNDERGROUND, item);
}

export async function getUnderground(id) {
  return getItem(STORES.UNDERGROUND, id);
}

export async function getUndergroundByJob(jobId) {
  return getItemsByIndex(STORES.UNDERGROUND, 'job_id', jobId);
}

export async function deleteUnderground(id) {
  return deleteItem(STORES.UNDERGROUND, id);
}

export async function getAllUnderground() {
  return getAllItems(STORES.UNDERGROUND);
}

// ============== PHOTO QUEUE ==============

export async function savePhotoBlob(rec) {
  return putItem(STORES.PHOTO_QUEUE, rec);
}

export async function getPhotoBlob(id) {
  return getItem(STORES.PHOTO_QUEUE, id);
}

export async function getAllPhotoBlobs() {
  return getAllItems(STORES.PHOTO_QUEUE);
}

export async function deletePhotoBlob(id) {
  return deleteItem(STORES.PHOTO_QUEUE, id);
}

// ============== SYNC QUEUE ==============

export async function addToSyncQueue(action) {
  const item = {
    ...action,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };
  return putItem(STORES.SYNC_QUEUE, item);
}

export async function getSyncQueue() {
  return getAllItems(STORES.SYNC_QUEUE);
}

export async function clearSyncQueue() {
  return clearStore(STORES.SYNC_QUEUE);
}

export async function removeSyncItem(id) {
  return deleteItem(STORES.SYNC_QUEUE, id);
}

// ============== METADATA ==============

export async function setLastSyncTime(time) {
  return putItem(STORES.META, { key: 'lastSync', value: time });
}

export async function getLastSyncTime() {
  const item = await getItem(STORES.META, 'lastSync');
  return item?.value || null;
}

export async function setUserData(user) {
  return putItem(STORES.META, { key: 'currentUser', value: user });
}

export async function getUserData() {
  const item = await getItem(STORES.META, 'currentUser');
  return item?.value || null;
}

// ============== BULK OPERATIONS ==============

export async function saveAllJobs(jobs) {
  for (const job of jobs) {
    await saveJob(job);
  }
}

export async function saveAllPoles(poles) {
  for (const pole of poles) {
    await savePole(pole);
  }
}

export async function saveAllUnderground(items) {
  for (const item of items) {
    await saveUnderground(item);
  }
}

export async function clearAllData() {
  await clearStore(STORES.JOBS);
  await clearStore(STORES.POLES);
  await clearStore(STORES.UNDERGROUND);
  await clearStore(STORES.SYNC_QUEUE);
  await clearStore(STORES.META);
}

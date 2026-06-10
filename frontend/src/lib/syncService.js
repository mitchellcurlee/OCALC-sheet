/**
 * Sync Service for offline data synchronization
 * 
 * Handles bidirectional sync between local IndexedDB and the server.
 * - Queues changes when offline
 * - Syncs pending changes when back online
 * - Pulls server changes since last sync
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as db from './offlineDb';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Sync status
let isSyncing = false;
let syncListeners = [];

/**
 * Register a listener for sync status changes
 */
export function onSyncStatusChange(callback) {
  syncListeners.push(callback);
  return () => {
    syncListeners = syncListeners.filter(cb => cb !== callback);
  };
}

function notifySyncStatus(status) {
  syncListeners.forEach(cb => cb(status));
}

/**
 * Check if we're online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Queue an action for sync when offline
 */
export async function queueAction(action, entity, entityId, data) {
  const syncItem = {
    id: uuidv4(),
    action, // 'create', 'update', 'delete'
    entity, // 'job', 'pole', 'underground'
    entity_id: entityId,
    data,
    timestamp: new Date().toISOString()
  };
  
  await db.addToSyncQueue(syncItem);
  
  // Try to sync if online
  if (isOnline()) {
    syncPendingChanges();
  }
  
  return syncItem;
}

/**
 * Create a job (works offline)
 */
export async function createJob(jobData) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const job = {
    id,
    ...jobData,
    pole_count: 0,
    created_at: now,
    updated_at: now,
    _offline: true
  };
  
  // Save locally
  await db.saveJob(job);
  
  // Queue for sync
  await queueAction('create', 'job', id, job);
  
  return job;
}

/**
 * Update a job (works offline)
 */
export async function updateJob(jobId, updates) {
  const job = await db.getJob(jobId);
  if (!job) throw new Error('Job not found');
  
  const updatedJob = {
    ...job,
    ...updates,
    updated_at: new Date().toISOString(),
    _offline: true
  };
  
  await db.saveJob(updatedJob);
  await queueAction('update', 'job', jobId, updates);
  
  return updatedJob;
}

/**
 * Delete a job (works offline)
 */
export async function deleteJobOffline(jobId) {
  await db.deleteJob(jobId);
  await queueAction('delete', 'job', jobId, null);
}

/**
 * Create a pole (works offline)
 */
export async function createPole(poleData) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const pole = {
    id,
    ...poleData,
    inspection_date: now,
    created_at: now,
    updated_at: now,
    _offline: true
  };
  
  await db.savePole(pole);
  await queueAction('create', 'pole', id, pole);
  
  return pole;
}

/**
 * Update a pole (works offline)
 */
export async function updatePole(poleId, updates) {
  const pole = await db.getPole(poleId);
  if (!pole) throw new Error('Pole not found');
  
  const updatedPole = {
    ...pole,
    ...updates,
    updated_at: new Date().toISOString(),
    _offline: true
  };
  
  await db.savePole(updatedPole);
  await queueAction('update', 'pole', poleId, updates);
  
  return updatedPole;
}

/**
 * Delete a pole (works offline)
 */
export async function deletePoleOffline(poleId) {
  await db.deletePole(poleId);
  await queueAction('delete', 'pole', poleId, null);
}

/**
 * Create underground item (works offline)
 */
export async function createUnderground(data) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const item = {
    id,
    ...data,
    created_at: now,
    updated_at: now,
    _offline: true
  };
  
  await db.saveUnderground(item);
  await queueAction('create', 'underground', id, item);
  
  return item;
}

/**
 * Update underground item (works offline)
 */
export async function updateUndergroundOffline(itemId, updates) {
  const item = await db.getUnderground(itemId);
  if (!item) throw new Error('Underground item not found');
  
  const updatedItem = {
    ...item,
    ...updates,
    updated_at: new Date().toISOString(),
    _offline: true
  };
  
  await db.saveUnderground(updatedItem);
  await queueAction('update', 'underground', itemId, updates);
  
  return updatedItem;
}

/**
 * Delete underground item (works offline)
 */
export async function deleteUndergroundOffline(itemId) {
  await db.deleteUnderground(itemId);
  await queueAction('delete', 'underground', itemId, null);
}

/**
 * Sync pending changes with the server
 */
export async function syncPendingChanges() {
  if (isSyncing || !isOnline()) return;
  
  isSyncing = true;
  notifySyncStatus({ syncing: true, error: null });
  
  try {
    const queue = await db.getSyncQueue();
    if (queue.length === 0) {
      isSyncing = false;
      notifySyncStatus({ syncing: false, error: null, pending: 0 });
      return;
    }
    
    const lastSync = await db.getLastSyncTime();
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    // Push changes to server
    const response = await axios.post(`${API_URL}/api/sync/push`, {
      actions: queue.map(q => ({
        id: q.id,
        action: q.action,
        entity: q.entity,
        entity_id: q.entity_id,
        data: q.data,
        timestamp: q.timestamp
      })),
      last_sync: lastSync
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const { results, server_time, changes } = response.data;
    
    // Process results - remove successful items from queue
    for (const result of results) {
      if (result.success) {
        // Find and remove from queue
        const queueItem = queue.find(q => q.id === result.action_id);
        if (queueItem) {
          await db.removeSyncItem(queueItem.id);
          
          // Update local ID if server assigned a different one
          if (result.server_id && queueItem.entity_id !== result.server_id) {
            // Update local data with server ID
            if (queueItem.entity === 'job') {
              const job = await db.getJob(queueItem.entity_id);
              if (job) {
                await db.deleteJob(queueItem.entity_id);
                job.id = result.server_id;
                delete job._offline;
                await db.saveJob(job);
              }
            } else if (queueItem.entity === 'pole') {
              const pole = await db.getPole(queueItem.entity_id);
              if (pole) {
                await db.deletePole(queueItem.entity_id);
                pole.id = result.server_id;
                delete pole._offline;
                await db.savePole(pole);
              }
            } else if (queueItem.entity === 'underground') {
              const ug = await db.getUnderground(queueItem.entity_id);
              if (ug) {
                await db.deleteUnderground(queueItem.entity_id);
                ug.id = result.server_id;
                delete ug._offline;
                await db.saveUnderground(ug);
              }
            }
          }
        }
      }
    }
    
    // Apply server changes
    if (changes) {
      if (changes.jobs) await db.saveAllJobs(changes.jobs);
      if (changes.poles) await db.saveAllPoles(changes.poles);
      if (changes.underground) await db.saveAllUnderground(changes.underground);
    }
    
    // Update last sync time
    await db.setLastSyncTime(server_time);
    
    const remainingQueue = await db.getSyncQueue();
    notifySyncStatus({ 
      syncing: false, 
      error: null, 
      pending: remainingQueue.length,
      lastSync: server_time
    });
    
  } catch (error) {
    console.error('Sync failed:', error);
    notifySyncStatus({ 
      syncing: false, 
      error: error.message || 'Sync failed',
      pending: (await db.getSyncQueue()).length
    });
  } finally {
    isSyncing = false;
  }
}

/**
 * Pull all data from server (initial sync or full refresh)
 */
export async function pullAllData() {
  if (!isOnline()) {
    throw new Error('Cannot pull data while offline');
  }
  
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  notifySyncStatus({ syncing: true, error: null });
  
  try {
    const response = await axios.get(`${API_URL}/api/sync/pull`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const { data, server_time } = response.data;
    
    // Save all data locally
    if (data.jobs) await db.saveAllJobs(data.jobs);
    if (data.poles) await db.saveAllPoles(data.poles);
    if (data.underground) await db.saveAllUnderground(data.underground);
    
    await db.setLastSyncTime(server_time);
    
    notifySyncStatus({ 
      syncing: false, 
      error: null,
      lastSync: server_time
    });
    
    return data;
  } catch (error) {
    console.error('Pull failed:', error);
    notifySyncStatus({ 
      syncing: false, 
      error: error.message || 'Pull failed'
    });
    throw error;
  }
}

/**
 * Get sync queue count
 */
export async function getPendingCount() {
  const queue = await db.getSyncQueue();
  return queue.length;
}

/**
 * Listen for online/offline events and trigger sync
 */
export function initSyncListeners() {
  window.addEventListener('online', () => {
    console.log('[Sync] Back online, syncing...');
    syncPendingChanges();
  });
  
  window.addEventListener('offline', () => {
    console.log('[Sync] Gone offline');
    notifySyncStatus({ online: false });
  });
  
  // Listen for service worker sync messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'SYNC_REQUESTED') {
        syncPendingChanges();
      }
    });
  }
  
  // Initial sync if online
  if (isOnline()) {
    syncPendingChanges();
  }
}

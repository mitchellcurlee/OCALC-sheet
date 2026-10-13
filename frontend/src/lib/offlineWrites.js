/**
 * Offline write queue: intercepts failed axios JSON writes for poles, underground
 * items and jobs, stores them in IndexedDB and queues them for /api/sync/push.
 * Also merges pending offline-created items into GET list responses.
 */
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import * as db from './offlineDb';
import { queueAction } from './syncService';

// Parse a relative API url into { entity, action, id } or null if not queueable
const parseWrite = (method, url) => {
  const m = (method || '').toLowerCase();
  const path = (url || '').split('?')[0];
  const patterns = [
    { re: /^\/poles$/, entity: 'pole' },
    { re: /^\/poles\/([^/]+)$/, entity: 'pole' },
    { re: /^\/underground$/, entity: 'underground' },
    { re: /^\/underground\/([^/]+)$/, entity: 'underground' },
    { re: /^\/jobs$/, entity: 'job' },
    { re: /^\/jobs\/([^/]+)$/, entity: 'job' },
  ];
  for (const p of patterns) {
    const match = path.match(p.re);
    if (!match) continue;
    const id = match[1] || null;
    if (m === 'post' && !id) return { entity: p.entity, action: 'create', id: null };
    if (m === 'put' && id) return { entity: p.entity, action: 'update', id };
    if (m === 'delete' && id) return { entity: p.entity, action: 'delete', id };
  }
  return null;
};

const saveLocal = async (entity, item) => {
  if (entity === 'pole') return db.savePole(item);
  if (entity === 'underground') return db.saveUnderground(item);
  if (entity === 'job') return db.saveJob(item);
};

const deleteLocal = async (entity, id) => {
  if (entity === 'pole') return db.deletePole(id);
  if (entity === 'underground') return db.deleteUnderground(id);
  if (entity === 'job') return db.deleteJob(id);
};

const getLocal = async (entity, id) => {
  if (entity === 'pole') return db.getPole(id);
  if (entity === 'underground') return db.getUnderground(id);
  if (entity === 'job') return db.getJob(id);
};

let offlineToastAt = 0;
const offlineToast = () => {
  if (Date.now() - offlineToastAt > 4000) {
    offlineToastAt = Date.now();
    toast.warning('No signal — saved on this device. It will sync automatically when you\u2019re back online.');
  }
};

// Request interceptor: every create carries a client id, so a retried/replayed request (double tap,
// response lost after the server saved) resolves to the SAME record instead of a duplicate
axios.interceptors.request.use((config) => {
  const parsed = parseWrite(config.method, config.url);
  if (parsed?.action === 'create' && parsed.entity !== 'job' && config.data && typeof config.data === 'object' && !(config.data instanceof FormData) && !config.data.id) {
    config.data = { ...config.data, id: uuidv4() };
  }
  return config;
});

// Response ERROR interceptor: queue failed writes when offline
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error.config;
    // Only network failures (no server response), never replays or uploads
    if (!cfg || error.response || cfg._offlineReplay || cfg.data instanceof FormData) {
      return Promise.reject(error);
    }
    // Only queue true connectivity failures — not timeouts/aborts while online
    if (navigator.onLine && error.code !== 'ERR_NETWORK') {
      return Promise.reject(error);
    }
    const parsed = parseWrite(cfg.method, cfg.url);
    console.warn('[Offline] write failed offline:', cfg.method, cfg.url, 'parsed:', parsed ? `${parsed.action} ${parsed.entity}` : 'not-queueable');
    if (!parsed) return Promise.reject(error);

    let body = cfg.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    try {
      if (parsed.action === 'create') {
        const id = body.id || uuidv4(); // reuse the client id already sent to the server
        const now = new Date().toISOString();
        const item = { ...body, id, created_at: now, updated_at: now, _offline: true };
        await saveLocal(parsed.entity, item);
        await queueAction('create', parsed.entity, id, { ...body, id });
        offlineToast();
        return Promise.resolve({ data: item, status: 202, statusText: 'Queued offline', headers: {}, config: cfg, offlineQueued: true });
      }
      if (parsed.action === 'update') {
        const existing = await getLocal(parsed.entity, parsed.id);
        const merged = { ...(existing || {}), ...body, id: parsed.id, updated_at: new Date().toISOString(), _offline: true };
        await saveLocal(parsed.entity, merged);
        await queueAction('update', parsed.entity, parsed.id, body);
        offlineToast();
        return Promise.resolve({ data: merged, status: 202, statusText: 'Queued offline', headers: {}, config: cfg, offlineQueued: true });
      }
      if (parsed.action === 'delete') {
        await deleteLocal(parsed.entity, parsed.id);
        await queueAction('delete', parsed.entity, parsed.id, null);
        offlineToast();
        return Promise.resolve({ data: { _offline: true }, status: 202, statusText: 'Queued offline', headers: {}, config: cfg, offlineQueued: true });
      }
    } catch (e) {
      console.error('[Offline] Failed to queue write:', e);
    }
    return Promise.reject(error);
  }
);

// Ids of entities with pending offline actions still in the sync queue
const getPendingByEntity = async (entity) => {
  try {
    const queue = await db.getSyncQueue();
    return queue.filter((q) => q.entity === entity);
  } catch (e) {
    return [];
  }
};

// Response SUCCESS interceptor: merge pending offline items into GET lists
axios.interceptors.response.use(async (response) => {
  const cfg = response.config || {};
  if ((cfg.method || '').toLowerCase() !== 'get' || !Array.isArray(response.data)) return response;
  const path = (cfg.url || '').split('?')[0];

  const polesMatch = path.match(/^\/jobs\/([^/]+)\/poles$/);
  const ugMatch = path.match(/^\/jobs\/([^/]+)\/underground$/);
  const jobsMatch = path === '/jobs';

  try {
    if (polesMatch || ugMatch) {
      const entity = polesMatch ? 'pole' : 'underground';
      const jobId = (polesMatch || ugMatch)[1];
      const pending = await getPendingByEntity(entity);
      const creates = pending.filter((q) => q.action === 'create');
      if (creates.length) {
        const existingIds = new Set(response.data.map((r) => r.id));
        for (const q of creates) {
          const item = await getLocal(entity, q.entity_id);
          if (item && item.job_id === jobId && !existingIds.has(item.id)) {
            response.data.push(item);
          }
        }
      }
      // Deleted-offline items should not show
      const deletes = new Set(pending.filter((q) => q.action === 'delete').map((q) => q.entity_id));
      if (deletes.size) response.data = response.data.filter((r) => !deletes.has(r.id));
    } else if (jobsMatch) {
      const pending = await getPendingByEntity('job');
      const creates = pending.filter((q) => q.action === 'create');
      if (creates.length) {
        const existingIds = new Set(response.data.map((r) => r.id));
        for (const q of creates) {
          const item = await getLocal('job', q.entity_id);
          if (item && !existingIds.has(item.id)) response.data.push(item);
        }
      }
    }
  } catch (e) {
    console.error('[Offline] Merge of pending items failed:', e);
  }
  return response;
});

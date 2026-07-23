/**
 * Offline photo capture: stores photo blobs in IndexedDB when uploads fail
 * offline, renders them via object URLs, and auto-uploads + rewires the
 * owning records when the connection returns.
 */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import * as db from './offlineDb';

export const OFFLINE_PHOTO_PREFIX = 'offline-photo://';
export const isOfflinePhoto = (url) => typeof url === 'string' && url.startsWith(OFFLINE_PHOTO_PREFIX);

export const queuePhotoOffline = async (file) => {
  const id = uuidv4();
  await db.savePhotoBlob({ id, blob: file, name: file.name || 'photo.jpg', created_at: new Date().toISOString() });
  window.dispatchEvent(new Event('offline-photos-changed'));
  return `${OFFLINE_PHOTO_PREFIX}${id}`;
};

const objectUrlCache = new Map();
export const getOfflinePhotoUrl = async (placeholder) => {
  const id = placeholder.slice(OFFLINE_PHOTO_PREFIX.length);
  if (objectUrlCache.has(id)) return objectUrlCache.get(id);
  const rec = await db.getPhotoBlob(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  objectUrlCache.set(id, url);
  return url;
};

export const useOfflinePhotoUrl = (src) => {
  const [resolved, setResolved] = useState(isOfflinePhoto(src) ? null : src);
  useEffect(() => {
    let active = true;
    if (isOfflinePhoto(src)) {
      getOfflinePhotoUrl(src).then((u) => { if (active) setResolved(u); });
    } else {
      setResolved(src);
    }
    return () => { active = false; };
  }, [src]);
  return resolved;
};

// Drop-in <img> replacement that resolves offline-photo:// placeholders
export const OfflinePhoto = ({ src, alt, ...props }) => {
  const url = useOfflinePhotoUrl(src);
  return <img src={url || undefined} alt={alt || ''} {...props} />;
};

// Replace placeholder strings anywhere in a record, returning changed top-level keys
const deepReplace = (value, placeholder, url) => {
  if (typeof value === 'string') return value === placeholder ? url : value;
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, placeholder, url));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = deepReplace(value[k], placeholder, url);
    return out;
  }
  return value;
};

let photoSyncing = false;
export const syncOfflinePhotos = async () => {
  if (photoSyncing || !navigator.onLine) return;
  // Wait until offline record writes have synced first
  try {
    const pending = await db.getSyncQueue();
    if (pending.length > 0) return;
  } catch (e) { return; }

  photoSyncing = true;
  let uploaded = 0;
  try {
    const queued = await db.getAllPhotoBlobs();
    if (!queued.length) return;

    for (const rec of queued) {
      const placeholder = `${OFFLINE_PHOTO_PREFIX}${rec.id}`;
      let url;
      try {
        const fd = new FormData();
        fd.append('file', rec.blob, rec.name || 'photo.jpg');
        const res = await axios.post('/upload-photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        url = res.data.url;
      } catch (e) {
        continue; // still offline / transient — retry later
      }

      // Rewire any locally-known records that hold this placeholder
      const groups = [
        { items: await db.getAllPoles(), path: (id) => `/poles/${id}`, save: db.savePole },
        { items: await db.getAllUnderground(), path: (id) => `/underground/${id}`, save: db.saveUnderground },
      ];
      let allPutsOk = true;
      for (const g of groups) {
        for (const item of g.items) {
          if (!JSON.stringify(item).includes(placeholder)) continue;
          const updated = deepReplace(item, placeholder, url);
          const payload = {};
          for (const k of Object.keys(updated)) {
            if (JSON.stringify(updated[k]) !== JSON.stringify(item[k])) payload[k] = updated[k];
          }
          try {
            await axios.put(g.path(item.id), payload);
            await g.save(updated);
          } catch (e) {
            allPutsOk = false;
          }
        }
      }
      if (allPutsOk) {
        await db.deletePhotoBlob(rec.id);
        uploaded++;
      }
    }
    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} offline photo${uploaded > 1 ? 's' : ''}`);
      window.dispatchEvent(new Event('offline-photos-changed'));
    }
  } finally {
    photoSyncing = false;
  }
};

// Auto-sync triggers
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setTimeout(syncOfflinePhotos, 6000));
  setTimeout(syncOfflinePhotos, 8000);
  setInterval(() => { syncOfflinePhotos(); }, 45000);
}

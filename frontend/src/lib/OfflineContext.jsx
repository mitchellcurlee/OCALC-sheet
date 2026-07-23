/**
 * Offline Context Provider
 * 
 * Provides offline state and sync status to the entire app.
 * Handles service worker registration and sync initialization.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { initDB } from './offlineDb';
import { 
  isOnline as checkOnline, 
  onSyncStatusChange, 
  initSyncListeners,
  cleanupSyncListeners,
  syncPendingChanges,
  pullAllData,
  getPendingCount
} from './syncService';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [swRegistered, setSwRegistered] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  // Initialize IndexedDB
  useEffect(() => {
    initDB()
      .then(() => {
        setDbReady(true);
        console.log('[Offline] IndexedDB initialized');
      })
      .catch((err) => {
        console.error('[Offline] Failed to initialize IndexedDB:', err);
      });
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          setSwRegistered(true);
          console.log('[Offline] Service Worker registered:', registration.scope);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('[Offline] New version available');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('[Offline] Service Worker registration failed:', err);
        });
    }
  }, []);

  // Detect new deployments: compare the served bundle name against the loaded one
  useEffect(() => {
    let reloading = false;
    const checkForUpdate = async () => {
      if (reloading || !navigator.onLine) return;
      try {
        const current = document.querySelector('script[src*="static/js/main"]')?.getAttribute('src');
        if (!current) return; // dev build — no hashed bundle
        const res = await fetch('/index.html', { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const m = html.match(/static\/js\/main[^"]*\.js/);
        if (m && !current.includes(m[0])) {
          reloading = true;
          console.log('[Update] New version detected — reloading');
          toast.info('App updated — loading new version…');
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) { /* offline or transient — ignore */ }
    };
    const t = setTimeout(checkForUpdate, 10000);
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(t); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      console.log('[Offline] Back online');
    };
    
    const handleOffline = () => {
      setOnline(false);
      console.log('[Offline] Gone offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize sync listeners and subscribe to status changes
  useEffect(() => {
    if (!dbReady) return;

    initSyncListeners();

    const unsubscribe = onSyncStatusChange((status) => {
      if (status.syncing !== undefined) setSyncing(status.syncing);
      if (status.pending !== undefined) setPendingChanges(status.pending);
      if (status.lastSync !== undefined) setLastSync(status.lastSync);
      if (status.error !== undefined) setSyncError(status.error);
      if (status.online !== undefined) setOnline(status.online);
    });

    // Get initial pending count
    getPendingCount().then(setPendingChanges).catch(console.error);

    return () => {
      unsubscribe();
      cleanupSyncListeners();
    };
  }, [dbReady]);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    if (!online) {
      console.log('[Offline] Cannot sync while offline');
      return;
    }
    await syncPendingChanges();
  }, [online]);

  // Full data refresh
  const refreshData = useCallback(async () => {
    if (!online) {
      throw new Error('Cannot refresh while offline');
    }
    return pullAllData();
  }, [online]);

  const value = {
    online,
    syncing,
    pendingChanges,
    lastSync,
    syncError,
    swRegistered,
    dbReady,
    triggerSync,
    refreshData,
    isOfflineReady: dbReady && swRegistered
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}

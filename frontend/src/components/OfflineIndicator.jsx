/**
 * Offline Status Indicator Component
 * 
 * Shows a small indicator for online/offline status and pending sync count.
 * Appears in the header/toolbar area.
 */

import { useOffline } from '@/lib/OfflineContext';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function OfflineIndicator() {
  const { 
    online, 
    syncing, 
    pendingChanges, 
    syncError, 
    triggerSync,
    isOfflineReady 
  } = useOffline();

  if (!isOfflineReady) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        {/* Online/Offline Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              online 
                ? 'bg-green-100 text-green-700' 
                : 'bg-amber-100 text-amber-700'
            }`}>
              {online ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {online 
              ? 'Connected to server' 
              : 'Working offline - changes will sync when back online'
            }
          </TooltipContent>
        </Tooltip>

        {/* Pending Changes Badge */}
        {pendingChanges > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                <CloudOff className="w-3 h-3" />
                <span>{pendingChanges}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {pendingChanges} change{pendingChanges !== 1 ? 's' : ''} pending sync
            </TooltipContent>
          </Tooltip>
        )}

        {/* Sync Error Indicator */}
        {syncError && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                <AlertCircle className="w-3 h-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Sync error: {syncError}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Manual Sync Button */}
        {online && pendingChanges > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={triggerSync}
                disabled={syncing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {syncing ? 'Syncing...' : 'Sync now'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Syncing Indicator */}
        {syncing && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Cloud className="w-3 h-3 animate-pulse" />
            <span className="hidden sm:inline">Syncing</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * Offline Banner Component
 * 
 * Shows a prominent banner when offline with pending changes.
 */
export function OfflineBanner() {
  const { online, pendingChanges, syncing, triggerSync } = useOffline();

  if (online && pendingChanges === 0) {
    return null;
  }

  return (
    <div className={`px-4 py-2 text-sm font-medium flex items-center justify-between ${
      online 
        ? 'bg-blue-50 text-blue-800 border-b border-blue-200' 
        : 'bg-amber-50 text-amber-800 border-b border-amber-200'
    }`}>
      <div className="flex items-center gap-2">
        {online ? (
          <>
            <CloudOff className="w-4 h-4" />
            <span>
              {pendingChanges} change{pendingChanges !== 1 ? 's' : ''} waiting to sync
            </span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span>
              You&apos;re offline. Changes will be saved locally and synced when back online.
              {pendingChanges > 0 && ` (${pendingChanges} pending)`}
            </span>
          </>
        )}
      </div>
      {online && pendingChanges > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
          onClick={triggerSync}
          disabled={syncing}
        >
          {syncing ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Sync Now
            </>
          )}
        </Button>
      )}
    </div>
  );
}

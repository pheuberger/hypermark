import { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone, Cloud, CloudOff, RefreshCw, Activity } from './Icons'
import { cn } from '@/utils/cn'
import { useNostrSync } from '../../hooks/useNostrSync'
import { subscribeToWebrtcProvider } from '../../hooks/useYjs'
import { checkDeviceInitialization } from '../../services/key-storage'

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function useSyncStatus() {
  const {
    isInitialized,
    isConnecting: nostrConnecting,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    lastSyncTime,
    syncNow,
  } = useNostrSync({ autoInitialize: false })

  const [hasLEK, setHasLEK] = useState(null)
  const [peerCount, setPeerCount] = useState(0)

  useEffect(() => {
    checkDeviceInitialization().then(({ hasLEK: lek }) => {
      setHasLEK(lek)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToWebrtcProvider((provider) => {
      if (!provider) {
        setPeerCount(0)
        return
      }

      const handlePeers = ({ webrtcPeers }) =>
        setPeerCount(webrtcPeers ? webrtcPeers.length : 0)

      provider.on('peers', handlePeers)
      setPeerCount(provider.room?.webrtcConns?.size || 0)

      return () => {
        provider.off('peers', handlePeers)
      }
    })
    return unsubscribe
  }, [])

  let dotClass, label
  if (hasLEK === false) {
    dotClass = 'bg-gray-500'
    label = 'Not paired'
  } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
    dotClass = 'bg-red-500'
    label = 'Offline'
  } else if (nostrConnecting) {
    dotClass = 'bg-yellow-500 animate-pulse'
    label = 'Connecting...'
  } else if (connectedRelays > 0) {
    dotClass = 'bg-green-500'
    label = 'Synced'
  } else {
    dotClass = 'bg-red-500'
    label = 'Disconnected'
  }

  return {
    dotClass,
    label,
    peerCount,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    lastSyncTime,
    isInitialized,
    syncNow,
  }
}

export function SyncStatusIndicator() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const {
    dotClass,
    label,
    peerCount,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    lastSyncTime,
    isInitialized,
    syncNow,
  } = useSyncStatus()

  const toggle = useCallback(() => setOpen((o) => !o), [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Sync status"
      >
        <div className={cn('w-1.5 h-1.5 rounded-full', dotClass)} data-testid="sync-dot" />
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-popover border border-border rounded-lg shadow-lg z-40 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span>
              {peerCount > 0
                ? `${peerCount} device(s) connected`
                : 'No devices online'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {connectedRelays > 0 ? (
              <Cloud className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <CloudOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span>
              {connectedRelays > 0
                ? `${connectedRelays}/${totalRelays} relays`
                : 'Not connected'}
            </span>
          </div>

          {pendingUpdates > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span>{pendingUpdates} pending changes</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span>Last activity: {formatRelativeTime(lastSyncTime)}</span>
          </div>

          <button
            onClick={syncNow}
            disabled={!isInitialized || pendingUpdates === 0}
            className="w-full mt-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Sync now
          </button>
        </div>
      )}
    </div>
  )
}

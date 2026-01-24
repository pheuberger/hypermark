import { useState, useEffect } from 'react'
import PairingFlow from '../pairing/PairingFlow'
import { cn } from '@/utils/cn'
import { subscribeToWebrtcProvider } from '../../hooks/useYjs'
import { useNostrSync } from '../../hooks/useNostrSync'
import { ChevronLeft, Cloud, CloudOff, RefreshCw, Settings2, ChevronRight, Activity } from 'lucide-react'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'
import { RelayConfigurationView } from './RelayConfigurationView'
import { DiagnosticsView } from './DiagnosticsView'

export function SettingsView({ onBack }) {
  const [showPairing, setShowPairing] = useState(false)
  const [showRelayConfig, setShowRelayConfig] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

  // Nostr sync hook
  const {
    isInitialized: nostrInitialized,
    isConnecting: nostrConnecting,
    isConnected: nostrConnected,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    error: nostrError,
    relayErrors,
    lastSyncTime,
    syncNow,
  } = useNostrSync({ autoInitialize: true })

  useEffect(() => {
    const unsubscribe = subscribeToWebrtcProvider((provider) => {
      if (!provider) {
        setConnected(false)
        setPeerCount(0)
        return
      }

      const handleStatus = ({ connected }) => setConnected(connected)
      const handlePeers = ({ webrtcPeers }) => setPeerCount(webrtcPeers ? webrtcPeers.length : 0)

      provider.on('status', handleStatus)
      provider.on('peers', handlePeers)

      setConnected(provider.connected || false)
      setPeerCount(provider.room?.webrtcConns?.size || 0)

      return () => {
        provider.off('status', handleStatus)
        provider.off('peers', handlePeers)
      }
    })

    return unsubscribe
  }, [])

  const getSyncStatus = () => {
    if (!connected) return 'Not connected'
    if (peerCount === 0) return 'No devices online'
    return `${peerCount} device${peerCount === 1 ? '' : 's'} connected`
  }

  const getNostrSyncStatus = () => {
    if (!nostrInitialized) return 'Not initialized'
    if (nostrConnecting) return 'Connecting...'

    // Show detailed error info when relays are failing
    const errorRelayUrls = relayErrors ? Object.keys(relayErrors) : []
    if (errorRelayUrls.length > 0) {
      // Extract hostnames for cleaner display
      const errorHosts = errorRelayUrls.map(url => {
        try {
          return new URL(url).hostname
        } catch {
          return url
        }
      })
      if (connectedRelays > 0) {
        // Some connected, some failing
        return `${connectedRelays}/${totalRelays} connected (${errorHosts.join(', ')} failing)`
      }
      // All failing
      return `Connection errors: ${errorHosts.join(', ')}`
    }

    if (nostrError) return nostrError
    if (connectedRelays === 0) return 'No relays connected'
    return `${connectedRelays}/${totalRelays} relays connected`
  }

  const getLastSyncText = () => {
    if (!lastSyncTime) return 'Never'
    const seconds = Math.floor((Date.now() - lastSyncTime) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return `${Math.floor(seconds / 3600)}h ago`
  }

  if (showRelayConfig) {
    return <RelayConfigurationView onBack={() => setShowRelayConfig(false)} />
  }

  if (showDiagnostics) {
    return <DiagnosticsView onBack={() => setShowDiagnostics(false)} />
  }

  if (showPairing) {
    return (
      <SettingsContainer>
        <button
          onClick={() => setShowPairing(false)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-semibold mb-8 mt-2">Device Pairing</h1>
        <PairingFlow />
      </SettingsContainer>
    )
  }

  return (
    <SettingsContainer>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 mb-2 transition-colors lg:hidden"
        >
          <ChevronLeft className="w-4 h-4" />
          Bookmarks
        </button>
      )}
      <h1 className="text-2xl font-semibold mb-8">Settings</h1>

      <SettingSection title="Sync">
        <SettingCard>
          <SettingRow
            label="Device pairing"
            description="Connect this device with your other devices to sync bookmarks"
          >
            <button
              onClick={() => setShowPairing(true)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Set up
            </button>
          </SettingRow>
          <SettingRow
            label="P2P sync status"
            description={getSyncStatus()}
            isLast
          >
            <div className={cn(
              "w-2 h-2 rounded-full",
              connected ? (peerCount > 0 ? "bg-green-500" : "bg-yellow-500") : "bg-muted-foreground/30"
            )} />
          </SettingRow>
        </SettingCard>
      </SettingSection>

      <SettingSection title="Cloud Sync (Nostr)">
        <SettingCard>
          <SettingRow
            label="Relay connection"
            description={getNostrSyncStatus()}
          >
            <div className="flex items-center gap-2">
              {nostrConnected ? (
                <Cloud className="w-4 h-4 text-green-500" />
              ) : nostrConnecting ? (
                <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
              ) : (
                <CloudOff className="w-4 h-4 text-muted-foreground/50" />
              )}
              <div className={cn(
                "w-2 h-2 rounded-full",
                nostrConnected ? "bg-green-500" : nostrConnecting ? "bg-yellow-500" : "bg-muted-foreground/30"
              )} />
            </div>
          </SettingRow>
          <SettingRow
            label="Last sync"
            description={`Last activity: ${getLastSyncText()}`}
          >
            {pendingUpdates > 0 && (
              <span className="text-xs text-muted-foreground">
                {pendingUpdates} pending
              </span>
            )}
          </SettingRow>
          <SettingRow
            label="Sync now"
            description="Force sync pending changes immediately"
          >
            <button
              onClick={syncNow}
              disabled={!nostrInitialized || pendingUpdates === 0}
              className={cn(
                "text-sm font-medium transition-colors",
                nostrInitialized && pendingUpdates > 0
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/50 cursor-not-allowed"
              )}
            >
              Sync
            </button>
          </SettingRow>
          <SettingRow
            label="Configure relays"
            description="Add, remove, and test Nostr relays"
            onClick={() => setShowRelayConfig(true)}
            className="cursor-pointer hover:bg-muted/50"
          >
            <div className="flex items-center gap-1 text-muted-foreground">
              <Settings2 className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </SettingRow>
          <SettingRow
            label="Sync diagnostics"
            description="Troubleshoot sync issues and view history"
            isLast
            onClick={() => setShowDiagnostics(true)}
            className="cursor-pointer hover:bg-muted/50"
          >
            <div className="flex items-center gap-1 text-muted-foreground">
              <Activity className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </SettingRow>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          Nostr sync enables bookmark synchronization even when devices aren't online simultaneously.
          Your bookmarks are encrypted before being stored on relays.
        </p>
      </SettingSection>

      <SettingSection title="Data">
        <SettingCard>
          <SettingRow
            label="Export bookmarks"
            description="Download all your bookmarks as a JSON file"
          >
            <button
              disabled
              className="text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
            >
              Coming soon
            </button>
          </SettingRow>
          <SettingRow
            label="Import bookmarks"
            description="Import bookmarks from a JSON or HTML file"
            isLast
          >
            <button
              disabled
              className="text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
            >
              Coming soon
            </button>
          </SettingRow>
        </SettingCard>
      </SettingSection>

      <SettingSection title="About">
        <SettingCard>
          <SettingRow
            label="Hypermark"
            description="Privacy-first bookmark manager with E2E encryption"
            isLast
          >
            <span className="text-sm text-muted-foreground">v0.1.0</span>
          </SettingRow>
        </SettingCard>
      </SettingSection>
    </SettingsContainer>
  )
}


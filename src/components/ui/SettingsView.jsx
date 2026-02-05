import { useState, useEffect, useRef } from 'react'
import PairingFlow from '../pairing/PairingFlow'
import { cn } from '@/utils/cn'
import { subscribeToWebrtcProvider } from '../../hooks/useYjs'
import { useNostrSync } from '../../hooks/useNostrSync'
import { ChevronLeft, Cloud, CloudOff, RefreshCw, Settings2, ChevronRight, Activity, Smartphone, AlertTriangle, Trash2, Download, Upload, Sparkles, Server, ExternalLink } from 'lucide-react'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'
import { RelayConfigurationView } from './RelayConfigurationView'
import { DiagnosticsView } from './DiagnosticsView'
import { ServiceConfigView } from './ServiceConfigView'
import { performFullReset, checkResetableData } from '../../services/reset'
import { downloadExport, importFromFile } from '../../services/bookmark-io'
import { isSuggestionsEnabled, setSuggestionsEnabled } from '../../services/content-suggestion'

export function SettingsView({ onBack }) {
  const [showPairing, setShowPairing] = useState(false)
  const [showRelayConfig, setShowRelayConfig] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showServiceConfig, setShowServiceConfig] = useState(false)
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [importStatus, setImportStatus] = useState(null)
  const fileInputRef = useRef(null)

  // Suggestions toggle state
  const [suggestEnabled, setSuggestEnabled] = useState(isSuggestionsEnabled())

  // Reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetProgress, setResetProgress] = useState(null)
  const [resetData, setResetData] = useState(null)
  const [confirmText, setConfirmText] = useState('')

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

const handleExport = () => {
    try {
      downloadExport()
    } catch (err) {
      console.error('[Settings] Export failed:', err)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportStatus({ type: 'loading', message: 'Importing...' })

    try {
      const result = await importFromFile(file)
      if (result.imported > 0) {
        setImportStatus({
          type: 'success',
          message: `Imported ${result.imported} bookmark${result.imported === 1 ? '' : 's'}${result.skipped > 0 ? `, ${result.skipped} skipped (duplicates)` : ''}`,
        })
      } else if (result.skipped > 0) {
        setImportStatus({
          type: 'info',
          message: `All ${result.skipped} bookmark${result.skipped === 1 ? '' : 's'} already exist`,
        })
      } else {
        setImportStatus({
          type: 'error',
          message: 'No bookmarks found in file',
        })
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: `Import failed: ${err.message}` })
    }

    // Clear file input so same file can be selected again
    e.target.value = ''

    // Clear status after 5 seconds
    setTimeout(() => setImportStatus(null), 5000)
  }

  const handleResetClick = async () => {
    const data = await checkResetableData()
    setResetData(data)
    setShowResetConfirm(true)
    setConfirmText('')
    setResetProgress(null)
  }

  const handleResetConfirm = async () => {
    if (confirmText !== 'RESET') return

    setResetProgress({ step: 0, total: 6, message: 'Starting reset...' })

    await performFullReset({
      reloadAfter: true,
      onProgress: (progress) => {
        setResetProgress(progress)
      },
    })
  }

  const handleResetCancel = () => {
    setShowResetConfirm(false)
    setConfirmText('')
    setResetProgress(null)
  }

  if (showResetConfirm) {
    return (
      <SettingsContainer>
        <button
          onClick={handleResetCancel}
          disabled={resetProgress !== null}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-semibold mb-4 mt-2 text-red-500 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" />
          Reset All Data
        </h1>

        {resetProgress ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">
                Step {resetProgress.step} of {resetProgress.total}
              </p>
              <p className="text-sm text-muted-foreground">{resetProgress.message}</p>
              <div className="mt-3 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${(resetProgress.step / resetProgress.total) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Please wait... The page will reload when complete.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400 font-medium mb-2">
                This action cannot be undone!
              </p>
              <p className="text-sm text-muted-foreground">
                This will permanently delete all data on this device:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  All bookmarks ({resetData?.details?.bookmarkCount || 0} stored locally)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  Encryption keys (LEK) - you will need to re-pair
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  Device identity and pairing information
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  Sync history and diagnostic logs
                </li>
              </ul>
            </div>

            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-400 font-medium mb-2">
                About other devices
              </p>
              <p className="text-sm text-muted-foreground">
                This only resets THIS device. Other paired devices will keep their data.
                To reset all devices, perform this action on each device, or start fresh
                by generating a new encryption key on one device and re-pairing the others.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Type <span className="font-mono text-red-500">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type RESET to confirm"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleResetCancel}
                className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfirm}
                disabled={confirmText !== 'RESET'}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2",
                  confirmText === 'RESET'
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-red-500/20 text-red-500/50 cursor-not-allowed"
                )}
              >
                <Trash2 className="w-4 h-4" />
                Reset All Data
              </button>
            </div>
          </div>
        )}
      </SettingsContainer>
    )
  }

  if (showServiceConfig) {
    return <ServiceConfigView onBack={() => { setShowServiceConfig(false); setSuggestEnabled(isSuggestionsEnabled()) }} />
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
            onClick={() => setShowPairing(true)}
            className="cursor-pointer hover:bg-muted/50"
          >
            <div className="flex items-center gap-1 text-muted-foreground">
              <Smartphone className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
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

      <SettingSection title="Services">
        <SettingCard>
          <SettingRow
            label="Content suggestions"
            description="Sends bookmark URLs to a stateless service to auto-fill titles, descriptions, and tags"
          >
            <button
              onClick={() => {
                const next = !suggestEnabled
                setSuggestionsEnabled(next)
                setSuggestEnabled(next)
              }}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                suggestEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm",
                  suggestEnabled && "translate-x-5"
                )}
              />
            </button>
          </SettingRow>
          <SettingRow
            label="Configure services"
            description="Set custom URLs for signaling and suggestion servers"
            isLast
            onClick={() => setShowServiceConfig(true)}
            className="cursor-pointer hover:bg-muted/50"
          >
            <div className="flex items-center gap-1 text-muted-foreground">
              <Server className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </SettingRow>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          Content suggestions send bookmark URLs to a service for metadata extraction.
          You can self-host the service for full privacy control.
        </p>
      </SettingSection>

      <SettingSection title="Data">
        <SettingCard>
          <SettingRow
            label="Export bookmarks"
            description="Download all bookmarks as an HTML file (browser-compatible format)"
          >
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </SettingRow>
          <SettingRow
            label="Import bookmarks"
            description="Import bookmarks from a browser export file (HTML)"
            isLast
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
          </SettingRow>
        </SettingCard>
        {importStatus && (
          <p className={cn(
            "text-xs mt-2 px-1",
            importStatus.type === 'success' && "text-green-600 dark:text-green-400",
            importStatus.type === 'error' && "text-red-600 dark:text-red-400",
            importStatus.type === 'info' && "text-muted-foreground",
            importStatus.type === 'loading' && "text-muted-foreground"
          )}>
            {importStatus.message}
          </p>
        )}
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

      <SettingSection title="Danger Zone">
        <SettingCard className="border-red-500/20">
          <SettingRow
            label="Reset all data"
            description="Delete all bookmarks, keys, and settings on this device"
            isLast
            onClick={handleResetClick}
            className="cursor-pointer hover:bg-red-500/5"
          >
            <div className="flex items-center gap-1 text-red-500">
              <Trash2 className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </SettingRow>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          Use this to start fresh if you have sync issues or corrupted data.
          This only affects this device - other paired devices keep their data.
        </p>
      </SettingSection>
    </SettingsContainer>
  )
}


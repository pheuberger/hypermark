import { useState, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { useNostrSync, addNostrRelay, removeNostrRelay } from '../../hooks/useNostrSync'
import { DEFAULT_RELAYS } from '../../services/nostr-sync'
import {
  testRelayConnection,
  loadCustomRelays,
  saveCustomRelays,
  loadSyncEnabled,
  saveSyncEnabled,
} from '../../utils/relay-utils'
import { RelayItem } from './RelayItem'
import { AddRelayDialog } from './AddRelayDialog'
import {
  ChevronLeft,
  Plus,
  Zap,
  HelpCircle,
} from 'lucide-react'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'
import { Button } from './button'
import { Switch } from './switch'

/**
 * RelayConfigurationView - Main settings page for relay configuration
 */
export function RelayConfigurationView({ onBack }) {
  const {
    isInitialized,
    isConnecting,
    connectedRelays,
    totalRelays,
    getService,
  } = useNostrSync({ autoInitialize: true })

  // State
  const [customRelays, setCustomRelays] = useState(() => loadCustomRelays())
  const [syncEnabled, setSyncEnabled] = useState(() => loadSyncEnabled())
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [relayStatuses, setRelayStatuses] = useState({})
  const [relayLatencies, setRelayLatencies] = useState({})
  const [testingRelays, setTestingRelays] = useState(new Set())
  const [showHelp, setShowHelp] = useState(false)

  // All relays (default + custom)
  const allRelays = [...DEFAULT_RELAYS, ...customRelays]

  // Update relay statuses from service
  useEffect(() => {
    const updateStatuses = () => {
      const service = getService()
      if (service) {
        const status = service.getStatus()
        const newStatuses = {}
        status.relays.connections.forEach(conn => {
          newStatuses[conn.url] = conn.state
        })
        setRelayStatuses(newStatuses)
      }
    }

    updateStatuses()
    const interval = setInterval(updateStatuses, 2000)
    return () => clearInterval(interval)
  }, [getService])

  // Test a single relay connection
  const handleTestRelay = async (relayUrl) => {
    setTestingRelays(prev => new Set([...prev, relayUrl]))

    const result = await testRelayConnection(relayUrl)

    if (result.success) {
      setRelayLatencies(prev => ({ ...prev, [relayUrl]: result.latency }))
      setRelayStatuses(prev => ({ ...prev, [relayUrl]: 'connected' }))
    } else {
      setRelayLatencies(prev => ({ ...prev, [relayUrl]: null }))
      setRelayStatuses(prev => ({ ...prev, [relayUrl]: 'failed' }))
    }

    setTestingRelays(prev => {
      const next = new Set(prev)
      next.delete(relayUrl)
      return next
    })
  }

  // Test all relays
  const handleTestAll = async () => {
    for (const relay of allRelays) {
      handleTestRelay(relay)
    }
  }

  // Add a custom relay
  const handleAddRelay = async (relayUrl) => {
    const newRelays = [...customRelays, relayUrl]
    setCustomRelays(newRelays)
    saveCustomRelays(newRelays)

    if (isInitialized) {
      await addNostrRelay(relayUrl)
    }
  }

  // Remove a custom relay
  const handleRemoveRelay = async (relayUrl) => {
    const newRelays = customRelays.filter(r => r !== relayUrl)
    setCustomRelays(newRelays)
    saveCustomRelays(newRelays)
    setRelayStatuses(prev => {
      const next = { ...prev }
      delete next[relayUrl]
      return next
    })
    setRelayLatencies(prev => {
      const next = { ...prev }
      delete next[relayUrl]
      return next
    })

    if (isInitialized) {
      await removeNostrRelay(relayUrl)
    }
  }

  // Toggle sync enabled
  const handleSyncEnabledChange = (enabled) => {
    setSyncEnabled(enabled)
    saveSyncEnabled(enabled)
  }

  return (
    <SettingsContainer>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <h1 className="text-2xl font-semibold mb-8 mt-2">Relay Configuration</h1>

      {/* Sync Status */}
      <SettingSection title="Sync Status">
        <SettingCard>
          <SettingRow
            label="Cloud sync"
            description={syncEnabled ? "Bookmarks sync across devices via Nostr relays" : "Sync is disabled"}
          >
            <Switch
              checked={syncEnabled}
              onCheckedChange={handleSyncEnabledChange}
            />
          </SettingRow>
          {syncEnabled && (
            <SettingRow
              label="Connection status"
              description={
                isConnecting
                  ? 'Connecting to relays...'
                  : isInitialized
                    ? `${connectedRelays} of ${totalRelays} relays connected`
                    : 'Not initialized'
              }
              isLast
            >
              <div className={cn(
                "w-2 h-2 rounded-full",
                connectedRelays > 0 ? "bg-green-500" : isConnecting ? "bg-yellow-500" : "bg-muted-foreground/30"
              )} />
            </SettingRow>
          )}
        </SettingCard>
      </SettingSection>

      {/* Relay List */}
      <SettingSection title="Relays">
        <SettingCard className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{allRelays.length} relays configured</span>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="What are relays?"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestAll}
                disabled={testingRelays.size > 0}
              >
                <Zap className="w-4 h-4" />
                Test All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
          </div>

          {showHelp && (
            <div className="px-4 py-3 bg-muted/50 border-b border-border text-sm text-muted-foreground">
              <p className="mb-2">
                <strong>What are Nostr relays?</strong>
              </p>
              <p className="mb-2">
                Relays are servers that store and forward your encrypted bookmarks. Your bookmarks are
                encrypted before being sent to relays, so relay operators cannot read your data.
              </p>
              <p className="mb-2">
                <strong>Why multiple relays?</strong>
              </p>
              <p>
                Using multiple relays provides redundancy. If one relay goes offline, your bookmarks
                are still available from others. You can add custom relays for better performance or privacy.
              </p>
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto">
            {allRelays.map(relay => (
              <RelayItem
                key={relay}
                relay={relay}
                status={relayStatuses[relay] || 'unknown'}
                latency={relayLatencies[relay] || null}
                isDefault={DEFAULT_RELAYS.includes(relay)}
                onTest={() => handleTestRelay(relay)}
                onRemove={() => handleRemoveRelay(relay)}
                isTesting={testingRelays.has(relay)}
              />
            ))}
          </div>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          Default relays cannot be removed. Add custom relays to optimize sync performance for your region.
        </p>
      </SettingSection>

      {/* Recommended Relays */}
      <SettingSection title="Recommended Relays">
        <SettingCard>
          <div className="p-4 space-y-3 text-sm">
            <p className="text-muted-foreground">
              Looking for more relays? Here are some popular options:
            </p>
            <div className="space-y-2">
              {[
                { url: 'wss://relay.snort.social', region: 'Global' },
                { url: 'wss://purplepag.es', region: 'Global' },
                { url: 'wss://relay.primal.net', region: 'Global' },
                { url: 'wss://nostr.wine', region: 'Global (paid)' },
              ].filter(r => !allRelays.includes(r.url)).map(({ url, region }) => (
                <div key={url} className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm">{url}</span>
                    <span className="text-xs text-muted-foreground ml-2">({region})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddRelay(url)}
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </SettingCard>
      </SettingSection>

      {/* Add Relay Dialog */}
      <AddRelayDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddRelay}
        existingRelays={allRelays}
      />
    </SettingsContainer>
  )
}

export default RelayConfigurationView

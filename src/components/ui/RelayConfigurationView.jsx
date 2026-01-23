import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/utils/cn'
import { useNostrSync, addNostrRelay, removeNostrRelay } from '../../hooks/useNostrSync'
import { DEFAULT_RELAYS, CONNECTION_STATES } from '../../services/nostr-sync'
import {
  ChevronLeft,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Zap,
  HelpCircle,
  Server,
  Clock,
} from 'lucide-react'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'
import { Button } from './button'
import { Input } from './input'
import { Switch } from './switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog'

// Relay configuration storage keys
const STORAGE_KEY_CUSTOM_RELAYS = 'hypermark_custom_relays'
const STORAGE_KEY_SYNC_ENABLED = 'hypermark_sync_enabled'

/**
 * Validate a Nostr relay URL
 * @param {string} url - URL to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateRelayUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' }
  }

  const trimmed = url.trim()

  // Check for websocket protocol
  if (!trimmed.startsWith('wss://') && !trimmed.startsWith('ws://')) {
    return { valid: false, error: 'URL must start with wss:// or ws://' }
  }

  // Warn about insecure connections
  if (trimmed.startsWith('ws://')) {
    return { valid: true, error: 'Warning: ws:// is not secure. Consider using wss://' }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return { valid: false, error: 'Invalid WebSocket URL' }
    }
    return { valid: true, error: null }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Test relay connectivity and measure response time
 * @param {string} relayUrl - Relay URL to test
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{ success: boolean, latency: number|null, error: string|null }>}
 */
async function testRelayConnection(relayUrl, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let ws = null
    let resolved = false

    const cleanup = () => {
      if (ws) {
        ws.onopen = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      }
    }

    const finish = (result) => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(result)
      }
    }

    const timeoutId = setTimeout(() => {
      finish({ success: false, latency: null, error: 'Connection timed out' })
    }, timeout)

    try {
      ws = new WebSocket(relayUrl)

      ws.onopen = () => {
        clearTimeout(timeoutId)
        const latency = Date.now() - startTime
        finish({ success: true, latency, error: null })
      }

      ws.onerror = () => {
        clearTimeout(timeoutId)
        finish({ success: false, latency: null, error: 'Connection failed' })
      }

      ws.onclose = (event) => {
        if (!resolved) {
          clearTimeout(timeoutId)
          finish({ success: false, latency: null, error: `Connection closed (${event.code})` })
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      finish({ success: false, latency: null, error: error.message })
    }
  })
}

/**
 * Load custom relays from localStorage
 */
function loadCustomRelays() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_RELAYS)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save custom relays to localStorage
 */
function saveCustomRelays(relays) {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_RELAYS, JSON.stringify(relays))
  } catch (error) {
    console.error('Failed to save custom relays:', error)
  }
}

/**
 * Load sync enabled preference
 */
function loadSyncEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SYNC_ENABLED)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

/**
 * Save sync enabled preference
 */
function saveSyncEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY_SYNC_ENABLED, String(enabled))
  } catch (error) {
    console.error('Failed to save sync enabled:', error)
  }
}

/**
 * RelayItem component - displays a single relay with status and actions
 */
function RelayItem({ relay, status, latency, isDefault, onTest, onRemove, isTesting }) {
  const getStatusIcon = () => {
    if (isTesting) {
      return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
    }

    switch (status) {
      case 'connected':
        return <Check className="w-4 h-4 text-green-500" />
      case 'error':
      case 'failed':
        return <X className="w-4 h-4 text-red-500" />
      case 'connecting':
        return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
      default:
        return <Server className="w-4 h-4 text-muted-foreground/50" />
    }
  }

  const getStatusText = () => {
    if (isTesting) return 'Testing...'
    if (latency !== null && status === 'connected') return `${latency}ms`
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'error':
      case 'failed':
        return 'Failed'
      case 'connecting':
        return 'Connecting...'
      default:
        return 'Not connected'
    }
  }

  const getLatencyColor = () => {
    if (latency === null) return 'text-muted-foreground'
    if (latency < 100) return 'text-green-500'
    if (latency < 300) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 px-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{relay}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {isDefault && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Default
              </span>
            )}
            <span className={cn("text-xs", getLatencyColor())}>
              {getStatusText()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onTest}
          disabled={isTesting}
          className={cn(
            "p-2 rounded-md transition-colors",
            isTesting
              ? "text-muted-foreground/50 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="Test connection"
        >
          <Zap className="w-4 h-4" />
        </button>
        {!isDefault && (
          <button
            onClick={onRemove}
            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove relay"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * AddRelayDialog - Modal for adding a custom relay
 */
function AddRelayDialog({ open, onOpenChange, onAdd, existingRelays }) {
  const [url, setUrl] = useState('')
  const [validation, setValidation] = useState({ valid: true, error: null })
  const [testResult, setTestResult] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  const resetState = () => {
    setUrl('')
    setValidation({ valid: true, error: null })
    setTestResult(null)
    setIsTesting(false)
  }

  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open])

  const handleUrlChange = (e) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    setTestResult(null)

    if (newUrl.trim()) {
      const result = validateRelayUrl(newUrl)
      setValidation(result)

      // Check for duplicates
      if (result.valid && existingRelays.includes(newUrl.trim())) {
        setValidation({ valid: false, error: 'This relay is already added' })
      }
    } else {
      setValidation({ valid: true, error: null })
    }
  }

  const handleTest = async () => {
    if (!validation.valid || !url.trim()) return

    setIsTesting(true)
    setTestResult(null)

    const result = await testRelayConnection(url.trim())
    setTestResult(result)
    setIsTesting(false)
  }

  const handleAdd = () => {
    if (!validation.valid || !url.trim()) return
    onAdd(url.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Relay</DialogTitle>
          <DialogDescription>
            Enter the WebSocket URL of the Nostr relay you want to add.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              placeholder="wss://relay.example.com"
              value={url}
              onChange={handleUrlChange}
              className={cn(
                "font-mono text-sm",
                validation.error && !validation.valid && "border-destructive"
              )}
            />
            {validation.error && (
              <p className={cn(
                "text-xs",
                validation.valid ? "text-yellow-500" : "text-destructive"
              )}>
                {validation.error}
              </p>
            )}
          </div>

          {testResult && (
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-md text-sm",
              testResult.success ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
            )}>
              {testResult.success ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Connection successful ({testResult.latency}ms)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>{testResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!validation.valid || !url.trim() || isTesting}
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Test
              </>
            )}
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!validation.valid || !url.trim()}
          >
            <Plus className="w-4 h-4" />
            Add Relay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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

    // Also add to the active service if initialized
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

    // Also remove from the active service if initialized
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

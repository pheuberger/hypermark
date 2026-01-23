/**
 * DiagnosticsView Component
 *
 * Comprehensive diagnostics interface for Nostr sync troubleshooting.
 * Provides visual feedback on system health, guided troubleshooting,
 * sync history viewing, and export capabilities.
 */

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { getNostrDiagnostics } from '../../services/nostr-diagnostics'
import {
  ChevronLeft,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Download,
  Trash2,
  Activity,
  Server,
  Key,
  Cloud,
  History,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { SettingSection, SettingCard, SettingsContainer } from './SettingsLayout'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog'

// ========================================================================
// Status Icons and Colors
// ========================================================================

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    label: 'Passed'
  },
  warn: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    label: 'Warning'
  },
  fail: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    label: 'Failed'
  },
  pending: {
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
    label: 'Pending'
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    label: 'Running'
  }
}

const SEVERITY_CONFIG = {
  error: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  info: {
    icon: Info,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  success: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  }
}

// ========================================================================
// Sub-components
// ========================================================================

/**
 * Status indicator badge
 */
function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = config.icon

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      config.bgColor,
      config.color
    )}>
      <Icon className={cn("w-3 h-3", status === 'running' && "animate-spin")} />
      {config.label}
    </span>
  )
}

/**
 * Diagnostic check result row
 */
function DiagnosticCheckRow({ result, isExpanded, onToggle }) {
  const config = STATUS_CONFIG[result.status] || STATUS_CONFIG.pending
  const Icon = config.icon
  const hasDetails = result.details && Object.keys(result.details).length > 0

  return (
    <div className={cn(
      "border-b border-border last:border-b-0",
      config.bgColor
    )}>
      <button
        onClick={hasDetails ? onToggle : undefined}
        className={cn(
          "w-full px-4 py-3 flex items-center justify-between gap-3 text-left",
          hasDetails && "cursor-pointer hover:bg-muted/30"
        )}
        disabled={!hasDetails}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon className={cn(
            "w-5 h-5 flex-shrink-0",
            config.color,
            result.status === 'running' && "animate-spin"
          )} />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{result.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {result.message}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.duration !== undefined && (
            <span className="text-xs text-muted-foreground">
              {result.duration}ms
            </span>
          )}
          {hasDetails && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-4 py-3 bg-muted/30 border-t border-border">
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * Troubleshooting suggestion card
 */
function SuggestionCard({ suggestion }) {
  const config = SEVERITY_CONFIG[suggestion.severity] || SEVERITY_CONFIG.info
  const Icon = config.icon

  return (
    <div className={cn(
      "p-4 rounded-lg border",
      config.bgColor,
      "border-border"
    )}>
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.color)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{suggestion.title}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {suggestion.description}
          </p>
          {suggestion.action && (
            <p className="text-xs mt-2 text-foreground/80">
              <strong>Suggestion:</strong> {suggestion.action}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Sync history entry row
 */
function HistoryEntryRow({ entry }) {
  const getTypeIcon = () => {
    switch (entry.type) {
      case 'publish':
        return <Cloud className="w-4 h-4 text-blue-500" />
      case 'receive':
        return <Download className="w-4 h-4 text-green-500" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />
    }
  }

  const formatTime = (date) => {
    const d = new Date(date)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 text-sm">
      {getTypeIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{entry.type}</span>
          {entry.eventType && entry.eventType !== 'unknown' && (
            <span className="text-xs text-muted-foreground">
              ({entry.eventType})
            </span>
          )}
        </div>
        {entry.error && (
          <div className="text-xs text-red-500 truncate">{entry.error}</div>
        )}
        {entry.bookmarkId && (
          <div className="text-xs text-muted-foreground truncate">
            Bookmark: {entry.bookmarkId.slice(0, 8)}...
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {formatTime(entry.timestamp)}
      </div>
    </div>
  )
}

/**
 * Summary card showing diagnostic overview
 */
function DiagnosticSummary({ results }) {
  if (!results || results.length === 0) return null

  const passed = results.filter(r => r.status === 'pass').length
  const warnings = results.filter(r => r.status === 'warn').length
  const failed = results.filter(r => r.status === 'fail').length

  const overallStatus = failed > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass'
  const config = STATUS_CONFIG[overallStatus]
  const Icon = config.icon

  return (
    <div className={cn(
      "p-4 rounded-lg border flex items-center justify-between",
      config.bgColor,
      config.borderColor
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn("w-6 h-6", config.color)} />
        <div>
          <div className="font-medium">
            {failed > 0 ? 'Issues Detected' : warnings > 0 ? 'Warnings Found' : 'All Systems Healthy'}
          </div>
          <div className="text-xs text-muted-foreground">
            {passed} passed, {warnings} warnings, {failed} failed
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-green-500">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">{passed}</span>
        </div>
        <div className="flex items-center gap-1 text-yellow-500">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">{warnings}</span>
        </div>
        <div className="flex items-center gap-1 text-red-500">
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">{failed}</span>
        </div>
      </div>
    </div>
  )
}

// ========================================================================
// Main Component
// ========================================================================

/**
 * DiagnosticsView - Main diagnostics page
 */
export function DiagnosticsView({ onBack }) {
  // State
  const [activeTab, setActiveTab] = useState('overview')
  const [diagnosticResults, setDiagnosticResults] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [syncHistory, setSyncHistory] = useState([])
  const [expandedChecks, setExpandedChecks] = useState(new Set())
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [keypairInfo, setKeypairInfo] = useState(null)

  const diagnostics = getNostrDiagnostics()

  // Load initial data
  useEffect(() => {
    loadData()

    // Subscribe to diagnostic updates
    const unsubscribe = diagnostics.subscribe(() => {
      setSyncHistory(diagnostics.getSyncHistory({ limit: 50 }))
    })

    return unsubscribe
  }, [])

  const loadData = async () => {
    setSyncHistory(diagnostics.getSyncHistory({ limit: 50 }))
    const info = await diagnostics.getKeypairFingerprint()
    setKeypairInfo(info)

    // Load suggestions
    const sug = await diagnostics.getTroubleshootingSuggestions()
    setSuggestions(sug)
  }

  // Run diagnostics
  const runDiagnostics = useCallback(async () => {
    setIsRunning(true)
    setProgress({ index: 0, total: 6, currentCheck: 'Starting...' })
    setDiagnosticResults([])
    setExpandedChecks(new Set())

    try {
      const results = await diagnostics.runAllDiagnostics((p) => {
        setProgress(p)
      })
      setDiagnosticResults(results)

      // Refresh suggestions after diagnostics
      const sug = await diagnostics.getTroubleshootingSuggestions()
      setSuggestions(sug)
    } catch (error) {
      console.error('Diagnostics failed:', error)
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }, [diagnostics])

  // Export diagnostics
  const handleExport = async () => {
    await diagnostics.downloadDiagnostics({
      includeHistory: true,
      includeLogs: true
    })
  }

  // Clear history
  const handleClearHistory = () => {
    diagnostics.clearSyncHistory()
    setSyncHistory([])
    setShowClearDialog(false)
  }

  // Toggle expanded check
  const toggleExpanded = (id) => {
    setExpandedChecks(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Tab buttons
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'troubleshoot', label: 'Troubleshoot', icon: HelpCircle },
    { id: 'history', label: 'History', icon: History },
  ]

  return (
    <SettingsContainer>
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Sync Diagnostics</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isRunning}
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={runDiagnostics}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Run Diagnostics
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Progress indicator */}
      {isRunning && progress && (
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{progress.currentCheck}</span>
            <span className="text-xs text-muted-foreground">
              {progress.index + 1} / {progress.total}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((progress.index + 1) / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-muted/50 rounded-lg">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary */}
          {diagnosticResults.length > 0 && (
            <DiagnosticSummary results={diagnosticResults} />
          )}

          {/* Keypair info */}
          <SettingSection title="Identity">
            <SettingCard className="p-0">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Nostr Public Key</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {keypairInfo?.available
                        ? keypairInfo.fingerprint
                        : 'Not available (device not paired)'}
                    </div>
                  </div>
                </div>
                <StatusBadge status={keypairInfo?.available ? 'pass' : 'fail'} />
              </div>
            </SettingCard>
          </SettingSection>

          {/* Diagnostic checks */}
          <SettingSection title="System Checks">
            {diagnosticResults.length > 0 ? (
              <SettingCard className="p-0">
                {diagnosticResults.map(result => (
                  <DiagnosticCheckRow
                    key={result.id}
                    result={result}
                    isExpanded={expandedChecks.has(result.id)}
                    onToggle={() => toggleExpanded(result.id)}
                  />
                ))}
              </SettingCard>
            ) : (
              <SettingCard>
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Click "Run Diagnostics" to check your sync health</p>
                </div>
              </SettingCard>
            )}
          </SettingSection>
        </div>
      )}

      {activeTab === 'troubleshoot' && (
        <div className="space-y-6">
          <SettingSection title="Suggestions">
            {suggestions.length > 0 ? (
              <div className="space-y-3">
                {suggestions.map(suggestion => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))}
              </div>
            ) : (
              <SettingCard>
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Run diagnostics to get troubleshooting suggestions</p>
                </div>
              </SettingCard>
            )}
          </SettingSection>

          <SettingSection title="Common Issues">
            <SettingCard>
              <div className="p-4 space-y-4 text-sm">
                <div>
                  <div className="font-medium mb-1">Bookmarks not syncing?</div>
                  <p className="text-muted-foreground text-xs">
                    Make sure you're connected to at least one relay and your device is paired.
                    Try clicking "Sync Now" in Settings to force a sync.
                  </p>
                </div>
                <div>
                  <div className="font-medium mb-1">Missing bookmarks after pairing a new device?</div>
                  <p className="text-muted-foreground text-xs">
                    Bookmarks sync through Nostr relays. Make sure the new device uses the same
                    pairing key and is connected to the same relays. It may take a few moments for all bookmarks to appear.
                  </p>
                </div>
                <div>
                  <div className="font-medium mb-1">Relay connection errors?</div>
                  <p className="text-muted-foreground text-xs">
                    Some relays may be temporarily unavailable. Go to Settings &gt; Configure Relays
                    to test each relay and add additional relays for redundancy.
                  </p>
                </div>
                <div>
                  <div className="font-medium mb-1">Changes not appearing on other devices?</div>
                  <p className="text-muted-foreground text-xs">
                    Changes are debounced before publishing (1.5 second delay). Check the pending
                    updates counter in Settings. If updates stay pending, there may be a connection issue.
                  </p>
                </div>
              </div>
            </SettingCard>
          </SettingSection>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <SettingSection title="Sync History">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                {syncHistory.length} recent event{syncHistory.length !== 1 ? 's' : ''}
              </span>
              {syncHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowClearDialog(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </Button>
              )}
            </div>
            {syncHistory.length > 0 ? (
              <SettingCard className="p-0 max-h-[400px] overflow-y-auto">
                {syncHistory.map((entry, index) => (
                  <HistoryEntryRow key={index} entry={entry} />
                ))}
              </SettingCard>
            ) : (
              <SettingCard>
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No sync history yet</p>
                  <p className="text-xs mt-1">Events will appear here as bookmarks sync</p>
                </div>
              </SettingCard>
            )}
          </SettingSection>
        </div>
      )}

      {/* Clear history dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Sync History?</DialogTitle>
            <DialogDescription>
              This will clear all sync history entries. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearHistory}>
              Clear History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsContainer>
  )
}

export default DiagnosticsView

/**
 * RelayItem component - displays a single relay with status and actions.
 * Extracted from RelayConfigurationView.jsx.
 */

import { cn } from '@/utils/cn'
import {
  Check,
  X,
  RefreshCw,
  Zap,
  Trash2,
  Server,
} from 'lucide-react'

export function RelayItem({ relay, status, latency, isDefault, onTest, onRemove, isTesting }) {
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

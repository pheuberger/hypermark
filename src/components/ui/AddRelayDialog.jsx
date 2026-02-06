/**
 * AddRelayDialog - Modal for adding a custom Nostr relay.
 * Extracted from RelayConfigurationView.jsx.
 */

import { useState, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { validateRelayUrl, testRelayConnection } from '../../utils/relay-utils'
import {
  Plus,
  RefreshCw,
  Check,
  AlertCircle,
  Zap,
} from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog'

export function AddRelayDialog({ open, onOpenChange, onAdd, existingRelays }) {
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

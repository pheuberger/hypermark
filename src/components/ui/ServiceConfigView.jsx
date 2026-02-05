import { useState, useEffect } from 'react'
import { ChevronLeft, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'
import {
  isSuggestionsEnabled,
  setSuggestionsEnabled,
  getSuggestionServiceUrl,
  setSuggestionServiceUrl,
  getSignalingServiceUrl,
  setSignalingServiceUrl,
  testSuggestionService,
} from '../../services/content-suggestion'

export function ServiceConfigView({ onBack }) {
  const [suggestEnabled, setSuggestEnabled] = useState(isSuggestionsEnabled())
  const [showDisclosure, setShowDisclosure] = useState(false)

  // Suggestion service URL
  const [suggestUrl, setSuggestUrl] = useState('')
  const [suggestUrlEditing, setSuggestUrlEditing] = useState(false)
  const [suggestTest, setSuggestTest] = useState(null)

  // Signaling service URL
  const [signalingUrl, setSignalingUrl] = useState('')
  const [signalingUrlEditing, setSignalingUrlEditing] = useState(false)

  useEffect(() => {
    setSuggestUrl(getSuggestionServiceUrl() || '')
    setSignalingUrl(getSignalingServiceUrl() || '')
  }, [])

  const handleToggleSuggestions = () => {
    if (!suggestEnabled) {
      // Show disclosure before enabling
      setShowDisclosure(true)
    } else {
      setSuggestionsEnabled(false)
      setSuggestEnabled(false)
    }
  }

  const handleConfirmEnable = () => {
    setSuggestionsEnabled(true)
    setSuggestEnabled(true)
    setShowDisclosure(false)
  }

  const handleCancelEnable = () => {
    setShowDisclosure(false)
  }

  const handleSuggestUrlSave = () => {
    const trimmed = suggestUrl.trim()
    if (trimmed) {
      // Validate URL format
      try {
        new URL(trimmed)
        setSuggestionServiceUrl(trimmed)
      } catch {
        return // invalid URL, don't save
      }
    } else {
      setSuggestionServiceUrl(null) // reset to default
      setSuggestUrl(getSuggestionServiceUrl() || '')
    }
    setSuggestUrlEditing(false)
  }

  const handleSignalingUrlSave = () => {
    const trimmed = signalingUrl.trim()
    if (trimmed) {
      try {
        new URL(trimmed.replace('wss://', 'https://').replace('ws://', 'http://'))
        setSignalingServiceUrl(trimmed)
      } catch {
        return
      }
    } else {
      setSignalingServiceUrl(null)
      setSignalingUrl(getSignalingServiceUrl() || '')
    }
    setSignalingUrlEditing(false)
  }

  const handleTestSuggestService = async () => {
    const url = suggestUrl.trim()
    if (!url) return
    setSuggestTest({ testing: true })
    const result = await testSuggestionService(url)
    setSuggestTest(result)
  }

  if (showDisclosure) {
    return (
      <SettingsContainer>
        <button
          onClick={handleCancelEnable}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-semibold mb-4 mt-2">Enable Content Suggestions</h1>

        <div className="space-y-6">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-400 mb-2">Privacy Notice</p>
                <p className="text-sm text-muted-foreground mb-3">
                  When enabled, this feature sends the <strong>URL of each bookmark</strong> you
                  create to the configured suggestion service for metadata extraction.
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0" />
                    The service receives the URL only — no identifiers, no cookies, no auth
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0" />
                    The service is stateless and does not log requests
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0" />
                    You can self-host the service for full control
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0" />
                    Suggestions are optional — you choose what to accept
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCancelEnable}
              className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg border border-border hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmEnable}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Enable Suggestions
            </button>
          </div>
        </div>
      </SettingsContainer>
    )
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
      <h1 className="text-2xl font-semibold mb-8 mt-2">Services</h1>

      <SettingSection title="Content Suggestions">
        <SettingCard>
          <SettingRow
            label="Enable suggestions"
            description="Auto-fill title, description, and tags when adding bookmarks"
          >
            <button
              onClick={handleToggleSuggestions}
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
            label="Service URL"
            description={suggestUrl || 'Using default (derived from signaling server)'}
            isLast
          >
            {suggestUrlEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={suggestUrl}
                  onChange={(e) => setSuggestUrl(e.target.value)}
                  placeholder="https://your-server.fly.dev"
                  className="w-48 px-2 py-1 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSuggestUrlSave()
                    if (e.key === 'Escape') {
                      setSuggestUrl(getSuggestionServiceUrl() || '')
                      setSuggestUrlEditing(false)
                    }
                  }}
                />
                <button
                  onClick={handleSuggestUrlSave}
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {suggestTest && !suggestTest.testing && (
                  suggestTest.ok ? (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                      <CheckCircle className="w-3 h-3" />
                      {suggestTest.latency}ms
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="w-3 h-3" />
                    </span>
                  )
                )}
                {suggestTest?.testing && (
                  <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                )}
                <button
                  onClick={handleTestSuggestService}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Test
                </button>
                <button
                  onClick={() => setSuggestUrlEditing(true)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </SettingRow>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          The suggestion service extracts page titles, descriptions, and tags from bookmark URLs.
          It is stateless and does not store any data. Clear the URL to use the default.
        </p>
      </SettingSection>

      <SettingSection title="Signaling Server">
        <SettingCard>
          <SettingRow
            label="Server URL"
            description={signalingUrl || 'ws://localhost:4444'}
            isLast
          >
            {signalingUrlEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={signalingUrl}
                  onChange={(e) => setSignalingUrl(e.target.value)}
                  placeholder="wss://your-server.fly.dev"
                  className="w-48 px-2 py-1 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSignalingUrlSave()
                    if (e.key === 'Escape') {
                      setSignalingUrl(getSignalingServiceUrl() || '')
                      setSignalingUrlEditing(false)
                    }
                  }}
                />
                <button
                  onClick={handleSignalingUrlSave}
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSignalingUrlEditing(true)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
            )}
          </SettingRow>
        </SettingCard>
        <p className="text-xs text-muted-foreground mt-2 px-1">
          The signaling server enables WebRTC peer discovery for P2P sync and device pairing.
          Changes take effect after reloading the app.
        </p>
      </SettingSection>
    </SettingsContainer>
  )
}

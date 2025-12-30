import { useState, useEffect } from 'react'
import PairingFlow from '../pairing/PairingFlow'
import { cn } from '@/utils/cn'
import { subscribeToWebrtcProvider } from '../../hooks/useYjs'
import { ChevronLeft } from 'lucide-react'
import { SettingSection, SettingRow, SettingCard, SettingsContainer } from './SettingsLayout'

export function SettingsView() {
  const [showPairing, setShowPairing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

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
            label="Sync status"
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


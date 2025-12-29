/**
 * ConnectionStatus Component
 * Shows Yjs WebRTC sync status
 */

import { useEffect, useState } from 'preact/hooks'
import { webrtcProviderSignal } from '../../hooks/useYjs'

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const provider = webrtcProviderSignal.value
    if (!provider) {
      // WebRTC not yet enabled (before pairing)
      return
    }

    const handleStatus = ({ connected }) => {
      setConnected(connected)
    }

    const handlePeers = ({ webrtcPeers }) => {
      setPeerCount(webrtcPeers ? webrtcPeers.length : 0)
    }

    const handleSynced = ({ synced }) => {
      setSynced(synced)
    }

    provider.on('status', handleStatus)
    provider.on('peers', handlePeers)
    provider.on('synced', handleSynced)

    // Get initial state
    setConnected(provider.connected || false)
    setPeerCount(provider.room?.webrtcConns?.size || 0)
    setSynced(provider.synced || false)

    return () => {
      provider.off('status', handleStatus)
      provider.off('peers', handlePeers)
      provider.off('synced', handleSynced)
    }
  }, [webrtcProviderSignal.value])

  // Don't show badge when offline
  if (!webrtcProviderSignal.value || !connected || peerCount === 0) {
    return null
  }

  const getBadgeStyle = () => {
    if (synced) return 'bg-green-100 text-green-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  const getStatusText = () => {
    const peerText = `${peerCount} peer${peerCount !== 1 ? 's' : ''}`
    if (synced) {
      return `Synced (${peerText})`
    }
    return `Syncing (${peerText})`
  }

  const getIcon = () => {
    if (synced) return '●'
    return '◐'
  }

  return (
    <div
      className={`fixed top-4 right-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getBadgeStyle()}`}
      title={getStatusText()}
    >
      <span className="text-lg leading-none">{getIcon()}</span>
      <span>{getStatusText()}</span>
    </div>
  )
}

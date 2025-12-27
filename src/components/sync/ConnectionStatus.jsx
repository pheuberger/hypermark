/**
 * ConnectionStatus Component
 * Shows Yjs WebRTC sync status
 */

import { useEffect, useState } from 'preact/hooks'
import { webrtcProvider } from '../../hooks/useYjs'

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

  useEffect(() => {
    if (!webrtcProvider) {
      // WebRTC not yet enabled (before pairing)
      return
    }

    const handleStatus = ({ connected }) => {
      setConnected(connected)
    }

    const handlePeers = ({ webrtcPeers }) => {
      setPeerCount(webrtcPeers ? webrtcPeers.length : 0)
    }

    webrtcProvider.on('status', handleStatus)
    webrtcProvider.on('peers', handlePeers)

    // Get initial state
    setConnected(webrtcProvider.connected || false)
    setPeerCount(webrtcProvider.room?.webrtcConns?.size || 0)

    return () => {
      webrtcProvider.off('status', handleStatus)
      webrtcProvider.off('peers', handlePeers)
    }
  }, [])

  const getBadgeStyle = () => {
    if (!webrtcProvider) return 'bg-gray-100 text-gray-700'
    if (connected && peerCount > 0) return 'bg-green-100 text-green-800'
    if (connected) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-700'
  }

  const getStatusText = () => {
    if (!webrtcProvider) return 'Offline'
    if (connected && peerCount > 0) {
      return `Syncing (${peerCount} peer${peerCount !== 1 ? 's' : ''})`
    }
    if (connected) return 'Online (no peers)'
    return 'Offline'
  }

  const getIcon = () => {
    if (!webrtcProvider) return '○'
    if (connected && peerCount > 0) return '●'
    if (connected) return '◐'
    return '○'
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

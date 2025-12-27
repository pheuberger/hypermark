/**
 * ConnectionStatus Component
 * Shows current sync status and number of connected devices
 */

import { syncState, connectedDevices, syncError } from '../../hooks/usePeerSync'

export default function ConnectionStatus() {
  const state = syncState.value
  const devices = connectedDevices.value
  const error = syncError.value

  // Determine badge color and icon
  const getBadgeStyle = () => {
    switch (state) {
      case 'connected':
      case 'syncing':
        return 'bg-green-100 text-green-800'
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = () => {
    switch (state) {
      case 'connected':
        return '●'
      case 'syncing':
        return '↻'
      case 'connecting':
        return '○'
      case 'error':
        return '✗'
      default:
        return '○'
    }
  }

  const getStatusText = () => {
    switch (state) {
      case 'connected':
        return `Connected (${devices.size} device${devices.size !== 1 ? 's' : ''})`
      case 'syncing':
        return 'Syncing...'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return 'Error'
      case 'disconnected':
        return 'Offline'
      default:
        return 'Unknown'
    }
  }

  return (
    <div class="connection-status">
      <div
        class={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getBadgeStyle()}`}
        title={error || getStatusText()}
      >
        <span class="text-lg leading-none">{getStatusIcon()}</span>
        <span>{getStatusText()}</span>
      </div>

      {error && state === 'error' && (
        <div class="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}

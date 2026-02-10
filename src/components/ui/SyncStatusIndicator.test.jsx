import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SyncStatusIndicator } from './SyncStatusIndicator.jsx'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Smartphone: (props) => <svg data-testid="icon-smartphone" {...props} />,
  Cloud: (props) => <svg data-testid="icon-cloud" {...props} />,
  CloudOff: (props) => <svg data-testid="icon-cloud-off" {...props} />,
  RefreshCw: (props) => <svg data-testid="icon-refresh" {...props} />,
  Activity: (props) => <svg data-testid="icon-activity" {...props} />,
}))

// Mock dependencies
const mockSyncNow = vi.fn()
let mockNostrSync = {}
vi.mock('../../hooks/useNostrSync', () => ({
  useNostrSync: () => mockNostrSync,
}))

let mockWebrtcCallback = null
vi.mock('../../hooks/useYjs', () => ({
  subscribeToWebrtcProvider: (cb) => {
    mockWebrtcCallback = cb
    cb(null) // default: no provider
    return () => { mockWebrtcCallback = null }
  },
}))

let mockDeviceInit = { hasKeypair: true, hasLEK: true }
vi.mock('../../services/key-storage', () => ({
  checkDeviceInitialization: () => Promise.resolve(mockDeviceInit),
}))

function setDefaults() {
  mockNostrSync = {
    isInitialized: true,
    isConnecting: false,
    connectedRelays: 2,
    totalRelays: 3,
    pendingUpdates: 0,
    lastSyncTime: null,
    syncNow: mockSyncNow,
  }
  mockDeviceInit = { hasKeypair: true, hasLEK: true }
}

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    setDefaults()
    mockSyncNow.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders "Not paired" when hasLEK is false', async () => {
    mockDeviceInit = { hasKeypair: false, hasLEK: false }
    render(<SyncStatusIndicator />)
    expect(await screen.findByText('Not paired')).toBeInTheDocument()
    expect(screen.getByTestId('sync-dot').className).toContain('bg-gray-500')
  })

  it('renders "Synced" with green dot when connectedRelays > 0', async () => {
    render(<SyncStatusIndicator />)
    expect(await screen.findByText('Synced')).toBeInTheDocument()
    expect(screen.getByTestId('sync-dot').className).toContain('bg-green-500')
  })

  it('renders "Connecting..." with yellow dot when nostrConnecting is true', async () => {
    mockNostrSync = { ...mockNostrSync, isConnecting: true, connectedRelays: 0 }
    render(<SyncStatusIndicator />)
    expect(await screen.findByText('Connecting...')).toBeInTheDocument()
    const dot = screen.getByTestId('sync-dot')
    expect(dot.className).toContain('bg-yellow-500')
    expect(dot.className).toContain('animate-pulse')
  })

  it('renders "Disconnected" with red dot when connectedRelays === 0 and not connecting', async () => {
    mockNostrSync = { ...mockNostrSync, isConnecting: false, connectedRelays: 0 }
    render(<SyncStatusIndicator />)
    expect(await screen.findByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByTestId('sync-dot').className).toContain('bg-red-500')
  })

  it('opens popover on click', async () => {
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('No devices online')).toBeInTheDocument()
  })

  it('closes popover on second click', async () => {
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('No devices online')).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByText('No devices online')).not.toBeInTheDocument()
  })

  it('shows P2P peer count in popover', async () => {
    render(<SyncStatusIndicator />)

    // Simulate a provider with peers
    act(() => {
      if (mockWebrtcCallback) {
        const mockProvider = {
          on: vi.fn(),
          off: vi.fn(),
          room: { webrtcConns: new Map([['peer1', {}], ['peer2', {}]]) },
        }
        mockWebrtcCallback(mockProvider)
      }
    })

    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('2 device(s) connected')).toBeInTheDocument()
  })

  it('shows relay count in popover', async () => {
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('2/3 relays')).toBeInTheDocument()
  })

  it('shows "Not connected" when no relays connected', async () => {
    mockNostrSync = { ...mockNostrSync, connectedRelays: 0, isConnecting: false }
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('shows pending changes when pendingUpdates > 0', async () => {
    mockNostrSync = { ...mockNostrSync, pendingUpdates: 5 }
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('5 pending changes')).toBeInTheDocument()
  })

  it('hides pending changes row when pendingUpdates is 0', async () => {
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.queryByText(/pending changes/)).not.toBeInTheDocument()
  })

  it('"Sync now" button calls syncNow()', async () => {
    mockNostrSync = { ...mockNostrSync, pendingUpdates: 3 }
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    const syncBtn = screen.getByText('Sync now')
    fireEvent.click(syncBtn)
    expect(mockSyncNow).toHaveBeenCalledTimes(1)
  })

  it('"Sync now" button is disabled when not initialized', async () => {
    mockNostrSync = { ...mockNostrSync, isInitialized: false, pendingUpdates: 3 }
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('Sync now')).toBeDisabled()
  })

  it('"Sync now" button is disabled when no pending updates', async () => {
    mockNostrSync = { ...mockNostrSync, pendingUpdates: 0 }
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('Sync now')).toBeDisabled()
  })

  it('shows "Last activity: Never" when lastSyncTime is null', async () => {
    render(<SyncStatusIndicator />)
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('Last activity: Never')).toBeInTheDocument()
  })

  it('closes popover on click outside', async () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <SyncStatusIndicator />
      </div>
    )
    const button = await screen.findByLabelText('Sync status')
    fireEvent.click(button)
    expect(screen.getByText('No devices online')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('No devices online')).not.toBeInTheDocument()
  })
})

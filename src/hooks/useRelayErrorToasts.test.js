import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRelayErrorToasts } from './useRelayErrorToasts.js'
import { CONNECTION_STATES } from '../services/nostr-sync'

const mockAddToast = vi.fn()

vi.mock('../contexts/ToastContext', () => ({
  useToastContext: () => ({ addToast: mockAddToast }),
}))

let subscribeCb = null
vi.mock('./useNostrSync', () => ({
  subscribeToNostrSync: vi.fn((cb) => {
    subscribeCb = cb
    return () => { subscribeCb = null }
  }),
}))

function makeService(connections) {
  return {
    isInitialized: true,
    getStatus: () => ({
      relays: { connections },
    }),
  }
}

describe('useRelayErrorToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    subscribeCb = null
    mockAddToast.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fires warning toast when relay enters ERROR state', () => {
    renderHook(() => useRelayErrorToasts())

    // First callback: relay is CONNECTED (establishes prev state)
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))

    // Second callback: relay enters ERROR
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))

    expect(mockAddToast).toHaveBeenCalledWith({
      message: 'Relay relay.example.com disconnected. Trying to reconnect...',
      type: 'warning',
      duration: 5000,
    })
  })

  it('fires success toast when relay transitions from ERROR to CONNECTED', () => {
    renderHook(() => useRelayErrorToasts())

    // Establish ERROR state
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))
    mockAddToast.mockClear()

    // Relay reconnects
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))

    expect(mockAddToast).toHaveBeenCalledWith({
      message: 'Relay relay.example.com reconnected',
      type: 'success',
      duration: 3000,
    })
  })

  it('does NOT fire toast when relay enters ERROR within 60s debounce window', () => {
    renderHook(() => useRelayErrorToasts())

    // First: CONNECTED
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))

    // Second: ERROR — fires toast
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))
    expect(mockAddToast).toHaveBeenCalledTimes(1)
    mockAddToast.mockClear()

    // Reconnect, then error again within 60s
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))
    // The reconnect toast fires
    mockAddToast.mockClear()

    // Advance only 30s (within debounce)
    vi.advanceTimersByTime(30_000)

    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))

    // No warning toast because debounce
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('does NOT fire toast when relay was already in ERROR state', () => {
    renderHook(() => useRelayErrorToasts())

    // First callback: relay in ERROR
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))
    mockAddToast.mockClear()

    // Second callback: relay still in ERROR
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))

    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('extracts correct hostname from relay URL', () => {
    renderHook(() => useRelayErrorToasts())

    subscribeCb(makeService([
      { url: 'wss://my-relay.nostr.org:443/path', state: CONNECTION_STATES.CONNECTED },
    ]))

    subscribeCb(makeService([
      { url: 'wss://my-relay.nostr.org:443/path', state: CONNECTION_STATES.ERROR },
    ]))

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Relay my-relay.nostr.org disconnected. Trying to reconnect...',
      })
    )
  })

  it('does nothing when service is not initialized', () => {
    renderHook(() => useRelayErrorToasts())

    subscribeCb({ isInitialized: false })
    subscribeCb(null)

    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('fires warning toast after debounce window expires', () => {
    renderHook(() => useRelayErrorToasts())

    // CONNECTED -> ERROR (fires toast)
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))
    expect(mockAddToast).toHaveBeenCalledTimes(1)
    mockAddToast.mockClear()

    // Reconnect
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.CONNECTED },
    ]))
    mockAddToast.mockClear()

    // Advance past debounce
    vi.advanceTimersByTime(61_000)

    // Error again — should fire because debounce expired
    subscribeCb(makeService([
      { url: 'wss://relay.example.com', state: CONNECTION_STATES.ERROR },
    ]))

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
      })
    )
  })

  it('cleans up subscription on unmount', () => {
    const { unmount } = renderHook(() => useRelayErrorToasts())

    expect(subscribeCb).not.toBeNull()

    unmount()

    expect(subscribeCb).toBeNull()
  })
})

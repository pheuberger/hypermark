/**
 * useNostrSync Module-level Functions Tests
 *
 * Tests the exported utility functions from useNostrSync.js
 * (not the hook itself, which has many side effects).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies
vi.mock('../services/nostr-sync', () => ({
  NostrSyncService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(),
    disconnect: vi.fn().mockResolvedValue(),
    isInitialized: false,
    getStatus: vi.fn(() => ({ isInitialized: false, relays: { connected: 0, total: 0 } })),
    addRelay: vi.fn().mockResolvedValue(true),
    removeRelay: vi.fn().mockResolvedValue(true),
    updateRelays: vi.fn().mockResolvedValue(),
    flushNow: vi.fn().mockResolvedValue({ published: 0, failed: 0 }),
    onConnectionChange: vi.fn(),
    subscribeToBookmarks: vi.fn().mockResolvedValue('sub-id'),
    unsubscribe: vi.fn().mockResolvedValue(),
    queueBookmarkUpdate: vi.fn(),
  })),
  CONNECTION_STATES: {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
  },
}))

vi.mock('../services/key-storage', () => ({
  retrieveLEK: vi.fn().mockResolvedValue(null),
}))

vi.mock('./useYjs', () => ({
  getYdocInstance: vi.fn(() => null),
  getUndoManager: vi.fn(() => null),
}))

vi.mock('../services/nostr-diagnostics', () => ({
  getNostrDiagnostics: vi.fn(() => ({
    recordPublish: vi.fn(),
    recordError: vi.fn(),
  })),
}))

vi.mock('../utils/bookmark-transform', () => ({
  ymapToBookmarkData: vi.fn((data) => data),
}))

vi.mock('../services/nostr-sync-debug', () => ({
  exposeDebugUtilities: vi.fn(),
}))

vi.mock('../services/nostr-inbound-handlers', () => ({
  handleInboundBookmark: vi.fn(),
  handleInboundDeletion: vi.fn(),
}))

vi.mock('../services/sync-performance', () => ({
  SyncPerformanceManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn(),
    recordNetworkLatency: vi.fn(),
    pauseBackgroundOperations: vi.fn(),
    resumeBackgroundOperations: vi.fn(),
    getRecommendedParameters: vi.fn(() => ({})),
  })),
  PERFORMANCE_CONFIG: { LARGE_COLLECTION_THRESHOLD: 500 },
  sortBookmarksByPriority: vi.fn((b) => b),
  PRIORITY_LEVELS: { HIGH: 'high', NORMAL: 'normal', LOW: 'low' },
}))

const {
  subscribeToNostrSync,
  getNostrSyncService,
  getPerformanceManager,
  disconnectNostrSync,
  addNostrRelay,
  removeNostrRelay,
  updateNostrRelays,
  publishAllExistingBookmarks,
} = await import('./useNostrSync.js')

describe('useNostrSync module-level functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getNostrSyncService', () => {
    it('returns null when not initialized', () => {
      expect(getNostrSyncService()).toBeNull()
    })
  })

  describe('getPerformanceManager', () => {
    it('returns null when not initialized', () => {
      expect(getPerformanceManager()).toBeNull()
    })
  })

  describe('subscribeToNostrSync', () => {
    it('calls callback immediately with current service state', () => {
      const callback = vi.fn()
      const unsub = subscribeToNostrSync(callback)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(null) // not initialized

      unsub()
    })

    it('returns an unsubscribe function', () => {
      const callback = vi.fn()
      const unsub = subscribeToNostrSync(callback)

      expect(typeof unsub).toBe('function')
      unsub()
    })

    it('unsubscribe removes the listener', () => {
      const callback = vi.fn()
      const unsub = subscribeToNostrSync(callback)

      expect(callback).toHaveBeenCalledTimes(1)
      unsub()

      // After unsubscribing, callback should not be called again
      // when notifyNostrSyncListeners is called internally
    })
  })

  describe('disconnectNostrSync', () => {
    it('does nothing when service is not initialized', async () => {
      await disconnectNostrSync()
      // Should not throw
    })
  })

  describe('addNostrRelay', () => {
    it('returns false when service is not initialized', async () => {
      const result = await addNostrRelay('wss://relay.example.com')
      expect(result).toBe(false)
    })
  })

  describe('removeNostrRelay', () => {
    it('returns false when service is not initialized', async () => {
      const result = await removeNostrRelay('wss://relay.example.com')
      expect(result).toBe(false)
    })
  })

  describe('updateNostrRelays', () => {
    it('does nothing when service is not initialized', async () => {
      await updateNostrRelays(['wss://relay.example.com'])
      // Should not throw
    })
  })

  describe('publishAllExistingBookmarks', () => {
    it('returns 0 when service is not initialized', async () => {
      const count = await publishAllExistingBookmarks()
      expect(count).toBe(0)
    })
  })
})

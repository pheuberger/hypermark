/**
 * Nostr Diagnostics Service Tests
 * Tests for src/services/nostr-diagnostics.js
 *
 * Tests the diagnostic functionality including sync history tracking,
 * relay connectivity testing, keypair verification, and troubleshooting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

// Set up crypto environment
if (!globalThis.window?.crypto) {
  globalThis.window = globalThis.window || globalThis
  globalThis.window.crypto = webcrypto
}

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock navigator
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'test-agent',
    language: 'en-US',
    onLine: true,
    platform: 'test'
  }
})

// Mock document for download functionality
globalThis.document = {
  createElement: vi.fn(() => ({
    href: '',
    download: '',
    click: vi.fn()
  })),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  }
}

// Mock URL
globalThis.URL = {
  createObjectURL: vi.fn(() => 'blob:test'),
  revokeObjectURL: vi.fn()
}

// Mock WebSocket for relay testing
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.onopen = null
    this.onclose = null
    this.onerror = null
    this.onmessage = null

    // Simulate successful connection by default
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) this.onopen({})
    }, 10)
  }

  send(data) {
    // Simulate EOSE response for NIP-01 test
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: JSON.stringify(['EOSE', 'test-sub']) })
      }
    }, 5)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose({ code: 1000 })
  }
}

globalThis.WebSocket = MockWebSocket

import { generateLEK } from './crypto.js'
import NostrDiagnosticsService, { getNostrDiagnostics, recordSyncEvent } from './nostr-diagnostics.js'

describe('NostrDiagnosticsService', () => {
  let diagnostics
  let testLEK

  beforeEach(async () => {
    localStorageMock.clear()
    vi.clearAllMocks()
    testLEK = await generateLEK()
    diagnostics = new NostrDiagnosticsService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Constructor', () => {
    it('initializes with empty history', () => {
      const diag = new NostrDiagnosticsService()
      expect(diag.syncHistory).toEqual([])
      expect(diag.diagnosticLogs).toEqual([])
    })

    it('loads history from localStorage', () => {
      const mockHistory = [
        { type: 'publish', timestamp: new Date().toISOString() }
      ]
      localStorageMock.setItem('hypermark_sync_history', JSON.stringify(mockHistory))

      const diag = new NostrDiagnosticsService()
      expect(diag.syncHistory.length).toBe(1)
      expect(diag.syncHistory[0].type).toBe('publish')
    })
  })

  describe('Sync History', () => {
    it('records sync events', () => {
      diagnostics.recordSyncEvent({
        type: 'publish',
        eventType: 'bookmark',
        eventId: 'test-event-id',
        bookmarkId: 'test-bookmark-id'
      })

      expect(diagnostics.syncHistory.length).toBe(1)
      expect(diagnostics.syncHistory[0].type).toBe('publish')
      expect(diagnostics.syncHistory[0].eventId).toBe('test-event-id')
    })

    it('records publish events via convenience method', () => {
      diagnostics.recordPublish('event-123', 'bookmark-456', 'wss://relay.test')

      expect(diagnostics.syncHistory.length).toBe(1)
      expect(diagnostics.syncHistory[0].type).toBe('publish')
      expect(diagnostics.syncHistory[0].eventId).toBe('event-123')
      expect(diagnostics.syncHistory[0].bookmarkId).toBe('bookmark-456')
      expect(diagnostics.syncHistory[0].relay).toBe('wss://relay.test')
    })

    it('records receive events via convenience method', () => {
      diagnostics.recordReceive('event-789', 'bookmark', 'bookmark-abc', 'wss://relay.test')

      expect(diagnostics.syncHistory.length).toBe(1)
      expect(diagnostics.syncHistory[0].type).toBe('receive')
      expect(diagnostics.syncHistory[0].eventType).toBe('bookmark')
    })

    it('records errors via convenience method', () => {
      diagnostics.recordError(new Error('Test error'), {
        eventType: 'bookmark',
        relay: 'wss://relay.test'
      })

      expect(diagnostics.syncHistory.length).toBe(1)
      expect(diagnostics.syncHistory[0].type).toBe('error')
      expect(diagnostics.syncHistory[0].error).toBe('Test error')
    })

    it('returns history filtered by type', () => {
      diagnostics.recordSyncEvent({ type: 'publish' })
      diagnostics.recordSyncEvent({ type: 'receive' })
      diagnostics.recordSyncEvent({ type: 'error', error: 'test' })
      diagnostics.recordSyncEvent({ type: 'publish' })

      const publishOnly = diagnostics.getSyncHistory({ type: 'publish' })
      expect(publishOnly.length).toBe(2)
      expect(publishOnly.every(e => e.type === 'publish')).toBe(true)
    })

    it('returns history limited by count', () => {
      for (let i = 0; i < 10; i++) {
        diagnostics.recordSyncEvent({ type: 'publish' })
      }

      const limited = diagnostics.getSyncHistory({ limit: 5 })
      expect(limited.length).toBe(5)
    })

    it('clears sync history', () => {
      diagnostics.recordSyncEvent({ type: 'publish' })
      diagnostics.recordSyncEvent({ type: 'receive' })

      diagnostics.clearSyncHistory()

      expect(diagnostics.syncHistory.length).toBe(0)
    })

    it('persists history to localStorage', () => {
      diagnostics.recordSyncEvent({
        type: 'publish',
        eventId: 'test-id'
      })

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'hypermark_sync_history',
        expect.any(String)
      )
    })
  })

  describe('Subscription', () => {
    it('notifies listeners on changes', () => {
      const callback = vi.fn()
      diagnostics.subscribe(callback)

      diagnostics.recordSyncEvent({ type: 'publish' })

      expect(callback).toHaveBeenCalled()
    })

    it('unsubscribes correctly', () => {
      const callback = vi.fn()
      const unsubscribe = diagnostics.subscribe(callback)

      unsubscribe()
      callback.mockClear()

      diagnostics.recordSyncEvent({ type: 'publish' })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('Relay Connectivity', () => {
    it('tests relay connectivity successfully', async () => {
      const result = await diagnostics.testRelayConnectivity('wss://test-relay.com', 1000)

      expect(result.url).toBe('wss://test-relay.com')
      expect(result.reachable).toBe(true)
      expect(result.latency).toBeDefined()
      expect(result.state).toBe('connected')
      expect(result.testedAt).toBeInstanceOf(Date)
    })

    it('handles connection timeout', async () => {
      // Create a mock that doesn't connect
      const originalWS = globalThis.WebSocket
      globalThis.WebSocket = class {
        static CONNECTING = 0
        static OPEN = 1
        constructor() {
          this.readyState = 0
          // Never call onopen
        }
        close() {}
      }

      const result = await diagnostics.testRelayConnectivity('wss://slow-relay.com', 100)

      expect(result.reachable).toBe(false)
      expect(result.error).toContain('timed out')

      globalThis.WebSocket = originalWS
    })

    it('handles connection errors', async () => {
      const originalWS = globalThis.WebSocket
      globalThis.WebSocket = class {
        static CONNECTING = 0
        constructor() {
          this.readyState = 0
          setTimeout(() => {
            if (this.onerror) this.onerror({})
          }, 5)
        }
        close() {}
      }

      const result = await diagnostics.testRelayConnectivity('wss://error-relay.com', 1000)

      expect(result.reachable).toBe(false)
      expect(result.error).toBeDefined()

      globalThis.WebSocket = originalWS
    })

    it('tests all relays', async () => {
      const results = await diagnostics.testAllRelays(['wss://relay1.com', 'wss://relay2.com'])

      expect(results.length).toBe(2)
      expect(results[0].url).toBe('wss://relay1.com')
      expect(results[1].url).toBe('wss://relay2.com')
    })
  })

  describe('Event Validation', () => {
    it('validates valid event structure', () => {
      const validEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [['d', 'test-id'], ['app', 'hypermark']],
        content: 'dGVzdA==:Y2lwaGVy',
        sig: 'c'.repeat(128)
      }

      const result = diagnostics.validateEvent(validEvent)

      expect(result.valid).toBe(true)
      expect(result.checks.length).toBeGreaterThan(0)
    })

    it('detects invalid event structure', () => {
      const invalidEvent = {
        id: 'invalid-id',
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128)
      }

      const result = diagnostics.validateEvent(invalidEvent)

      expect(result.valid).toBe(false)
      expect(result.checks.some(c => c.status === 'fail')).toBe(true)
    })

    it('validates bookmark event tags', () => {
      const bookmarkEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [['d', 'test-id'], ['app', 'hypermark']],
        content: 'dGVzdA==:Y2lwaGVy',
        sig: 'c'.repeat(128)
      }

      const result = diagnostics.validateEvent(bookmarkEvent)
      const bookmarkCheck = result.checks.find(c => c.name === 'Bookmark Event')

      expect(bookmarkCheck).toBeDefined()
      expect(bookmarkCheck.status).toBe('pass')
    })
  })

  describe('Diagnostics Run', () => {
    it('runs all diagnostics', async () => {
      const results = await diagnostics.runAllDiagnostics()

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.id && r.name && r.status)).toBe(true)
    })

    it('reports progress during diagnostics', async () => {
      const progressUpdates = []
      await diagnostics.runAllDiagnostics((progress) => {
        progressUpdates.push(progress)
      })

      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates[0]).toHaveProperty('index')
      expect(progressUpdates[0]).toHaveProperty('total')
      expect(progressUpdates[0]).toHaveProperty('currentCheck')
    })

    it('logs diagnostic runs', async () => {
      await diagnostics.runAllDiagnostics()

      expect(diagnostics.diagnosticLogs.length).toBe(1)
      expect(diagnostics.diagnosticLogs[0]).toHaveProperty('timestamp')
      expect(diagnostics.diagnosticLogs[0]).toHaveProperty('summary')
    })
  })

  describe('Troubleshooting Suggestions', () => {
    it('returns suggestions when LEK is missing', async () => {
      // LEK will be missing without initialization
      const suggestions = await diagnostics.getTroubleshootingSuggestions()

      expect(suggestions.length).toBeGreaterThan(0)
      const pairingSuggestion = suggestions.find(s => s.id === 'pair-device')
      expect(pairingSuggestion).toBeDefined()
      expect(pairingSuggestion.severity).toBe('error')
    })
  })

  describe('Export', () => {
    it('exports diagnostic data', async () => {
      // Add some history first
      diagnostics.recordSyncEvent({ type: 'publish', eventId: 'test-123' })

      const exported = await diagnostics.exportDiagnostics()

      expect(exported.exportedAt).toBeDefined()
      expect(exported.version).toBe('1.0')
      expect(exported.app).toBe('Hypermark')
      expect(exported.system).toBeDefined()
      expect(exported.diagnostics).toBeDefined()
      expect(exported.keypair).toBeDefined()
      expect(exported.suggestions).toBeDefined()
    })

    it('includes history when requested', async () => {
      diagnostics.recordSyncEvent({ type: 'publish' })

      const exported = await diagnostics.exportDiagnostics({ includeHistory: true })

      expect(exported.syncHistory).toBeDefined()
      expect(exported.syncHistory.recentEntries.length).toBe(1)
    })

    it('excludes history when not requested', async () => {
      diagnostics.recordSyncEvent({ type: 'publish' })

      const exported = await diagnostics.exportDiagnostics({ includeHistory: false })

      expect(exported.syncHistory).toBeUndefined()
    })

    it('downloads diagnostics as file', async () => {
      await diagnostics.downloadDiagnostics()

      expect(document.createElement).toHaveBeenCalledWith('a')
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalled()
    })
  })

  describe('Clear All', () => {
    it('clears all diagnostic data', () => {
      diagnostics.recordSyncEvent({ type: 'publish' })
      diagnostics._logDiagnosticRun([{ id: 'test', status: 'pass' }])

      diagnostics.clearAll()

      expect(diagnostics.syncHistory.length).toBe(0)
      expect(diagnostics.diagnosticLogs.length).toBe(0)
    })
  })

  describe('Singleton', () => {
    it('getNostrDiagnostics returns singleton instance', () => {
      const instance1 = getNostrDiagnostics()
      const instance2 = getNostrDiagnostics()

      expect(instance1).toBe(instance2)
    })

    it('recordSyncEvent uses singleton', () => {
      recordSyncEvent({ type: 'publish', eventId: 'singleton-test' })

      const instance = getNostrDiagnostics()
      const history = instance.getSyncHistory()

      expect(history.some(e => e.eventId === 'singleton-test')).toBe(true)
    })
  })
})

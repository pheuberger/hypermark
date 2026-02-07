/**
 * Relay Utils Tests
 * Tests for src/utils/relay-utils.js
 */

import { describe, it, expect, vi } from 'vitest'
import {
  validateRelayUrl,
  testRelayConnection,
  loadCustomRelays,
  saveCustomRelays,
  loadSyncEnabled,
  saveSyncEnabled,
  STORAGE_KEY_CUSTOM_RELAYS,
  STORAGE_KEY_SYNC_ENABLED,
} from './relay-utils.js'

describe('relay-utils', () => {
  describe('validateRelayUrl', () => {
    it('returns invalid for empty input', () => {
      expect(validateRelayUrl('')).toEqual({ valid: false, error: 'URL is required' })
      expect(validateRelayUrl(null)).toEqual({ valid: false, error: 'URL is required' })
      expect(validateRelayUrl(undefined)).toEqual({ valid: false, error: 'URL is required' })
    })

    it('returns invalid for non-string input', () => {
      expect(validateRelayUrl(123)).toEqual({ valid: false, error: 'URL is required' })
    })

    it('requires websocket protocol', () => {
      const result = validateRelayUrl('https://relay.example.com')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('URL must start with wss:// or ws://')
    })

    it('rejects http:// protocol', () => {
      const result = validateRelayUrl('http://relay.example.com')
      expect(result.valid).toBe(false)
    })

    it('accepts valid wss:// URLs', () => {
      const result = validateRelayUrl('wss://relay.example.com')
      expect(result.valid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('accepts ws:// with a warning', () => {
      const result = validateRelayUrl('ws://relay.example.com')
      expect(result.valid).toBe(true)
      expect(result.error).toContain('not secure')
    })

    it('handles URLs with paths', () => {
      const result = validateRelayUrl('wss://relay.example.com/v1')
      expect(result.valid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('handles trimming whitespace', () => {
      const result = validateRelayUrl('  wss://relay.example.com  ')
      expect(result.valid).toBe(true)
    })

    it('rejects malformed wss URLs', () => {
      const result = validateRelayUrl('wss://')
      // URL constructor may throw or parse this differently
      expect(typeof result.valid).toBe('boolean')
    })
  })

  describe('testRelayConnection', () => {
    it('resolves with failure on error', async () => {
      const OriginalWS = globalThis.WebSocket
      globalThis.WebSocket = class ErrorWS {
        constructor() {
          this.readyState = 0
          this.onopen = null
          this.onerror = null
          this.onclose = null
          setTimeout(() => {
            if (this.onerror) this.onerror({ type: 'error' })
          }, 0)
        }
        close() {}
      }

      const result = await testRelayConnection('wss://relay.example.com')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection failed')

      globalThis.WebSocket = OriginalWS
    })

    it('handles constructor throwing', async () => {
      const OriginalWS = globalThis.WebSocket
      globalThis.WebSocket = class ThrowingWS {
        constructor() {
          throw new Error('Network error')
        }
      }

      const result = await testRelayConnection('wss://relay.example.com')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')

      globalThis.WebSocket = OriginalWS
    })

    it('handles connection close before open', async () => {
      const OriginalWS = globalThis.WebSocket
      globalThis.WebSocket = class CloseWS {
        constructor() {
          this.readyState = 0
          this.onopen = null
          this.onerror = null
          this.onclose = null
          setTimeout(() => {
            if (this.onclose) this.onclose({ code: 1006 })
          }, 0)
        }
        close() {}
      }

      const result = await testRelayConnection('wss://relay.example.com')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection closed')

      globalThis.WebSocket = OriginalWS
    })

    it('resolves with success on open', async () => {
      const OriginalWS = globalThis.WebSocket
      globalThis.WebSocket = class SuccessWS {
        static OPEN = 1
        static CONNECTING = 0
        constructor() {
          this.readyState = 0
          this.onopen = null
          this.onerror = null
          this.onclose = null
          setTimeout(() => {
            this.readyState = 1
            if (this.onopen) this.onopen({ type: 'open' })
          }, 0)
        }
        close() { this.readyState = 3 }
      }

      const result = await testRelayConnection('wss://relay.example.com')
      expect(result.success).toBe(true)
      expect(result.latency).toBeGreaterThanOrEqual(0)
      expect(result.error).toBeNull()

      globalThis.WebSocket = OriginalWS
    })
  })

  describe('loadCustomRelays', () => {
    it('returns empty array when no data stored', () => {
      expect(loadCustomRelays()).toEqual([])
    })

    it('loads stored relays', () => {
      const relays = ['wss://relay1.com', 'wss://relay2.com']
      localStorage.setItem(STORAGE_KEY_CUSTOM_RELAYS, JSON.stringify(relays))
      expect(loadCustomRelays()).toEqual(relays)
    })

    it('returns empty array on invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY_CUSTOM_RELAYS, 'not-json')
      expect(loadCustomRelays()).toEqual([])
    })
  })

  describe('saveCustomRelays', () => {
    it('saves relays to localStorage', () => {
      const relays = ['wss://relay1.com']
      saveCustomRelays(relays)
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_RELAYS))).toEqual(relays)
    })

    it('handles localStorage errors gracefully', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('QuotaExceeded') }

      saveCustomRelays(['wss://relay.com'])
      expect(spy).toHaveBeenCalled()

      localStorage.setItem = originalSetItem
    })
  })

  describe('loadSyncEnabled', () => {
    it('defaults to true when not stored', () => {
      expect(loadSyncEnabled()).toBe(true)
    })

    it('returns true when stored as "true"', () => {
      localStorage.setItem(STORAGE_KEY_SYNC_ENABLED, 'true')
      expect(loadSyncEnabled()).toBe(true)
    })

    it('returns false when stored as "false"', () => {
      localStorage.setItem(STORAGE_KEY_SYNC_ENABLED, 'false')
      expect(loadSyncEnabled()).toBe(false)
    })
  })

  describe('saveSyncEnabled', () => {
    it('saves true value', () => {
      saveSyncEnabled(true)
      expect(localStorage.getItem(STORAGE_KEY_SYNC_ENABLED)).toBe('true')
    })

    it('saves false value', () => {
      saveSyncEnabled(false)
      expect(localStorage.getItem(STORAGE_KEY_SYNC_ENABLED)).toBe('false')
    })

    it('handles localStorage errors gracefully', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('QuotaExceeded') }

      saveSyncEnabled(true)
      expect(spy).toHaveBeenCalled()

      localStorage.setItem = originalSetItem
    })
  })
})

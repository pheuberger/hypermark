/**
 * Reset Service Tests
 * Tests for src/services/reset.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies
vi.mock('./key-storage', () => ({
  clearAllKeys: vi.fn().mockResolvedValue(),
  retrieveLEK: vi.fn().mockResolvedValue(null),
}))

vi.mock('../utils/device-id', () => ({
  clearDeviceData: vi.fn(),
}))

vi.mock('./nostr-diagnostics', () => ({
  getNostrDiagnostics: vi.fn(() => ({
    clearAll: vi.fn(),
  })),
}))

vi.mock('../hooks/useYjs', () => ({
  getWebrtcProvider: vi.fn(() => null),
  disconnectYjsWebRTC: vi.fn(),
  getYdocInstance: vi.fn(() => null),
}))

vi.mock('../hooks/useNostrSync', () => ({
  getNostrSyncService: vi.fn(() => null),
}))

const { performFullReset, checkResetableData } = await import('./reset.js')

describe('reset service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('performFullReset', () => {
    it('executes all reset steps', async () => {
      const result = await performFullReset({ reloadAfter: false })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('reports progress via callback', async () => {
      const progressCalls = []
      await performFullReset({
        reloadAfter: false,
        onProgress: (p) => progressCalls.push(p),
      })

      expect(progressCalls.length).toBeGreaterThan(0)
      // Each progress call should have step, total, message
      progressCalls.forEach(p => {
        expect(p.step).toBeDefined()
        expect(p.total).toBeDefined()
        expect(p.message).toBeDefined()
      })
    })

    it('collects errors without stopping', async () => {
      // Make clearAllKeys fail
      const { clearAllKeys } = await import('./key-storage')
      clearAllKeys.mockRejectedValueOnce(new Error('key error'))

      const result = await performFullReset({ reloadAfter: false })
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('key error')
    })

    it('progress callback receives all steps', async () => {
      const messages = []
      await performFullReset({
        reloadAfter: false,
        onProgress: (p) => messages.push(p.message),
      })

      expect(messages).toContain('Disconnecting sync providers')
      expect(messages).toContain('Clearing cryptographic keys')
      expect(messages).toContain('Clearing local storage')
    })
  })

  describe('checkResetableData', () => {
    it('returns hasData: false when nothing stored', async () => {
      const result = await checkResetableData()
      expect(result.hasData).toBe(false)
      expect(result.details.hasLEK).toBe(false)
      expect(result.details.hasBookmarks).toBe(false)
      expect(result.details.bookmarkCount).toBe(0)
    })

    it('detects device ID in localStorage', async () => {
      localStorage.setItem('hypermark:device-id', 'test-device')
      const result = await checkResetableData()
      expect(result.hasData).toBe(true)
      expect(result.details.hasDeviceId).toBe(true)
    })

    it('detects stored LEK', async () => {
      const { retrieveLEK } = await import('./key-storage')
      retrieveLEK.mockResolvedValueOnce('fake-lek')

      const result = await checkResetableData()
      expect(result.hasData).toBe(true)
      expect(result.details.hasLEK).toBe(true)
    })
  })
})

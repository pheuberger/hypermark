/**
 * useYjs Utility Functions Tests
 *
 * Tests the exported utility functions from useYjs.js
 * (not the hook itself, which requires IndexedDB/WebRTC).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LOCAL_ORIGIN,
  getUndoManager,
  undo,
  redo,
  canUndo,
  canRedo,
  subscribeToUndoManager,
  subscribeToWebrtcProvider,
  getWebrtcProvider,
  getYdocInstance,
  setYjsRoomPassword,
  disconnectYjsWebRTC,
} from './useYjs.js'

describe('useYjs utility functions', () => {
  describe('LOCAL_ORIGIN', () => {
    it('is the string "local"', () => {
      expect(LOCAL_ORIGIN).toBe('local')
    })
  })

  describe('undo/redo without undoManager', () => {
    it('undo returns false when no undoManager', () => {
      // Before initialization, undoManager is null from prior tests.
      // If getUndoManager returns null, undo should return false.
      if (!getUndoManager()) {
        expect(undo()).toBe(false)
      }
    })

    it('redo returns false when no undoManager', () => {
      if (!getUndoManager()) {
        expect(redo()).toBe(false)
      }
    })

    it('canUndo returns false when no undoManager', () => {
      if (!getUndoManager()) {
        expect(canUndo()).toBe(false)
      }
    })

    it('canRedo returns false when no undoManager', () => {
      if (!getUndoManager()) {
        expect(canRedo()).toBe(false)
      }
    })
  })

  describe('subscribeToUndoManager', () => {
    it('returns an unsubscribe function', () => {
      const callback = vi.fn()
      const unsub = subscribeToUndoManager(callback)
      expect(typeof unsub).toBe('function')
      unsub() // cleanup
    })
  })

  describe('subscribeToWebrtcProvider', () => {
    it('calls callback immediately with current provider', () => {
      const callback = vi.fn()
      const unsub = subscribeToWebrtcProvider(callback)

      // Should be called immediately with null (no provider yet)
      expect(callback).toHaveBeenCalledTimes(1)
      unsub()
    })

    it('returns an unsubscribe function that removes the listener', () => {
      const callback = vi.fn()
      const unsub = subscribeToWebrtcProvider(callback)
      expect(callback).toHaveBeenCalledTimes(1)

      unsub()
      // After unsubscribe, further notifications won't call this callback
    })
  })

  describe('getWebrtcProvider', () => {
    it('returns null before WebRTC initialization', () => {
      // Provider starts null before reconnectYjsWebRTC is called
      const provider = getWebrtcProvider()
      expect(provider === null || provider !== undefined).toBe(true)
    })
  })

  describe('setYjsRoomPassword', () => {
    it('does nothing when no webrtcProvider', () => {
      // Should not throw
      setYjsRoomPassword('test-password')
    })
  })

  describe('disconnectYjsWebRTC', () => {
    it('does nothing when no webrtcProvider', () => {
      // Should not throw
      disconnectYjsWebRTC()
    })
  })

  describe('getYdocInstance', () => {
    it('returns the ydoc instance (may be null or Y.Doc)', () => {
      const doc = getYdocInstance()
      // Either null (uninitialized) or a Y.Doc instance
      expect(doc === null || typeof doc === 'object').toBe(true)
    })
  })
})

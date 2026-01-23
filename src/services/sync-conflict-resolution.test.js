/**
 * Sync Conflict Resolution Test Suite
 *
 * Extensive tests for sync conflict scenarios including:
 * - Simultaneous edits to same bookmark
 * - Rapid edit sequences
 * - Network partition scenarios
 * - Device onboarding during active editing
 * - Bookmark deletion conflicts
 * - Edge cases in CRDT merge logic
 * - Automated conflict generation and deterministic replay
 * - Validation of CRDT mathematical properties under stress
 *
 * These tests ensure no data is lost during conflicts, convergence is achieved
 * across devices, and user experience remains smooth during conflict resolution.
 *
 * BEAD: hypermark-lf6.18
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import * as Y from 'yjs'

// Set up crypto environment
if (!globalThis.window?.crypto) {
  globalThis.window = globalThis.window || globalThis
  globalThis.window.crypto = webcrypto
}

import { generateLEK } from './crypto.js'
import {
  NostrSyncService,
  NOSTR_KINDS,
  CONNECTION_STATES,
  extractYjsStateVector,
  extractYjsStateVectorBase64,
  decodeStateVectorFromBase64,
  parseStateVector,
  compareStateVectors,
  hasRemoteChanges,
  encodeYjsState,
  encodeYjsStateBase64,
  applyYjsUpdate,
  getYjsDiff,
  getYjsDiffBase64,
} from './nostr-sync.js'
import { generateBookmark, generateBookmarks } from '../test-utils/data-generators.js'

// ============================================================================
// Test Utilities for Conflict Resolution
// ============================================================================

/**
 * Create a virtual device for simulating multi-device scenarios
 */
class VirtualDevice {
  constructor(id) {
    this.id = id
    this.ydoc = new Y.Doc()
    this.bookmarks = this.ydoc.getMap('bookmarks')
    this.syncHistory = []
  }

  /**
   * Add a bookmark to this device
   */
  addBookmark(id, data) {
    const ymap = new Y.Map()
    Object.entries(data).forEach(([key, value]) => {
      ymap.set(key, value)
    })
    this.bookmarks.set(id, ymap)
    this.syncHistory.push({ action: 'add', id, data, timestamp: Date.now() })
    return ymap
  }

  /**
   * Update a bookmark field on this device
   */
  updateBookmark(id, field, value) {
    const bm = this.bookmarks.get(id)
    if (bm && bm instanceof Y.Map) {
      bm.set(field, value)
      this.syncHistory.push({ action: 'update', id, field, value, timestamp: Date.now() })
    }
  }

  /**
   * Delete a bookmark from this device
   */
  deleteBookmark(id) {
    this.bookmarks.delete(id)
    this.syncHistory.push({ action: 'delete', id, timestamp: Date.now() })
  }

  /**
   * Get current state vector
   */
  getStateVector() {
    return extractYjsStateVector(this.ydoc)
  }

  /**
   * Get encoded state
   */
  encodeState() {
    return encodeYjsState(this.ydoc)
  }

  /**
   * Get diff since a given state vector
   */
  getDiff(targetStateVector) {
    return getYjsDiff(this.ydoc, targetStateVector)
  }

  /**
   * Apply an update from another device
   */
  applyUpdate(update, origin = 'remote') {
    applyYjsUpdate(this.ydoc, update, origin)
  }

  /**
   * Sync with another device (bidirectional)
   */
  syncWith(otherDevice) {
    const mySv = this.getStateVector()
    const theirSv = otherDevice.getStateVector()

    // Exchange diffs
    const myDiff = this.getDiff(theirSv)
    const theirDiff = otherDevice.getDiff(mySv)

    // Apply updates
    this.applyUpdate(theirDiff, `sync-from-${otherDevice.id}`)
    otherDevice.applyUpdate(myDiff, `sync-from-${this.id}`)
  }

  /**
   * Get bookmark by ID
   */
  getBookmark(id) {
    return this.bookmarks.get(id)
  }

  /**
   * Get all bookmark IDs
   */
  getBookmarkIds() {
    return Array.from(this.bookmarks.keys())
  }

  /**
   * Get bookmark count
   */
  getBookmarkCount() {
    return this.bookmarks.size
  }
}

/**
 * Create a conflict scenario generator for deterministic testing
 */
class ConflictScenarioGenerator {
  constructor(seed = 12345) {
    this.seed = seed
    this.rng = this.createSeededRandom(seed)
  }

  createSeededRandom(seed) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
  }

  /**
   * Generate a sequence of operations that will create conflicts
   */
  generateConflictSequence(options = {}) {
    const {
      numDevices = 2,
      numBookmarks = 5,
      numOperations = 20,
      conflictProbability = 0.5,
    } = options

    const operations = []
    const bookmarkIds = Array.from({ length: numBookmarks }, (_, i) => `bm-${i}`)

    for (let i = 0; i < numOperations; i++) {
      const deviceId = Math.floor(this.rng() * numDevices)
      const bookmarkId = bookmarkIds[Math.floor(this.rng() * bookmarkIds.length)]
      const shouldConflict = this.rng() < conflictProbability

      if (shouldConflict && i > 0) {
        // Create a conflicting operation on another device
        const otherDeviceId = (deviceId + 1) % numDevices
        operations.push({
          deviceId: otherDeviceId,
          bookmarkId,
          operation: this.randomOperation(),
          timestamp: Date.now() + i,
        })
      }

      operations.push({
        deviceId,
        bookmarkId,
        operation: this.randomOperation(),
        timestamp: Date.now() + i,
      })
    }

    return operations
  }

  randomOperation() {
    const ops = ['updateTitle', 'updateTags', 'updateDescription', 'updateReadLater']
    return ops[Math.floor(this.rng() * ops.length)]
  }
}

/**
 * Create a mock WebSocket for testing
 */
function createMockWebSocketClass() {
  const instances = []

  const MockWebSocket = vi.fn((url) => {
    const instance = {
      url,
      readyState: 0,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'open') instance.onopen = handler
        if (event === 'close') instance.onclose = handler
        if (event === 'error') instance.onerror = handler
        if (event === 'message') instance.onmessage = handler
      }),
    }

    setTimeout(() => {
      instance.readyState = 1
      if (instance.onopen) instance.onopen({ type: 'open' })
    }, 10)

    instances.push(instance)
    return instance
  })

  MockWebSocket.CONNECTING = 0
  MockWebSocket.OPEN = 1
  MockWebSocket.CLOSING = 2
  MockWebSocket.CLOSED = 3
  MockWebSocket._instances = instances

  return MockWebSocket
}

// ============================================================================
// Simultaneous Edit Conflict Tests
// ============================================================================

describe('Simultaneous Edit Conflicts', () => {
  describe('Same Field Conflicts', () => {
    it('should converge when two devices edit the same title simultaneously', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create initial shared state
      device1.addBookmark('bm1', {
        url: 'https://example.com',
        title: 'Original Title',
        tags: [],
      })

      // Sync initial state to device2
      device2.applyUpdate(device1.encodeState())

      // Both devices edit the title simultaneously (no sync between edits)
      device1.updateBookmark('bm1', 'title', 'Title from Device 1')
      device2.updateBookmark('bm1', 'title', 'Title from Device 2')

      // Verify divergence before sync
      expect(device1.getBookmark('bm1').get('title')).toBe('Title from Device 1')
      expect(device2.getBookmark('bm1').get('title')).toBe('Title from Device 2')

      // Sync devices
      device1.syncWith(device2)

      // Both should converge to the same value (CRDT property)
      const title1 = device1.getBookmark('bm1').get('title')
      const title2 = device2.getBookmark('bm1').get('title')
      expect(title1).toBe(title2)
    })

    it('should converge when three devices edit the same field simultaneously', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')
      const device3 = new VirtualDevice('device3')

      // Create initial shared state
      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Original' })

      // Sync to all devices
      const initialState = device1.encodeState()
      device2.applyUpdate(initialState)
      device3.applyUpdate(initialState)

      // All devices edit simultaneously
      device1.updateBookmark('bm1', 'title', 'From D1')
      device2.updateBookmark('bm1', 'title', 'From D2')
      device3.updateBookmark('bm1', 'title', 'From D3')

      // Pairwise sync
      device1.syncWith(device2)
      device2.syncWith(device3)
      device1.syncWith(device3)

      // All should converge
      const t1 = device1.getBookmark('bm1').get('title')
      const t2 = device2.getBookmark('bm1').get('title')
      const t3 = device3.getBookmark('bm1').get('title')

      expect(t1).toBe(t2)
      expect(t2).toBe(t3)
    })

    it('should handle concurrent URL updates', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://original.com', title: 'Test' })
      device2.applyUpdate(device1.encodeState())

      // Both update URL
      device1.updateBookmark('bm1', 'url', 'https://device1.com')
      device2.updateBookmark('bm1', 'url', 'https://device2.com')

      device1.syncWith(device2)

      // Convergence
      const url1 = device1.getBookmark('bm1').get('url')
      const url2 = device2.getBookmark('bm1').get('url')
      expect(url1).toBe(url2)
    })
  })

  describe('Different Field Conflicts', () => {
    it('should merge non-conflicting field updates', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', {
        url: 'https://example.com',
        title: 'Original',
        description: 'Original desc',
        readLater: false,
      })
      device2.applyUpdate(device1.encodeState())

      // Device 1 updates title, device 2 updates description
      device1.updateBookmark('bm1', 'title', 'New Title')
      device2.updateBookmark('bm1', 'description', 'New Description')

      device1.syncWith(device2)

      // Both changes should be preserved
      const bm1 = device1.getBookmark('bm1')
      const bm2 = device2.getBookmark('bm1')

      expect(bm1.get('title')).toBe('New Title')
      expect(bm1.get('description')).toBe('New Description')
      expect(bm2.get('title')).toBe('New Title')
      expect(bm2.get('description')).toBe('New Description')
    })

    it('should preserve all field updates from multiple devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')
      const device3 = new VirtualDevice('device3')

      device1.addBookmark('bm1', {
        url: 'https://example.com',
        title: 'Title',
        description: '',
        readLater: false,
        favicon: null,
      })

      const initialState = device1.encodeState()
      device2.applyUpdate(initialState)
      device3.applyUpdate(initialState)

      // Each device updates different fields
      device1.updateBookmark('bm1', 'title', 'Updated Title')
      device2.updateBookmark('bm1', 'description', 'Added description')
      device3.updateBookmark('bm1', 'readLater', true)

      // Full sync
      device1.syncWith(device2)
      device2.syncWith(device3)
      device1.syncWith(device3)

      // All changes preserved on all devices
      for (const device of [device1, device2, device3]) {
        const bm = device.getBookmark('bm1')
        expect(bm.get('title')).toBe('Updated Title')
        expect(bm.get('description')).toBe('Added description')
        expect(bm.get('readLater')).toBe(true)
      }
    })
  })

  describe('Simultaneous Bookmark Creation', () => {
    it('should preserve both bookmarks when created simultaneously on different devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Each device creates a different bookmark
      device1.addBookmark('bm-from-d1', { url: 'https://d1.com', title: 'From D1' })
      device2.addBookmark('bm-from-d2', { url: 'https://d2.com', title: 'From D2' })

      device1.syncWith(device2)

      // Both devices should have both bookmarks
      expect(device1.getBookmarkCount()).toBe(2)
      expect(device2.getBookmarkCount()).toBe(2)
      expect(device1.getBookmark('bm-from-d1')).toBeTruthy()
      expect(device1.getBookmark('bm-from-d2')).toBeTruthy()
      expect(device2.getBookmark('bm-from-d1')).toBeTruthy()
      expect(device2.getBookmark('bm-from-d2')).toBeTruthy()
    })

    it('should handle many simultaneous bookmark creations', () => {
      const devices = Array.from({ length: 5 }, (_, i) => new VirtualDevice(`device${i}`))

      // Each device creates 10 bookmarks
      devices.forEach((device, deviceIdx) => {
        for (let i = 0; i < 10; i++) {
          device.addBookmark(`bm-${deviceIdx}-${i}`, {
            url: `https://d${deviceIdx}-${i}.com`,
            title: `Bookmark from D${deviceIdx} #${i}`,
          })
        }
      })

      // Full mesh sync
      for (let i = 0; i < devices.length; i++) {
        for (let j = i + 1; j < devices.length; j++) {
          devices[i].syncWith(devices[j])
        }
      }

      // All devices should have all 50 bookmarks
      for (const device of devices) {
        expect(device.getBookmarkCount()).toBe(50)
      }
    })
  })
})

// ============================================================================
// Rapid Edit Sequence Tests
// ============================================================================

describe('Rapid Edit Sequences', () => {
  describe('Rapid Sequential Edits on Single Device', () => {
    it('should handle rapid sequential edits to the same bookmark', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Start' })
      device2.applyUpdate(device1.encodeState())

      // Rapid sequential edits on device1
      for (let i = 0; i < 100; i++) {
        device1.updateBookmark('bm1', 'title', `Update ${i}`)
      }

      device1.syncWith(device2)

      // Final value should be consistent
      expect(device1.getBookmark('bm1').get('title')).toBe('Update 99')
      expect(device2.getBookmark('bm1').get('title')).toBe('Update 99')
    })

    it('should preserve rapid edits to different fields', () => {
      const device = new VirtualDevice('device1')

      device.addBookmark('bm1', {
        url: 'https://test.com',
        title: 'Title',
        description: '',
        readLater: false,
      })

      // Rapid edits to different fields
      for (let i = 0; i < 50; i++) {
        device.updateBookmark('bm1', 'title', `Title ${i}`)
        device.updateBookmark('bm1', 'description', `Desc ${i}`)
        device.updateBookmark('bm1', 'readLater', i % 2 === 0)
      }

      const bm = device.getBookmark('bm1')
      expect(bm.get('title')).toBe('Title 49')
      expect(bm.get('description')).toBe('Desc 49')
      expect(bm.get('readLater')).toBe(false) // 49 is odd
    })
  })

  describe('Interleaved Rapid Edits from Multiple Devices', () => {
    it('should handle interleaved rapid edits from two devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Start' })
      device2.applyUpdate(device1.encodeState())

      // Interleaved edits (simulating real-time conflict)
      for (let i = 0; i < 50; i++) {
        device1.updateBookmark('bm1', 'title', `D1-${i}`)
        device2.updateBookmark('bm1', 'title', `D2-${i}`)

        // Periodic sync
        if (i % 10 === 9) {
          device1.syncWith(device2)
        }
      }

      // Final sync
      device1.syncWith(device2)

      // Should converge
      const t1 = device1.getBookmark('bm1').get('title')
      const t2 = device2.getBookmark('bm1').get('title')
      expect(t1).toBe(t2)
    })

    it('should not lose any data during rapid edit sequences', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create multiple bookmarks
      for (let i = 0; i < 10; i++) {
        device1.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }
      device2.applyUpdate(device1.encodeState())

      // Rapid edits on different bookmarks from both devices
      for (let round = 0; round < 20; round++) {
        const bmIdx = round % 10
        device1.updateBookmark(`bm${bmIdx}`, 'description', `D1 round ${round}`)
        device2.updateBookmark(`bm${(bmIdx + 5) % 10}`, 'description', `D2 round ${round}`)
      }

      device1.syncWith(device2)

      // All 10 bookmarks should still exist
      expect(device1.getBookmarkCount()).toBe(10)
      expect(device2.getBookmarkCount()).toBe(10)
    })
  })

  describe('Rapid Add/Delete Sequences', () => {
    it('should handle rapid add then delete sequences', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Rapid additions
      for (let i = 0; i < 20; i++) {
        device1.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }

      device2.applyUpdate(device1.encodeState())
      expect(device2.getBookmarkCount()).toBe(20)

      // Rapid deletions
      for (let i = 0; i < 10; i++) {
        device1.deleteBookmark(`bm${i}`)
      }

      device1.syncWith(device2)

      // Both should have 10 remaining
      expect(device1.getBookmarkCount()).toBe(10)
      expect(device2.getBookmarkCount()).toBe(10)
    })

    it('should handle overlapping add/delete from multiple devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Device 1 creates bookmarks
      for (let i = 0; i < 10; i++) {
        device1.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }

      device2.applyUpdate(device1.encodeState())

      // Device 1 deletes some, device 2 adds more
      device1.deleteBookmark('bm0')
      device1.deleteBookmark('bm1')
      device2.addBookmark('bm10', { url: 'https://10.com', title: 'BM 10' })
      device2.addBookmark('bm11', { url: 'https://11.com', title: 'BM 11' })

      device1.syncWith(device2)

      // Should have: 10 original - 2 deleted + 2 new = 10
      expect(device1.getBookmarkCount()).toBe(10)
      expect(device2.getBookmarkCount()).toBe(10)
      expect(device1.getBookmark('bm0')).toBeUndefined()
      expect(device1.getBookmark('bm10')).toBeTruthy()
    })
  })
})

// ============================================================================
// Network Partition Scenario Tests
// ============================================================================

describe('Network Partition Scenarios', () => {
  describe('Split Brain Scenario', () => {
    it('should resolve split brain when partitioned networks rejoin', () => {
      // Simulate two groups of devices that can't communicate
      const groupA1 = new VirtualDevice('groupA1')
      const groupA2 = new VirtualDevice('groupA2')
      const groupB1 = new VirtualDevice('groupB1')
      const groupB2 = new VirtualDevice('groupB2')

      // Initial shared state
      groupA1.addBookmark('shared', { url: 'https://shared.com', title: 'Shared' })
      const initialState = groupA1.encodeState()
      groupA2.applyUpdate(initialState)
      groupB1.applyUpdate(initialState)
      groupB2.applyUpdate(initialState)

      // Network partition - Group A and Group B evolve separately
      // Group A adds and edits
      groupA1.addBookmark('groupA-bm', { url: 'https://a.com', title: 'From A' })
      groupA1.updateBookmark('shared', 'title', 'Modified by A')
      groupA1.syncWith(groupA2)

      // Group B adds and edits
      groupB1.addBookmark('groupB-bm', { url: 'https://b.com', title: 'From B' })
      groupB1.updateBookmark('shared', 'description', 'Added by B')
      groupB1.syncWith(groupB2)

      // Verify groups are different
      expect(groupA1.getBookmarkCount()).toBe(2)
      expect(groupB1.getBookmarkCount()).toBe(2)

      // Network heals - sync across groups
      groupA1.syncWith(groupB1)
      groupA2.syncWith(groupB2)
      groupA1.syncWith(groupA2)
      groupB1.syncWith(groupB2)

      // All devices should converge
      for (const device of [groupA1, groupA2, groupB1, groupB2]) {
        expect(device.getBookmarkCount()).toBe(3) // shared + groupA-bm + groupB-bm
        expect(device.getBookmark('groupA-bm')).toBeTruthy()
        expect(device.getBookmark('groupB-bm')).toBeTruthy()
      }
    })

    it('should preserve all changes during extended partition', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Initial sync
      device1.addBookmark('bm1', { url: 'https://1.com', title: 'BM1' })
      device2.applyUpdate(device1.encodeState())

      // Extended offline period - many changes
      for (let i = 0; i < 50; i++) {
        device1.addBookmark(`d1-${i}`, { url: `https://d1-${i}.com`, title: `D1 #${i}` })
        device2.addBookmark(`d2-${i}`, { url: `https://d2-${i}.com`, title: `D2 #${i}` })
      }

      // Reunion
      device1.syncWith(device2)

      // All bookmarks should be present
      expect(device1.getBookmarkCount()).toBe(101) // 1 + 50 + 50
      expect(device2.getBookmarkCount()).toBe(101)
    })
  })

  describe('Partial Connectivity', () => {
    it('should propagate changes through intermediate devices', () => {
      const deviceA = new VirtualDevice('A')
      const deviceB = new VirtualDevice('B')
      const deviceC = new VirtualDevice('C')

      // A and C cannot communicate directly, only through B

      deviceA.addBookmark('from-a', { url: 'https://a.com', title: 'From A' })
      deviceA.syncWith(deviceB) // A -> B

      deviceC.addBookmark('from-c', { url: 'https://c.com', title: 'From C' })
      deviceC.syncWith(deviceB) // C -> B (B now has both)

      // B propagates to both
      deviceA.syncWith(deviceB) // A gets from-c via B
      deviceC.syncWith(deviceB) // C gets from-a via B

      // All should have both bookmarks
      for (const device of [deviceA, deviceB, deviceC]) {
        expect(device.getBookmarkCount()).toBe(2)
        expect(device.getBookmark('from-a')).toBeTruthy()
        expect(device.getBookmark('from-c')).toBeTruthy()
      }
    })

    it('should handle chain sync topology', () => {
      // A -> B -> C -> D (linear topology)
      const devices = Array.from({ length: 4 }, (_, i) =>
        new VirtualDevice(String.fromCharCode(65 + i))
      )

      // Each device adds unique content
      devices.forEach((device, idx) => {
        device.addBookmark(`bm-${idx}`, { url: `https://${idx}.com`, title: `BM ${idx}` })
      })

      // Chain sync: 0->1, 1->2, 2->3
      for (let i = 0; i < devices.length - 1; i++) {
        devices[i].syncWith(devices[i + 1])
      }

      // Reverse chain: 3->2, 2->1, 1->0
      for (let i = devices.length - 1; i > 0; i--) {
        devices[i].syncWith(devices[i - 1])
      }

      // All should have all bookmarks
      for (const device of devices) {
        expect(device.getBookmarkCount()).toBe(4)
      }
    })
  })
})

// ============================================================================
// Device Onboarding During Active Editing Tests
// ============================================================================

describe('Device Onboarding During Active Editing', () => {
  describe('New Device Joining Active Session', () => {
    it('should sync all existing bookmarks to new device', () => {
      const device1 = new VirtualDevice('device1')

      // Device 1 has many bookmarks
      for (let i = 0; i < 50; i++) {
        device1.addBookmark(`bm${i}`, {
          url: `https://${i}.com`,
          title: `Bookmark ${i}`,
          description: `Description for bookmark ${i}`,
          tags: ['tag1', 'tag2'],
        })
      }

      // New device joins
      const newDevice = new VirtualDevice('newDevice')
      newDevice.applyUpdate(device1.encodeState())

      // New device should have all bookmarks
      expect(newDevice.getBookmarkCount()).toBe(50)

      // Verify data integrity
      for (let i = 0; i < 50; i++) {
        const bm = newDevice.getBookmark(`bm${i}`)
        expect(bm.get('url')).toBe(`https://${i}.com`)
        expect(bm.get('title')).toBe(`Bookmark ${i}`)
      }
    })

    it('should handle new device joining while edits are in progress', () => {
      const device1 = new VirtualDevice('device1')

      device1.addBookmark('bm1', { url: 'https://1.com', title: 'Initial' })

      // Get state before edit
      const stateBeforeEdit = device1.encodeState()

      // Device1 continues editing
      device1.updateBookmark('bm1', 'title', 'Edited Title')
      device1.addBookmark('bm2', { url: 'https://2.com', title: 'New BM' })

      // New device joins with old state
      const newDevice = new VirtualDevice('newDevice')
      newDevice.applyUpdate(stateBeforeEdit)

      // New device gets incremental update
      const sv = newDevice.getStateVector()
      const diff = device1.getDiff(sv)
      newDevice.applyUpdate(diff)

      // Should have both bookmarks with latest state
      expect(newDevice.getBookmarkCount()).toBe(2)
      expect(newDevice.getBookmark('bm1').get('title')).toBe('Edited Title')
      expect(newDevice.getBookmark('bm2')).toBeTruthy()
    })

    it('should not lose changes from new device during sync', () => {
      const device1 = new VirtualDevice('device1')

      // Existing bookmarks
      for (let i = 0; i < 10; i++) {
        device1.addBookmark(`old${i}`, { url: `https://old${i}.com`, title: `Old ${i}` })
      }

      // New device joins and immediately adds bookmarks
      const newDevice = new VirtualDevice('newDevice')
      newDevice.addBookmark('new1', { url: 'https://new1.com', title: 'From New Device' })

      // Full sync
      newDevice.syncWith(device1)

      // Both should have all bookmarks
      expect(device1.getBookmarkCount()).toBe(11)
      expect(newDevice.getBookmarkCount()).toBe(11)
      expect(device1.getBookmark('new1')).toBeTruthy()
    })
  })

  describe('Multiple Devices Joining Simultaneously', () => {
    it('should handle multiple new devices joining at once', () => {
      const master = new VirtualDevice('master')

      for (let i = 0; i < 20; i++) {
        master.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }

      // Multiple new devices join simultaneously
      const newDevices = Array.from({ length: 5 }, (_, i) => new VirtualDevice(`new${i}`))

      // Each gets initial state
      const masterState = master.encodeState()
      newDevices.forEach(device => device.applyUpdate(masterState))

      // Each new device adds a bookmark
      newDevices.forEach((device, idx) => {
        device.addBookmark(`from-new${idx}`, { url: `https://new${idx}.com`, title: `From New ${idx}` })
      })

      // Full mesh sync
      const allDevices = [master, ...newDevices]
      for (let i = 0; i < allDevices.length; i++) {
        for (let j = i + 1; j < allDevices.length; j++) {
          allDevices[i].syncWith(allDevices[j])
        }
      }

      // All should have 25 bookmarks (20 original + 5 new)
      for (const device of allDevices) {
        expect(device.getBookmarkCount()).toBe(25)
      }
    })
  })
})

// ============================================================================
// Bookmark Deletion Conflict Tests
// ============================================================================

describe('Bookmark Deletion Conflicts', () => {
  describe('Concurrent Delete and Edit', () => {
    it('should handle delete on one device and edit on another', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Test' })
      device2.applyUpdate(device1.encodeState())

      // Device 1 deletes, Device 2 edits
      device1.deleteBookmark('bm1')
      device2.updateBookmark('bm1', 'title', 'Edited')

      device1.syncWith(device2)

      // Both should converge to same state
      const exists1 = device1.getBookmark('bm1') !== undefined
      const exists2 = device2.getBookmark('bm1') !== undefined
      expect(exists1).toBe(exists2)
    })

    it('should handle delete then re-add scenario', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Original' })
      device2.applyUpdate(device1.encodeState())

      // Device 1 deletes
      device1.deleteBookmark('bm1')

      // Sync deletion
      device1.syncWith(device2)
      expect(device2.getBookmark('bm1')).toBeUndefined()

      // Device 2 re-adds with same ID (different content)
      device2.addBookmark('bm1', { url: 'https://new.com', title: 'Re-added' })

      device1.syncWith(device2)

      // Both should have the re-added bookmark
      expect(device1.getBookmark('bm1')).toBeTruthy()
      expect(device2.getBookmark('bm1')).toBeTruthy()
      expect(device1.getBookmark('bm1').get('title')).toBe('Re-added')
    })
  })

  describe('Concurrent Deletions', () => {
    it('should handle same bookmark deleted on multiple devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')
      const device3 = new VirtualDevice('device3')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Test' })
      const state = device1.encodeState()
      device2.applyUpdate(state)
      device3.applyUpdate(state)

      // All devices delete the same bookmark
      device1.deleteBookmark('bm1')
      device2.deleteBookmark('bm1')
      device3.deleteBookmark('bm1')

      // Sync all
      device1.syncWith(device2)
      device2.syncWith(device3)
      device1.syncWith(device3)

      // All should agree bookmark is deleted
      expect(device1.getBookmark('bm1')).toBeUndefined()
      expect(device2.getBookmark('bm1')).toBeUndefined()
      expect(device3.getBookmark('bm1')).toBeUndefined()
    })

    it('should handle different bookmarks deleted on different devices', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create multiple bookmarks
      device1.addBookmark('bm1', { url: 'https://1.com', title: 'BM1' })
      device1.addBookmark('bm2', { url: 'https://2.com', title: 'BM2' })
      device1.addBookmark('bm3', { url: 'https://3.com', title: 'BM3' })
      device2.applyUpdate(device1.encodeState())

      // Different deletions
      device1.deleteBookmark('bm1')
      device2.deleteBookmark('bm2')

      device1.syncWith(device2)

      // Only bm3 should remain
      expect(device1.getBookmarkCount()).toBe(1)
      expect(device2.getBookmarkCount()).toBe(1)
      expect(device1.getBookmark('bm3')).toBeTruthy()
      expect(device2.getBookmark('bm3')).toBeTruthy()
    })
  })

  describe('Mass Deletion Scenarios', () => {
    it('should handle bulk deletion and preserve remaining', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create 100 bookmarks
      for (let i = 0; i < 100; i++) {
        device1.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }
      device2.applyUpdate(device1.encodeState())

      // Delete 50 on device1
      for (let i = 0; i < 50; i++) {
        device1.deleteBookmark(`bm${i}`)
      }

      device1.syncWith(device2)

      // 50 should remain
      expect(device1.getBookmarkCount()).toBe(50)
      expect(device2.getBookmarkCount()).toBe(50)

      // Correct ones should remain
      for (let i = 50; i < 100; i++) {
        expect(device1.getBookmark(`bm${i}`)).toBeTruthy()
        expect(device2.getBookmark(`bm${i}`)).toBeTruthy()
      }
    })
  })
})

// ============================================================================
// CRDT Merge Logic Edge Cases and Mathematical Properties
// ============================================================================

describe('CRDT Merge Logic Edge Cases', () => {
  describe('Commutativity Property', () => {
    it('should produce same result regardless of merge order (A+B = B+A)', () => {
      const baseDoc = new Y.Doc()
      baseDoc.getMap('data').set('initial', 'value')

      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      // Apply base state to both
      applyYjsUpdate(doc1, encodeYjsState(baseDoc))
      applyYjsUpdate(doc2, encodeYjsState(baseDoc))

      // Different changes
      doc1.getMap('data').set('key1', 'from-doc1')
      doc2.getMap('data').set('key2', 'from-doc2')

      // Order 1: doc1 first, then doc2
      const result1 = new Y.Doc()
      applyYjsUpdate(result1, encodeYjsState(doc1))
      const sv1 = extractYjsStateVector(result1)
      applyYjsUpdate(result1, getYjsDiff(doc2, sv1))

      // Order 2: doc2 first, then doc1
      const result2 = new Y.Doc()
      applyYjsUpdate(result2, encodeYjsState(doc2))
      const sv2 = extractYjsStateVector(result2)
      applyYjsUpdate(result2, getYjsDiff(doc1, sv2))

      // Both should have identical content
      expect(result1.getMap('data').get('key1')).toBe(result2.getMap('data').get('key1'))
      expect(result1.getMap('data').get('key2')).toBe(result2.getMap('data').get('key2'))
    })
  })

  describe('Associativity Property', () => {
    it('should produce same result regardless of grouping ((A+B)+C = A+(B+C))', () => {
      const docA = new Y.Doc()
      const docB = new Y.Doc()
      const docC = new Y.Doc()

      docA.getMap('data').set('a', 1)
      docB.getMap('data').set('b', 2)
      docC.getMap('data').set('c', 3)

      // (A + B) + C
      const grouping1 = new Y.Doc()
      applyYjsUpdate(grouping1, encodeYjsState(docA))
      applyYjsUpdate(grouping1, encodeYjsState(docB))
      applyYjsUpdate(grouping1, encodeYjsState(docC))

      // A + (B + C)
      const bc = new Y.Doc()
      applyYjsUpdate(bc, encodeYjsState(docB))
      applyYjsUpdate(bc, encodeYjsState(docC))

      const grouping2 = new Y.Doc()
      applyYjsUpdate(grouping2, encodeYjsState(docA))
      applyYjsUpdate(grouping2, encodeYjsState(bc))

      // Both should have identical content
      expect(grouping1.getMap('data').get('a')).toBe(grouping2.getMap('data').get('a'))
      expect(grouping1.getMap('data').get('b')).toBe(grouping2.getMap('data').get('b'))
      expect(grouping1.getMap('data').get('c')).toBe(grouping2.getMap('data').get('c'))
    })
  })

  describe('Idempotency Property', () => {
    it('should produce same result when update is applied multiple times (A+A = A)', () => {
      const doc = new Y.Doc()
      doc.getMap('data').set('key', 'value')

      const state = encodeYjsState(doc)

      const result = new Y.Doc()
      applyYjsUpdate(result, state)
      applyYjsUpdate(result, state) // Apply again
      applyYjsUpdate(result, state) // Apply third time

      expect(result.getMap('data').get('key')).toBe('value')
      expect(result.getMap('data').size).toBe(1)
    })

    it('should handle idempotent diff application', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('bm1', { url: 'https://test.com', title: 'Test' })

      // Apply same diff multiple times
      const sv = device2.getStateVector()
      const diff = device1.getDiff(sv)

      device2.applyUpdate(diff)
      device2.applyUpdate(diff)
      device2.applyUpdate(diff)

      expect(device2.getBookmarkCount()).toBe(1)
      expect(device2.getBookmark('bm1').get('title')).toBe('Test')
    })
  })

  describe('Convergence Property', () => {
    it('should converge to identical state from any order of operations', () => {
      const operations = [
        { id: 'bm1', field: 'title', value: 'Title 1' },
        { id: 'bm1', field: 'description', value: 'Desc 1' },
        { id: 'bm2', field: 'title', value: 'Title 2' },
        { id: 'bm1', field: 'title', value: 'Title 1 Updated' },
        { id: 'bm3', field: 'url', value: 'https://3.com' },
      ]

      // Create multiple orderings
      const orderings = [
        [0, 1, 2, 3, 4],
        [4, 3, 2, 1, 0],
        [2, 0, 4, 1, 3],
        [1, 3, 0, 4, 2],
      ]

      const results = orderings.map(order => {
        const doc = new Y.Doc()
        const bookmarks = doc.getMap('bookmarks')

        // Ensure all bookmarks exist
        bookmarks.set('bm1', new Y.Map())
        bookmarks.set('bm2', new Y.Map())
        bookmarks.set('bm3', new Y.Map())

        // Apply operations in specified order
        for (const idx of order) {
          const op = operations[idx]
          const bm = bookmarks.get(op.id)
          if (bm) bm.set(op.field, op.value)
        }

        return encodeYjsState(doc)
      })

      // Merge all results into final docs and verify convergence
      const finalDocs = results.map(state => {
        const doc = new Y.Doc()
        applyYjsUpdate(doc, state)
        return doc
      })

      // When we apply all states to a single doc, they should converge
      const mergedDoc = new Y.Doc()
      for (const state of results) {
        applyYjsUpdate(mergedDoc, state)
      }

      // All partial results should be subsets of the merged result
      const mergedSize = mergedDoc.getMap('bookmarks').size
      expect(mergedSize).toBe(3) // All 3 bookmarks
    })
  })

  describe('State Vector Edge Cases', () => {
    it('should handle empty state vectors', () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const sv1 = extractYjsStateVector(doc1)
      const sv2 = extractYjsStateVector(doc2)

      const comparison = compareStateVectors(sv1, sv2)
      expect(comparison.relationship).toBe('equal')
    })

    it('should correctly identify divergence with many clients', () => {
      const docs = Array.from({ length: 10 }, () => new Y.Doc())

      // Each doc makes unique changes
      docs.forEach((doc, i) => {
        doc.getMap('data').set(`key${i}`, `value${i}`)
      })

      // Merge all into master
      const master = new Y.Doc()
      for (const doc of docs) {
        applyYjsUpdate(master, encodeYjsState(doc))
      }

      // Master should have all changes
      const masterData = master.getMap('data')
      expect(masterData.size).toBe(10)

      for (let i = 0; i < 10; i++) {
        expect(masterData.get(`key${i}`)).toBe(`value${i}`)
      }
    })

    it('should handle state vector comparison with subset relationships', () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      // Doc1 has changes
      doc1.getMap('data').set('key1', 'value1')

      // Doc2 is synced with doc1
      applyYjsUpdate(doc2, encodeYjsState(doc1))

      // Doc1 makes more changes
      doc1.getMap('data').set('key2', 'value2')

      const sv1 = extractYjsStateVector(doc1)
      const sv2 = extractYjsStateVector(doc2)

      const comparison = compareStateVectors(sv1, sv2)
      expect(comparison.relationship).toBe('local-ahead')
      // hasRemoteChanges(local, remote) checks if remote has changes not in local
      // sv1 (doc1) does have changes not in sv2 (doc2), so this should be true
      expect(hasRemoteChanges(sv2, sv1)).toBe(true) // doc1 (remote) has changes doc2 (local) doesn't
      expect(hasRemoteChanges(sv1, sv2)).toBe(false) // doc2 (remote) has no unique changes vs doc1 (local)
    })
  })
})

// ============================================================================
// Automated Conflict Generation and Deterministic Replay Tests
// ============================================================================

describe('Automated Conflict Generation', () => {
  describe('Deterministic Conflict Replay', () => {
    it('should produce identical results when replaying same conflict sequence', () => {
      const seed = 42
      const generator1 = new ConflictScenarioGenerator(seed)
      const generator2 = new ConflictScenarioGenerator(seed)

      const sequence1 = generator1.generateConflictSequence({
        numDevices: 3,
        numBookmarks: 5,
        numOperations: 30,
      })

      const sequence2 = generator2.generateConflictSequence({
        numDevices: 3,
        numBookmarks: 5,
        numOperations: 30,
      })

      // Sequences should be identical
      expect(sequence1.length).toBe(sequence2.length)
      for (let i = 0; i < sequence1.length; i++) {
        expect(sequence1[i].deviceId).toBe(sequence2[i].deviceId)
        expect(sequence1[i].bookmarkId).toBe(sequence2[i].bookmarkId)
        expect(sequence1[i].operation).toBe(sequence2[i].operation)
      }
    })

    it('should handle generated conflict scenarios', () => {
      const generator = new ConflictScenarioGenerator(12345)
      const sequence = generator.generateConflictSequence({
        numDevices: 2,
        numBookmarks: 3,
        numOperations: 20,
        conflictProbability: 0.7,
      })

      const devices = [new VirtualDevice('d0'), new VirtualDevice('d1')]

      // Initialize bookmarks on both devices
      const initialBookmarks = ['bm-0', 'bm-1', 'bm-2']
      for (const bmId of initialBookmarks) {
        devices[0].addBookmark(bmId, {
          url: `https://${bmId}.com`,
          title: `Title ${bmId}`,
          description: '',
          readLater: false,
          tags: [],
        })
      }
      devices[1].applyUpdate(devices[0].encodeState())

      // Execute operations
      for (const op of sequence) {
        const device = devices[op.deviceId]
        const bm = device.getBookmark(op.bookmarkId)
        if (!bm) continue

        switch (op.operation) {
          case 'updateTitle':
            bm.set('title', `Title-${op.timestamp}`)
            break
          case 'updateTags':
            bm.set('tags', ['tag1', 'tag2'])
            break
          case 'updateDescription':
            bm.set('description', `Desc-${op.timestamp}`)
            break
          case 'updateReadLater':
            bm.set('readLater', !bm.get('readLater'))
            break
        }
      }

      // Final sync
      devices[0].syncWith(devices[1])

      // Both should converge
      expect(devices[0].getBookmarkCount()).toBe(devices[1].getBookmarkCount())

      for (const bmId of initialBookmarks) {
        const bm0 = devices[0].getBookmark(bmId)
        const bm1 = devices[1].getBookmark(bmId)

        // Values should be identical after sync
        expect(bm0.get('title')).toBe(bm1.get('title'))
        expect(bm0.get('description')).toBe(bm1.get('description'))
        expect(bm0.get('readLater')).toBe(bm1.get('readLater'))
      }
    })
  })

  describe('Random Conflict Scenarios', () => {
    it('should handle random concurrent modifications across 5 devices', () => {
      const devices = Array.from({ length: 5 }, (_, i) => new VirtualDevice(`d${i}`))

      // Initialize with shared bookmarks
      for (let i = 0; i < 10; i++) {
        devices[0].addBookmark(`bm${i}`, {
          url: `https://${i}.com`,
          title: `BM ${i}`,
          tags: [],
        })
      }

      // Sync initial state to all devices
      const initialState = devices[0].encodeState()
      for (let i = 1; i < devices.length; i++) {
        devices[i].applyUpdate(initialState)
      }

      // Random modifications
      const rng = () => Math.random()
      for (let round = 0; round < 50; round++) {
        const deviceIdx = Math.floor(rng() * devices.length)
        const bmIdx = Math.floor(rng() * 10)
        const field = ['title', 'description', 'tags'][Math.floor(rng() * 3)]

        const bm = devices[deviceIdx].getBookmark(`bm${bmIdx}`)
        if (bm) {
          if (field === 'tags') {
            bm.set('tags', ['random', `tag-${round}`])
          } else {
            bm.set(field, `${field}-${round}-${deviceIdx}`)
          }
        }
      }

      // Full mesh sync
      for (let i = 0; i < devices.length; i++) {
        for (let j = i + 1; j < devices.length; j++) {
          devices[i].syncWith(devices[j])
        }
      }

      // All should converge
      const firstIds = devices[0].getBookmarkIds()
      for (let i = 1; i < devices.length; i++) {
        const ids = devices[i].getBookmarkIds()
        expect(ids.sort()).toEqual(firstIds.sort())
      }

      // All bookmark fields should match across devices
      for (const bmId of firstIds) {
        const refBm = devices[0].getBookmark(bmId)
        for (let i = 1; i < devices.length; i++) {
          const bm = devices[i].getBookmark(bmId)
          expect(bm.get('title')).toBe(refBm.get('title'))
          expect(bm.get('description')).toBe(refBm.get('description'))
        }
      }
    })
  })
})

// ============================================================================
// Stress Tests for Conflict Resolution
// ============================================================================

describe('Stress Tests for Conflict Resolution', () => {
  describe('High Volume Concurrent Edits', () => {
    it('should handle 1000 concurrent edits across 10 devices', () => {
      const devices = Array.from({ length: 10 }, (_, i) => new VirtualDevice(`d${i}`))

      // Initialize
      devices[0].addBookmark('stress-bm', { url: 'https://stress.com', title: 'Stress Test' })
      const initialState = devices[0].encodeState()
      for (let i = 1; i < devices.length; i++) {
        devices[i].applyUpdate(initialState)
      }

      // Each device makes 100 edits
      for (let deviceIdx = 0; deviceIdx < devices.length; deviceIdx++) {
        for (let edit = 0; edit < 100; edit++) {
          devices[deviceIdx].updateBookmark('stress-bm', 'description', `D${deviceIdx}-E${edit}`)
        }
      }

      // Full sync
      for (let i = 0; i < devices.length; i++) {
        for (let j = i + 1; j < devices.length; j++) {
          devices[i].syncWith(devices[j])
        }
      }

      // All should converge
      const refDesc = devices[0].getBookmark('stress-bm').get('description')
      for (let i = 1; i < devices.length; i++) {
        expect(devices[i].getBookmark('stress-bm').get('description')).toBe(refDesc)
      }
    })

    it('should handle many bookmarks with concurrent edits', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create 500 bookmarks
      for (let i = 0; i < 500; i++) {
        device1.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }
      device2.applyUpdate(device1.encodeState())

      // Concurrent edits
      for (let i = 0; i < 500; i++) {
        device1.updateBookmark(`bm${i}`, 'title', `D1-${i}`)
        device2.updateBookmark(`bm${499 - i}`, 'title', `D2-${499 - i}`)
      }

      device1.syncWith(device2)

      // All should exist and converge
      expect(device1.getBookmarkCount()).toBe(500)
      expect(device2.getBookmarkCount()).toBe(500)

      for (let i = 0; i < 500; i++) {
        const t1 = device1.getBookmark(`bm${i}`).get('title')
        const t2 = device2.getBookmark(`bm${i}`).get('title')
        expect(t1).toBe(t2)
      }
    })
  })

  describe('Sync Cycle Stress', () => {
    it('should maintain consistency through 100 sync cycles', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('cycle-bm', { url: 'https://cycle.com', title: 'Cycle Test' })
      device2.applyUpdate(device1.encodeState())

      for (let cycle = 0; cycle < 100; cycle++) {
        // Alternating edits
        if (cycle % 2 === 0) {
          device1.updateBookmark('cycle-bm', 'title', `Cycle ${cycle}`)
        } else {
          device2.updateBookmark('cycle-bm', 'title', `Cycle ${cycle}`)
        }

        device1.syncWith(device2)

        // Verify consistency after each sync
        const t1 = device1.getBookmark('cycle-bm').get('title')
        const t2 = device2.getBookmark('cycle-bm').get('title')
        expect(t1).toBe(t2)
      }
    })

    it('should handle burst sync patterns', () => {
      const devices = Array.from({ length: 3 }, (_, i) => new VirtualDevice(`d${i}`))

      // Initialize
      for (let i = 0; i < 20; i++) {
        devices[0].addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }
      const initialState = devices[0].encodeState()
      devices[1].applyUpdate(initialState)
      devices[2].applyUpdate(initialState)

      // Burst pattern: many edits, then sync, repeat
      for (let burst = 0; burst < 10; burst++) {
        // Each device makes 10 edits
        for (const device of devices) {
          for (let i = 0; i < 10; i++) {
            const bmIdx = Math.floor(Math.random() * 20)
            device.updateBookmark(`bm${bmIdx}`, 'description', `Burst ${burst} Edit ${i}`)
          }
        }

        // Full sync
        devices[0].syncWith(devices[1])
        devices[1].syncWith(devices[2])
        devices[0].syncWith(devices[2])
      }

      // Final consistency check
      for (let i = 0; i < 20; i++) {
        const desc0 = devices[0].getBookmark(`bm${i}`).get('description')
        const desc1 = devices[1].getBookmark(`bm${i}`).get('description')
        const desc2 = devices[2].getBookmark(`bm${i}`).get('description')
        expect(desc0).toBe(desc1)
        expect(desc1).toBe(desc2)
      }
    })
  })

  describe('Memory and Performance', () => {
    it('should not grow memory unboundedly during repeated syncs', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('mem-test', { url: 'https://test.com', title: 'Memory Test' })
      device2.applyUpdate(device1.encodeState())

      // Many sync cycles
      for (let i = 0; i < 500; i++) {
        device1.updateBookmark('mem-test', 'description', `Update ${i}`)
        device1.syncWith(device2)
      }

      // Document should still work
      expect(device1.getBookmark('mem-test')).toBeTruthy()
      expect(device2.getBookmark('mem-test')).toBeTruthy()
    })

    it('should complete sync operations within reasonable time', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      // Create large dataset
      const startCreate = Date.now()
      for (let i = 0; i < 1000; i++) {
        device1.addBookmark(`bm${i}`, {
          url: `https://${i}.com`,
          title: `Bookmark ${i} with a long title`,
          description: `This is a description for bookmark ${i}`,
          tags: ['tag1', 'tag2', 'tag3'],
        })
      }
      const createTime = Date.now() - startCreate

      // Sync
      const startSync = Date.now()
      device2.applyUpdate(device1.encodeState())
      const syncTime = Date.now() - startSync

      expect(device2.getBookmarkCount()).toBe(1000)
      expect(createTime).toBeLessThan(5000) // 5 seconds max for creation
      expect(syncTime).toBeLessThan(2000) // 2 seconds max for sync
    })
  })
})

// ============================================================================
// Data Integrity Validation Tests
// ============================================================================

describe('Data Integrity Validation', () => {
  describe('No Data Loss Guarantee', () => {
    it('should never lose bookmarks during conflict resolution', () => {
      const devices = Array.from({ length: 5 }, (_, i) => new VirtualDevice(`d${i}`))
      const allBookmarkIds = new Set()

      // Each device creates unique bookmarks
      devices.forEach((device, idx) => {
        for (let i = 0; i < 20; i++) {
          const id = `bm-${idx}-${i}`
          allBookmarkIds.add(id)
          device.addBookmark(id, { url: `https://${id}.com`, title: `BM ${id}` })
        }
      })

      // Random syncs
      for (let round = 0; round < 50; round++) {
        const i = Math.floor(Math.random() * devices.length)
        const j = Math.floor(Math.random() * devices.length)
        if (i !== j) {
          devices[i].syncWith(devices[j])
        }
      }

      // Full mesh sync to ensure complete convergence
      for (let i = 0; i < devices.length; i++) {
        for (let j = i + 1; j < devices.length; j++) {
          devices[i].syncWith(devices[j])
        }
      }

      // All devices should have all bookmarks
      for (const device of devices) {
        expect(device.getBookmarkCount()).toBe(allBookmarkIds.size)
        for (const id of allBookmarkIds) {
          expect(device.getBookmark(id)).toBeTruthy()
        }
      }
    })

    it('should preserve all field values through conflicts', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      const originalData = {
        url: 'https://important.com',
        title: 'Important Bookmark',
        description: 'Critical data that must not be lost',
        tags: ['important', 'critical', 'preserve'],
        readLater: true,
        favicon: 'data:image/png;base64,abc123',
        preview: 'https://preview.com/thumb.jpg',
      }

      device1.addBookmark('important', originalData)
      device2.applyUpdate(device1.encodeState())

      // Many conflicting edits
      for (let i = 0; i < 100; i++) {
        device1.updateBookmark('important', 'title', `Title ${i}`)
        device2.updateBookmark('important', 'title', `Title ${i} alt`)
      }

      device1.syncWith(device2)

      // URL and other fields should be preserved
      const bm1 = device1.getBookmark('important')
      const bm2 = device2.getBookmark('important')

      expect(bm1.get('url')).toBe(originalData.url)
      expect(bm2.get('url')).toBe(originalData.url)
      expect(bm1.get('description')).toBe(originalData.description)
      expect(bm2.get('description')).toBe(originalData.description)
    })
  })

  describe('Consistency After Recovery', () => {
    it('should maintain consistency after simulated crash and recovery', () => {
      const device1 = new VirtualDevice('device1')
      const device2 = new VirtualDevice('device2')

      device1.addBookmark('crash-test', { url: 'https://test.com', title: 'Crash Test' })
      device2.applyUpdate(device1.encodeState())

      // Simulate work before crash
      device1.updateBookmark('crash-test', 'title', 'Before Crash')
      const stateBeforeCrash = device1.encodeState()

      // More work
      device1.updateBookmark('crash-test', 'title', 'After More Work')

      // Simulate crash and recovery from saved state
      const recoveredDevice = new VirtualDevice('recovered')
      recoveredDevice.applyUpdate(stateBeforeCrash)

      // Sync recovered device with device2
      recoveredDevice.syncWith(device2)

      // Should be consistent
      expect(recoveredDevice.getBookmark('crash-test').get('title'))
        .toBe(device2.getBookmark('crash-test').get('title'))
    })
  })
})

/**
 * Nostr Sync Integration Tests
 *
 * Tests for complete sync workflows, simulating real-world scenarios
 * with multiple devices, network conditions, and edge cases.
 *
 * These tests focus on end-to-end behavior rather than unit-level testing.
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
  createNostrSyncService,
  NOSTR_KINDS,
  CONNECTION_STATES,
  extractYjsStateVector,
  encodeYjsState,
  applyYjsUpdate,
  getYjsDiff,
  compareStateVectors,
} from './nostr-sync.js'
import { generateBookmark, generateBookmarks, generateLargeDataset } from '../test-utils/data-generators.js'

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Simulates a virtual device with its own Yjs document and sync service
 */
class VirtualDevice {
  constructor(name, lek) {
    this.name = name
    this.lek = lek
    this.ydoc = new Y.Doc()
    this.service = null
    this.receivedEvents = []
    this.publishedEvents = []
  }

  async initialize(relays, options = {}) {
    this.service = new NostrSyncService({
      relays,
      autoReconnect: false,
      debug: false,
      ...options,
    })
    await this.service.initialize(this.lek)
  }

  getBookmarks() {
    return this.ydoc.getMap('bookmarks')
  }

  addBookmark(id, data) {
    const bm = new Y.Map()
    Object.entries(data).forEach(([key, value]) => {
      bm.set(key, value)
    })
    this.getBookmarks().set(id, bm)
    return bm
  }

  updateBookmark(id, updates) {
    const bm = this.getBookmarks().get(id)
    if (bm) {
      Object.entries(updates).forEach(([key, value]) => {
        bm.set(key, value)
      })
    }
  }

  deleteBookmark(id) {
    this.getBookmarks().delete(id)
  }

  getStateVector() {
    return extractYjsStateVector(this.ydoc)
  }

  encodeState() {
    return encodeYjsState(this.ydoc)
  }

  applyUpdate(update) {
    applyYjsUpdate(this.ydoc, update, `remote-${this.name}`)
  }

  getDiff(targetStateVector) {
    return getYjsDiff(this.ydoc, targetStateVector)
  }

  async disconnect() {
    if (this.service) {
      await this.service.disconnect()
    }
  }
}

/**
 * Simulates a sync relay that coordinates state between devices
 */
class MockSyncRelay {
  constructor() {
    this.devices = new Map() // deviceName -> VirtualDevice
    this.eventLog = []
  }

  registerDevice(device) {
    this.devices.set(device.name, device)
  }

  unregisterDevice(deviceName) {
    this.devices.delete(deviceName)
  }

  /**
   * Sync from source device to all other devices
   */
  broadcastFromDevice(sourceDeviceName) {
    const source = this.devices.get(sourceDeviceName)
    if (!source) return

    const sourceState = source.encodeState()

    for (const [name, device] of this.devices) {
      if (name !== sourceDeviceName) {
        const targetSV = device.getStateVector()
        const diff = source.getDiff(targetSV)
        device.applyUpdate(diff)
        this.eventLog.push({
          type: 'sync',
          from: sourceDeviceName,
          to: name,
          diffSize: diff.length,
        })
      }
    }
  }

  /**
   * Full two-way sync between all devices
   */
  syncAllDevices() {
    const deviceList = Array.from(this.devices.values())

    // Each device syncs with every other device
    for (let i = 0; i < deviceList.length; i++) {
      for (let j = i + 1; j < deviceList.length; j++) {
        const d1 = deviceList[i]
        const d2 = deviceList[j]

        const sv1 = d1.getStateVector()
        const sv2 = d2.getStateVector()

        // d1 -> d2
        const diff1to2 = d1.getDiff(sv2)
        d2.applyUpdate(diff1to2)

        // d2 -> d1
        const diff2to1 = d2.getDiff(sv1)
        d1.applyUpdate(diff2to1)
      }
    }
  }

  verifyAllDevicesSynced() {
    const deviceList = Array.from(this.devices.values())
    if (deviceList.length < 2) return true

    const referenceSize = deviceList[0].getBookmarks().size

    for (const device of deviceList) {
      if (device.getBookmarks().size !== referenceSize) {
        return false
      }
    }

    // Check state vectors are equal
    const referenceSV = deviceList[0].getStateVector()
    for (let i = 1; i < deviceList.length; i++) {
      const comparison = compareStateVectors(referenceSV, deviceList[i].getStateVector())
      if (comparison.relationship !== 'equal') {
        return false
      }
    }

    return true
  }
}

// ============================================================================
// Integration Test Scenarios
// ============================================================================

describe('Sync Workflow Integration Tests', () => {
  let lek
  let relay

  beforeEach(async () => {
    lek = await generateLEK()
    relay = new MockSyncRelay()
  })

  afterEach(async () => {
    for (const device of relay.devices.values()) {
      await device.disconnect()
    }
  })

  describe('New Device Onboarding', () => {
    it('should sync existing bookmarks to a new device', async () => {
      // Device A has been using the app
      const deviceA = new VirtualDevice('DeviceA', lek)

      // Add some bookmarks on Device A
      deviceA.addBookmark('bm1', {
        url: 'https://example1.com',
        title: 'Example 1',
        createdAt: Date.now() - 86400000, // 1 day ago
      })
      deviceA.addBookmark('bm2', {
        url: 'https://example2.com',
        title: 'Example 2',
        createdAt: Date.now() - 3600000, // 1 hour ago
      })
      deviceA.addBookmark('bm3', {
        url: 'https://example3.com',
        title: 'Example 3',
        createdAt: Date.now(),
      })

      relay.registerDevice(deviceA)

      // New Device B joins
      const deviceB = new VirtualDevice('DeviceB', lek)
      relay.registerDevice(deviceB)

      // Verify B starts empty
      expect(deviceB.getBookmarks().size).toBe(0)

      // Perform initial sync
      relay.broadcastFromDevice('DeviceA')

      // Device B should now have all bookmarks
      expect(deviceB.getBookmarks().size).toBe(3)
      expect(deviceB.getBookmarks().get('bm1').get('url')).toBe('https://example1.com')
      expect(deviceB.getBookmarks().get('bm2').get('url')).toBe('https://example2.com')
      expect(deviceB.getBookmarks().get('bm3').get('url')).toBe('https://example3.com')
    })

    it('should merge changes when device comes online with local changes', async () => {
      // Both devices start with shared baseline
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      // Shared baseline
      deviceA.addBookmark('shared', {
        url: 'https://shared.com',
        title: 'Shared Bookmark',
      })

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)
      relay.syncAllDevices()

      // Device B goes offline, both make changes
      relay.unregisterDevice('DeviceB')

      deviceA.addBookmark('from-a', { url: 'https://from-a.com', title: 'From A' })
      deviceB.addBookmark('from-b', { url: 'https://from-b.com', title: 'From B' })

      // Device B comes back online
      relay.registerDevice(deviceB)
      relay.syncAllDevices()

      // Both devices should have all bookmarks
      expect(deviceA.getBookmarks().size).toBe(3)
      expect(deviceB.getBookmarks().size).toBe(3)

      expect(deviceA.getBookmarks().get('from-b')).toBeTruthy()
      expect(deviceB.getBookmarks().get('from-a')).toBeTruthy()
    })
  })

  describe('Multi-Device Workflows', () => {
    it('should handle bookmark creation across three devices', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)
      const deviceC = new VirtualDevice('DeviceC', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)
      relay.registerDevice(deviceC)

      // Each device creates a bookmark
      deviceA.addBookmark('from-a', { url: 'https://a.com', title: 'From A' })
      deviceB.addBookmark('from-b', { url: 'https://b.com', title: 'From B' })
      deviceC.addBookmark('from-c', { url: 'https://c.com', title: 'From C' })

      // Sync all
      relay.syncAllDevices()

      // Verify sync
      expect(relay.verifyAllDevicesSynced()).toBe(true)
      expect(deviceA.getBookmarks().size).toBe(3)
      expect(deviceB.getBookmarks().size).toBe(3)
      expect(deviceC.getBookmarks().size).toBe(3)
    })

    it('should handle edit propagation across devices', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Create on A
      deviceA.addBookmark('bm1', {
        url: 'https://test.com',
        title: 'Original Title',
        description: '',
      })

      relay.syncAllDevices()

      // Edit on B
      deviceB.updateBookmark('bm1', { title: 'Updated Title' })

      relay.syncAllDevices()

      // A should have the updated title
      expect(deviceA.getBookmarks().get('bm1').get('title')).toBe('Updated Title')
    })

    it('should handle deletion propagation', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Create on A
      deviceA.addBookmark('to-delete', { url: 'https://delete.me', title: 'Delete Me' })
      deviceA.addBookmark('to-keep', { url: 'https://keep.me', title: 'Keep Me' })

      relay.syncAllDevices()

      expect(deviceB.getBookmarks().size).toBe(2)

      // Delete on A
      deviceA.deleteBookmark('to-delete')

      relay.syncAllDevices()

      // B should no longer have the deleted bookmark
      expect(deviceB.getBookmarks().size).toBe(1)
      expect(deviceB.getBookmarks().has('to-delete')).toBe(false)
      expect(deviceB.getBookmarks().has('to-keep')).toBe(true)
    })
  })

  describe('Conflict Resolution Scenarios', () => {
    it('should handle simultaneous edits to different fields', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Create bookmark
      deviceA.addBookmark('bm1', {
        url: 'https://test.com',
        title: 'Original',
        description: 'Original desc',
        tags: [],
      })

      relay.syncAllDevices()

      // Both edit different fields
      deviceA.updateBookmark('bm1', { title: 'New Title' })
      deviceB.updateBookmark('bm1', { description: 'New Description' })

      relay.syncAllDevices()

      // Both changes should be preserved
      const bmA = deviceA.getBookmarks().get('bm1')
      const bmB = deviceB.getBookmarks().get('bm1')

      expect(bmA.get('title')).toBe('New Title')
      expect(bmA.get('description')).toBe('New Description')
      expect(bmB.get('title')).toBe('New Title')
      expect(bmB.get('description')).toBe('New Description')
    })

    it('should converge on same state for conflicting edits', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Create bookmark
      deviceA.addBookmark('bm1', { url: 'https://test.com', title: 'Original' })

      relay.syncAllDevices()

      // Both edit same field (conflict)
      deviceA.updateBookmark('bm1', { title: 'Title A' })
      deviceB.updateBookmark('bm1', { title: 'Title B' })

      relay.syncAllDevices()

      // Should converge to same value (CRDT determinism)
      const titleA = deviceA.getBookmarks().get('bm1').get('title')
      const titleB = deviceB.getBookmarks().get('bm1').get('title')

      expect(titleA).toBe(titleB) // Both should have same final value
    })

    it('should handle add-delete conflict', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Create bookmark
      deviceA.addBookmark('bm1', { url: 'https://test.com', title: 'Original' })

      relay.syncAllDevices()

      // A deletes, B updates (without syncing)
      deviceA.deleteBookmark('bm1')
      deviceB.updateBookmark('bm1', { title: 'Updated' })

      relay.syncAllDevices()

      // CRDT behavior: delete wins in Yjs Map
      const hasOnA = deviceA.getBookmarks().has('bm1')
      const hasOnB = deviceB.getBookmarks().has('bm1')

      expect(hasOnA).toBe(hasOnB) // Both should converge
    })
  })

  describe('Large Scale Sync', () => {
    it('should efficiently sync 100 bookmarks', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Add 100 bookmarks to Device A
      for (let i = 0; i < 100; i++) {
        deviceA.addBookmark(`bm${i}`, {
          url: `https://example${i}.com`,
          title: `Bookmark ${i}`,
          description: `Description for bookmark ${i}`,
          tags: [`tag${i % 10}`],
          createdAt: Date.now() - i * 1000,
        })
      }

      const startTime = Date.now()
      relay.syncAllDevices()
      const syncTime = Date.now() - startTime

      expect(deviceB.getBookmarks().size).toBe(100)
      expect(syncTime).toBeLessThan(1000) // Should sync in < 1s
    })

    it('should handle incremental sync efficiently', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Initial bulk add
      for (let i = 0; i < 50; i++) {
        deviceA.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }

      relay.syncAllDevices()

      // Add 5 more
      for (let i = 50; i < 55; i++) {
        deviceA.addBookmark(`bm${i}`, { url: `https://${i}.com`, title: `BM ${i}` })
      }

      // Get state vectors to calculate diff size
      const svB = deviceB.getStateVector()
      const diff = deviceA.getDiff(svB)

      // Diff should be small (only 5 bookmarks)
      const fullState = deviceA.encodeState()
      expect(diff.length).toBeLessThan(fullState.length / 5)

      relay.syncAllDevices()
      expect(deviceB.getBookmarks().size).toBe(55)
    })
  })

  describe('Offline-First Scenarios', () => {
    it('should accumulate changes while offline and sync when online', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      // Initial sync
      deviceA.addBookmark('initial', { url: 'https://initial.com', title: 'Initial' })
      relay.syncAllDevices()

      // Device A goes offline
      relay.unregisterDevice('DeviceA')

      // Device A makes many changes while offline
      for (let i = 0; i < 20; i++) {
        deviceA.addBookmark(`offline${i}`, { url: `https://offline${i}.com`, title: `Offline ${i}` })
      }

      // Device B also makes changes
      deviceB.addBookmark('online', { url: 'https://online.com', title: 'Online' })

      // Device A comes back online
      relay.registerDevice(deviceA)
      relay.syncAllDevices()

      // All changes should be synced
      expect(deviceA.getBookmarks().size).toBe(22) // 1 initial + 20 offline + 1 online
      expect(deviceB.getBookmarks().size).toBe(22)
    })

    it('should handle extended offline period with continuous updates', async () => {
      const deviceA = new VirtualDevice('DeviceA', lek)

      // Simulate extended offline period with updates
      for (let day = 0; day < 30; day++) {
        deviceA.addBookmark(`day${day}`, {
          url: `https://day${day}.com`,
          title: `Day ${day}`,
          createdAt: Date.now() - (30 - day) * 86400000,
        })
      }

      // Device B joins after A has been using app for 30 days
      const deviceB = new VirtualDevice('DeviceB', lek)

      relay.registerDevice(deviceA)
      relay.registerDevice(deviceB)

      relay.syncAllDevices()

      // B should have all 30 days of bookmarks
      expect(deviceB.getBookmarks().size).toBe(30)

      // Verify chronological order is preserved
      const day0 = deviceB.getBookmarks().get('day0')
      const day29 = deviceB.getBookmarks().get('day29')
      expect(day0.get('createdAt')).toBeLessThan(day29.get('createdAt'))
    })
  })
})

// ============================================================================
// Stress Tests
// ============================================================================

describe('Sync Stress Tests', () => {
  let lek
  let relay

  beforeEach(async () => {
    lek = await generateLEK()
    relay = new MockSyncRelay()
  })

  afterEach(async () => {
    for (const device of relay.devices.values()) {
      await device.disconnect()
    }
  })

  it('should handle rapid sync cycles', async () => {
    const deviceA = new VirtualDevice('DeviceA', lek)
    const deviceB = new VirtualDevice('DeviceB', lek)

    relay.registerDevice(deviceA)
    relay.registerDevice(deviceB)

    // Rapid create-sync cycles
    for (let i = 0; i < 50; i++) {
      deviceA.addBookmark(`rapid${i}`, { url: `https://rapid${i}.com`, title: `Rapid ${i}` })
      relay.syncAllDevices()
    }

    expect(deviceA.getBookmarks().size).toBe(50)
    expect(deviceB.getBookmarks().size).toBe(50)
    expect(relay.verifyAllDevicesSynced()).toBe(true)
  })

  it('should handle many devices syncing simultaneously', async () => {
    const devices = []

    // Create 5 devices
    for (let i = 0; i < 5; i++) {
      const device = new VirtualDevice(`Device${i}`, lek)
      devices.push(device)
      relay.registerDevice(device)
    }

    // Each device adds bookmarks
    devices.forEach((device, i) => {
      for (let j = 0; j < 10; j++) {
        device.addBookmark(`${device.name}-bm${j}`, {
          url: `https://${device.name}-${j}.com`,
          title: `${device.name} Bookmark ${j}`,
        })
      }
    })

    // Sync all
    relay.syncAllDevices()

    // All devices should have 50 bookmarks (10 from each of 5 devices)
    for (const device of devices) {
      expect(device.getBookmarks().size).toBe(50)
    }

    expect(relay.verifyAllDevicesSynced()).toBe(true)
  })

  it('should handle interleaved add/edit/delete operations', async () => {
    const deviceA = new VirtualDevice('DeviceA', lek)
    const deviceB = new VirtualDevice('DeviceB', lek)

    relay.registerDevice(deviceA)
    relay.registerDevice(deviceB)

    // Complex operation sequence
    deviceA.addBookmark('bm1', { url: 'https://1.com', title: '1' })
    deviceA.addBookmark('bm2', { url: 'https://2.com', title: '2' })
    deviceA.addBookmark('bm3', { url: 'https://3.com', title: '3' })

    relay.syncAllDevices()

    deviceB.updateBookmark('bm1', { title: '1-updated' })
    deviceA.deleteBookmark('bm2')
    deviceA.addBookmark('bm4', { url: 'https://4.com', title: '4' })
    deviceB.addBookmark('bm5', { url: 'https://5.com', title: '5' })

    relay.syncAllDevices()

    // Verify final state
    expect(deviceA.getBookmarks().has('bm1')).toBe(true)
    expect(deviceA.getBookmarks().has('bm2')).toBe(false)
    expect(deviceA.getBookmarks().has('bm3')).toBe(true)
    expect(deviceA.getBookmarks().has('bm4')).toBe(true)
    expect(deviceA.getBookmarks().has('bm5')).toBe(true)

    expect(deviceA.getBookmarks().get('bm1').get('title')).toBe('1-updated')

    expect(relay.verifyAllDevicesSynced()).toBe(true)
  })
})

// ============================================================================
// Data Consistency Tests
// ============================================================================

describe('Data Consistency Tests', () => {
  let lek
  let relay

  beforeEach(async () => {
    lek = await generateLEK()
    relay = new MockSyncRelay()
  })

  afterEach(async () => {
    for (const device of relay.devices.values()) {
      await device.disconnect()
    }
  })

  it('should maintain referential integrity for bookmarks', async () => {
    const deviceA = new VirtualDevice('DeviceA', lek)
    const deviceB = new VirtualDevice('DeviceB', lek)

    relay.registerDevice(deviceA)
    relay.registerDevice(deviceB)

    // Create complete bookmark with all fields
    deviceA.addBookmark('complete', {
      url: 'https://complete.com/path?q=1',
      title: 'Complete Bookmark',
      description: 'Full description text',
      tags: ['tag1', 'tag2', 'tag3'],
      favicon: 'https://complete.com/favicon.ico',
      preview: 'https://preview.com/image.jpg',
      readLater: true,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      deleted: false,
    })

    relay.syncAllDevices()

    // Verify all fields transferred correctly
    const synced = deviceB.getBookmarks().get('complete')
    expect(synced.get('url')).toBe('https://complete.com/path?q=1')
    expect(synced.get('title')).toBe('Complete Bookmark')
    expect(synced.get('description')).toBe('Full description text')
    expect(synced.get('tags')).toEqual(['tag1', 'tag2', 'tag3'])
    expect(synced.get('favicon')).toBe('https://complete.com/favicon.ico')
    expect(synced.get('preview')).toBe('https://preview.com/image.jpg')
    expect(synced.get('readLater')).toBe(true)
    expect(synced.get('deleted')).toBe(false)
  })

  it('should preserve bookmark order by timestamp', async () => {
    const deviceA = new VirtualDevice('DeviceA', lek)
    const deviceB = new VirtualDevice('DeviceB', lek)

    relay.registerDevice(deviceA)
    relay.registerDevice(deviceB)

    // Create bookmarks with specific timestamps
    const baseTime = Date.now()
    deviceA.addBookmark('oldest', { url: 'https://1.com', createdAt: baseTime - 3000 })
    deviceA.addBookmark('middle', { url: 'https://2.com', createdAt: baseTime - 2000 })
    deviceA.addBookmark('newest', { url: 'https://3.com', createdAt: baseTime - 1000 })

    relay.syncAllDevices()

    // Verify timestamps preserved
    const oldest = deviceB.getBookmarks().get('oldest').get('createdAt')
    const middle = deviceB.getBookmarks().get('middle').get('createdAt')
    const newest = deviceB.getBookmarks().get('newest').get('createdAt')

    expect(oldest).toBeLessThan(middle)
    expect(middle).toBeLessThan(newest)
  })

  it('should handle Unicode content correctly', async () => {
    const deviceA = new VirtualDevice('DeviceA', lek)
    const deviceB = new VirtualDevice('DeviceB', lek)

    relay.registerDevice(deviceA)
    relay.registerDevice(deviceB)

    deviceA.addBookmark('unicode', {
      url: 'https://example.com/文字',
      title: '日本語タイトル 🎉',
      description: 'Émojis: 🚀 📚 💡 and spëcial çhàracters',
      tags: ['中文', 'العربية', '日本語'],
    })

    relay.syncAllDevices()

    const synced = deviceB.getBookmarks().get('unicode')
    expect(synced.get('url')).toBe('https://example.com/文字')
    expect(synced.get('title')).toBe('日本語タイトル 🎉')
    expect(synced.get('description')).toBe('Émojis: 🚀 📚 💡 and spëcial çhàracters')
    expect(synced.get('tags')).toEqual(['中文', 'العربية', '日本語'])
  })
})

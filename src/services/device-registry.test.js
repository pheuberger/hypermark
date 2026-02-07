/**
 * Device Registry Tests
 * Tests for src/services/device-registry.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'

let testDoc

vi.mock('../hooks/useYjs', () => ({
  getYdocInstance: () => testDoc,
}))

const {
  addPairedDevice,
  getAllPairedDevices,
  getDevice,
  updateDeviceLastSeen,
  unpairDevice,
} = await import('./device-registry.js')

describe('device-registry', () => {
  beforeEach(() => {
    testDoc = new Y.Doc()
  })

  describe('addPairedDevice', () => {
    it('adds a device to the Yjs map', () => {
      const device = addPairedDevice({
        deviceId: 'device-1',
        deviceName: 'My Phone',
        peerID: 'peer-1',
        publicKey: 'key-1',
      })

      expect(device.deviceId).toBe('device-1')
      expect(device.deviceName).toBe('My Phone')
      expect(device.peerID).toBe('peer-1')
      expect(device.publicKey).toBe('key-1')
      expect(device.pairedAt).toBeDefined()
      expect(device.lastSeen).toBeDefined()
    })

    it('stores device in Yjs', () => {
      addPairedDevice({
        deviceId: 'device-1',
        deviceName: 'My Phone',
        peerID: 'peer-1',
        publicKey: 'key-1',
      })

      const devicesMap = testDoc.getMap('devices')
      expect(devicesMap.size).toBe(1)
    })
  })

  describe('getAllPairedDevices', () => {
    it('returns empty array when no devices', () => {
      expect(getAllPairedDevices()).toEqual([])
    })

    it('returns all paired devices', () => {
      addPairedDevice({ deviceId: 'd1', deviceName: 'Phone', peerID: 'p1', publicKey: 'k1' })
      addPairedDevice({ deviceId: 'd2', deviceName: 'Tablet', peerID: 'p2', publicKey: 'k2' })

      const devices = getAllPairedDevices()
      expect(devices).toHaveLength(2)
    })
  })

  describe('getDevice', () => {
    it('returns device by ID', () => {
      addPairedDevice({ deviceId: 'd1', deviceName: 'Phone', peerID: 'p1', publicKey: 'k1' })

      const device = getDevice('d1')
      expect(device).not.toBeNull()
      expect(device.deviceName).toBe('Phone')
    })

    it('returns null for unknown device ID', () => {
      expect(getDevice('nonexistent')).toBeNull()
    })
  })

  describe('updateDeviceLastSeen', () => {
    it('updates lastSeen timestamp', () => {
      addPairedDevice({ deviceId: 'd1', deviceName: 'Phone', peerID: 'p1', publicKey: 'k1' })

      const before = getDevice('d1').lastSeen
      // Small delay to ensure timestamp changes
      updateDeviceLastSeen('d1')
      const after = getDevice('d1').lastSeen

      expect(after).toBeGreaterThanOrEqual(before)
    })

    it('does nothing for unknown device ID', () => {
      // Should not throw
      updateDeviceLastSeen('nonexistent')
    })
  })

  describe('unpairDevice', () => {
    it('removes a paired device', () => {
      addPairedDevice({ deviceId: 'd1', deviceName: 'Phone', peerID: 'p1', publicKey: 'k1' })
      unpairDevice('d1')

      expect(getDevice('d1')).toBeNull()
      expect(getAllPairedDevices()).toHaveLength(0)
    })

    it('does nothing for unknown device ID', () => {
      // Should not throw
      unpairDevice('nonexistent')
    })
  })

  describe('when Yjs not initialized', () => {
    it('throws with descriptive error', () => {
      testDoc = null
      expect(() => getAllPairedDevices()).toThrow('Yjs not initialized')
    })
  })
})

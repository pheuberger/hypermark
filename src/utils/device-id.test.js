import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateDeviceId,
  getDeviceId,
  setDeviceId,
  clearDeviceId,
  getDeviceName,
  setDeviceName,
  getDeviceInfo,
  clearDeviceData,
  isDeviceInitialized,
  initializeDevice,
} from './device-id.js'

describe('device-id', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('generateDeviceId', () => {
    it('returns a valid UUID', () => {
      const id = generateDeviceId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })
  })

  describe('getDeviceId', () => {
    it('creates and stores a new device ID if none exists', () => {
      const id = getDeviceId()
      expect(id).toBeTruthy()
      expect(localStorage.getItem('hypermark:device-id')).toBe(id)
    })

    it('returns existing device ID if one exists', () => {
      localStorage.setItem('hypermark:device-id', 'test-id')
      expect(getDeviceId()).toBe('test-id')
    })
  })

  describe('setDeviceId', () => {
    it('sets the device ID', () => {
      setDeviceId('custom-id')
      expect(localStorage.getItem('hypermark:device-id')).toBe('custom-id')
    })
  })

  describe('clearDeviceId', () => {
    it('removes the device ID', () => {
      localStorage.setItem('hypermark:device-id', 'test-id')
      clearDeviceId()
      expect(localStorage.getItem('hypermark:device-id')).toBeNull()
    })
  })

  describe('device name', () => {
    it('setDeviceName stores trimmed name', () => {
      setDeviceName('  My Device  ')
      expect(localStorage.getItem('hypermark:device-name')).toBe('My Device')
    })

    it('getDeviceName returns stored name', () => {
      localStorage.setItem('hypermark:device-name', 'Test Device')
      expect(getDeviceName()).toBe('Test Device')
    })
  })

  describe('getDeviceInfo', () => {
    it('returns device id and name', () => {
      setDeviceId('info-test-id')
      setDeviceName('Info Test Device')
      const info = getDeviceInfo()
      expect(info.id).toBe('info-test-id')
      expect(info.name).toBe('Info Test Device')
    })
  })

  describe('clearDeviceData', () => {
    it('clears both device ID and name', () => {
      setDeviceId('clear-test-id')
      setDeviceName('Clear Test Device')
      clearDeviceData()
      expect(localStorage.getItem('hypermark:device-id')).toBeNull()
      expect(localStorage.getItem('hypermark:device-name')).toBeNull()
    })
  })

  describe('isDeviceInitialized', () => {
    it('returns false when no device ID exists', () => {
      expect(isDeviceInitialized()).toBe(false)
    })

    it('returns true when device ID exists', () => {
      setDeviceId('init-test-id')
      expect(isDeviceInitialized()).toBe(true)
    })
  })

  describe('initializeDevice', () => {
    it('sets both device ID and name', () => {
      initializeDevice('init-id', 'Init Device')
      expect(localStorage.getItem('hypermark:device-id')).toBe('init-id')
      expect(localStorage.getItem('hypermark:device-name')).toBe('Init Device')
    })
  })
})

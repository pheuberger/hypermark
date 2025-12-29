/**
 * Device Registry
 * Store paired devices in Yjs
 */

import * as Y from 'yjs'
import { getYdocInstance } from '../hooks/useYjs'

// Helper to get ydoc, with better error message
function getYdoc() {
  const doc = getYdocInstance()
  if (!doc) {
    console.error('[DeviceRegistry] ydoc is null. App component must mount first to initialize Yjs.')
    throw new Error('[DeviceRegistry] Yjs not initialized. This is a bug - App should initialize Yjs on mount.')
  }
  return doc
}

export function addPairedDevice(deviceInfo) {
  const { deviceId, deviceName, peerID, publicKey } = deviceInfo

  const doc = getYdoc()
  const devicesMap = doc.getMap('devices')

  const device = new Y.Map([
    ['deviceId', deviceId],
    ['deviceName', deviceName],
    ['peerID', peerID],
    ['publicKey', publicKey],
    ['pairedAt', Date.now()],
    ['lastSeen', Date.now()],
  ])

  devicesMap.set(deviceId, device)
  console.log('[DeviceRegistry] Device added:', deviceName)

  return deviceToObject(deviceId, device)
}

export function getAllPairedDevices() {
  const doc = getYdoc()
  const devicesMap = doc.getMap('devices')
  const devices = []

  for (const [id, device] of devicesMap.entries()) {
    devices.push(deviceToObject(id, device))
  }

  return devices
}

export function getDevice(deviceId) {
  const doc = getYdoc()
  const devicesMap = doc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (!device) return null
  return deviceToObject(deviceId, device)
}

export function updateDeviceLastSeen(deviceId) {
  const doc = getYdoc()
  const devicesMap = doc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (device) {
    device.set('lastSeen', Date.now())
  }
}

export function unpairDevice(deviceId) {
  const doc = getYdoc()
  const devicesMap = doc.getMap('devices')
  devicesMap.delete(deviceId)
  console.log('[DeviceRegistry] Device unpaired:', deviceId)
}

function deviceToObject(id, ymap) {
  return {
    deviceId: id,
    deviceName: ymap.get('deviceName'),
    peerID: ymap.get('peerID'),
    publicKey: ymap.get('publicKey'),
    pairedAt: ymap.get('pairedAt'),
    lastSeen: ymap.get('lastSeen'),
  }
}

/**
 * Device Registry
 * Store paired devices in Yjs
 */

import * as Y from 'yjs'
import { ydoc } from '../hooks/useYjs'

export function addPairedDevice(deviceInfo) {
  const { deviceId, deviceName, peerID, publicKey } = deviceInfo

  const devicesMap = ydoc.getMap('devices')

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
  const devicesMap = ydoc.getMap('devices')
  const devices = []

  for (const [id, device] of devicesMap.entries()) {
    devices.push(deviceToObject(id, device))
  }

  return devices
}

export function getDevice(deviceId) {
  const devicesMap = ydoc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (!device) return null
  return deviceToObject(deviceId, device)
}

export function updateDeviceLastSeen(deviceId) {
  const devicesMap = ydoc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (device) {
    device.set('lastSeen', Date.now())
  }
}

export function unpairDevice(deviceId) {
  const devicesMap = ydoc.getMap('devices')
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

/**
 * Device registry - manage paired devices in Fireproof
 * Devices are stored with type: "_device" so they sync automatically
 */

/**
 * Add a paired device to the registry
 * @param {Database} db - Fireproof database
 * @param {Object} deviceInfo - Device information
 * @param {string} deviceInfo.deviceId - Unique device ID
 * @param {string} deviceInfo.deviceName - Human-readable name
 * @param {string} deviceInfo.peerID - PeerJS peer ID
 * @param {string} deviceInfo.publicKey - Device identity public key (base64)
 * @returns {Promise<Object>} - Created device document
 */
export async function addPairedDevice(db, deviceInfo) {
  const { deviceId, deviceName, peerID, publicKey } = deviceInfo

  if (!deviceId || !deviceName || !peerID || !publicKey) {
    throw new Error('Missing required device information')
  }

  const deviceDoc = {
    _id: `device:${deviceId}`,
    type: '_device',
    deviceId,
    deviceName,
    peerID,
    publicKey,
    pairedAt: Date.now(),
    lastSeen: Date.now(),
  }

  await db.put(deviceDoc)
  return deviceDoc
}

/**
 * Get all paired devices
 * @param {Database} db - Fireproof database
 * @returns {Promise<Array>} - Array of device documents
 */
export async function getAllPairedDevices(db) {
  const result = await db.allDocs()

  return result.rows
    .map(row => row.value)
    .filter(doc => doc && doc.type === '_device' && !doc._deleted)
}

/**
 * Get a specific device by ID
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} - Device document or null
 */
export async function getDevice(db, deviceId) {
  try {
    const doc = await db.get(`device:${deviceId}`)
    if (doc && doc.type === '_device' && !doc._deleted) {
      return doc
    }
    return null
  } catch (err) {
    if (err.name === 'not_found' || err.message?.includes('Not found')) {
      return null
    }
    throw err
  }
}

/**
 * Update device last-seen timestamp
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export async function updateDeviceLastSeen(db, deviceId) {
  const device = await getDevice(db, deviceId)
  if (device) {
    await db.put({
      ...device,
      lastSeen: Date.now(),
    })
  }
}

/**
 * Unpair a device (soft delete)
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export async function unpairDevice(db, deviceId) {
  const device = await getDevice(db, deviceId)
  if (device) {
    await db.del(`device:${deviceId}`)
  }
}

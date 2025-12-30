/**
 * Device identity management
 * Handles device ID generation, storage, and device metadata
 */

const DEVICE_ID_KEY = 'hypermark:device-id'
const DEVICE_NAME_KEY = 'hypermark:device-name'

/**
 * Generate a new device ID
 * @returns {string} - UUID v4
 */
export function generateDeviceId() {
  return crypto.randomUUID()
}

/**
 * Get or create device ID
 * @returns {string} - Device ID
 */
export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)

  if (!deviceId) {
    deviceId = generateDeviceId()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }

  return deviceId
}

/**
 * Set device ID (used during pairing)
 * @param {string} deviceId - Device ID to set
 */
export function setDeviceId(deviceId) {
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
}

/**
 * Clear device ID (for testing or reset)
 */
export function clearDeviceId() {
  localStorage.removeItem(DEVICE_ID_KEY)
}

/**
 * Generate a default device name based on browser and OS
 * @returns {string}
 */
export function generateDefaultDeviceName() {
  const ua = navigator.userAgent

  // Detect OS
  let os = 'Unknown'
  if (ua.indexOf('Win') !== -1) os = 'Windows'
  else if (ua.indexOf('Mac') !== -1) os = 'Mac'
  else if (ua.indexOf('Linux') !== -1) os = 'Linux'
  else if (ua.indexOf('Android') !== -1) os = 'Android'
  else if (ua.indexOf('iOS') !== -1 || ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) {
    os = 'iOS'
  }

  // Detect browser
  let browser = 'Browser'
  if (ua.indexOf('Firefox') !== -1) browser = 'Firefox'
  else if (ua.indexOf('Chrome') !== -1) browser = 'Chrome'
  else if (ua.indexOf('Safari') !== -1) browser = 'Safari'
  else if (ua.indexOf('Edge') !== -1) browser = 'Edge'

  return `${os} ${browser}`
}

/**
 * Get device name
 * @returns {string} - Device name
 */
export function getDeviceName() {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY)

  if (!deviceName) {
    deviceName = generateDefaultDeviceName()
    localStorage.setItem(DEVICE_NAME_KEY, deviceName)
  }

  return deviceName
}

/**
 * Set device name
 * @param {string} name - Device name
 */
export function setDeviceName(name) {
  localStorage.setItem(DEVICE_NAME_KEY, name.trim())
}

/**
 * Get full device info
 * @returns {{id: string, name: string}}
 */
export function getDeviceInfo() {
  return {
    id: getDeviceId(),
    name: getDeviceName(),
  }
}

/**
 * Clear all device data
 */
export function clearDeviceData() {
  clearDeviceId()
  localStorage.removeItem(DEVICE_NAME_KEY)
}

/**
 * Check if device is initialized
 * @returns {boolean}
 */
export function isDeviceInitialized() {
  return !!localStorage.getItem(DEVICE_ID_KEY)
}

/**
 * Initialize device with custom ID and name (used during pairing)
 * @param {string} deviceId - Device ID
 * @param {string} deviceName - Device name
 */
export function initializeDevice(deviceId, deviceName) {
  setDeviceId(deviceId)
  setDeviceName(deviceName)
}

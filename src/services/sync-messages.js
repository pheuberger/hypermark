/**
 * Sync protocol message types and validators
 */

export const MESSAGE_TYPES = {
  HELLO: 'sync-hello',
  HELLO_ACK: 'sync-hello-ack',
  SYNC_STATE: 'sync-state',
  SYNC_REQUEST: 'sync-request',
  SYNC_DATA: 'sync-data',
  ERROR: 'sync-error',
}

/**
 * Create a hello message for device authentication
 * @param {Object} params
 * @param {string} params.deviceId - Our device ID
 * @param {string} params.deviceName - Our device name
 * @param {string} params.publicKey - Our public key (base64)
 * @returns {Object} - Hello message
 */
export function createHelloMessage({ deviceId, deviceName, publicKey }) {
  return {
    type: MESSAGE_TYPES.HELLO,
    deviceId,
    deviceName,
    publicKey,
    timestamp: Date.now(),
  }
}

/**
 * Create a hello acknowledgment message
 * @param {Object} params
 * @param {string} params.deviceId - Our device ID
 * @param {string} params.deviceName - Our device name
 * @returns {Object} - Hello ACK message
 */
export function createHelloAckMessage({ deviceId, deviceName }) {
  return {
    type: MESSAGE_TYPES.HELLO_ACK,
    deviceId,
    deviceName,
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-state message with current clock head
 * @param {Object} params
 * @param {Array} params.clockHead - Fireproof clock head
 * @returns {Object} - Sync state message
 */
export function createSyncStateMessage({ clockHead }) {
  return {
    type: MESSAGE_TYPES.SYNC_STATE,
    clockHead: clockHead || [],
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-request message asking for changes
 * @param {Object} params
 * @param {Array} params.since - Clock head to request changes since
 * @returns {Object} - Sync request message
 */
export function createSyncRequestMessage({ since }) {
  return {
    type: MESSAGE_TYPES.SYNC_REQUEST,
    since: since || [],
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-data message with document changes
 * @param {Object} params
 * @param {Array} params.changes - Array of document changes
 * @param {Array} params.clockHead - Current clock head after these changes
 * @returns {Object} - Sync data message
 */
export function createSyncDataMessage({ changes, clockHead }) {
  return {
    type: MESSAGE_TYPES.SYNC_DATA,
    changes,
    clockHead: clockHead || [],
    timestamp: Date.now(),
  }
}

/**
 * Create an error message
 * @param {Object} params
 * @param {string} params.error - Error message
 * @param {string} params.code - Error code (optional)
 * @returns {Object} - Error message
 */
export function createErrorMessage({ error, code }) {
  return {
    type: MESSAGE_TYPES.ERROR,
    error,
    code,
    timestamp: Date.now(),
  }
}

/**
 * Validate a message has required structure
 * @param {Object} msg - Message to validate
 * @returns {boolean} - True if valid
 */
export function isValidMessage(msg) {
  return (
    msg &&
    typeof msg === 'object' &&
    typeof msg.type === 'string' &&
    Object.values(MESSAGE_TYPES).includes(msg.type)
  )
}

/**
 * Yjs State Vector Utilities for Nostr Sync
 *
 * Pure functions for extracting, encoding, decoding, and comparing
 * Yjs state vectors. Used for conflict detection and state reconciliation
 * in Nostr-based bookmark synchronization.
 *
 * Extracted from nostr-sync.js for modularity and testability.
 */

import * as Y from 'yjs'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto.js'

// ========================================================================
// Yjs Vector Clock Extraction and Comparison (BEAD lf6.3.3)
// ========================================================================

/**
 * Extract Yjs state vector from a Y.Doc for a specific bookmark
 *
 * The state vector represents the "version" of the document - it contains
 * the client IDs and their clock values, which can be used to determine
 * if another document has newer changes.
 *
 * @param {Y.Doc} ydoc - Yjs document
 * @returns {Uint8Array} - Encoded state vector
 */
export function extractYjsStateVector(ydoc) {
  if (!ydoc || !(ydoc instanceof Y.Doc)) {
    throw new Error('Invalid Yjs document')
  }
  return Y.encodeStateVector(ydoc)
}

/**
 * Extract Yjs state vector and encode as base64 for transport
 *
 * @param {Y.Doc} ydoc - Yjs document
 * @returns {string} - Base64 encoded state vector
 */
export function extractYjsStateVectorBase64(ydoc) {
  const stateVector = extractYjsStateVector(ydoc)
  return arrayBufferToBase64(stateVector.buffer)
}

/**
 * Decode base64 state vector back to Uint8Array
 *
 * @param {string} base64StateVector - Base64 encoded state vector
 * @returns {Uint8Array} - Decoded state vector
 */
export function decodeStateVectorFromBase64(base64StateVector) {
  const buffer = base64ToArrayBuffer(base64StateVector)
  return new Uint8Array(buffer)
}

/**
 * Parse a state vector into a Map of clientId -> clock value
 *
 * This allows for detailed comparison of individual client states.
 *
 * @param {Uint8Array} stateVector - Encoded state vector
 * @returns {Map<number, number>} - Map of clientId to clock value
 */
export function parseStateVector(stateVector) {
  const decoded = Y.decodeStateVector(stateVector)
  return decoded
}

/**
 * Compare two state vectors to determine their relationship
 *
 * Returns:
 * - 'equal': Both vectors represent the same state
 * - 'local-ahead': Local has changes not in remote
 * - 'remote-ahead': Remote has changes not in local
 * - 'divergent': Both have changes the other doesn't have
 *
 * @param {Uint8Array|Map} localVector - Local state vector (encoded or parsed)
 * @param {Uint8Array|Map} remoteVector - Remote state vector (encoded or parsed)
 * @returns {Object} - Comparison result with relationship and details
 */
export function compareStateVectors(localVector, remoteVector) {
  // Parse vectors if they're encoded
  const localMap = localVector instanceof Map
    ? localVector
    : parseStateVector(localVector)
  const remoteMap = remoteVector instanceof Map
    ? remoteVector
    : parseStateVector(remoteVector)

  let localHasMore = false
  let remoteHasMore = false
  const details = {
    localOnlyClients: [],
    remoteOnlyClients: [],
    localAheadClients: [],
    remoteAheadClients: [],
  }

  // Check all clients in local
  for (const [clientId, localClock] of localMap) {
    const remoteClock = remoteMap.get(clientId)

    if (remoteClock === undefined) {
      // Client exists only in local
      localHasMore = true
      details.localOnlyClients.push(clientId)
    } else if (localClock > remoteClock) {
      // Local has more operations from this client
      localHasMore = true
      details.localAheadClients.push({ clientId, localClock, remoteClock })
    } else if (remoteClock > localClock) {
      // Remote has more operations from this client
      remoteHasMore = true
      details.remoteAheadClients.push({ clientId, localClock, remoteClock })
    }
  }

  // Check for clients only in remote
  for (const [clientId] of remoteMap) {
    if (!localMap.has(clientId)) {
      remoteHasMore = true
      details.remoteOnlyClients.push(clientId)
    }
  }

  // Determine relationship
  let relationship
  if (!localHasMore && !remoteHasMore) {
    relationship = 'equal'
  } else if (localHasMore && !remoteHasMore) {
    relationship = 'local-ahead'
  } else if (!localHasMore && remoteHasMore) {
    relationship = 'remote-ahead'
  } else {
    relationship = 'divergent'
  }

  return {
    relationship,
    localHasMore,
    remoteHasMore,
    details,
  }
}

/**
 * Check if remote state vector has new changes compared to local
 *
 * This is the primary function for determining if an incoming event
 * contains new data that should be merged.
 *
 * @param {Uint8Array|Map} localVector - Local state vector
 * @param {Uint8Array|Map} remoteVector - Remote state vector
 * @returns {boolean} - True if remote has changes not in local
 */
export function hasRemoteChanges(localVector, remoteVector) {
  const comparison = compareStateVectors(localVector, remoteVector)
  return comparison.remoteHasMore
}

/**
 * Create a state vector tag for Nostr events
 *
 * Embeds the Yjs state vector into a Nostr event tag for conflict detection.
 *
 * @param {Y.Doc} ydoc - Yjs document
 * @returns {Array} - Nostr tag array ['sv', base64StateVector]
 */
export function createStateVectorTag(ydoc) {
  const base64 = extractYjsStateVectorBase64(ydoc)
  return ['sv', base64]
}

/**
 * Extract state vector from a Nostr event tag
 *
 * @param {Object} event - Nostr event
 * @returns {Uint8Array|null} - Decoded state vector or null if not present
 */
export function extractStateVectorFromEvent(event) {
  const svTag = event.tags?.find(t => t[0] === 'sv')
  if (!svTag || !svTag[1]) {
    return null
  }
  return decodeStateVectorFromBase64(svTag[1])
}

/**
 * Encode Yjs document state as an update (for full state transfer)
 *
 * This captures the complete state of a document for reconstruction.
 *
 * @param {Y.Doc} ydoc - Yjs document
 * @returns {Uint8Array} - Encoded state update
 */
export function encodeYjsState(ydoc) {
  if (!ydoc || !(ydoc instanceof Y.Doc)) {
    throw new Error('Invalid Yjs document')
  }
  return Y.encodeStateAsUpdate(ydoc)
}

/**
 * Encode Yjs document state as base64 string
 *
 * @param {Y.Doc} ydoc - Yjs document
 * @returns {string} - Base64 encoded state
 */
export function encodeYjsStateBase64(ydoc) {
  const state = encodeYjsState(ydoc)
  return arrayBufferToBase64(state.buffer)
}

/**
 * Apply an encoded Yjs update to a document
 *
 * This is used to merge remote changes into the local document.
 *
 * @param {Y.Doc} ydoc - Yjs document to update
 * @param {Uint8Array|string} update - Encoded update (Uint8Array or base64 string)
 * @param {string} [origin='nostr-sync'] - Transaction origin for tracking
 */
export function applyYjsUpdate(ydoc, update, origin = 'nostr-sync') {
  if (!ydoc || !(ydoc instanceof Y.Doc)) {
    throw new Error('Invalid Yjs document')
  }

  let updateBytes
  if (typeof update === 'string') {
    updateBytes = new Uint8Array(base64ToArrayBuffer(update))
  } else {
    updateBytes = update
  }

  Y.applyUpdate(ydoc, updateBytes, origin)
}

/**
 * Get the diff/update between two state vectors
 *
 * Returns only the changes from the source document that aren't
 * present in the target state vector.
 *
 * @param {Y.Doc} sourceDoc - Source Yjs document
 * @param {Uint8Array} targetStateVector - Target state vector
 * @returns {Uint8Array} - Encoded diff/update
 */
export function getYjsDiff(sourceDoc, targetStateVector) {
  if (!sourceDoc || !(sourceDoc instanceof Y.Doc)) {
    throw new Error('Invalid Yjs document')
  }
  return Y.encodeStateAsUpdate(sourceDoc, targetStateVector)
}

/**
 * Get the diff as base64 string
 *
 * @param {Y.Doc} sourceDoc - Source Yjs document
 * @param {Uint8Array|string} targetStateVector - Target state vector
 * @returns {string} - Base64 encoded diff
 */
export function getYjsDiffBase64(sourceDoc, targetStateVector) {
  let stateVector = targetStateVector
  if (typeof targetStateVector === 'string') {
    stateVector = decodeStateVectorFromBase64(targetStateVector)
  }
  const diff = getYjsDiff(sourceDoc, stateVector)
  return arrayBufferToBase64(diff.buffer)
}

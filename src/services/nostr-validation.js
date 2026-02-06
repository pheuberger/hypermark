/**
 * Nostr Event Validation
 *
 * Validation functions for Nostr events used in Hypermark bookmark sync.
 * Includes NIP-01 structural validation, timestamp/tag/content checks,
 * and Hypermark-specific bookmark and delete event validation.
 *
 * Extracted from nostr-sync.js for modularity and testability.
 */

import { verifyNostrEventSignature } from './nostr-crypto'

// ========================================================================
// Event Validation Configuration
// ========================================================================

/**
 * Maximum allowed event content size in bytes (100KB)
 * Protects against oversized payloads that could cause memory issues
 */
const MAX_CONTENT_SIZE = 100 * 1024

/**
 * Maximum allowed number of tags per event
 * Prevents excessive tag arrays that could be used for DoS
 */
const MAX_TAGS_COUNT = 100

/**
 * Maximum allowed timestamp drift in seconds (1 hour)
 * Events too far in the future are rejected
 */
const MAX_FUTURE_TIMESTAMP_DRIFT = 3600

/**
 * Minimum allowed event timestamp (Jan 1, 2020)
 * Events with unreasonably old timestamps are rejected
 */
const MIN_TIMESTAMP = 1577836800

/**
 * Event validation error types for categorized error handling
 */
export const VALIDATION_ERRORS = {
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_KIND: 'INVALID_KIND',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  INVALID_CONTENT: 'INVALID_CONTENT',
  INVALID_TAGS: 'INVALID_TAGS',
  MISSING_REQUIRED_TAG: 'MISSING_REQUIRED_TAG',
  INVALID_TAG_FORMAT: 'INVALID_TAG_FORMAT',
  CONTENT_TOO_LARGE: 'CONTENT_TOO_LARGE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  INVALID_PUBKEY: 'INVALID_PUBKEY',
  INVALID_EVENT_ID: 'INVALID_EVENT_ID',
  INVALID_ENCRYPTED_FORMAT: 'INVALID_ENCRYPTED_FORMAT',
}

// Nostr event kinds
export const NOSTR_KINDS = {
  REPLACEABLE_EVENT: 30053, // Parameterized replaceable event for bookmark state
  TEXT_NOTE: 1,             // Standard text note (not used for bookmarks)
  DELETE: 5,                // Delete event (for explicit deletions)
}

// ========================================================================
// Event Validation Functions (BEAD lf6.3.2)
// ========================================================================

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the event passed validation
 * @property {string|null} error - Error type from VALIDATION_ERRORS
 * @property {string|null} message - Human-readable error message
 * @property {Object|null} details - Additional error details
 */

/**
 * Create a successful validation result
 * @returns {ValidationResult}
 */
function validResult() {
  return { valid: true, error: null, message: null, details: null }
}

/**
 * Create a failed validation result
 * @param {string} error - Error type from VALIDATION_ERRORS
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Additional error details
 * @returns {ValidationResult}
 */
function invalidResult(error, message, details = null) {
  return { valid: false, error, message, details }
}

/**
 * Validate basic Nostr event structure (NIP-01 compliance)
 *
 * Checks that all required fields exist and have correct types:
 * - id: 64-character hex string
 * - pubkey: 64-character hex string
 * - created_at: Unix timestamp (number)
 * - kind: Non-negative integer
 * - tags: Array of arrays
 * - content: String
 * - sig: 128-character hex string
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateEventStructure(event) {
  // Check event is an object
  if (!event || typeof event !== 'object') {
    return invalidResult(
      VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
      'Event must be an object'
    )
  }

  // Required fields check
  const requiredFields = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']
  for (const field of requiredFields) {
    if (!(field in event)) {
      return invalidResult(
        VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
        `Missing required field: ${field}`,
        { field }
      )
    }
  }

  // id: 64-character hex string
  if (typeof event.id !== 'string' || !/^[0-9a-f]{64}$/.test(event.id)) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_EVENT_ID,
      'Event id must be a 64-character lowercase hex string',
      { id: event.id }
    )
  }

  // pubkey: 64-character hex string (x-only pubkey)
  if (typeof event.pubkey !== 'string' || !/^[0-9a-f]{64}$/.test(event.pubkey)) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_PUBKEY,
      'Event pubkey must be a 64-character lowercase hex string',
      { pubkey: event.pubkey }
    )
  }

  // created_at: Unix timestamp
  if (typeof event.created_at !== 'number' || !Number.isInteger(event.created_at)) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_TIMESTAMP,
      'Event created_at must be an integer timestamp',
      { created_at: event.created_at }
    )
  }

  // kind: Non-negative integer
  if (typeof event.kind !== 'number' || !Number.isInteger(event.kind) || event.kind < 0) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_KIND,
      'Event kind must be a non-negative integer',
      { kind: event.kind }
    )
  }

  // tags: Array of arrays
  if (!Array.isArray(event.tags)) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_TAGS,
      'Event tags must be an array',
      { tags: event.tags }
    )
  }

  // content: String
  if (typeof event.content !== 'string') {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_CONTENT,
      'Event content must be a string',
      { content: typeof event.content }
    )
  }

  // sig: 128-character hex string (Schnorr signature)
  if (typeof event.sig !== 'string' || !/^[0-9a-f]{128}$/.test(event.sig)) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_SIGNATURE,
      'Event sig must be a 128-character lowercase hex string',
      { sig: event.sig }
    )
  }

  return validResult()
}

/**
 * Validate event timestamp
 *
 * Ensures the timestamp is:
 * - Not too far in the future (prevents time-based attacks)
 * - Not unreasonably old (prevents replay of ancient events)
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateEventTimestamp(event) {
  const now = Math.floor(Date.now() / 1000)

  // Check for future timestamps (with allowed drift)
  if (event.created_at > now + MAX_FUTURE_TIMESTAMP_DRIFT) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_TIMESTAMP,
      `Event timestamp is too far in the future (${event.created_at - now}s ahead)`,
      { created_at: event.created_at, now, drift: event.created_at - now }
    )
  }

  // Check for unreasonably old timestamps
  if (event.created_at < MIN_TIMESTAMP) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_TIMESTAMP,
      `Event timestamp is too old (before ${new Date(MIN_TIMESTAMP * 1000).toISOString()})`,
      { created_at: event.created_at, minTimestamp: MIN_TIMESTAMP }
    )
  }

  return validResult()
}

/**
 * Validate event tags structure
 *
 * Ensures tags array:
 * - Doesn't exceed maximum count
 * - Each tag is an array with at least one string element (the tag name)
 * - All tag elements are strings
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateEventTags(event) {
  if (event.tags.length > MAX_TAGS_COUNT) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_TAGS,
      `Event has too many tags (${event.tags.length} > ${MAX_TAGS_COUNT})`,
      { count: event.tags.length, max: MAX_TAGS_COUNT }
    )
  }

  for (let i = 0; i < event.tags.length; i++) {
    const tag = event.tags[i]

    if (!Array.isArray(tag)) {
      return invalidResult(
        VALIDATION_ERRORS.INVALID_TAG_FORMAT,
        `Tag at index ${i} must be an array`,
        { index: i, tag }
      )
    }

    if (tag.length === 0) {
      return invalidResult(
        VALIDATION_ERRORS.INVALID_TAG_FORMAT,
        `Tag at index ${i} must have at least one element`,
        { index: i }
      )
    }

    // Check all elements are strings
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] !== 'string') {
        return invalidResult(
          VALIDATION_ERRORS.INVALID_TAG_FORMAT,
          `Tag element at [${i}][${j}] must be a string`,
          { index: i, elementIndex: j, element: tag[j] }
        )
      }
    }
  }

  return validResult()
}

/**
 * Validate event content size
 *
 * Prevents processing of oversized events that could cause memory issues.
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateEventContentSize(event) {
  const contentSize = new TextEncoder().encode(event.content).length

  if (contentSize > MAX_CONTENT_SIZE) {
    return invalidResult(
      VALIDATION_ERRORS.CONTENT_TOO_LARGE,
      `Event content too large (${contentSize} bytes > ${MAX_CONTENT_SIZE} bytes)`,
      { size: contentSize, max: MAX_CONTENT_SIZE }
    )
  }

  return validResult()
}

/**
 * Validate Hypermark bookmark event (kind 30053)
 *
 * For Hypermark bookmark events, validates:
 * - Correct event kind (30053)
 * - Required tags: 'd' (bookmark ID), 'app' (must be 'hypermark')
 * - Content format (encrypted format: iv:ciphertext in base64)
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateBookmarkEvent(event) {
  // Validate kind
  if (event.kind !== NOSTR_KINDS.REPLACEABLE_EVENT) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_KIND,
      `Expected bookmark event kind ${NOSTR_KINDS.REPLACEABLE_EVENT}, got ${event.kind}`,
      { expected: NOSTR_KINDS.REPLACEABLE_EVENT, actual: event.kind }
    )
  }

  // Check for required 'd' tag (bookmark ID)
  let result = requireTag(event, 'd', "Bookmark event must have a 'd' tag with bookmark ID")
  if (!result.valid) return result

  // Check for required 'app' tag with value 'hypermark'
  result = requireTag(event, 'app', "Bookmark event must have 'app' tag with value 'hypermark'",
    { expectedValue: 'hypermark' })
  if (!result.valid) return result

  // Validate encrypted content format (iv:ciphertext in base64)
  if (event.content) {
    const parts = event.content.split(':')
    if (parts.length !== 2) {
      return invalidResult(
        VALIDATION_ERRORS.INVALID_ENCRYPTED_FORMAT,
        'Bookmark content must be in format iv:ciphertext (base64 encoded)',
        { contentPreview: event.content.substring(0, 50) }
      )
    }

    const base64Regex = /^[A-Za-z0-9+/]+=*$/
    if (!base64Regex.test(parts[0]) || !base64Regex.test(parts[1])) {
      return invalidResult(
        VALIDATION_ERRORS.INVALID_ENCRYPTED_FORMAT,
        'Bookmark content IV and ciphertext must be base64 encoded',
        { ivValid: base64Regex.test(parts[0]), ciphertextValid: base64Regex.test(parts[1]) }
      )
    }
  }

  return validResult()
}

/**
 * Validate Hypermark delete event (kind 5)
 *
 * For delete events, validates:
 * - Correct event kind (5)
 * - Required 'a' tag referencing the event to delete
 * - App tag is present
 *
 * @param {Object} event - Nostr event to validate
 * @returns {ValidationResult}
 */
export function validateDeleteEvent(event) {
  if (event.kind !== NOSTR_KINDS.DELETE) {
    return invalidResult(
      VALIDATION_ERRORS.INVALID_KIND,
      `Expected delete event kind ${NOSTR_KINDS.DELETE}, got ${event.kind}`,
      { expected: NOSTR_KINDS.DELETE, actual: event.kind }
    )
  }

  // Check for 'a' tag referencing the addressable event, with format kind:pubkey:d-tag
  const result = requireTag(event, 'a',
    "Delete event must have an 'a' tag referencing the event to delete",
    { minParts: 3 })
  if (!result.valid) return result

  return validResult()
}

/**
 * Run a series of validation functions in sequence, short-circuiting on first failure.
 * @param {Object} event - Nostr event to validate
 * @param {...Function} validators - Validation functions that take an event and return ValidationResult
 * @returns {ValidationResult}
 */
function runValidationPipeline(event, ...validators) {
  for (const validator of validators) {
    const result = validator(event)
    if (!result.valid) return result
  }
  return validResult()
}

/**
 * Find and validate a required tag on an event.
 * @param {Object} event - Nostr event
 * @param {string} tagName - Tag name to find (e.g. 'd', 'app', 'a')
 * @param {string} errorMessage - Error message if tag is missing/invalid
 * @param {Object} [options]
 * @param {string} [options.expectedValue] - If set, tag value must equal this
 * @param {number} [options.minParts] - Minimum number of ':'-separated parts in tag value
 * @returns {ValidationResult}
 */
function requireTag(event, tagName, errorMessage, options = {}) {
  const tag = event.tags.find(t => t[0] === tagName)
  if (!tag || tag.length < 2 || !tag[1]) {
    return invalidResult(VALIDATION_ERRORS.MISSING_REQUIRED_TAG, errorMessage, { tags: event.tags })
  }
  if (options.expectedValue && tag[1] !== options.expectedValue) {
    return invalidResult(VALIDATION_ERRORS.MISSING_REQUIRED_TAG, errorMessage, { [`${tagName}Tag`]: tag })
  }
  if (options.minParts) {
    const parts = tag[1].split(':')
    if (parts.length < options.minParts) {
      return invalidResult(VALIDATION_ERRORS.INVALID_TAG_FORMAT,
        `${errorMessage} (expected format with ${options.minParts}+ parts)`,
        { [`${tagName}Tag`]: tag[1] })
    }
  }
  return validResult()
}

/**
 * Comprehensive event validation for incoming Nostr events
 *
 * Runs all applicable validators and returns the first failure, or success if all pass.
 * This is the main entry point for validating events received from relays.
 *
 * @param {Object} event - Nostr event to validate
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.skipSignature=false] - Skip signature validation (for testing)
 * @param {boolean} [options.isHypermarkEvent=true] - Apply Hypermark-specific validation
 * @returns {Promise<ValidationResult>}
 */
export async function validateNostrEvent(event, options = {}) {
  const { skipSignature = false, isHypermarkEvent = true } = options

  // Run core validators as a pipeline
  const coreResult = runValidationPipeline(event,
    validateEventStructure,
    validateEventTimestamp,
    validateEventTags,
    validateEventContentSize
  )
  if (!coreResult.valid) return coreResult

  // Validate signature (unless skipped)
  if (!skipSignature) {
    const sigValid = await verifyNostrEventSignature(event)
    if (!sigValid) {
      return invalidResult(
        VALIDATION_ERRORS.INVALID_SIGNATURE,
        'Event signature verification failed',
        { eventId: event.id }
      )
    }
  }

  // Hypermark-specific validation
  if (isHypermarkEvent) {
    if (event.kind === NOSTR_KINDS.REPLACEABLE_EVENT) {
      const result = validateBookmarkEvent(event)
      if (!result.valid) return result
    } else if (event.kind === NOSTR_KINDS.DELETE) {
      const result = validateDeleteEvent(event)
      if (!result.valid) return result
    }
  }

  return validResult()
}

/**
 * Extract bookmark ID from a validated bookmark event
 *
 * @param {Object} event - Validated bookmark event
 * @returns {string|null} - Bookmark ID or null if not found
 */
export function extractBookmarkId(event) {
  const dTag = event.tags.find(t => t[0] === 'd')
  return dTag ? dTag[1] : null
}

/**
 * Extract app tag value from an event
 *
 * @param {Object} event - Nostr event
 * @returns {string|null} - App identifier or null if not found
 */
export function extractAppTag(event) {
  const appTag = event.tags.find(t => t[0] === 'app')
  return appTag ? appTag[1] : null
}

/**
 * Extract version tag value from an event
 *
 * @param {Object} event - Nostr event
 * @returns {string|null} - Version string or null if not found
 */
export function extractVersionTag(event) {
  const vTag = event.tags.find(t => t[0] === 'v')
  return vTag ? vTag[1] : null
}

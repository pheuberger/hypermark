/**
 * QR code utilities for pairing
 * Handles short code encoding/decoding with compression
 */

import bs58 from 'bs58'
import pako from 'pako'

/**
 * Encode session as short code: HYPER-XXX-XXX-XXX
 * Uses compression + base58 to reduce ~250 char JSON to ~100 char code
 * @param {Object} session - Session object
 * @returns {string} - Formatted short code
 */
export function encodeShortCode(session) {
  try {
    // 1. JSON stringify
    const json = JSON.stringify(session)

    // 2. Compress with pako (deflate algorithm)
    const compressed = pako.deflate(new TextEncoder().encode(json))

    // 3. Base58 encode (Bitcoin alphabet, no ambiguous 0/O or 1/I/l)
    const base58 = bs58.encode(compressed)

    // 4. Format as HYPER-XXX-XXX-XXX for readability
    const chunks = base58.match(/.{1,6}/g) || []
    return `HYPER-${chunks.join('-')}`
  } catch (err) {
    console.error('Failed to encode short code:', err)
    throw new Error(`Short code encoding failed: ${err.message}`)
  }
}

/**
 * Decode short code back to session object
 * @param {string} shortCode - HYPER-XXX-XXX-XXX format
 * @returns {Object} - Session object
 */
export function decodeShortCode(shortCode) {
  try {
    // Remove HYPER- prefix and hyphens
    const base58Str = shortCode.replace(/^HYPER-/, '').replace(/-/g, '')

    // Base58 decode
    const compressed = bs58.decode(base58Str)

    // Decompress
    const json = pako.inflate(compressed, { to: 'string' })

    // Parse JSON
    return JSON.parse(json)
  } catch (err) {
    console.error('Failed to decode short code:', err)
    throw new Error(`Short code decoding failed: ${err.message}`)
  }
}

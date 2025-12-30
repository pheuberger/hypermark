/**
 * Pairing Code Service
 * 
 * Security model:
 * - Room (1-999): ~10 bits, determines rendezvous point
 * - Two words: ~18 bits (600^2 combinations)
 * - PSK encrypts all signaling traffic via PBKDF2 -> AES-GCM
 * - 5-minute expiry + rate limiting prevents brute force
 */

import { wordlist } from './wordlist'

const MIN_ROOM = 1
const MAX_ROOM = 999
const CODE_PATTERN = /^(\d{1,3})-([a-z]+)-([a-z]+)$/i

export function generatePairingCode() {
  const roomBytes = crypto.getRandomValues(new Uint8Array(2))
  const room = MIN_ROOM + ((roomBytes[0] << 8 | roomBytes[1]) % (MAX_ROOM - MIN_ROOM + 1))
  
  const wordBytes = crypto.getRandomValues(new Uint8Array(4))
  const wordIndex1 = ((wordBytes[0] << 8) | wordBytes[1]) % wordlist.length
  const wordIndex2 = ((wordBytes[2] << 8) | wordBytes[3]) % wordlist.length
  
  const words = [wordlist[wordIndex1], wordlist[wordIndex2]]
  const code = `${room}-${words[0]}-${words[1]}`
  
  console.log('[PairingCode] Generated:', code)
  
  return { code, room, words }
}

export function parsePairingCode(codeString) {
  const normalized = codeString.trim().toLowerCase()
  const match = normalized.match(CODE_PATTERN)
  
  if (!match) {
    throw new Error('Invalid pairing code format. Expected: number-word-word (e.g., 42-apple-river)')
  }
  
  const room = parseInt(match[1], 10)
  const word1 = match[2]
  const word2 = match[3]
  
  if (room < MIN_ROOM || room > MAX_ROOM) {
    throw new Error(`Room number must be between ${MIN_ROOM} and ${MAX_ROOM}`)
  }
  
  if (!wordlist.includes(word1)) {
    throw new Error(`Unknown word: "${word1}". Please check for typos.`)
  }
  if (!wordlist.includes(word2)) {
    throw new Error(`Unknown word: "${word2}". Please check for typos.`)
  }
  
  return { room, words: [word1, word2] }
}

export function getRoomName(room) {
  return `pairing-${room}`
}

export async function derivePSK(words) {
  const password = words.join('-')
  const encoder = new TextEncoder()
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  // Fixed salt with domain separator - all parties derive same key from same words
  const salt = encoder.encode('hypermark-pairing-psk-v1')
  
  const psk = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  )
  
  console.log('[PairingCode] Derived PSK from words')
  return psk
}

export async function encryptMessage(psk, message) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(message))
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    psk,
    plaintext
  )
  
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
  }
}

export async function decryptMessage(psk, ciphertext, iv) {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext)
  const ivBuffer = new Uint8Array(base64ToArrayBuffer(iv))
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    psk,
    ciphertextBuffer
  )
  
  return JSON.parse(new TextDecoder().decode(plaintext))
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

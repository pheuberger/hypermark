/**
 * PairingFlow Component
 * Orchestrates the complete 7-phase device pairing protocol
 * See: docs/plans/2025-12-26-pairingflow-component-design.md
 */

import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import Peer from 'peerjs'
import QRCodeDisplay from './QRCodeDisplay'
import QRScanner from './QRScanner'
import {
  generateEphemeralKeypair,
  generateDeviceKeypair,
  generateLEK,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  deriveSessionKey,
  encryptData,
  decryptData,
  exportLEK,
  importLEK,
  generateUUID,
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  isWebCryptoAvailable,
} from '../../services/crypto'
import { deriveVerificationWords } from '../../services/wordlist'
import {
  retrieveLEK,
  storeLEK,
  retrieveDeviceKeypair,
  storeDeviceKeypair,
} from '../../services/key-storage'
import { getDeviceInfo, getPeerJSId } from '../../utils/device-id'
import { addPairedDevice } from '../../services/device-registry'
import { setYjsRoomPassword, reconnectYjsWebRTC } from '../../hooks/useYjs'

// State machine constants
const STATES = {
  INITIAL: 'initial',
  GENERATING: 'generating',
  SCANNING: 'scanning',
  VERIFYING: 'verifying',
  TRANSFERRING: 'transferring',
  IMPORTING: 'importing',
  COMPLETE: 'complete',
  ERROR: 'error',
}

// Message types for pairing protocol
const MESSAGE_TYPES = {
  PAIRING_HANDSHAKE: 'pairing-handshake',
  PAIRING_CONFIRMED: 'pairing-confirmed',
  PAIRING_COMPLETE: 'pairing-complete',
  PAIRING_ACK: 'pairing-ack',
  PAIRING_ERROR: 'pairing-error',
}

// Global state using signals
const pairingState = signal(STATES.INITIAL)
const role = signal(null) // 'initiator' | 'responder'
const error = signal(null)
const session = signal(null)
const connection = signal(null)
const verificationWords = signal(null)
const ephemeralKeypair = signal(null)
const sessionKey = signal(null)
const peer = signal(null)

export default function PairingFlow() {
  // Cleanup PeerJS connection on component unmount
  useEffect(() => {
    return cleanupPairingState
  }, [])

  // Check WebCrypto availability
  if (!isWebCryptoAvailable()) {
    return (
      <div class="pairing-error p-6">
        <div class="text-red-600 text-4xl mb-4">✗</div>
        <h2 class="text-xl font-bold mb-2">Unsupported Browser</h2>
        <p class="text-red-600">
          This browser does not support required encryption features.
        </p>
        <p class="text-sm text-gray-600 mt-2">
          Please use Chrome, Firefox, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div class="pairing-flow max-w-2xl mx-auto p-6">
      {pairingState.value === STATES.INITIAL && <InitialView />}
      {pairingState.value === STATES.GENERATING && <GeneratingView />}
      {pairingState.value === STATES.SCANNING && <ScanningView />}
      {pairingState.value === STATES.VERIFYING && <VerifyingView />}
      {(pairingState.value === STATES.TRANSFERRING ||
        pairingState.value === STATES.IMPORTING) && <ProgressView />}
      {pairingState.value === STATES.COMPLETE && <CompleteView />}
      {pairingState.value === STATES.ERROR && <ErrorView />}
    </div>
  )
}

// ============================================================================
// View Components
// ============================================================================

function InitialView() {
  return (
    <div class="role-selection text-center">
      <h2 class="text-3xl font-bold mb-4">Pair New Device</h2>
      <p class="text-gray-600 mb-8">Choose how to pair:</p>

      <div class="space-y-4">
        <button
          class="w-full py-4 px-6 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          onClick={startAsInitiator}
        >
          <div class="text-3xl mb-2">📱</div>
          <div class="font-semibold">Show QR Code</div>
          <div class="text-sm opacity-90">Use this device to pair a new one</div>
        </button>

        <button
          class="w-full py-4 px-6 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          onClick={startAsResponder}
        >
          <div class="text-3xl mb-2">📷</div>
          <div class="font-semibold">Scan QR Code</div>
          <div class="text-sm opacity-90">This is the new device being paired</div>
        </button>
      </div>
    </div>
  )
}

function GeneratingView() {
  return (
    <QRCodeDisplay
      session={session.value}
      verificationWords={verificationWords.value}
      onError={handleError}
    />
  )
}

function ScanningView() {
  return (
    <QRScanner onScanned={handleQRScanned} onError={handleError} />
  )
}

function VerifyingView() {
  return (
    <div class="verification-screen text-center">
      <h2 class="text-2xl font-bold mb-4">Verify Pairing</h2>

      <p class="text-gray-600 mb-6">
        Confirm these words match on both devices:
      </p>

      <div class="verification-words flex justify-center items-center gap-4 p-8 bg-gray-100 rounded-lg mb-6">
        <span class="text-4xl font-bold lowercase text-gray-900">
          {verificationWords.value?.[0] || '...'}
        </span>
        <span class="text-2xl text-gray-400">·</span>
        <span class="text-4xl font-bold lowercase text-gray-900">
          {verificationWords.value?.[1] || '...'}
        </span>
      </div>

      <div class="space-y-3 mb-6">
        <button
          class="w-full py-3 px-6 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
          onClick={handleWordsMatch}
        >
          ✓ They Match
        </button>
        <button
          class="w-full py-3 px-6 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
          onClick={handleWordsDontMatch}
        >
          ✗ Don't Match
        </button>
      </div>

      <p class="text-sm text-gray-500">
        This protects against network attacks
      </p>
    </div>
  )
}

function ProgressView() {
  return (
    <div class="pairing-progress text-center py-12">
      <div class="spinner mx-auto mb-6 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <h2 class="text-xl font-bold mb-2">
        {role.value === 'initiator'
          ? 'Sending encryption key...'
          : 'Receiving encryption key...'}
      </h2>
      <p class="text-gray-600">This will only take a moment.</p>
    </div>
  )
}

function CompleteView() {
  return (
    <div class="pairing-success text-center py-12">
      <div class="text-green-600 text-6xl mb-4">✓</div>
      <h2 class="text-2xl font-bold mb-2">Pairing Complete!</h2>
      <p class="text-gray-600 mb-8">
        Your devices are now paired and ready to sync.
      </p>
      <button
        class="py-3 px-8 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold"
        onClick={handleDone}
      >
        Done
      </button>
    </div>
  )
}

function ErrorView() {
  return (
    <div class="pairing-error text-center">
      <div class="text-red-600 text-6xl mb-4">✗</div>
      <h2 class="text-xl font-bold mb-2">Pairing Failed</h2>
      <p class="text-red-600 mb-6">{error.value}</p>

      <div class="space-y-3 mb-6">
        <button
          class="w-full py-3 px-6 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-semibold"
          onClick={reset}
        >
          Try Again
        </button>
        <button
          class="w-full py-3 px-6 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          onClick={handleDone}
        >
          Cancel
        </button>
      </div>

      <details class="mt-4 text-left">
        <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
          Troubleshooting tips
        </summary>
        <ul class="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
          <li>Ensure both devices are on the same network</li>
          <li>Check camera permissions on scanning device</li>
          <li>Try moving QR code closer to camera</li>
          <li>Restart the app if issues persist</li>
        </ul>
      </details>
    </div>
  )
}

// ============================================================================
// Role Selection Handlers
// ============================================================================

async function startAsInitiator() {
  try {
    role.value = 'initiator'
    pairingState.value = STATES.GENERATING

    // Check for LEK, generate if missing (first-time pairing)
    let lek = await retrieveLEK()
    if (!lek) {
      console.log('First-time pairing: generating LEK')
      lek = await generateLEK()
      await storeLEK(lek)

      // Also ensure device keypair exists
      let deviceKeypair = await retrieveDeviceKeypair()
      if (!deviceKeypair) {
        deviceKeypair = await generateDeviceKeypair()
        await storeDeviceKeypair(deviceKeypair)
      }
    }

    // Generate ephemeral keypair for this pairing session
    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    // Create session with 5-min expiry
    const sessionData = {
      sessionId: generateUUID(),
      ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
      peerID: getPeerJSId(),
      deviceName: getDeviceInfo().name,
      expires: Date.now() + 300000, // 5 minutes
    }
    session.value = sessionData

    // Initialize PeerJS and listen for connections
    await initializePeerJSListener()
  } catch (err) {
    console.error('Failed to start as initiator:', err)
    error.value = err.message
    pairingState.value = STATES.ERROR
  }
}

async function startAsResponder() {
  role.value = 'responder'
  pairingState.value = STATES.SCANNING
}

// ============================================================================
// PeerJS Connection Management
// ============================================================================

async function initializePeerJSListener() {
  const peerId = getPeerJSId()
  const newPeer = new Peer(peerId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
  })

  peer.value = newPeer

  newPeer.on('open', (id) => {
    console.log('PeerJS ready, ID:', id)
    // Update session with confirmed peer ID
    session.value = { ...session.value, peerID: id }
  })

  newPeer.on('connection', (conn) => {
    console.log('Incoming pairing connection')
    connection.value = conn

    conn.on('open', () => {
      console.log('Connection established')
    })

    conn.on('data', handlePairingMessage)

    conn.on('error', (err) => {
      console.error('Connection error:', err)
      error.value = `Connection error: ${err.message}`
      pairingState.value = STATES.ERROR
    })

    conn.on('close', () => {
      console.log('Connection closed')
    })
  })

  newPeer.on('error', (err) => {
    console.error('PeerJS error:', err)
    if (err.type === 'network') {
      error.value = 'Cannot reach signaling server. Check internet connection.'
    } else if (err.type === 'peer-unavailable') {
      error.value = 'Cannot connect to other device. Check that QR code is current.'
    } else {
      error.value = `PeerJS error: ${err.message}`
    }
    pairingState.value = STATES.ERROR
  })

  // Set connection timeout
  const connectionTimeout = setTimeout(() => {
    if (pairingState.value === STATES.GENERATING) {
      error.value = 'Connection timeout. No device scanned QR code.'
      pairingState.value = STATES.ERROR
      newPeer.destroy()
    }
  }, 300000) // 5 minutes (same as session expiry)

  // Clear timeout if connection succeeds
  newPeer.on('connection', () => {
    clearTimeout(connectionTimeout)
  })
}

async function connectToInitiator(sessionData) {
  const newPeer = new Peer() // Let PeerJS assign temporary ID

  peer.value = newPeer

  newPeer.on('open', async (id) => {
    console.log('Responder PeerJS ready:', id)

    // Connect to initiator
    const conn = newPeer.connect(sessionData.peerID, {
      reliable: true, // Use reliable data channel
    })

    connection.value = conn

    conn.on('open', async () => {
      console.log('Connected to initiator')
      // Send handshake with our ephemeral public key
      const deviceInfo = getDeviceInfo()
      const handshake = {
        type: MESSAGE_TYPES.PAIRING_HANDSHAKE,
        sessionId: sessionData.sessionId,
        ephemeralPublicKey: await exportPublicKey(
          ephemeralKeypair.value.publicKey
        ),
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
      }
      conn.send(handshake)
    })

    conn.on('data', handlePairingMessage)

    conn.on('error', (err) => {
      console.error('Connection error:', err)
      error.value = `Connection error: ${err.message}`
      pairingState.value = STATES.ERROR
    })

    conn.on('close', () => {
      console.log('Connection closed')
    })
  })

  newPeer.on('error', (err) => {
    console.error('PeerJS error:', err)
    error.value = `Failed to connect: ${err.message}`
    pairingState.value = STATES.ERROR
  })

  // Set connection timeout
  setTimeout(() => {
    if (pairingState.value === STATES.SCANNING) {
      error.value = 'Connection timeout. Could not reach other device.'
      pairingState.value = STATES.ERROR
      newPeer.destroy()
    }
  }, 30000) // 30 seconds
}

// ============================================================================
// Message Protocol Handlers
// ============================================================================

async function handlePairingMessage(msg) {
  try {
    console.log('Received message:', msg.type)

    switch (msg.type) {
      case MESSAGE_TYPES.PAIRING_HANDSHAKE:
        await handleHandshake(msg)
        break
      case MESSAGE_TYPES.PAIRING_CONFIRMED:
        await handlePairingConfirmed(msg)
        break
      case MESSAGE_TYPES.PAIRING_COMPLETE:
        await handlePairingComplete(msg)
        break
      case MESSAGE_TYPES.PAIRING_ACK:
        await handlePairingAck(msg)
        break
      case MESSAGE_TYPES.PAIRING_ERROR:
        handlePairingError(msg)
        break
      default:
        console.warn('Unknown message type:', msg.type)
    }
  } catch (err) {
    console.error('Message handling error:', err)
    error.value = err.message
    pairingState.value = STATES.ERROR
  }
}

async function handleHandshake(msg) {
  // Initiator receives handshake from responder
  const { ephemeralPublicKey, deviceName, sessionId } = msg

  // Verify session ID matches
  if (sessionId !== session.value.sessionId) {
    throw new Error('Session ID mismatch')
  }

  console.log('Handshake received from:', deviceName)

  // Import responder's ephemeral public key
  const responderPublicKey = await importPublicKey(ephemeralPublicKey)

  // Derive shared secret via ECDH
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeypair.value.privateKey,
    responderPublicKey
  )

  // Derive session key using HKDF
  const sk = await deriveSessionKey(sharedSecret, sessionId)
  sessionKey.value = sk

  // Derive verification words
  const words = await deriveVerificationWords(sk, sessionId)
  verificationWords.value = words

  // Transition to verification state
  pairingState.value = STATES.VERIFYING
}

async function handlePairingConfirmed(msg) {
  console.log('Pairing confirmed by peer')

  // Transition based on role
  if (role.value === 'initiator') {
    pairingState.value = STATES.TRANSFERRING
    await transferLEK()
  } else {
    pairingState.value = STATES.IMPORTING
    // Wait for LEK from initiator
  }
}

async function handlePairingComplete(msg) {
  // Responder receives encrypted LEK from initiator
  try {
    const {
      encryptedLEK,
      iv,
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      identityPublicKey,
      sessionId: msgSessionId,
    } = msg

    // Verify session ID
    if (msgSessionId !== session.value.sessionId) {
      throw new Error('Session ID mismatch')
    }

    console.log('Receiving LEK from:', initiatorDeviceName)

    // Decrypt LEK (must use initiator's device ID in AAD to match encryption)
    const additionalData = `${msgSessionId}:${initiatorDeviceId}`

    // Get our device info for acknowledgment
    const deviceInfo = getDeviceInfo()

    const lekRaw = await decryptData(
      sessionKey.value,
      base64ToArrayBuffer(encryptedLEK),
      new Uint8Array(base64ToArrayBuffer(iv)),
      additionalData
    )

    // Import LEK as non-extractable
    const lek = await importLEK(lekRaw, false)
    await storeLEK(lek)

    console.log('LEK imported successfully')

    // Store initiator's device metadata in Yjs
    addPairedDevice({
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      peerID: session.value.peerID,
      publicKey: identityPublicKey,
    })
    console.log('[PairingFlow] Stored initiator device in Yjs')

    // Enable Yjs P2P sync with LEK as room password
    const lekBase64 = await exportLEK(lek)
    setYjsRoomPassword(lekBase64)
    reconnectYjsWebRTC()
    console.log('[PairingFlow] Yjs P2P sync enabled with shared LEK')

    // Generate/retrieve our device keypair
    let deviceKeypair = await retrieveDeviceKeypair()
    if (!deviceKeypair) {
      deviceKeypair = await generateDeviceKeypair()
      await storeDeviceKeypair(deviceKeypair)
    }

    // Send acknowledgment
    const ourPublicKey = await exportPublicKey(deviceKeypair.publicKey)
    connection.value.send({
      type: MESSAGE_TYPES.PAIRING_ACK,
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey: ourPublicKey,
    })

    // Cleanup ephemeral keys
    cleanupEphemeralKeys()

    // Success!
    pairingState.value = STATES.COMPLETE
  } catch (err) {
    console.error('Failed to import LEK:', err)
    error.value = `Failed to import LEK: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

async function handlePairingAck(msg) {
  // Initiator receives acknowledgment from responder
  const { deviceId, deviceName, identityPublicKey } = msg

  console.log('Pairing acknowledged by:', deviceName)

  // Store responder's device metadata in Yjs
  addPairedDevice({
    deviceId,
    deviceName,
    peerID: session.value.peerID,
    publicKey: identityPublicKey,
  })
  console.log('[PairingFlow] Stored responder device in Yjs')

  // Enable Yjs P2P sync with LEK as room password
  const lek = await retrieveLEK()
  const lekBase64 = await exportLEK(lek)
  setYjsRoomPassword(lekBase64)
  reconnectYjsWebRTC()
  console.log('[PairingFlow] Yjs P2P sync enabled with shared LEK')

  // Cleanup ephemeral keys
  cleanupEphemeralKeys()

  // Success!
  pairingState.value = STATES.COMPLETE
}

function handlePairingError(msg) {
  console.error('Pairing error from peer:', msg.message)
  error.value = `Peer error: ${msg.message}`
  pairingState.value = STATES.ERROR
}

// ============================================================================
// LEK Transfer
// ============================================================================

async function transferLEK() {
  try {
    console.log('Transferring LEK...')

    // Retrieve LEK from storage
    const lek = await retrieveLEK()
    if (!lek) {
      throw new Error('LEK not found')
    }

    // Export LEK as raw bytes
    const lekRaw = await exportLEK(lek)

    // Encrypt with session key using AES-GCM
    const deviceInfo = getDeviceInfo()
    const additionalData = `${session.value.sessionId}:${deviceInfo.id}`

    const { ciphertext, iv } = await encryptData(
      sessionKey.value,
      lekRaw,
      additionalData
    )

    // Get device keypair for identity
    const deviceKeypair = await retrieveDeviceKeypair()
    const identityPublicKey = await exportPublicKey(deviceKeypair.publicKey)

    // Send encrypted LEK + metadata
    connection.value.send({
      type: MESSAGE_TYPES.PAIRING_COMPLETE,
      encryptedLEK: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey,
      sessionId: session.value.sessionId,
    })

    console.log('LEK transferred, waiting for acknowledgment')
  } catch (err) {
    console.error('Failed to transfer LEK:', err)
    error.value = `Failed to transfer LEK: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

// ============================================================================
// QR Scanner Handler
// ============================================================================

async function handleQRScanned(sessionData) {
  try {
    // Validate and check expiry
    if (!sessionData.sessionId || !sessionData.ephemeralPublicKey) {
      throw new Error('Invalid QR code')
    }
    if (sessionData.expires < Date.now()) {
      throw new Error('QR code has expired')
    }

    console.log('QR scanned, session:', sessionData.sessionId)

    session.value = sessionData

    // Generate our ephemeral keypair
    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    // Perform ECDH with initiator's public key
    const initiatorPublicKey = await importPublicKey(
      sessionData.ephemeralPublicKey
    )
    const sharedSecret = await deriveSharedSecret(
      keypair.privateKey,
      initiatorPublicKey
    )

    // Derive session key
    const sk = await deriveSessionKey(sharedSecret, sessionData.sessionId)
    sessionKey.value = sk

    // Derive verification words
    const words = await deriveVerificationWords(sk, sessionData.sessionId)
    verificationWords.value = words

    console.log('Verification words:', words)

    // Connect to initiator via PeerJS
    await connectToInitiator(sessionData)

    // Transition to verification
    pairingState.value = STATES.VERIFYING
  } catch (err) {
    console.error('QR scan failed:', err)
    error.value = `QR scan failed: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

// ============================================================================
// Verification Handlers
// ============================================================================

async function handleWordsMatch() {
  console.log('User confirmed words match')

  // Send confirmation to peer
  connection.value.send({
    type: MESSAGE_TYPES.PAIRING_CONFIRMED,
    role: role.value,
  })

  // Transition based on role
  if (role.value === 'initiator') {
    pairingState.value = STATES.TRANSFERRING
    await transferLEK()
  } else {
    pairingState.value = STATES.IMPORTING
    // Wait for LEK from initiator
  }
}

function handleWordsDontMatch() {
  console.log('User reported words don\'t match')

  // Notify peer of verification failure
  connection.value.send({
    type: MESSAGE_TYPES.PAIRING_ERROR,
    message: 'Verification words did not match',
  })

  // Close connection and cleanup
  connection.value.close()
  cleanupPairingState()

  error.value =
    "Verification failed: words don't match. This could indicate a network attack."
  pairingState.value = STATES.ERROR
}

// ============================================================================
// Cleanup & Reset
// ============================================================================

function cleanupEphemeralKeys() {
  ephemeralKeypair.value = null
  sessionKey.value = null
  // Let garbage collector handle the keys
}

function cleanupPairingState() {
  cleanupEphemeralKeys()
  if (peer.value) {
    peer.value.destroy()
    peer.value = null
  }
}

function reset() {
  console.log('Resetting pairing flow')

  // Close connections
  if (connection.value) {
    connection.value.close()
  }

  // Cleanup
  cleanupPairingState()

  // Clear all state
  pairingState.value = STATES.INITIAL
  role.value = null
  session.value = null
  connection.value = null
  verificationWords.value = null
  error.value = null
}

function handleDone() {
  reset()
  // TODO: Signal to parent component to close pairing view
  // Could emit event or call prop callback
}

function handleError(err) {
  console.error('Pairing error:', err)
  error.value = err.message || err
  pairingState.value = STATES.ERROR
}

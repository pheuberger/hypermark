/**
 * PairingFlow Component (Refactored)
 * Uses y-webrtc signaling server instead of PeerJS
 * Single server for both pairing and sync
 */

import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
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
  deriveYjsPassword,
  generateUUID,
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
import { getDeviceInfo } from '../../utils/device-id'
import { addPairedDevice } from '../../services/device-registry'
import { reconnectYjsWebRTC } from '../../hooks/useYjs'
import { SignalingClient, getPairingRoomName, getSignalingUrl } from '../../services/signaling'

const STATES = {
  INITIAL: 'initial',
  GENERATING: 'generating',
  SCANNING: 'scanning',
  WAITING_FOR_PEER: 'waiting_for_peer',
  VERIFYING: 'verifying',
  TRANSFERRING: 'transferring',
  IMPORTING: 'importing',
  COMPLETE: 'complete',
  ERROR: 'error',
}

const MESSAGE_TYPES = {
  ANNOUNCE: 'announce',
  HANDSHAKE: 'handshake',
  CONFIRMED: 'confirmed',
  LEK_TRANSFER: 'lek-transfer',
  ACK: 'ack',
  ERROR: 'error',
}

const pairingState = signal(STATES.INITIAL)
const role = signal(null)
const error = signal(null)
const session = signal(null)
const verificationWords = signal(null)
const ephemeralKeypair = signal(null)
const sessionKey = signal(null)
const signalingClient = signal(null)
const peerDeviceInfo = signal(null)

export default function PairingFlow() {
  useEffect(() => {
    return () => cleanupPairingState()
  }, [])

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
      {pairingState.value === STATES.WAITING_FOR_PEER && <WaitingView />}
      {pairingState.value === STATES.VERIFYING && <VerifyingView />}
      {(pairingState.value === STATES.TRANSFERRING ||
        pairingState.value === STATES.IMPORTING) && <ProgressView />}
      {pairingState.value === STATES.COMPLETE && <CompleteView />}
      {pairingState.value === STATES.ERROR && <ErrorView />}
    </div>
  )
}

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
  return <QRScanner onScanned={handleQRScanned} onError={handleError} />
}

function WaitingView() {
  return (
    <div class="text-center py-12">
      <div class="spinner mx-auto mb-6 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <h2 class="text-xl font-bold mb-2">Connecting...</h2>
      <p class="text-gray-600">Waiting for the other device</p>
    </div>
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

      <p class="text-sm text-gray-500">This protects against network attacks</p>
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
          <li>Check that the signaling server is running</li>
          <li>Ensure both devices have internet access</li>
          <li>Try generating a new QR code</li>
          <li>Restart the app if issues persist</li>
        </ul>
      </details>
    </div>
  )
}

// === INITIATOR FLOW ===

async function startAsInitiator() {
  try {
    role.value = 'initiator'
    pairingState.value = STATES.GENERATING

    let lek = await retrieveLEK()
    if (!lek) {
      console.log('[Pairing] First-time pairing: generating LEK')
      lek = await generateLEK()
      await storeLEK(lek)

      let deviceKeypair = await retrieveDeviceKeypair()
      if (!deviceKeypair) {
        deviceKeypair = await generateDeviceKeypair()
        await storeDeviceKeypair(deviceKeypair)
      }
    }

    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    const sessionId = generateUUID()
    const sessionData = {
      sessionId,
      ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
      signalingUrl: getSignalingUrl(),
      deviceName: getDeviceInfo().name,
      expires: Date.now() + 300000,
    }
    session.value = sessionData

    const client = new SignalingClient()
    signalingClient.value = client
    await client.connect()

    const roomName = getPairingRoomName(sessionId)
    client.subscribe(roomName, handleSignalingMessage)

    setupSessionTimeout(sessionId)

    console.log('[Pairing] Initiator ready, waiting for responder')
  } catch (err) {
    console.error('[Pairing] Failed to start as initiator:', err)
    error.value = err.message
    pairingState.value = STATES.ERROR
  }
}

// === RESPONDER FLOW ===

async function startAsResponder() {
  role.value = 'responder'
  pairingState.value = STATES.SCANNING
}

async function handleQRScanned(sessionData) {
  try {
    if (!sessionData.sessionId || !sessionData.ephemeralPublicKey) {
      throw new Error('Invalid QR code')
    }
    if (sessionData.expires < Date.now()) {
      throw new Error('QR code has expired')
    }

    console.log('[Pairing] QR scanned, session:', sessionData.sessionId)
    session.value = sessionData
    pairingState.value = STATES.WAITING_FOR_PEER

    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    const initiatorPublicKey = await importPublicKey(sessionData.ephemeralPublicKey)
    const sharedSecret = await deriveSharedSecret(keypair.privateKey, initiatorPublicKey)
    const sk = await deriveSessionKey(sharedSecret, sessionData.sessionId)
    sessionKey.value = sk

    const words = await deriveVerificationWords(sk, sessionData.sessionId)
    verificationWords.value = words

    const signalingUrl = sessionData.signalingUrl || getSignalingUrl()
    const client = new SignalingClient(signalingUrl)
    signalingClient.value = client
    await client.connect()

    const roomName = getPairingRoomName(sessionData.sessionId)
    client.subscribe(roomName, handleSignalingMessage)

    const deviceInfo = getDeviceInfo()
    client.publish(roomName, {
      type: MESSAGE_TYPES.HANDSHAKE,
      sessionId: sessionData.sessionId,
      ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
    })

    pairingState.value = STATES.VERIFYING
  } catch (err) {
    console.error('[Pairing] QR scan failed:', err)
    error.value = `QR scan failed: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

// === MESSAGE HANDLING ===

async function handleSignalingMessage(data) {
  try {
    console.log('[Pairing] Received message:', data.type)

    switch (data.type) {
      case MESSAGE_TYPES.HANDSHAKE:
        await handleHandshake(data)
        break
      case MESSAGE_TYPES.CONFIRMED:
        await handleConfirmed(data)
        break
      case MESSAGE_TYPES.LEK_TRANSFER:
        await handleLEKTransfer(data)
        break
      case MESSAGE_TYPES.ACK:
        await handleAck(data)
        break
      case MESSAGE_TYPES.ERROR:
        handleRemoteError(data)
        break
    }
  } catch (err) {
    console.error('[Pairing] Message handling error:', err)
    error.value = err.message
    pairingState.value = STATES.ERROR
  }
}

async function handleHandshake(data) {
  if (role.value !== 'initiator') return

  const { ephemeralPublicKey, deviceName, deviceId, sessionId } = data

  if (sessionId !== session.value.sessionId) {
    throw new Error('Session ID mismatch')
  }

  console.log('[Pairing] Handshake received from:', deviceName)
  peerDeviceInfo.value = { deviceId, deviceName }

  const responderPublicKey = await importPublicKey(ephemeralPublicKey)
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeypair.value.privateKey,
    responderPublicKey
  )
  const sk = await deriveSessionKey(sharedSecret, sessionId)
  sessionKey.value = sk

  const words = await deriveVerificationWords(sk, sessionId)
  verificationWords.value = words

  pairingState.value = STATES.VERIFYING
}

async function handleConfirmed(data) {
  console.log('[Pairing] Peer confirmed verification')

  if (role.value === 'initiator') {
    pairingState.value = STATES.TRANSFERRING
    await transferLEK()
  } else {
    pairingState.value = STATES.IMPORTING
  }
}

async function handleLEKTransfer(data) {
  if (role.value !== 'responder') return

  try {
    const { encryptedLEK, iv, deviceId, deviceName, identityPublicKey, sessionId } = data

    if (sessionId !== session.value.sessionId) {
      throw new Error('Session ID mismatch')
    }

    console.log('[Pairing] Receiving LEK from:', deviceName)

    const additionalData = `${sessionId}:${deviceId}`
    const lekRaw = await decryptData(
      sessionKey.value,
      base64ToArrayBuffer(encryptedLEK),
      new Uint8Array(base64ToArrayBuffer(iv)),
      additionalData
    )

    const lek = await importLEK(lekRaw, true)
    await storeLEK(lek)

    console.log('[Pairing] LEK imported successfully')

    addPairedDevice({
      deviceId,
      deviceName,
      publicKey: identityPublicKey,
    })

    const yjsPassword = await deriveYjsPassword(lek)
    reconnectYjsWebRTC(yjsPassword)

    let deviceKeypair = await retrieveDeviceKeypair()
    if (!deviceKeypair) {
      deviceKeypair = await generateDeviceKeypair()
      await storeDeviceKeypair(deviceKeypair)
    }

    const deviceInfo = getDeviceInfo()
    const ourPublicKey = await exportPublicKey(deviceKeypair.publicKey)
    const roomName = getPairingRoomName(session.value.sessionId)

    signalingClient.value.publish(roomName, {
      type: MESSAGE_TYPES.ACK,
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey: ourPublicKey,
    })

    cleanupEphemeralKeys()
    pairingState.value = STATES.COMPLETE
  } catch (err) {
    console.error('[Pairing] Failed to import LEK:', err)
    error.value = `Failed to import LEK: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

async function handleAck(data) {
  if (role.value !== 'initiator') return

  const { deviceId, deviceName, identityPublicKey } = data
  console.log('[Pairing] Acknowledged by:', deviceName)

  addPairedDevice({
    deviceId,
    deviceName,
    publicKey: identityPublicKey,
  })

  const lek = await retrieveLEK()
  const yjsPassword = await deriveYjsPassword(lek)
  reconnectYjsWebRTC(yjsPassword)

  cleanupEphemeralKeys()
  pairingState.value = STATES.COMPLETE
}

function handleRemoteError(data) {
  console.error('[Pairing] Error from peer:', data.message)
  error.value = `Peer error: ${data.message}`
  pairingState.value = STATES.ERROR
}

// === LEK TRANSFER ===

async function transferLEK() {
  try {
    console.log('[Pairing] Transferring LEK...')

    const lek = await retrieveLEK()
    if (!lek) throw new Error('LEK not found')

    const lekRaw = await exportLEK(lek)
    const deviceInfo = getDeviceInfo()
    const additionalData = `${session.value.sessionId}:${deviceInfo.id}`

    const { ciphertext, iv } = await encryptData(sessionKey.value, lekRaw, additionalData)

    const deviceKeypair = await retrieveDeviceKeypair()
    const identityPublicKey = await exportPublicKey(deviceKeypair.publicKey)

    const roomName = getPairingRoomName(session.value.sessionId)
    signalingClient.value.publish(roomName, {
      type: MESSAGE_TYPES.LEK_TRANSFER,
      encryptedLEK: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey,
      sessionId: session.value.sessionId,
    })

    console.log('[Pairing] LEK transferred, waiting for acknowledgment')
  } catch (err) {
    console.error('[Pairing] Failed to transfer LEK:', err)
    error.value = `Failed to transfer LEK: ${err.message}`
    pairingState.value = STATES.ERROR
  }
}

// === VERIFICATION ===

async function handleWordsMatch() {
  console.log('[Pairing] User confirmed words match')

  const roomName = getPairingRoomName(session.value.sessionId)
  signalingClient.value.publish(roomName, {
    type: MESSAGE_TYPES.CONFIRMED,
    role: role.value,
  })

  if (role.value === 'initiator') {
    pairingState.value = STATES.TRANSFERRING
    await transferLEK()
  } else {
    pairingState.value = STATES.IMPORTING
  }
}

function handleWordsDontMatch() {
  console.log("[Pairing] User reported words don't match")

  const roomName = getPairingRoomName(session.value.sessionId)
  signalingClient.value.publish(roomName, {
    type: MESSAGE_TYPES.ERROR,
    message: 'Verification words did not match',
  })

  cleanupPairingState()
  error.value = "Verification failed: words don't match. This could indicate a network attack."
  pairingState.value = STATES.ERROR
}

// === CLEANUP ===

function setupSessionTimeout(sessionId) {
  setTimeout(() => {
    if (pairingState.value === STATES.GENERATING || pairingState.value === STATES.WAITING_FOR_PEER) {
      error.value = 'Session expired. Please try again.'
      pairingState.value = STATES.ERROR
      cleanupPairingState()
    }
  }, 300000)
}

function cleanupEphemeralKeys() {
  ephemeralKeypair.value = null
  sessionKey.value = null
}

function cleanupPairingState() {
  cleanupEphemeralKeys()
  if (signalingClient.value) {
    signalingClient.value.close()
    signalingClient.value = null
  }
  peerDeviceInfo.value = null
}

function reset() {
  console.log('[Pairing] Resetting')
  cleanupPairingState()
  pairingState.value = STATES.INITIAL
  role.value = null
  session.value = null
  verificationWords.value = null
  error.value = null
}

function handleDone() {
  reset()
}

function handleError(err) {
  console.error('[Pairing] Error:', err)
  error.value = err.message || err
  pairingState.value = STATES.ERROR
}

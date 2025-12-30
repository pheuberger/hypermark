/**
 * PairingFlow Component (Refactored)
 * Uses y-webrtc signaling server instead of PeerJS
 * Single server for both pairing and sync
 */

import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import QRCodeDisplay from './QRCodeDisplay'
import QRScanner from './QRScanner'
import { Button } from '../ui/Button'
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
      <div className="p-6 text-center">
        <div className="text-error text-4xl mb-4">✗</div>
        <h2 className="text-xl font-bold mb-2">Unsupported Browser</h2>
        <p className="text-error">
          This browser does not support required encryption features.
        </p>
        <p className="text-sm text-base-content/60 mt-2">
          Please use Chrome, Firefox, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-6 min-h-[500px] flex flex-col justify-center">
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
    <div className="text-center">
      <h2 className="text-3xl font-bold mb-4 tracking-tight">Pair Device</h2>
      <p className="text-base-content/60 mb-10 text-lg">Choose how to pair this device:</p>

      <div className="space-y-4 max-w-sm mx-auto">
        <button
          className="w-full text-left p-6 bg-base-100 border border-base-200 rounded-xl hover:border-primary/50 hover:shadow-md transition-all group"
          onClick={startAsInitiator}
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">📱</div>
          <div className="font-semibold text-lg">Show QR Code</div>
          <div className="text-sm text-base-content/60 mt-1">Use this device to pair a new one</div>
        </button>

        <button
          className="w-full text-left p-6 bg-base-100 border border-base-200 rounded-xl hover:border-primary/50 hover:shadow-md transition-all group"
          onClick={startAsResponder}
        >
          <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">📷</div>
          <div className="font-semibold text-lg">Scan QR Code</div>
          <div className="text-sm text-base-content/60 mt-1">This is the new device being paired</div>
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
    <div className="text-center py-12">
      <div className="loading loading-spinner loading-lg text-primary mb-6"></div>
      <h2 className="text-xl font-bold mb-2">Connecting...</h2>
      <p className="text-base-content/60">Waiting for the other device</p>
    </div>
  )
}

function VerifyingView() {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Verify Pairing</h2>

      <p className="text-base-content/60 mb-8">
        Confirm these words match on both devices:
      </p>

      <div className="flex justify-center items-center gap-4 p-8 bg-base-200/50 rounded-xl border border-base-200 mb-8">
        <span className="text-4xl font-bold lowercase text-primary">
          {verificationWords.value?.[0] || '...'}
        </span>
        <span className="text-2xl text-base-content/20">·</span>
        <span className="text-4xl font-bold lowercase text-primary">
          {verificationWords.value?.[1] || '...'}
        </span>
      </div>

      <div className="space-y-3 mb-6 max-w-sm mx-auto">
        <Button
          onClick={handleWordsMatch}
          variant="primary"
          size="large"
          className="w-full bg-green-600 hover:bg-green-700 text-white border-none"
        >
          ✓ They Match
        </Button>
        <Button
          onClick={handleWordsDontMatch}
          variant="ghost"
          size="large"
          className="w-full text-error hover:bg-error/10"
        >
          ✗ Don't Match
        </Button>
      </div>

      <p className="text-xs text-base-content/40">This protects against network attacks</p>
    </div>
  )
}

function ProgressView() {
  return (
    <div className="text-center py-12">
      <div className="loading loading-spinner loading-lg text-primary mb-6"></div>
      <h2 className="text-xl font-bold mb-2">
        {role.value === 'initiator'
          ? 'Sending encryption key...'
          : 'Receiving encryption key...'}
      </h2>
      <p className="text-base-content/60">This will only take a moment.</p>
    </div>
  )
}

function CompleteView() {
  return (
    <div className="text-center py-12 animate-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-4xl">✓</span>
      </div>
      <h2 className="text-3xl font-bold mb-4 tracking-tight">Pairing Complete!</h2>
      <p className="text-base-content/60 mb-10 text-lg">
        Your devices are now paired and ready to sync.
      </p>
      <Button
        onClick={handleDone}
        variant="primary"
        size="large"
        className="px-12"
      >
        Done
      </Button>
    </div>
  )
}

function ErrorView() {
  return (
    <div className="text-center">
      <div className="w-20 h-20 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-4xl">✗</span>
      </div>
      <h2 className="text-xl font-bold mb-2">Pairing Failed</h2>
      <p className="text-error mb-8 max-w-md mx-auto">{error.value}</p>

      <div className="space-y-3 mb-8 max-w-sm mx-auto">
        <Button
          onClick={reset}
          variant="primary"
          className="w-full"
        >
          Try Again
        </Button>
        <Button
          onClick={handleDone}
          variant="ghost"
          className="w-full"
        >
          Cancel
        </Button>
      </div>

      <details className="mt-4 text-left border rounded-lg border-base-200">
        <summary className="p-4 text-sm text-base-content/60 cursor-pointer hover:text-base-content hover:bg-base-200/50">
          Troubleshooting tips
        </summary>
        <div className="p-4 pt-0">
          <ul className="text-sm text-base-content/60 space-y-2 list-disc list-inside">
            <li>Check that the signaling server is running</li>
            <li>Ensure both devices have internet access</li>
            <li>Try generating a new QR code</li>
            <li>Restart the app if issues persist</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

// ... Rest of the file (logic helpers) unchanged ...
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

  // Only act if we're still in VERIFYING state
  // This prevents double-triggering if both confirmations race
  if (pairingState.value !== STATES.VERIFYING) {
    console.log('[Pairing] Already past verification, ignoring duplicate CONFIRMED')
    return
  }

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

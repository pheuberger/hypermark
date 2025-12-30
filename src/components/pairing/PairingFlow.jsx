import { useState, useEffect, useCallback, useRef } from 'react'
import QRCodeDisplay from './QRCodeDisplay'
import QRScanner from './QRScanner'
import { Button } from '../ui/Button'
import { Loader2, Monitor, Smartphone, Check, X, AlertCircle } from '../ui/Icons'
import { SettingCard, SettingSection, SettingRow } from '../ui/SettingsLayout'
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

export default function PairingFlow() {
  const [pairingState, setPairingState] = useState(STATES.INITIAL)
  const [role, setRole] = useState(null)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [verificationWords, setVerificationWords] = useState(null)
  
  const ephemeralKeypairRef = useRef(null)
  const sessionKeyRef = useRef(null)
  const signalingClientRef = useRef(null)
  const peerDeviceInfoRef = useRef(null)

  useEffect(() => {
    return () => cleanupPairingState()
  }, [])

  const cleanupEphemeralKeys = useCallback(() => {
    ephemeralKeypairRef.current = null
    sessionKeyRef.current = null
  }, [])

  const cleanupPairingState = useCallback(() => {
    cleanupEphemeralKeys()
    if (signalingClientRef.current) {
      signalingClientRef.current.close()
      signalingClientRef.current = null
    }
    peerDeviceInfoRef.current = null
  }, [cleanupEphemeralKeys])

  const reset = useCallback(() => {
    console.log('[Pairing] Resetting')
    cleanupPairingState()
    setPairingState(STATES.INITIAL)
    setRole(null)
    setSession(null)
    setVerificationWords(null)
    setError(null)
  }, [cleanupPairingState])

  const handleError = useCallback((err) => {
    console.error('[Pairing] Error:', err)
    setError(err.message || err)
    setPairingState(STATES.ERROR)
  }, [])

  const handleSignalingMessage = useCallback(async (data) => {
    try {
      console.log('[Pairing] Received message:', data.type)

      switch (data.type) {
        case MESSAGE_TYPES.HANDSHAKE:
          await handleHandshake(data)
          break
        case MESSAGE_TYPES.CONFIRMED:
          await handleConfirmed()
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
      setError(err.message)
      setPairingState(STATES.ERROR)
    }
  }, [])

  const handleHandshake = async (data) => {
    if (role !== 'initiator') return

    const { ephemeralPublicKey, deviceName, deviceId, sessionId } = data

    if (sessionId !== session?.sessionId) {
      throw new Error('Session ID mismatch')
    }

    console.log('[Pairing] Handshake received from:', deviceName)
    peerDeviceInfoRef.current = { deviceId, deviceName }

    const responderPublicKey = await importPublicKey(ephemeralPublicKey)
    const sharedSecret = await deriveSharedSecret(
      ephemeralKeypairRef.current.privateKey,
      responderPublicKey
    )
    const sk = await deriveSessionKey(sharedSecret, sessionId)
    sessionKeyRef.current = sk

    const words = await deriveVerificationWords(sk, sessionId)
    setVerificationWords(words)
    setPairingState(STATES.VERIFYING)
  }

  const handleConfirmed = async () => {
    console.log('[Pairing] Peer confirmed verification')

    if (pairingState !== STATES.VERIFYING) {
      console.log('[Pairing] Already past verification, ignoring duplicate CONFIRMED')
      return
    }

    if (role === 'initiator') {
      setPairingState(STATES.TRANSFERRING)
      await transferLEK()
    } else {
      setPairingState(STATES.IMPORTING)
    }
  }

  const handleLEKTransfer = async (data) => {
    if (role !== 'responder') return

    try {
      const { encryptedLEK, iv, deviceId, deviceName, identityPublicKey, sessionId } = data

      if (sessionId !== session?.sessionId) {
        throw new Error('Session ID mismatch')
      }

      console.log('[Pairing] Receiving LEK from:', deviceName)

      const additionalData = `${sessionId}:${deviceId}`
      const lekRaw = await decryptData(
        sessionKeyRef.current,
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
      const roomName = getPairingRoomName(session.sessionId)

      signalingClientRef.current.publish(roomName, {
        type: MESSAGE_TYPES.ACK,
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
        identityPublicKey: ourPublicKey,
      })

      cleanupEphemeralKeys()
      setPairingState(STATES.COMPLETE)
    } catch (err) {
      console.error('[Pairing] Failed to import LEK:', err)
      setError(`Failed to import LEK: ${err.message}`)
      setPairingState(STATES.ERROR)
    }
  }

  const handleAck = async (data) => {
    if (role !== 'initiator') return

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
    setPairingState(STATES.COMPLETE)
  }

  const handleRemoteError = (data) => {
    console.error('[Pairing] Error from peer:', data.message)
    setError(`Peer error: ${data.message}`)
    setPairingState(STATES.ERROR)
  }

  const transferLEK = async () => {
    try {
      console.log('[Pairing] Transferring LEK...')

      const lek = await retrieveLEK()
      if (!lek) throw new Error('LEK not found')

      const lekRaw = await exportLEK(lek)
      const deviceInfo = getDeviceInfo()
      const additionalData = `${session.sessionId}:${deviceInfo.id}`

      const { ciphertext, iv } = await encryptData(sessionKeyRef.current, lekRaw, additionalData)

      const deviceKeypair = await retrieveDeviceKeypair()
      const identityPublicKey = await exportPublicKey(deviceKeypair.publicKey)

      const roomName = getPairingRoomName(session.sessionId)
      signalingClientRef.current.publish(roomName, {
        type: MESSAGE_TYPES.LEK_TRANSFER,
        encryptedLEK: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer),
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
        identityPublicKey,
        sessionId: session.sessionId,
      })

      console.log('[Pairing] LEK transferred, waiting for acknowledgment')
    } catch (err) {
      console.error('[Pairing] Failed to transfer LEK:', err)
      setError(`Failed to transfer LEK: ${err.message}`)
      setPairingState(STATES.ERROR)
    }
  }

  const handleWordsMatch = async () => {
    console.log('[Pairing] User confirmed words match')

    const roomName = getPairingRoomName(session.sessionId)
    signalingClientRef.current.publish(roomName, {
      type: MESSAGE_TYPES.CONFIRMED,
      role: role,
    })

    if (role === 'initiator') {
      setPairingState(STATES.TRANSFERRING)
      await transferLEK()
    } else {
      setPairingState(STATES.IMPORTING)
    }
  }

  const handleWordsDontMatch = () => {
    console.log("[Pairing] User reported words don't match")

    const roomName = getPairingRoomName(session.sessionId)
    signalingClientRef.current.publish(roomName, {
      type: MESSAGE_TYPES.ERROR,
      message: 'Verification words did not match',
    })

    cleanupPairingState()
    setError("Verification failed: words don't match. This could indicate a network attack.")
    setPairingState(STATES.ERROR)
  }

  const startAsInitiator = async () => {
    try {
      setRole('initiator')
      setPairingState(STATES.GENERATING)

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
      ephemeralKeypairRef.current = keypair

      const sessionId = generateUUID()
      const sessionData = {
        sessionId,
        ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
        signalingUrl: getSignalingUrl(),
        deviceName: getDeviceInfo().name,
        expires: Date.now() + 300000,
      }
      setSession(sessionData)

      const client = new SignalingClient()
      signalingClientRef.current = client
      await client.connect()

      const roomName = getPairingRoomName(sessionId)
      client.subscribe(roomName, handleSignalingMessage)

      setTimeout(() => {
        if (pairingState === STATES.GENERATING || pairingState === STATES.WAITING_FOR_PEER) {
          setError('Session expired. Please try again.')
          setPairingState(STATES.ERROR)
          cleanupPairingState()
        }
      }, 300000)

      console.log('[Pairing] Initiator ready, waiting for responder')
    } catch (err) {
      console.error('[Pairing] Failed to start as initiator:', err)
      setError(err.message)
      setPairingState(STATES.ERROR)
    }
  }

  const startAsResponder = () => {
    setRole('responder')
    setPairingState(STATES.SCANNING)
  }

  const handleQRScanned = async (sessionData) => {
    try {
      if (!sessionData.sessionId || !sessionData.ephemeralPublicKey) {
        throw new Error('Invalid QR code')
      }
      if (sessionData.expires < Date.now()) {
        throw new Error('QR code has expired')
      }

      console.log('[Pairing] QR scanned, session:', sessionData.sessionId)
      setSession(sessionData)
      setPairingState(STATES.WAITING_FOR_PEER)

      const keypair = await generateEphemeralKeypair()
      ephemeralKeypairRef.current = keypair

      const initiatorPublicKey = await importPublicKey(sessionData.ephemeralPublicKey)
      const sharedSecret = await deriveSharedSecret(keypair.privateKey, initiatorPublicKey)
      const sk = await deriveSessionKey(sharedSecret, sessionData.sessionId)
      sessionKeyRef.current = sk

      const words = await deriveVerificationWords(sk, sessionData.sessionId)
      setVerificationWords(words)

      const signalingUrl = sessionData.signalingUrl || getSignalingUrl()
      const client = new SignalingClient(signalingUrl)
      signalingClientRef.current = client
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

      setPairingState(STATES.VERIFYING)
    } catch (err) {
      console.error('[Pairing] QR scan failed:', err)
      setError(`QR scan failed: ${err.message}`)
      setPairingState(STATES.ERROR)
    }
  }

  if (!isWebCryptoAvailable()) {
    return (
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Unsupported Browser</h2>
        <p className="text-muted-foreground text-sm">
          This browser does not support required encryption features.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Please use Chrome, Firefox, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div>
      {pairingState === STATES.INITIAL && (
        <SettingSection title="Sync bookmarks securely between devices. No account required.">
          <SettingCard>
            <SettingRow
              label="Show QR Code"
              description="Use this device to pair a new one"
              onClick={startAsInitiator}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-primary" />
              </div>
            </SettingRow>
            <SettingRow
              label="Scan QR Code"
              description="This is the new device being paired"
              onClick={startAsResponder}
              isLast
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-primary" />
              </div>
            </SettingRow>
          </SettingCard>
        </SettingSection>
      )}

      {pairingState === STATES.GENERATING && (
        <SettingCard className="p-6">
          <div className="text-center mb-6">
            <h3 className="font-medium">Scan this code</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Open Hypermark on your other device and select "Scan QR Code"
            </p>
          </div>
          <div className="flex justify-center w-full mb-6">
            <QRCodeDisplay
              session={session}
              verificationWords={verificationWords}
              onError={handleError}
            />
          </div>
          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
        </SettingCard>
      )}

      {pairingState === STATES.SCANNING && (
        <SettingCard className="overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h3 className="font-medium text-center">Scan QR Code</h3>
          </div>
          <div className="aspect-square bg-black relative">
            <QRScanner onScanned={handleQRScanned} onError={handleError} />
          </div>
          <div className="p-4">
            <Button variant="ghost" onClick={reset} className="w-full">
              Cancel
            </Button>
          </div>
        </SettingCard>
      )}

      {pairingState === STATES.WAITING_FOR_PEER && (
        <SettingCard className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-6" />
          <h3 className="font-medium mb-2">Connecting...</h3>
          <p className="text-sm text-muted-foreground">Waiting for the other device</p>
        </SettingCard>
      )}

      {pairingState === STATES.VERIFYING && (
        <SettingCard className="p-6">
          <div className="text-center mb-8">
            <h3 className="font-medium mb-2">Verify Pairing</h3>
            <p className="text-sm text-muted-foreground">
              Confirm these words match exactly on both devices
            </p>
          </div>

          <div className="flex justify-center items-center gap-3 p-6 bg-accent/30 rounded-lg border border-border/50 mb-8">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {verificationWords?.[0] || '...'}
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {verificationWords?.[1] || '...'}
            </span>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleWordsMatch}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              They Match
            </Button>
            <Button
              onClick={handleWordsDontMatch}
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Don't Match
            </Button>
          </div>
        </SettingCard>
      )}

      {(pairingState === STATES.TRANSFERRING || pairingState === STATES.IMPORTING) && (
        <SettingCard className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-6" />
          <h3 className="font-medium mb-2">
            {role === 'initiator' ? 'Syncing...' : 'Receiving data...'}
          </h3>
          <p className="text-sm text-muted-foreground">
            Securely transferring encryption keys
          </p>
        </SettingCard>
      )}

      {pairingState === STATES.COMPLETE && (
        <SettingCard className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Pairing Complete</h3>
          <p className="text-muted-foreground text-sm mb-8">
            Your devices are now securely synced.
          </p>
          <Button onClick={reset} className="w-full">
            Done
          </Button>
        </SettingCard>
      )}

      {pairingState === STATES.ERROR && (
        <SettingCard className="p-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <X className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="font-medium mb-2">Pairing Failed</h3>
            <p className="text-destructive text-sm mb-6 px-4">{error}</p>

            <div className="space-y-3">
              <Button onClick={reset} className="w-full">
                Try Again
              </Button>
              
              <div className="mt-6 pt-6 border-t border-border/50 text-left">
                <p className="text-xs font-medium text-muted-foreground mb-2">Troubleshooting</p>
                <ul className="text-xs text-muted-foreground/80 space-y-1 list-disc list-inside">
                  <li>Check internet connection on both devices</li>
                  <li>Ensure signaling server is running</li>
                  <li>Try regenerating the QR code</li>
                </ul>
              </div>
            </div>
          </div>
        </SettingCard>
      )}
    </div>
  )
}


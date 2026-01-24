import { useState, useEffect, useCallback, useRef } from 'react'
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
  arrayBufferToBase64,
  base64ToArrayBuffer,
  isWebCryptoAvailable,
} from '../../services/crypto'
import {
  generatePairingCode,
  parsePairingCode,
  getRoomName,
  derivePSK,
  encryptMessage,
  decryptMessage,
} from '../../services/pairing-code'
import {
  retrieveLEK,
  storeLEK,
  retrieveDeviceKeypair,
  storeDeviceKeypair,
} from '../../services/key-storage'
import { getDeviceInfo } from '../../utils/device-id'
import { addPairedDevice } from '../../services/device-registry'
import { reconnectYjsWebRTC, getYjsStatus } from '../../hooks/useYjs'
import { SignalingClient, getSignalingUrl } from '../../services/signaling'

const STATES = {
  INITIAL: 'initial',
  GENERATING: 'generating',
  ENTERING_CODE: 'entering_code',
  CONNECTING: 'connecting',
  KEY_EXCHANGE: 'key_exchange',
  TRANSFERRING: 'transferring',
  IMPORTING: 'importing',
  COMPLETE: 'complete',
  ERROR: 'error',
}

const MESSAGE_TYPES = {
  KEY_EXCHANGE: 'key-exchange',
  KEY_EXCHANGE_RESPONSE: 'key-exchange-response',
  LEK_TRANSFER: 'lek-transfer',
  ACK: 'ack',
  ERROR: 'error',
}

const SESSION_TIMEOUT_MS = 300000

export default function PairingFlow() {
  const [pairingState, setPairingState] = useState(STATES.INITIAL)
  const [role, setRole] = useState(null)
  const [error, setError] = useState(null)
  const [pairingCode, setPairingCode] = useState(null)
  const [codeInput, setCodeInput] = useState('')
  const [debugLog, setDebugLog] = useState([])

  const addDebugLog = useCallback((msg) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[Pairing] ${msg}`)
    setDebugLog(prev => [...prev.slice(-9), `${timestamp} ${msg}`])
  }, [])
  
  const roleRef = useRef(null)
  const pskRef = useRef(null)
  const ephemeralKeypairRef = useRef(null)
  const sessionKeyRef = useRef(null)
  const signalingClientRef = useRef(null)
  const peerDeviceInfoRef = useRef(null)
  const roomRef = useRef(null)
  const timeoutRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanupPairingState()
    }
  }, [])

  const cleanupPairingState = useCallback(() => {
    pskRef.current = null
    ephemeralKeypairRef.current = null
    sessionKeyRef.current = null
    peerDeviceInfoRef.current = null
    roomRef.current = null
    
    if (signalingClientRef.current) {
      signalingClientRef.current.close()
      signalingClientRef.current = null
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    console.log('[Pairing] Resetting')
    cleanupPairingState()
    setPairingState(STATES.INITIAL)
    setRole(null)
    roleRef.current = null
    setPairingCode(null)
    setCodeInput('')
    setError(null)
  }, [cleanupPairingState])

  const handleError = useCallback((err) => {
    console.error('[Pairing] Error:', err)
    if (!mountedRef.current) return
    setError(err.message || String(err))
    setPairingState(STATES.ERROR)
  }, [])

  const sendEncrypted = useCallback(async (messageType, payload) => {
    if (!pskRef.current || !signalingClientRef.current || !roomRef.current) {
      throw new Error('Not connected')
    }
    
    const message = { type: messageType, ...payload }
    const { ciphertext, iv } = await encryptMessage(pskRef.current, message)
    
    signalingClientRef.current.publish(roomRef.current, {
      encrypted: true,
      ciphertext,
      iv,
    })
  }, [])

  const handleSignalingMessage = useCallback(async (data) => {
    try {
      if (!data.encrypted || !pskRef.current) {
        addDebugLog('Ignoring unencrypted/pre-PSK msg')
        return
      }

      let message
      try {
        message = await decryptMessage(pskRef.current, data.ciphertext, data.iv)
      } catch (decryptError) {
        addDebugLog('Decrypt failed - wrong code?')
        return
      }

      addDebugLog(`Received: ${message.type}`)

      switch (message.type) {
        case MESSAGE_TYPES.KEY_EXCHANGE:
          await handleKeyExchange(message)
          break
        case MESSAGE_TYPES.KEY_EXCHANGE_RESPONSE:
          await handleKeyExchangeResponse(message)
          break
        case MESSAGE_TYPES.LEK_TRANSFER:
          await handleLEKTransfer(message)
          break
        case MESSAGE_TYPES.ACK:
          await handleAck(message)
          break
        case MESSAGE_TYPES.ERROR:
          handleRemoteError(message)
          break
      }
    } catch (err) {
      addDebugLog(`Error: ${err.message}`)
      handleError(err)
    }
  }, [handleError, addDebugLog])

  const handleKeyExchange = async (message) => {
    if (roleRef.current !== 'initiator') return

    const { ephemeralPublicKey, deviceName, deviceId } = message
    console.log('[Pairing] Key exchange from:', deviceName)

    peerDeviceInfoRef.current = { deviceId, deviceName }

    const responderPublicKey = await importPublicKey(ephemeralPublicKey)
    const sharedSecret = await deriveSharedSecret(
      ephemeralKeypairRef.current.privateKey,
      responderPublicKey
    )

    const sessionId = `${roomRef.current}-${Date.now()}`
    const sk = await deriveSessionKey(sharedSecret, sessionId)
    sessionKeyRef.current = sk

    const deviceInfo = getDeviceInfo()
    await sendEncrypted(MESSAGE_TYPES.KEY_EXCHANGE_RESPONSE, {
      ephemeralPublicKey: await exportPublicKey(ephemeralKeypairRef.current.publicKey),
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      sessionId,
    })

    if (!mountedRef.current) return
    setPairingState(STATES.TRANSFERRING)
    await transferLEK(sessionId)
  }

  const handleKeyExchangeResponse = async (message) => {
    if (roleRef.current !== 'responder') return

    const { ephemeralPublicKey, deviceName, deviceId, sessionId } = message
    addDebugLog(`Key response from: ${deviceName}`)

    peerDeviceInfoRef.current = { deviceId, deviceName }

    try {
      const initiatorPublicKey = await importPublicKey(ephemeralPublicKey)
      const sharedSecret = await deriveSharedSecret(
        ephemeralKeypairRef.current.privateKey,
        initiatorPublicKey
      )

      const sk = await deriveSessionKey(sharedSecret, sessionId)
      sessionKeyRef.current = sk
      addDebugLog('Session key derived')

      if (!mountedRef.current) return
      setPairingState(STATES.IMPORTING)
      addDebugLog('State: IMPORTING, waiting for LEK...')
    } catch (err) {
      addDebugLog(`Key derive error: ${err.message}`)
      throw err
    }
  }

  const handleLEKTransfer = async (message) => {
    if (roleRef.current !== 'responder') {
      addDebugLog(`LEK ignored: role=${roleRef.current}`)
      return
    }

    try {
      const { encryptedLEK, iv, deviceId, deviceName, identityPublicKey, sessionId } = message
      addDebugLog(`LEK from: ${deviceName}`)

      // Wait for session key if key-exchange-response is still being processed (race condition)
      if (!sessionKeyRef.current) {
        addDebugLog('Waiting for session key...')
        for (let i = 0; i < 50; i++) {
          await new Promise(r => setTimeout(r, 100))
          if (sessionKeyRef.current) break
        }
      }

      if (!sessionKeyRef.current) {
        addDebugLog('ERROR: Session key timeout!')
        throw new Error('Session key not established')
      }

      addDebugLog('Decrypting LEK...')
      const additionalData = `${sessionId}:${deviceId}`
      const lekRaw = await decryptData(
        sessionKeyRef.current,
        base64ToArrayBuffer(encryptedLEK),
        new Uint8Array(base64ToArrayBuffer(iv)),
        additionalData
      )

      addDebugLog('Importing LEK...')
      const lek = await importLEK(lekRaw, true)
      await storeLEK(lek)

      addDebugLog('LEK stored successfully')

      addPairedDevice({
        deviceId,
        deviceName,
        publicKey: identityPublicKey,
      })

      addDebugLog('Deriving Yjs password...')
      const yjsPassword = await deriveYjsPassword(lek)
      const pwFingerprint = yjsPassword ? `${yjsPassword.substring(0, 8)}...${yjsPassword.slice(-4)}` : 'null'
      addDebugLog(`Password fingerprint: ${pwFingerprint}`)
      addDebugLog('Calling reconnectYjsWebRTC...')
      reconnectYjsWebRTC(yjsPassword)
      const status = getYjsStatus()
      addDebugLog(`Yjs: doc=${status.ydocExists}, aware=${status.awarenessExists}, rtc=${status.webrtcProviderExists}`)

      let deviceKeypair = await retrieveDeviceKeypair()
      if (!deviceKeypair) {
        deviceKeypair = await generateDeviceKeypair()
        await storeDeviceKeypair(deviceKeypair)
      }

      addDebugLog('Sending ACK...')
      const deviceInfo = getDeviceInfo()
      const ourPublicKey = await exportPublicKey(deviceKeypair.publicKey)

      await sendEncrypted(MESSAGE_TYPES.ACK, {
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
        identityPublicKey: ourPublicKey,
      })

      addDebugLog('Pairing complete!')
      if (!mountedRef.current) return
      setPairingState(STATES.COMPLETE)
    } catch (err) {
      addDebugLog(`LEK error: ${err.message}`)
      handleError(new Error(`Failed to import LEK: ${err.message}`))
    }
  }

  const handleAck = async (message) => {
    if (roleRef.current !== 'initiator') return

    const { deviceId, deviceName, identityPublicKey } = message
    addDebugLog(`ACK from: ${deviceName}`)

    addPairedDevice({
      deviceId,
      deviceName,
      publicKey: identityPublicKey,
    })

    try {
      addDebugLog('Retrieving LEK...')
      const lek = await retrieveLEK()
      if (!lek) {
        addDebugLog('ERROR: LEK not found!')
        return
      }
      addDebugLog('Deriving Yjs password...')
      const yjsPassword = await deriveYjsPassword(lek)
      const pwFingerprint = yjsPassword ? `${yjsPassword.substring(0, 8)}...${yjsPassword.slice(-4)}` : 'null'
      addDebugLog(`Password fingerprint: ${pwFingerprint}`)
      reconnectYjsWebRTC(yjsPassword)
      const status = getYjsStatus()
      addDebugLog(`Yjs: doc=${status.ydocExists}, aware=${status.awarenessExists}, rtc=${status.webrtcProviderExists}`)
    } catch (err) {
      addDebugLog(`ACK error: ${err.message}`)
      console.error('[Pairing] ACK handler error:', err)
    }

    if (!mountedRef.current) return
    setPairingState(STATES.COMPLETE)
  }

  const handleRemoteError = (message) => {
    console.error('[Pairing] Error from peer:', message.message)
    handleError(new Error(`Peer error: ${message.message}`))
  }

  const transferLEK = async (sessionId) => {
    try {
      console.log('[Pairing] Transferring LEK...')

      const lek = await retrieveLEK()
      if (!lek) throw new Error('LEK not found')

      const lekRaw = await exportLEK(lek)
      const deviceInfo = getDeviceInfo()
      const additionalData = `${sessionId}:${deviceInfo.id}`

      const { ciphertext, iv } = await encryptData(sessionKeyRef.current, lekRaw, additionalData)

      const deviceKeypair = await retrieveDeviceKeypair()
      const identityPublicKey = await exportPublicKey(deviceKeypair.publicKey)

      await sendEncrypted(MESSAGE_TYPES.LEK_TRANSFER, {
        encryptedLEK: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer),
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
        identityPublicKey,
        sessionId,
      })

      console.log('[Pairing] LEK transferred, waiting for acknowledgment')
    } catch (err) {
      console.error('[Pairing] Failed to transfer LEK:', err)
      handleError(new Error(`Failed to transfer LEK: ${err.message}`))
    }
  }

  const startAsInitiator = async () => {
    try {
      setRole('initiator')
      roleRef.current = 'initiator'
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

      const { code, room, words } = generatePairingCode()
      setPairingCode(code)
      roomRef.current = getRoomName(room)

      const psk = await derivePSK(words)
      pskRef.current = psk

      const keypair = await generateEphemeralKeypair()
      ephemeralKeypairRef.current = keypair

      const client = new SignalingClient()
      signalingClientRef.current = client
      await client.connect()

      client.subscribe(roomRef.current, handleSignalingMessage)

      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        if (pairingState === STATES.GENERATING) {
          handleError(new Error('Session expired. Please try again.'))
        }
      }, SESSION_TIMEOUT_MS)

      console.log('[Pairing] Initiator ready, code:', code)
    } catch (err) {
      console.error('[Pairing] Failed to start as initiator:', err)
      handleError(err)
    }
  }

  const startAsResponder = () => {
    setRole('responder')
    roleRef.current = 'responder'
    setPairingState(STATES.ENTERING_CODE)
  }

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    setDebugLog([])

    try {
      const { room, words } = parsePairingCode(codeInput)
      addDebugLog(`Parsed code, room: ${room}`)

      if (!mountedRef.current) return
      setPairingState(STATES.CONNECTING)
      roomRef.current = getRoomName(room)

      addDebugLog('Deriving PSK...')
      const psk = await derivePSK(words)
      pskRef.current = psk

      addDebugLog('Generating keypair...')
      const keypair = await generateEphemeralKeypair()
      ephemeralKeypairRef.current = keypair

      addDebugLog('Connecting to signaling...')
      const client = new SignalingClient()
      signalingClientRef.current = client
      await client.connect()

      if (!mountedRef.current) return
      addDebugLog(`Subscribing to: ${roomRef.current}`)
      client.subscribe(roomRef.current, handleSignalingMessage)

      addDebugLog('Sending key exchange...')
      const deviceInfo = getDeviceInfo()
      await sendEncrypted(MESSAGE_TYPES.KEY_EXCHANGE, {
        ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
      })

      if (!mountedRef.current) return
      setPairingState(STATES.KEY_EXCHANGE)
      addDebugLog('Waiting for response...')
    } catch (err) {
      console.error('[Pairing] Code submit failed:', err)
      handleError(err)
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
              label="Show Pairing Code"
              description="Display a code to enter on your other device"
              onClick={startAsInitiator}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-primary" />
              </div>
            </SettingRow>
            <SettingRow
              label="Enter Pairing Code"
              description="Type the code shown on your other device"
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
            <h3 className="font-medium">Enter this code on your other device</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Go to Settings → Pair Device → Enter Pairing Code
            </p>
          </div>
          
          <div className="flex justify-center mb-6">
            <div className="bg-accent/30 rounded-xl p-6 border border-border/50">
              <code className="text-3xl font-bold font-mono tracking-wide text-foreground">
                {pairingCode || '...'}
              </code>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Waiting for other device...</span>
          </div>
          
          <p className="text-[10px] text-muted-foreground/60 text-center font-medium uppercase tracking-wider mb-4">
            Code expires in 5 minutes
          </p>
          
          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
        </SettingCard>
      )}

      {pairingState === STATES.ENTERING_CODE && (
        <SettingCard className="p-6">
          <div className="text-center mb-6">
            <h3 className="font-medium">Enter Pairing Code</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Type the code shown on your other device
            </p>
          </div>
          
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="42-apple-river"
              className="input input-bordered w-full text-center text-lg font-mono"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            
            <Button type="submit" className="w-full" disabled={!codeInput.trim()}>
              Connect
            </Button>
          </form>
          
          <Button variant="ghost" onClick={reset} className="w-full mt-3 text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
        </SettingCard>
      )}

      {(pairingState === STATES.CONNECTING || pairingState === STATES.KEY_EXCHANGE) && (
        <SettingCard className="p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <h3 className="font-medium mb-2">Connecting...</h3>
          <p className="text-sm text-muted-foreground mb-4">Establishing secure connection</p>
          {debugLog.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-left">
              <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Debug Log</p>
              <div className="space-y-1 font-mono text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                {debugLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </SettingCard>
      )}

      {(pairingState === STATES.TRANSFERRING || pairingState === STATES.IMPORTING) && (
        <SettingCard className="p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <h3 className="font-medium mb-2">
            {role === 'initiator' ? 'Syncing...' : 'Receiving data...'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Securely transferring encryption keys
          </p>
          {debugLog.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-left">
              <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Debug Log</p>
              <div className="space-y-1 font-mono text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                {debugLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </SettingCard>
      )}

      {pairingState === STATES.COMPLETE && (
        <SettingCard className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Pairing Complete</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Your devices are now securely synced.
          </p>
          {debugLog.length > 0 && (
            <div className="mb-6 p-3 bg-muted/50 rounded-lg text-left">
              <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase">Debug Log</p>
              <div className="space-y-1 font-mono text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                {debugLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
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
                  <li>Make sure you entered the code exactly as shown</li>
                  <li>Check internet connection on both devices</li>
                  <li>The code expires after 5 minutes - get a new one</li>
                </ul>
              </div>
            </div>
          </div>
        </SettingCard>
      )}
    </div>
  )
}

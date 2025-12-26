/**
 * QRScanner Component
 * Handles camera access, QR code scanning, and manual input fallback for pairing responder
 * See: docs/plans/2025-12-27-qrscanner-component-design.md
 */

import { useState, useEffect, useRef } from 'preact/hooks'
import QrScanner from 'qr-scanner'
import { decodeShortCode } from '../../utils/qr'

export default function QRScanner({ onScanned, onError }) {
  const [cameraStatus, setCameraStatus] = useState('requesting') // 'requesting' | 'granted' | 'denied'
  const [scanning, setScanning] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const videoRef = useRef(null)
  const scannerRef = useRef(null)

  // Request camera permission on mount
  useEffect(() => {
    requestCameraPermission()

    return () => {
      // Cleanup on unmount
      if (scannerRef.current) {
        scannerRef.current.stop()
        scannerRef.current.destroy()
      }
    }
  }, [])

  async function requestCameraPermission() {
    setCameraStatus('requesting')

    try {
      // Request camera access with rear camera preference
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // rear camera
      })

      // Stop the test stream (qr-scanner will request again)
      stream.getTracks().forEach((track) => track.stop())

      setCameraStatus('granted')
      initializeScanner()
    } catch (err) {
      console.error('Camera permission error:', err)
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        setCameraStatus('denied')
        setShowManual(true) // Auto-show manual input
      } else {
        onError(new Error(`Camera error: ${err.message}`))
      }
    }
  }

  async function initializeScanner() {
    if (!videoRef.current) return

    try {
      const scanner = new QrScanner(videoRef.current, handleQRDetected, {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: 'environment',
      })

      scannerRef.current = scanner
      await scanner.start()
      setScanning(true)
    } catch (err) {
      console.error('Scanner initialization error:', err)
      onError(new Error(`Scanner initialization failed: ${err.message}`))
      setCameraStatus('denied')
      setShowManual(true)
    }
  }

  async function handleQRDetected(result) {
    try {
      // Parse JSON from QR code
      const sessionData = JSON.parse(result.data)

      // Validate structure
      if (
        !sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
        !sessionData.peerID ||
        !sessionData.deviceName ||
        !sessionData.expires
      ) {
        throw new Error('Invalid QR code format')
      }

      // Check expiry (5 minute window)
      if (Date.now() > sessionData.expires) {
        throw new Error('QR code has expired. Generate a new one.')
      }

      // Stop scanning (success!)
      if (scannerRef.current) {
        scannerRef.current.stop()
      }
      setScanning(false)

      // Fire callback with validated session
      onScanned(sessionData)
    } catch (err) {
      if (err instanceof SyntaxError) {
        // JSON parse error - not a valid pairing QR
        console.warn('Invalid QR code:', err)
        // Don't stop scanning, wait for valid QR
      } else {
        // Validation error - show to user
        console.error('QR validation error:', err)
        onError(err)
        // Stop scanning on validation failure
        if (scannerRef.current) {
          scannerRef.current.stop()
        }
        setScanning(false)
      }
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault()

    try {
      const input = manualInput.trim()

      if (!input) {
        throw new Error('Please enter a pairing code or JSON')
      }

      let sessionData

      // Auto-detect format: short code vs JSON
      if (input.startsWith('HYPER-')) {
        // Decode short code
        sessionData = decodeShortCode(input)
      } else {
        // Parse as JSON
        sessionData = JSON.parse(input)
      }

      // Same validation as QR scanning
      if (
        !sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
        !sessionData.peerID ||
        !sessionData.deviceName ||
        !sessionData.expires
      ) {
        throw new Error('Invalid pairing data')
      }

      // Check expiry
      if (Date.now() > sessionData.expires) {
        throw new Error('Pairing session has expired')
      }

      // Success!
      onScanned(sessionData)
    } catch (err) {
      console.error('Manual input error:', err)
      if (err instanceof SyntaxError) {
        onError(new Error('Invalid JSON format. Please check the pasted data.'))
      } else {
        onError(err)
      }
    }
  }

  return (
    <div class="qr-scanner max-w-md mx-auto p-6">
      {/* Header */}
      <div class="header mb-6 text-center">
        <h2 class="text-2xl font-bold mb-2">Scan QR Code</h2>
        <p class="text-gray-600 text-sm">Point your camera at the QR code</p>
      </div>

      {/* Camera Status: Requesting */}
      {cameraStatus === 'requesting' && (
        <div class="text-center py-12">
          <div class="text-4xl mb-4 animate-pulse">📷</div>
          <p class="text-gray-600">Requesting camera permission...</p>
        </div>
      )}

      {/* Camera Status: Granted */}
      {cameraStatus === 'granted' && (
        <div class="scanner-container">
          <video
            ref={videoRef}
            class="w-full rounded-lg shadow-lg bg-black"
            autoplay
            muted
            playsInline
          />
          {scanning && (
            <p class="text-center text-sm text-gray-600 mt-2">
              Position QR code within frame
            </p>
          )}
        </div>
      )}

      {/* Camera Status: Denied */}
      {cameraStatus === 'denied' && (
        <div class="camera-denied bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p class="text-sm font-medium text-yellow-800 mb-2">
            📷 Camera access denied
          </p>
          <p class="text-xs text-yellow-700">
            Enable camera permission in browser settings or use manual entry
            below
          </p>
        </div>
      )}

      {/* Manual Pairing Toggle */}
      {!showManual && cameraStatus === 'granted' && (
        <button
          onClick={() => setShowManual(true)}
          class="w-full mt-4 text-sm text-gray-600 hover:text-gray-800 underline"
        >
          Can't scan? Enter manually
        </button>
      )}

      {/* Manual Pairing Form */}
      {showManual && (
        <div class="manual-pairing mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 class="text-lg font-semibold mb-3">Manual Pairing</h3>

          <form onSubmit={handleManualSubmit}>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Enter short code or paste JSON:
            </label>
            <textarea
              value={manualInput}
              onInput={(e) => setManualInput(e.target.value)}
              placeholder="HYPER-XXX-XXX-XXX or paste full JSON"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono h-24 resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <button
              type="submit"
              class="w-full mt-3 py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
            >
              Connect
            </button>
          </form>

          {cameraStatus === 'granted' && (
            <button
              onClick={() => setShowManual(false)}
              class="w-full mt-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Back to camera
            </button>
          )}
        </div>
      )}
    </div>
  )
}

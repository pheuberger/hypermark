/**
 * QRScanner Component
 * Handles camera access, QR code scanning, and manual input fallback for pairing responder
 * See: docs/plans/2025-12-27-qrscanner-component-design.md
 */

import { useState, useEffect, useRef } from 'preact/hooks'
import QrScanner from 'qr-scanner'
import { decodeShortCode } from '../../utils/qr'
import { Button } from '../ui/Button'
import { TextArea } from '../ui/Input'

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

    // Skip the test stream on iOS - let qr-scanner handle everything
    try {
      setCameraStatus('granted')
      // Give the DOM a moment to render the video element
      setTimeout(() => {
        initializeScanner()
      }, 100)
    } catch (err) {
      console.error('Camera permission error:', err)
      setCameraStatus('denied')
      setShowManual(true)
      onError(new Error(`Camera error: ${err.message}`))
    }
  }

  async function initializeScanner() {
    if (!videoRef.current) {
      console.error('Video ref not available')
      return
    }

    try {
      console.log('Initializing QR scanner...')
      const scanner = new QrScanner(videoRef.current, handleQRDetected, {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: 'environment',
      })

      scannerRef.current = scanner

      await scanner.start()
      console.log('QR scanner started successfully')
      setScanning(true)
    } catch (err) {
      console.error('Scanner initialization error:', err)

      // Check if it's a permission error
      if (err.name === 'NotAllowedError' || err.message.includes('permission')) {
        setCameraStatus('denied')
        setShowManual(true)
      } else {
        onError(new Error(`Scanner initialization failed: ${err.message}`))
        setCameraStatus('denied')
        setShowManual(true)
      }
    }
  }

  async function handleQRDetected(result) {
    try {
      // Parse JSON from QR code
      const sessionData = JSON.parse(result.data)

      if (
        !sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
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

      if (
        !sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
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
    <div className="max-w-md mx-auto p-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Scan QR Code</h2>
        <p className="text-base-content/60 text-sm">Point your camera at the QR code</p>
      </div>

      {/* Camera Status: Requesting */}
      {cameraStatus === 'requesting' && (
        <div className="text-center py-12 bg-base-200/50 rounded-lg border border-base-200 border-dashed">
          <div className="text-4xl mb-4 animate-pulse">📷</div>
          <p className="text-base-content/60">Requesting camera permission...</p>
        </div>
      )}

      {/* Camera Status: Granted */}
      {cameraStatus === 'granted' && (
        <div className="relative">
          <video
            ref={videoRef}
            className="w-full rounded-xl shadow-lg bg-black border border-base-300"
            autoPlay
            muted
            playsInline
          />
          {scanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-primary/50 rounded-lg animate-pulse shadow-[0_0_0_100vh_rgba(0,0,0,0.5)]"></div>
            </div>
          )}
          {scanning && (
             <p className="text-center text-xs text-base-content/60 mt-4 font-medium">
               Position QR code within frame
             </p>
          )}
        </div>
      )}

      {/* Camera Status: Denied */}
      {cameraStatus === 'denied' && (
        <div className="alert alert-warning mb-6">
           <span className="text-xl">📷</span>
           <div>
            <h3 className="font-bold text-sm">Camera access denied</h3>
            <div className="text-xs">
              Enable camera permission in browser settings or use manual entry below
            </div>
           </div>
        </div>
      )}

      {/* Manual Pairing Toggle */}
      {!showManual && cameraStatus === 'granted' && (
        <button
          onClick={() => setShowManual(true)}
          className="w-full mt-6 text-sm text-base-content/60 hover:text-primary underline transition-colors"
        >
          Can't scan? Enter manually
        </button>
      )}

      {/* Manual Pairing Form */}
      {showManual && (
        <div className="mt-8 pt-6 border-t border-base-200">
          <h3 className="text-lg font-semibold mb-4">Manual Pairing</h3>

          <form onSubmit={handleManualSubmit}>
            <TextArea
              label="Enter short code or paste JSON"
              value={manualInput}
              onChange={(value) => setManualInput(value)}
              placeholder="HYPER-XXX-XXX-XXX or paste full JSON"
              className="font-mono text-sm h-24"
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
            >
              Connect
            </Button>
          </form>

          {cameraStatus === 'granted' && (
            <Button
              variant="ghost"
              onClick={() => setShowManual(false)}
              className="w-full mt-2"
              size="small"
            >
              Back to camera
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

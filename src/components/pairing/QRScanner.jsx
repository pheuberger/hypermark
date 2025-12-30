import { useState, useEffect, useRef } from 'react'
import QrScanner from 'qr-scanner'
import { decodeShortCode } from '../../utils/qr'
import { Button } from '../ui/Button'
import { TextArea } from '../ui/Input'
import { cn } from '@/lib/utils'
import { Camera, AlertCircle } from '../ui/Icons'

export default function QRScanner({ onScanned, onError }) {
  const [cameraStatus, setCameraStatus] = useState('requesting')
  const [scanning, setScanning] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const videoRef = useRef(null)
  const scannerRef = useRef(null)

  useEffect(() => {
    requestCameraPermission()

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop()
        scannerRef.current.destroy()
      }
    }
  }, [])

  async function requestCameraPermission() {
    setCameraStatus('requesting')

    try {
      setCameraStatus('granted')
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
      const sessionData = JSON.parse(result.data)

      if (
        !sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
        !sessionData.deviceName ||
        !sessionData.expires
      ) {
        throw new Error('Invalid QR code format')
      }

      if (Date.now() > sessionData.expires) {
        throw new Error('QR code has expired. Generate a new one.')
      }

      if (scannerRef.current) {
        scannerRef.current.stop()
      }
      setScanning(false)

      onScanned(sessionData)
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.warn('Invalid QR code:', err)
      } else {
        console.error('QR validation error:', err)
        onError(err)
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

      if (input.startsWith('HYPER-')) {
        sessionData = decodeShortCode(input)
      } else {
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

      if (Date.now() > sessionData.expires) {
        throw new Error('Pairing session has expired')
      }

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
    <div className="w-full">
      {cameraStatus === 'requesting' && (
        <div className="text-center py-20 bg-muted/5">
          <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Requesting camera permission...</p>
        </div>
      )}

      {cameraStatus === 'granted' && !showManual && (
        <div className="relative bg-black h-[300px] w-full flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
          {scanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-primary/70 rounded-lg animate-pulse shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
            </div>
          )}
          
          <button
            onClick={() => setShowManual(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors border border-white/10"
          >
            Enter code manually
          </button>
        </div>
      )}

      {cameraStatus === 'denied' && (
        <div className="p-6 text-center bg-destructive/5 rounded-lg border border-destructive/20 mb-6">
           <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
           <h3 className="font-medium text-destructive mb-1">Camera access denied</h3>
           <p className="text-xs text-muted-foreground">
             Enable camera permission in browser settings or use manual entry below
           </p>
        </div>
      )}

      {showManual && (
        <div className="p-6">
          <div className="text-center mb-6">
            <h3 className="font-medium">Manual Pairing</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the short code shown on the other device
            </p>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-4">
            <TextArea
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="HYPER-XXX-XXX-XXX or paste full JSON"
              className="font-mono text-sm min-h-[100px] resize-none"
            />

            <div className="flex gap-3">
              {cameraStatus === 'granted' && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowManual(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                className={cn("flex-1", cameraStatus !== 'granted' && "w-full")}
              >
                Connect
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

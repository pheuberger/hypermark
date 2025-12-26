# QRScanner Component Design

**Date:** 2025-12-27
**Task:** hypermark-2f9.3 - Implement QRScanner component
**Status:** Ready for Implementation

---

## Overview

QRScanner is a simple scanning component for the pairing responder that handles camera access, QR code detection, and manual input fallback. All connection and crypto logic lives in PairingFlow.

**Key Decisions:**
- ✅ Simple display/input component (no connection/crypto logic)
- ✅ Props-driven: receives callbacks from PairingFlow
- ✅ Back camera (environment) default for mobile
- ✅ Manual pairing fallback included in component
- ✅ Auto-show manual input if camera denied

---

## Architecture

### Component Responsibilities

QRScanner is **input-only**:
- ✅ Request camera permission
- ✅ Initialize qr-scanner library
- ✅ Detect and parse QR codes
- ✅ Validate session structure and expiry
- ✅ Show manual input fallback
- ✅ Parse short code or JSON from manual input
- ✅ Fire `onScanned` callback with session data

QRScanner does **NOT**:
- ❌ Perform ECDH key agreement (PairingFlow handles this)
- ❌ Connect via PeerJS (PairingFlow handles this)
- ❌ Derive verification words (PairingFlow handles this)

### Props Interface

```typescript
interface QRScannerProps {
  onScanned: (sessionData: Object) => void
  onError: (error: Error) => void
}
```

**Session Data Structure:**
```javascript
{
  sessionId: string,
  ephemeralPublicKey: string,      // base64-encoded SPKI
  peerID: string,
  deviceName: string,
  expires: number                   // timestamp
}
```

### Component State

```javascript
const [cameraStatus, setCameraStatus] = useState('requesting')  // 'requesting' | 'granted' | 'denied'
const [scanning, setScanning] = useState(false)
const [showManual, setShowManual] = useState(false)
const [manualInput, setManualInput] = useState('')
const videoRef = useRef(null)
const scannerRef = useRef(null)
```

---

## Implementation

### Camera Permission & Initialization

**Request Camera Permission (on mount):**
```javascript
import QrScanner from 'qr-scanner'

useEffect(() => {
  requestCameraPermission()

  return () => {
    // Cleanup on unmount
    scannerRef.current?.stop()
    scannerRef.current?.destroy()
  }
}, [])

async function requestCameraPermission() {
  setCameraStatus('requesting')

  try {
    // Request camera access with rear camera preference
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }  // rear camera
    })

    // Stop the test stream (qr-scanner will request again)
    stream.getTracks().forEach(track => track.stop())

    setCameraStatus('granted')
    initializeScanner()

  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setCameraStatus('denied')
      setShowManual(true)  // Auto-show manual input
    } else {
      onError(new Error(`Camera error: ${err.message}`))
    }
  }
}
```

**Why this approach:**
- Test permission first with getUserMedia
- Stop test stream to avoid conflicts
- qr-scanner will request camera again when initializing
- Auto-show manual input if camera denied
- Cleanup scanner on unmount

**Initialize QR Scanner:**
```javascript
async function initializeScanner() {
  if (!videoRef.current) return

  try {
    const scanner = new QrScanner(
      videoRef.current,
      handleQRDetected,
      {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: 'environment'
      }
    )

    scannerRef.current = scanner
    await scanner.start()
    setScanning(true)

  } catch (err) {
    onError(new Error(`Scanner initialization failed: ${err.message}`))
  }
}
```

**Scanner Options:**
- `returnDetailedScanResult`: Get scan result object with data
- `highlightScanRegion`: Show scanning area overlay
- `highlightCodeOutline`: Highlight detected QR codes
- `preferredCamera`: Use rear camera on mobile

---

## QR Detection & Validation

**Detection Handler:**
```javascript
async function handleQRDetected(result) {
  try {
    // Parse JSON from QR code
    const sessionData = JSON.parse(result.data)

    // Validate structure
    if (!sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
        !sessionData.peerID ||
        !sessionData.deviceName ||
        !sessionData.expires) {
      throw new Error('Invalid QR code format')
    }

    // Check expiry (5 minute window)
    if (Date.now() > sessionData.expires) {
      throw new Error('QR code has expired. Generate a new one.')
    }

    // Stop scanning (success!)
    scannerRef.current?.stop()
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
      onError(err)
      // Stop scanning on validation failure
      scannerRef.current?.stop()
      setScanning(false)
    }
  }
}
```

**Validation Strategy:**
- Required fields: sessionId, ephemeralPublicKey, peerID, deviceName, expires
- Expiry check: reject expired sessions
- Parse errors: silently ignore (might scan wrong QR)
- Validation errors: stop scanning and show error
- Success: stop scanning and fire callback

---

## Manual Pairing Fallback

**Manual Input Handler:**
```javascript
import { decodeShortCode } from '../../utils/qr'

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
    if (!sessionData.sessionId ||
        !sessionData.ephemeralPublicKey ||
        !sessionData.peerID ||
        !sessionData.deviceName ||
        !sessionData.expires) {
      throw new Error('Invalid pairing data')
    }

    // Check expiry
    if (Date.now() > sessionData.expires) {
      throw new Error('Pairing session has expired')
    }

    // Success!
    onScanned(sessionData)

  } catch (err) {
    if (err instanceof SyntaxError) {
      onError(new Error('Invalid JSON format. Please check the pasted data.'))
    } else {
      onError(err)
    }
  }
}
```

**Format Detection:**
- Short code: Starts with `HYPER-` → decode using utils/qr.js
- JSON: Everything else → parse as JSON
- Validation: Same checks as QR scanning
- Errors: Clear messages for parse vs validation failures

---

## UI Design

### Component Structure

```jsx
<div class="qr-scanner max-w-md mx-auto p-6">
  {/* Header */}
  <div class="header mb-6 text-center">
    <h2 class="text-2xl font-bold mb-2">Scan QR Code</h2>
    <p class="text-gray-600 text-sm">
      Point your camera at the QR code
    </p>
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
        Enable camera permission in browser settings or use manual entry below
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
```

### Visual Design Principles

**Layout:**
- Centered, single-column (max 28rem width)
- Camera view prominent when available
- Manual input collapsible for cleaner UI

**Camera View:**
- Video fills container width
- Black background for loading state
- Rounded corners and shadow for depth
- Status text below video

**Manual Input:**
- Gray background to differentiate from camera
- Textarea for flexibility (short code or JSON)
- Monospace font for code readability
- Toggle between camera and manual modes

**Status Feedback:**
- Requesting: Animated camera emoji
- Denied: Yellow alert box with instructions
- Scanning: Instruction text below video

---

## Error Scenarios

### Camera Access Denied

```javascript
if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
  setCameraStatus('denied')
  setShowManual(true)  // Auto-show fallback
  // User sees yellow alert + manual input form
}
```

### Invalid QR Code

```javascript
// Not a JSON QR code
if (err instanceof SyntaxError) {
  console.warn('Invalid QR code:', err)
  // Continue scanning, don't show error
}

// Wrong format QR code
throw new Error('Invalid QR code format')
// onError called, scanning stops, user sees error
```

### Expired Session

```javascript
if (Date.now() > sessionData.expires) {
  throw new Error('QR code has expired. Generate a new one.')
  // User sees error, must restart pairing
}
```

### Camera Initialization Failure

```javascript
catch (err) {
  onError(new Error(`Scanner initialization failed: ${err.message}`))
  // Fallback to manual input
}
```

---

## Dependencies

### Required Packages
- `qr-scanner` (already installed) - QR code detection

### Browser APIs
- `navigator.mediaDevices.getUserMedia()` - Camera access
- `JSON.parse()` - QR data parsing

### Utilities
- `decodeShortCode()` from `utils/qr.js` - Short code decoding

### Bundle Impact
- `qr-scanner`: ~10KB gzipped
- Already included in project dependencies

---

## Testing Checklist

### Unit Tests
- [ ] Camera permission request works
- [ ] Scanner initializes with video element
- [ ] QR detection parses JSON correctly
- [ ] Session validation catches invalid data
- [ ] Expiry check rejects old sessions
- [ ] Manual input detects short code vs JSON
- [ ] Short code decodes correctly
- [ ] JSON parsing handles errors gracefully

### Visual Tests
- [ ] Video element displays camera feed
- [ ] Scanner highlights detected QR codes
- [ ] Manual input toggle shows/hides form
- [ ] Camera denied shows yellow alert
- [ ] Requesting state shows loading animation

### Integration Tests
- [ ] onScanned callback fires with valid session
- [ ] onError callback fires on failures
- [ ] Scanner cleanup on unmount
- [ ] Manual submit fires onScanned

### E2E Tests (Two Devices)
- [ ] Device B scans Device A's QR
- [ ] Valid session passes to PairingFlow
- [ ] Expired QR shows error
- [ ] Short code manual entry works
- [ ] JSON manual entry works
- [ ] Camera denied fallback works

---

## Acceptance Criteria

- [ ] Requests camera permission on mount
- [ ] Uses rear camera (environment facing) by default
- [ ] Initializes qr-scanner library
- [ ] Detects and parses QR codes
- [ ] Validates session structure and expiry
- [ ] Fires onScanned callback with session data
- [ ] Shows manual input fallback
- [ ] Parses short code (HYPER-XXX format)
- [ ] Parses JSON from textarea
- [ ] Auto-shows manual input if camera denied
- [ ] Cleans up scanner on unmount
- [ ] Error handling via onError callback

---

## Future Enhancements

**Camera Switching:**
- Button to switch between front/rear cameras
- Remember user preference in localStorage

**Visual Feedback:**
- Flash animation when QR detected
- Haptic feedback on mobile

**Scanning Improvements:**
- Torch/flashlight toggle for low light
- Zoom controls for distant QR codes

**Accessibility:**
- ARIA labels for screen readers
- Keyboard navigation for manual input
- High contrast mode support

---

**Status:** ✅ Design validated, ready for implementation

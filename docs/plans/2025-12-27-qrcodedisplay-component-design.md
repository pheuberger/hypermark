# QRCodeDisplay Component Design

**Date:** 2025-12-27
**Task:** hypermark-2f9.2 - Implement QRCodeDisplay component
**Status:** Ready for Implementation

---

## Overview

QRCodeDisplay is a simple display component for the pairing initiator that encodes the session data as a QR code, shows verification words after ECDH completes, and provides manual pairing fallbacks.

**Key Decisions:**
- ✅ Simple display component (no connection/crypto logic)
- ✅ Props-driven: receives session and verification words from PairingFlow
- ✅ Short code + JSON copy for manual pairing
- ✅ Progressive disclosure: verification words appear after ECDH

---

## Architecture

### Component Responsibilities

QRCodeDisplay is **display-only**:
- ✅ Encode session as QR code
- ✅ Show QR code prominently
- ✅ Display verification words when available
- ✅ Generate short code for manual entry
- ✅ Provide copy-to-clipboard buttons

QRCodeDisplay does **NOT**:
- ❌ Manage PeerJS connections (PairingFlow handles this)
- ❌ Perform ECDH or crypto operations (PairingFlow handles this)
- ❌ Handle pairing state machine (PairingFlow handles this)

### Props Interface

```typescript
interface QRCodeDisplayProps {
  session: {
    sessionId: string
    ephemeralPublicKey: string      // base64-encoded SPKI
    peerID: string
    deviceName: string
    expires: number                  // timestamp
  }
  verificationWords: [string, string] | null  // null until ECDH completes
  onError: (error: Error) => void
}
```

### Component State

```javascript
const [qrDataUrl, setQrDataUrl] = useState(null)      // QR code as data URL
const [shortCode, setShortCode] = useState(null)      // HYPER-XXX-XXX format
const [copied, setCopied] = useState(false)           // 'short' | 'json' | false
```

---

## Implementation

### QR Code Generation

**On Component Mount:**
```javascript
import QRCode from 'qrcode'
import { encodeShortCode } from '../../utils/qr'

useEffect(() => {
  if (!session) return
  generateQR()
}, [session])

async function generateQR() {
  try {
    // Encode session as JSON
    const payload = JSON.stringify(session)

    // Generate QR code as data URL
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',  // Medium error correction (15% damage tolerance)
      margin: 2,                   // 2-module quiet zone
      width: 300,                  // 300x300 pixels
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })

    setQrDataUrl(dataUrl)

    // Also generate short code
    const code = encodeShortCode(session)
    setShortCode(code)

  } catch (err) {
    onError(new Error(`Failed to generate QR: ${err.message}`))
  }
}
```

**Why these settings:**
- Error correction 'M': Good balance of data capacity and error tolerance
- 300x300px: Large enough to scan easily, not too large for mobile screens
- Data URL: Easy to display as `<img src={dataUrl}>`, no file handling needed

### Short Code Encoding

**Utility: utils/qr.js**
```javascript
import bs58 from 'bs58'
import pako from 'pako'

/**
 * Encode session as short code: HYPER-XXX-XXX-XXX
 * Uses compression + base58 to reduce ~250 char JSON to ~100 char code
 * @param {Object} session - Session object
 * @returns {string} - Formatted short code
 */
export function encodeShortCode(session) {
  // 1. JSON stringify
  const json = JSON.stringify(session)

  // 2. Compress with pako (deflate algorithm)
  const compressed = pako.deflate(new TextEncoder().encode(json))

  // 3. Base58 encode (Bitcoin alphabet, no ambiguous 0/O or 1/I/l)
  const base58 = bs58.encode(compressed)

  // 4. Format as HYPER-XXX-XXX-XXX for readability
  const chunks = base58.match(/.{1,6}/g) || []
  return `HYPER-${chunks.join('-')}`
}

/**
 * Decode short code back to session object
 * @param {string} shortCode - HYPER-XXX-XXX-XXX format
 * @returns {Object} - Session object
 */
export function decodeShortCode(shortCode) {
  // Remove HYPER- prefix and hyphens
  const base58Str = shortCode.replace(/^HYPER-/, '').replace(/-/g, '')

  // Base58 decode
  const compressed = bs58.decode(base58Str)

  // Decompress
  const json = pako.inflate(compressed, { to: 'string' })

  // Parse JSON
  return JSON.parse(json)
}
```

**Why base58 + compression:**
- Base58 alphabet avoids ambiguous characters (no 0/O, 1/I/l)
- Compression reduces JSON from ~250 chars to ~100 chars
- Hyphen-separated chunks aid manual entry
- Still short enough to type if needed

---

## UI Design

### Component Structure

```jsx
<div class="qr-code-display max-w-md mx-auto p-6 text-center">
  {/* Header */}
  <div class="header mb-6">
    <h2 class="text-2xl font-bold mb-2">Scan to Pair</h2>
    <p class="text-gray-600 text-sm">
      Scan this QR code with your other device
    </p>
  </div>

  {/* QR Code */}
  {qrDataUrl && (
    <div class="qr-container bg-white p-4 rounded-lg shadow-lg inline-block mb-6">
      <img
        src={qrDataUrl}
        alt="Pairing QR Code"
        class="w-[300px] h-[300px]"
      />
    </div>
  )}

  {/* Verification Words (progressive disclosure) */}
  {verificationWords && (
    <div class="verification-section bg-blue-50 p-4 rounded-lg mb-6">
      <h3 class="text-lg font-semibold mb-3">Verification Words</h3>
      <div class="words-display flex justify-center items-center gap-3 mb-2">
        <span class="word text-3xl font-bold lowercase">
          {verificationWords[0]}
        </span>
        <span class="separator text-2xl text-gray-400">·</span>
        <span class="word text-3xl font-bold lowercase">
          {verificationWords[1]}
        </span>
      </div>
      <p class="text-sm text-gray-600">
        Confirm these match on the other device
      </p>
    </div>
  )}

  {/* Manual Pairing Options (collapsed by default) */}
  <details class="manual-pairing text-left bg-gray-50 p-4 rounded-lg mb-4">
    <summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
      Can't scan? Enter manually
    </summary>

    <div class="mt-4 space-y-4">
      {/* Short Code */}
      <div class="short-code-section">
        <label class="block text-xs font-medium text-gray-700 mb-1">
          Short Code:
        </label>
        <div class="flex gap-2">
          <code class="flex-1 px-3 py-2 bg-white border rounded text-sm font-mono">
            {shortCode}
          </code>
          <button
            onClick={copyShortCode}
            class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
          >
            {copied === 'short' ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Full JSON */}
      <div class="full-json-section">
        <label class="block text-xs font-medium text-gray-700 mb-1">
          Or copy full payload:
        </label>
        <button
          onClick={copyFullJSON}
          class="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition-colors"
        >
          {copied === 'json' ? '✓ Copied JSON' : 'Copy JSON'}
        </button>
      </div>
    </div>
  </details>

  {/* Expiry Warning */}
  <p class="text-sm text-gray-500">
    ⏱ Session expires in 5 minutes
  </p>
</div>
```

### Visual Design Principles

**Layout:**
- Centered, single-column layout (max 28rem width)
- Clear visual hierarchy: QR → words → manual options
- Good spacing between sections for scannability

**QR Code:**
- White padding around code for contrast
- Shadow for depth
- 300x300px size: large enough to scan easily

**Verification Words:**
- Blue background to differentiate from QR
- Large, bold typography (3xl) for readability
- Lowercase for consistency with EFF wordlist

**Manual Options:**
- Collapsed by default (`<details>`) to reduce clutter
- Short code in monospace font for clarity
- Copy buttons with instant feedback

**Progressive Disclosure:**
- Verification words only appear after ECDH completes
- Manual options hidden until user needs them

---

## Clipboard Functionality

### Copy Handlers

```javascript
async function copyShortCode() {
  try {
    await navigator.clipboard.writeText(shortCode)
    setCopied('short')

    // Reset after 2 seconds
    setTimeout(() => setCopied(false), 2000)
  } catch (err) {
    onError(new Error('Failed to copy short code'))
  }
}

async function copyFullJSON() {
  try {
    const json = JSON.stringify(session, null, 2)  // Pretty print
    await navigator.clipboard.writeText(json)
    setCopied('json')

    // Reset after 2 seconds
    setTimeout(() => setCopied(false), 2000)
  } catch (err) {
    onError(new Error('Failed to copy JSON'))
  }
}
```

### Clipboard API Support

**Modern browsers (Chrome, Firefox, Safari, Edge):**
- `navigator.clipboard.writeText()` works without prompts
- No user permission dialog for write operations
- Async/await pattern for clean error handling

**Visual Feedback:**
- Button text changes: 'Copy' → '✓ Copied'
- Auto-reset after 2 seconds
- Prevents multiple simultaneous copies

**Error Handling:**
- Delegates to parent via `onError` callback
- User sees inline error in PairingFlow

---

## Dependencies

### Required Packages
- `qrcode` (already installed) - QR code generation
- `bs58` (already installed) - Base58 encoding
- `pako` (needs installation) - Deflate compression

### Installation
```bash
npm install pako
```

### Bundle Impact
- `qrcode`: ~10KB gzipped
- `bs58`: ~3KB gzipped
- `pako`: ~15KB gzipped
- **Total:** ~28KB additional (acceptable for core feature)

---

## Error Scenarios

### QR Generation Fails
```javascript
try {
  const dataUrl = await QRCode.toDataURL(payload, options)
} catch (err) {
  onError(new Error(`Failed to generate QR: ${err.message}`))
  // User sees error in PairingFlow ERROR state
}
```

### Clipboard API Unavailable
```javascript
try {
  await navigator.clipboard.writeText(shortCode)
} catch (err) {
  onError(new Error('Failed to copy to clipboard'))
  // Fallback: Could show manual "copy text" instruction
}
```

### Session Prop Missing
```javascript
if (!session) {
  // Don't generate QR, wait for session from parent
  return <div>Loading...</div>
}
```

---

## Testing Checklist

### Unit Tests
- [ ] QR code generates correctly from session data
- [ ] Short code encodes/decodes session accurately
- [ ] Clipboard copy triggers correctly
- [ ] Copy feedback resets after 2 seconds
- [ ] Error callback fires on failures

### Visual Tests
- [ ] QR code displays at correct size
- [ ] Verification words appear when prop changes from null
- [ ] Manual options expand/collapse
- [ ] Copy button feedback works
- [ ] Layout responsive on mobile

### Integration Tests
- [ ] QR code scans correctly on another device
- [ ] Short code pastes and decodes on QRScanner
- [ ] Full JSON pastes and parses correctly
- [ ] Error propagates to PairingFlow

### E2E Tests (Two Devices)
- [ ] Device A shows QR
- [ ] Device B scans QR
- [ ] Verification words appear on both devices
- [ ] Words match on both devices
- [ ] Manual entry works as alternative

---

## Acceptance Criteria

- [ ] Generates QR code from session data
- [ ] Displays 300x300px QR code with padding and shadow
- [ ] Shows verification words when available (progressive disclosure)
- [ ] Generates short code (HYPER-XXX-XXX format)
- [ ] Copy short code to clipboard works
- [ ] Copy full JSON to clipboard works
- [ ] Copy feedback (button text change) works
- [ ] Manual options collapsed by default
- [ ] Session expiry hint displayed
- [ ] Error handling via onError callback
- [ ] Responsive layout (mobile + desktop)

---

## Future Enhancements

**Countdown Timer:**
- Show remaining time until session expires
- Update every second: "4:32 remaining"

**QR Code Animations:**
- Subtle pulse animation while waiting for scan
- Green checkmark overlay when scanned

**Manual Entry Improvements:**
- Show copy icon (📋) instead of text
- Toast notification on successful copy
- Auto-select text on click

**Accessibility:**
- ARIA labels for screen readers
- Keyboard navigation for copy buttons
- High contrast mode support

---

**Status:** ✅ Design validated, ready for implementation

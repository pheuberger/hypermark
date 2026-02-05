# Security Architecture

## Threat Model

### In Scope

**Primary adversaries:**
- **Passive network eavesdropping** - WiFi sniffers, ISP monitoring, network operators
- **Active MITM during pairing** - Compromised signaling server attempting to impersonate a device
- **Unauthorized device access** - Someone trying to pair without physical access to an existing device

### Out of Scope

**Not defending against:**
- Device compromise (malware, unlocked phone left unattended)
- State-level targeted attacks requiring infrastructure compromise
- Timing/traffic analysis attacks
- Perfect forward secrecy for historical data if device is compromised

### Trust Assumptions

- Users can physically verify pairing codes or QR codes on trusted devices
- WebRTC's DTLS encryption is secure
- Device local storage is secure (protected by OS/browser)
- Users will notice if someone unauthorized pairs a device

---

## Architecture Layers

### Layer 1: Transport Encryption (WebRTC DTLS)

**What it provides:**
- All data encrypted in transit with DTLS 1.2+
- Perfect forward secrecy
- Authenticated encryption (AES-GCM)
- Protection against passive eavesdropping

**What it doesn't provide:**
- Protection against MITM during initial WebRTC negotiation
- End-to-end encryption if signaling server is compromised

### Layer 2: Pairing Protocol (This Document)

**What it provides:**
- MITM-resistant device pairing via out-of-band verification
- Device authentication using public key cryptography
- Trusted device registry

**Implementation:** QR code or manual verification code

### Layer 3: Application E2EE (Implemented via Nostr Sync)

**What it provides:**
- Zero-trust architecture (signaling server and Nostr relays never see plaintext)
- Content encrypted with AES-256-GCM before leaving device
- Ledger Encryption Key (LEK) shared across paired devices
- Deterministic Nostr keypair derived from LEK for cross-device identity

**Status:** Fully implemented. All bookmark data is encrypted before publishing to Nostr relays. See [Nostr Sync Architecture](nostr-sync-architecture.md) for details.

---

## Pairing Protocol Specification

### Goals

1. **Authenticate devices** - Ensure you're pairing with the intended device
2. **Prevent MITM** - Signaling server cannot impersonate a device
3. **User-friendly** - One-time setup, works with/without camera
4. **Forward-compatible** - Can add application-level E2EE later without breaking

### Overview

```
┌──────────────┐                                ┌──────────────┐
│  Device A    │                                │  Device B    │
│  (Existing)  │                                │    (New)     │
└──────┬───────┘                                └──────┬───────┘
       │                                               │
       │ 1. Generate pairing token                    │
       │    - Peer ID                                 │
       │    - Device public key                       │
       │    - Pairing verification code (6 digits)    │
       │                                               │
       │ 2. Display as QR code                        │
       │    OR show text for manual entry             │
       │                                               │
       │◄──────────────────────────────────────────────┤ 3. Scan QR
       │                                               │    OR paste text
       │                                               │
       │                                               │ 4. Show verification
       │                                               │    code on screen
       │                                               │
       │ 5. User verifies codes match                 │
       │    on both devices                           │
       │                                               │
       │ 6. WebRTC connection established             │
       │◄─────────────────────────────────────────────►│
       │                                               │
       │ 7. Device B sends its public key             │
       │◄──────────────────────────────────────────────┤
       │                                               │
       │ 8. Both save each other as authorized        │
       │                                               │
```

### Step-by-Step Protocol

#### 1. Device A: Generate Pairing Token

When user clicks "Pair New Device":

```javascript
const pairingToken = {
  version: 1,
  peerId: myPeerId,                    // PeerJS ID (e.g., "abc123xyz")
  publicKey: myPublicKey,              // Device's Ed25519 public key (32 bytes)
  timestamp: Date.now(),               // Token expiry
  verificationCode: generateCode()     // 6-digit numeric code
}

// Serialize
const tokenString = base64url.encode(JSON.stringify(pairingToken))

// Generate verification code (deterministic from token)
const verificationCode = HKDF(
  hash(tokenString),
  salt: "hypermark-pairing-v1",
  outputLength: 6 digits
) // e.g., "482193"
```

**Token format:**
```
eyJ2ZXJzaW9uIjoxLCJwZWVySWQiOiJhYmMxMjMiLCJwdWJsaWNLZXkiOiIuLi4iLCJ0aW1lc3RhbXAiOjE3MDk4NTAwMDB9
```

#### 2. Device A: Display Token

**Primary method (QR code):**
- Display QR code containing `tokenString`
- Display verification code prominently: **"482193"**
- Show expiry countdown (5 minutes)

**Fallback method (no camera):**
- Show "No camera? Click here"
- Display `tokenString` as copyable text
- Display verification code: **"482193"**

#### 3. Device B: Scan or Paste Token

**Primary method:**
- Scan QR code
- Parse `tokenString`
- Validate:
  - Version matches
  - Timestamp is fresh (< 5 minutes old)
  - Peer ID format is valid
  - Public key is valid Ed25519 key

**Fallback method:**
- Show text input field
- User pastes `tokenString`
- Same validation

#### 4. Device B: Display Verification Code

Extract and display the verification code:
```javascript
const verificationCode = HKDF(
  hash(tokenString),
  salt: "hypermark-pairing-v1",
  outputLength: 6 digits
)

// Show on screen in large font:
"Does Device A show: 482193 ?"
[Yes] [No]
```

#### 5. User Verification (Trust-on-First-Use)

**User compares codes:**
- Device A shows: **482193**
- Device B shows: **"Does Device A show: 482193?"**

**If codes match:** User taps "Yes" → proceed
**If codes don't match:** MITM attack detected → abort

**Why this works:**
- Signaling server can't predict verification code without `tokenString`
- `tokenString` is transmitted out-of-band (QR/physical paste)
- Attacker would need to intercept QR code or clipboard, not just network

#### 6. Establish WebRTC Connection

Device B initiates connection:
```javascript
peer.connect(pairingToken.peerId)
```

**Note:** At this point, WebRTC DTLS encryption kicks in. Even if signaling is compromised, the verification code check in step 5 prevents MITM.

#### 7. Exchange Device Public Keys

Once WebRTC connection is open:

**Device B sends:**
```javascript
connection.send({
  type: 'pairing-handshake',
  publicKey: myPublicKey,
  peerId: myPeerId,
  deviceName: "John's iPhone"  // User-set or default
})
```

**Device A receives and validates:**
- Check signature (future: can sign messages with private key)
- Verify device isn't already paired
- Store authorized device

#### 8. Mutual Authorization

Both devices save each other:

```javascript
authorizedDevices = [
  {
    peerId: "abc123",
    publicKey: "...",
    deviceName: "John's Laptop",
    pairedAt: 1709850000,
    lastSeen: 1709850000
  }
]
localStorage.setItem('authorized-devices', JSON.stringify(authorizedDevices))
```

**Future:** Can use public keys to verify message signatures, detect impersonation.

---

## Security Properties

### What This Achieves

✅ **MITM-resistant pairing** - Attacker can't impersonate Device A without showing same verification code

✅ **Out-of-band verification** - QR code or physical paste bypasses network attacker

✅ **User-visible security** - User sees and verifies code, detects mismatches

✅ **Device authentication** - After pairing, devices know each other's public keys

✅ **Revocation** - User can unpair devices from UI

✅ **Works offline** - QR code/paste works on same LAN without internet

### What This Doesn't Achieve (By Design)

❌ **Perfect forward secrecy per-message** - WebRTC provides PFS, but Nostr events use static LEK-derived keys

❌ **Anonymous pairing** - Signaling server knows which peer IDs are connecting (metadata leak)

❌ **Anonymous Nostr sync** - Relays see the same pubkey for all devices with same LEK (identity correlation)

❌ **Protection after device compromise** - If attacker steals device, they have access (use device lock screen)

---

## Attack Scenarios

### Attack 1: Passive Network Eavesdropping

**Attacker:** WiFi sniffer at coffee shop

**Protection:** WebRTC DTLS encryption

**Result:** ✅ Defended - Attacker sees encrypted traffic only

---

### Attack 2: Compromised Signaling Server (MITM During Pairing)

**Attacker:** Malicious or hacked PeerJS server

**Attack flow:**
```
Device A ──[wants to pair]──> PeerJS (attacker)
                                     │
                                     ▼
                              Attacker creates fake
                              Device B connection
```

**Protection:** Verification code mismatch

**What happens:**
1. Device A shows QR with verification code `482193`
2. Attacker intercepts, tries to MITM
3. Device B (real) receives different WebRTC connection parameters
4. Verification code computed from different values → different code `591847`
5. **User sees mismatch, aborts pairing**

**Result:** ✅ Defended - User detects attack

---

### Attack 3: QR Code Interception (Physical Access)

**Attacker:** Takes photo of QR code over user's shoulder

**What attacker gets:**
- Peer ID
- Public key (not private!)
- Verification code

**Can they pair?**
- Attacker can *try* to connect using peer ID
- But Device A will receive connection from unknown peer ID (attacker's ID)
- Device A shows verification code for *attacker's* connection
- Codes won't match original QR code

**Result:** ✅ Defended - Original pairing proceeds, attacker's connection rejected

---

### Attack 4: Replay Attack (Reuse Old QR)

**Attacker:** Uses expired QR code from trash

**Protection:** Timestamp validation

**Result:** ✅ Defended - Device B rejects expired token (> 5 minutes old)

---

### Attack 5: Signaling Server Learns Metadata

**Attacker:** PeerJS logs connections

**What they learn:**
- Peer IDs connecting to each other
- Connection times
- Approximate data volume (encrypted)

**What they don't learn:**
- Bookmark content
- Document structure
- Which devices belong to same user (unless correlation)

**Result:** ⚠️ Metadata leak accepted for MVP (use self-hosted signaling to eliminate)

---

## Implementation Notes

### Cryptographic Primitives

**Key generation:**
```javascript
// Use WebCrypto API
const keyPair = await crypto.subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256"  // Or Ed25519 when broadly supported
  },
  false,  // Non-extractable for security
  ["sign", "verify"]
)
```

**Verification code derivation:**
```javascript
function deriveVerificationCode(tokenString) {
  const hash = sha256(tokenString)
  const hkdf = HKDF(hash, "hypermark-pairing-v1", 32)
  const numeric = bytesToBigInt(hkdf) % 1000000
  return numeric.toString().padStart(6, '0')  // "482193"
}
```

### Token Expiry

**Pairing tokens expire after 5 minutes:**
- Forces attacker to act quickly if they intercept QR
- Reduces window for attacks
- User-friendly (most pairings complete in < 30 seconds)

**On expiry:**
- User must generate new QR code
- Old tokens rejected by Device B

### Device Name Collision

**Problem:** User pairs "iPhone" three times, can't tell them apart

**Solution:**
```javascript
deviceName = userInput || `${platform} (${peerId.slice(0, 6)})`
// e.g., "iPhone (abc123)" or "Linux (xyz789)"
```

### Revoking Devices

**Soft revocation (MVP):**
```javascript
// Remove from authorized list
authorizedDevices = authorizedDevices.filter(d => d.peerId !== targetPeerId)

// Close active connection
connections.get(targetPeerId)?.close()
```

**Limitation:** Revoked device keeps cached data. For strong revocation, need to rotate ledger encryption key (future feature).

---

## Future Enhancements

### ~~Phase 2: Application-Level E2EE~~ (Completed)

Application-level E2EE is now implemented via Nostr sync:
- LEK is exchanged during pairing via ECDH-derived session key
- All bookmark content is encrypted with AES-256-GCM before publishing
- Nostr keypair is deterministically derived from LEK
- See `src/services/nostr-sync.js` and `src/services/nostr-crypto.js`

### Phase 3: Device Signatures

Sign all messages to prevent impersonation after pairing:

```javascript
// Sender
const signature = await crypto.subtle.sign(
  { name: "ECDSA", hash: "SHA-256" },
  privateKey,
  JSON.stringify(message)
)

connection.send({ message, signature })

// Receiver
const isValid = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  senderPublicKey,
  signature,
  JSON.stringify(message)
)
```

### Phase 4: Self-Hosted Signaling

Replace PeerJS with Raspberry Pi relay:
- Eliminates metadata leakage to third party
- Full control over infrastructure
- Same pairing protocol applies

---

## Security Checklist

**MVP (Completed):**

- [x] Implement QR code pairing with verification code display
- [x] Add manual text fallback for devices without cameras
- [x] Validate token timestamps (5 minute expiry)
- [x] Generate device keypairs using WebCrypto (non-extractable)
- [x] Store authorized devices in IndexedDB
- [x] Show clear "Verify this code" UI with verification words
- [x] Add device removal (unpair) functionality
- [x] Test verification code mismatch scenario
- [x] Ensure verification words are deterministic from session
- [x] Add user-facing device names for identification
- [x] Implement application-level E2EE via Nostr sync

**Future work:**

- [ ] Security audit of pairing protocol
- [ ] Pen test MITM scenarios
- [ ] Add rate limiting for pairing attempts
- [ ] Implement device signature verification
- [ ] Perfect forward secrecy for Nostr events

---

## References

**Similar approaches:**
- **Signal:** Safety numbers (fingerprint verification)
- **WhatsApp:** QR code pairing with security codes
- **Telegram:** End-to-end encryption with verification
- **PAKE protocols:** SRP, OPAQUE (overkill for our threat model)

**Standards:**
- WebRTC Security Architecture: RFC 8827
- DTLS 1.2: RFC 6347
- HKDF: RFC 5869

---

## Appendix: Code Example

### Complete Pairing Flow

```javascript
// Device A: Generate pairing token
async function generatePairingToken() {
  const token = {
    version: 1,
    peerId: peer.id,
    publicKey: await exportPublicKey(deviceKeyPair.publicKey),
    timestamp: Date.now()
  }

  const tokenString = base64url.encode(JSON.stringify(token))
  const verificationCode = await deriveVerificationCode(tokenString)

  // Display QR code and verification code
  showQRCode(tokenString)
  showVerificationCode(verificationCode)

  return { tokenString, verificationCode }
}

// Device B: Parse and verify token
async function parsePairingToken(tokenString) {
  const token = JSON.parse(base64url.decode(tokenString))

  // Validate
  if (token.version !== 1) throw new Error('Invalid version')
  if (Date.now() - token.timestamp > 5 * 60 * 1000) {
    throw new Error('Token expired')
  }

  // Compute verification code
  const verificationCode = await deriveVerificationCode(tokenString)

  // Show to user for verification
  const userConfirmed = await showVerificationPrompt(verificationCode)

  if (!userConfirmed) {
    throw new Error('User rejected pairing')
  }

  // Proceed with connection
  return token
}

// Derive verification code (6 digits)
async function deriveVerificationCode(input) {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)

  // Take first 4 bytes, convert to number, mod 1M
  const num = new DataView(hashArray.buffer).getUint32(0) % 1000000

  return num.toString().padStart(6, '0')
}
```

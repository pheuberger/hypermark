# Derive Yjs Password from LEK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Derive Yjs room password from LEK using HMAC instead of exporting raw LEK, improving security by not exposing the master encryption key to the Yjs network layer.

**Architecture:** Add a `deriveYjsPassword()` function that uses HMAC-SHA256 to derive a password from the LEK without exporting it. Update all Yjs integration points to use derived password. Change LEK import to be non-extractable by default, but keep generation extractable to support pairing new devices.

**Tech Stack:** Web Crypto API (HMAC), Yjs, Preact

**Security Improvement:**
- Yjs network layer never sees the actual LEK
- Compromised Yjs password doesn't compromise bookmark encryption
- LEK can be non-extractable on devices that receive it via pairing
- Reduces blast radius of potential key compromise

---

## Task 1: Add Yjs Password Derivation Function

**Files:**
- Modify: `src/services/crypto.js` (add new function after `exportLEK`)
- Test: Manual testing (crypto operations are hard to unit test in browser context)

**Step 1: Write deriveYjsPassword function**

Add this function to `src/services/crypto.js` after the `exportLEK` function:

```javascript
/**
 * Derive Yjs room password from LEK using HMAC
 * This allows us to keep LEK non-extractable while still generating a password
 * The derived password is different from the LEK itself (defense in depth)
 * @param {CryptoKey} lek - LEK to derive password from
 * @returns {Promise<string>} - Base64-encoded derived password
 */
export async function deriveYjsPassword(lek) {
  try {
    // Use HMAC to derive a password from the LEK
    // We use a fixed salt/info to ensure all devices derive the same password
    const info = new TextEncoder().encode('hypermark-yjs-room-password-v1')

    // Sign the info string with the LEK to derive a deterministic password
    // This works even if LEK is non-extractable
    const derivedBytes = await crypto.subtle.sign(
      'HMAC',
      lek,
      info
    )

    // Convert to base64 for use as Yjs room password
    return arrayBufferToBase64(derivedBytes)
  } catch (error) {
    console.error('Failed to derive Yjs password:', error)
    throw new Error('Failed to derive Yjs password: ' + error.message)
  }
}
```

**Step 2: Export the new function**

Verify that `deriveYjsPassword` is added to the exports. Check the crypto.js exports are visible by running:

```bash
grep -n "export.*deriveYjsPassword" src/services/crypto.js
```

Expected: Function is exported (should show the line with `export async function deriveYjsPassword`)

**Step 3: Commit**

```bash
git add src/services/crypto.js
git commit -m "feat: add deriveYjsPassword function for LEK-derived room password"
```

---

## Task 2: Update PairingFlow to Use Derived Password (Responder Path)

**Files:**
- Modify: `src/components/pairing/PairingFlow.jsx:559-578`

**Step 1: Import the new function**

Find the imports from crypto.js at the top of PairingFlow.jsx (around line 12-29) and add `deriveYjsPassword`:

```javascript
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
  deriveYjsPassword, // Add this
  generateUUID,
  generateRandomBytes,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  hashForVerification,
} from '../../services/crypto'
```

**Step 2: Update handlePairingComplete to use derived password**

Replace the Yjs setup section in `handlePairingComplete` function (around line 559-578):

Find this code:
```javascript
    // Import LEK as extractable (needed for future pairing and Yjs sync)
    const lek = await importLEK(lekRaw, true)
    await storeLEK(lek)

    console.log('LEK imported successfully')

    // Store initiator's device metadata in Yjs
    addPairedDevice({
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      peerID: session.value.peerID,
      publicKey: identityPublicKey,
    })
    console.log('[PairingFlow] Stored initiator device in Yjs')

    // Enable Yjs P2P sync with LEK as room password
    const lekBase64 = await exportLEK(lek)
    setYjsRoomPassword(lekBase64)
    reconnectYjsWebRTC()
    console.log('[PairingFlow] Yjs P2P sync enabled with shared LEK')
```

Replace with:
```javascript
    // Import LEK as non-extractable (received devices don't need to export)
    // Note: Initiator device keeps LEK extractable to pair additional devices
    const lek = await importLEK(lekRaw, false)
    await storeLEK(lek)

    console.log('LEK imported successfully as non-extractable')

    // Store initiator's device metadata in Yjs
    addPairedDevice({
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      peerID: session.value.peerID,
      publicKey: identityPublicKey,
    })
    console.log('[PairingFlow] Stored initiator device in Yjs')

    // Enable Yjs P2P sync with derived password (not raw LEK)
    const yjsPassword = await deriveYjsPassword(lek)
    setYjsRoomPassword(yjsPassword)
    reconnectYjsWebRTC()
    console.log('[PairingFlow] Yjs P2P sync enabled with derived password')
```

**Step 3: Verify the change**

```bash
grep -A 3 "deriveYjsPassword" src/components/pairing/PairingFlow.jsx
```

Expected: Should show the new usage of `deriveYjsPassword(lek)`

**Step 4: Commit**

```bash
git add src/components/pairing/PairingFlow.jsx
git commit -m "feat: responder uses derived Yjs password instead of raw LEK"
```

---

## Task 3: Update PairingFlow to Use Derived Password (Initiator Path)

**Files:**
- Modify: `src/components/pairing/PairingFlow.jsx:608-630`

**Step 1: Update handlePairingAck to use derived password**

Find the `handlePairingAck` function (around line 608-630) and locate this section:

```javascript
  // Enable Yjs P2P sync with LEK as room password
  const lek = await retrieveLEK()
  const lekBase64 = await exportLEK(lek)
  setYjsRoomPassword(lekBase64)
  reconnectYjsWebRTC()
  console.log('[PairingFlow] Yjs P2P sync enabled with shared LEK')
```

Replace with:
```javascript
  // Enable Yjs P2P sync with derived password (not raw LEK)
  const lek = await retrieveLEK()
  const yjsPassword = await deriveYjsPassword(lek)
  setYjsRoomPassword(yjsPassword)
  reconnectYjsWebRTC()
  console.log('[PairingFlow] Yjs P2P sync enabled with derived password')
```

**Step 2: Verify the change**

```bash
grep -B 2 -A 2 "deriveYjsPassword" src/components/pairing/PairingFlow.jsx | grep -A 5 "handlePairingAck"
```

Expected: Should show both usages of `deriveYjsPassword` in the file

**Step 3: Commit**

```bash
git add src/components/pairing/PairingFlow.jsx
git commit -m "feat: initiator uses derived Yjs password instead of raw LEK"
```

---

## Task 4: Update crypto.js Default Parameter for importLEK

**Files:**
- Modify: `src/services/crypto.js:376`

**Step 1: Change importLEK default to non-extractable**

Find the `importLEK` function (around line 376) and change the default parameter:

Find this:
```javascript
export async function importLEK(rawKey, extractable = true) {
  try {
    const lek = await crypto.subtle.importKey(
      'raw',
      rawKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      extractable, // typically true to support pairing new devices
      ['encrypt', 'decrypt']
    )
```

Replace with:
```javascript
export async function importLEK(rawKey, extractable = false) {
  try {
    const lek = await crypto.subtle.importKey(
      'raw',
      rawKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      extractable, // false by default (devices receiving LEK via pairing don't need to export)
      ['encrypt', 'decrypt']
    )
```

**Step 2: Update the JSDoc comment**

Update the function comment:

```javascript
/**
 * Import LEK from raw bytes
 * @param {ArrayBuffer} rawKey - Raw key bytes
 * @param {boolean} extractable - Whether key should be extractable (false = non-extractable, more secure)
 * @returns {Promise<CryptoKey>} - Imported LEK
 */
```

**Step 3: Verify the change**

```bash
grep -A 15 "export async function importLEK" src/services/crypto.js
```

Expected: Should show `extractable = false` as the default

**Step 4: Commit**

```bash
git add src/services/crypto.js
git commit -m "refactor: importLEK defaults to non-extractable for better security"
```

---

## Task 5: Update App.jsx to Use Derived Password on Startup

**Files:**
- Modify: `src/App.jsx` (Yjs initialization section)

**Step 1: Find the Yjs initialization code**

Search for where the app initializes Yjs with the LEK:

```bash
grep -n "setYjsRoomPassword" src/App.jsx
```

**Step 2: Import deriveYjsPassword in App.jsx**

Add the import at the top of App.jsx (check existing crypto imports):

```javascript
import { deriveYjsPassword } from './services/crypto'
```

**Step 3: Update Yjs initialization**

Find the code that sets up Yjs room password on app startup. It likely looks something like:

```javascript
const lek = await retrieveLEK()
if (lek) {
  const lekBase64 = await exportLEK(lek)
  setYjsRoomPassword(lekBase64)
}
```

Replace with:

```javascript
const lek = await retrieveLEK()
if (lek) {
  const yjsPassword = await deriveYjsPassword(lek)
  setYjsRoomPassword(yjsPassword)
}
```

**Step 4: Search for any other exportLEK usages**

```bash
grep -rn "exportLEK" src/
```

Expected: Should only show:
- The function definition in crypto.js
- Usage in transferLEK() for pairing (this is correct - we need to export during pairing)

If there are other usages, evaluate if they should use derived password instead.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: app startup uses derived Yjs password"
```

---

## Task 6: Test End-to-End Pairing Flow

**Files:**
- Test manually with two browser tabs/devices

**Step 1: Clear existing state**

Open browser DevTools → Application → IndexedDB → Delete all databases
Open browser DevTools → Application → Local Storage → Clear

**Step 2: Test first device initialization**

1. Open app in first tab
2. Open DevTools Console
3. Generate QR code for pairing
4. Verify console shows: "First-time pairing: generating LEK"
5. Verify console shows: "Yjs P2P sync enabled with derived password"

**Step 3: Test second device pairing**

1. Open app in second tab (or second browser window)
2. Scan QR code from first device
3. Verify words match on both devices
4. Confirm pairing
5. Verify console shows: "LEK imported successfully as non-extractable"
6. Verify console shows: "Yjs P2P sync enabled with derived password"

**Step 4: Test data sync**

1. Create a bookmark in first device
2. Verify it appears in second device (Yjs sync working)
3. Create a bookmark in second device
4. Verify it appears in first device

**Step 5: Test that LEK is non-extractable on second device**

In second device console:

```javascript
// Test that we can't export LEK on device that received it via pairing
const { retrieveLEK } = await import('./services/key-storage.js')
const { exportLEK } = await import('./services/crypto.js')
const lek = await retrieveLEK()
try {
  await exportLEK(lek)
  console.log('ERROR: LEK should not be exportable!')
} catch (e) {
  console.log('CORRECT: LEK is non-extractable -', e.message)
}
```

Expected: Should throw error about key not being extractable

**Step 6: Document test results**

Create a test log:

```bash
echo "# Pairing Test Results - $(date)" > test-results.txt
echo "" >> test-results.txt
echo "✓ First device generates extractable LEK" >> test-results.txt
echo "✓ Second device imports non-extractable LEK" >> test-results.txt
echo "✓ Both devices derive same Yjs password" >> test-results.txt
echo "✓ Data syncs between devices" >> test-results.txt
echo "✓ Second device cannot export LEK" >> test-results.txt
cat test-results.txt
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `docs/plans/2025-12-26-hypermark-implementation-design.md`
- Modify: `docs/plans/2025-12-26-pairingflow-component-design.md`

**Step 1: Update security documentation**

In `docs/plans/2025-12-26-hypermark-implementation-design.md`, find the "Security Properties" section and add:

```markdown
**Key Derivation for Yjs:**
- Yjs room password is derived from LEK using HMAC-SHA256
- Derived password is deterministic (all devices derive the same value)
- Yjs network layer never sees the actual LEK
- Compromised Yjs password does not compromise bookmark encryption
- Defense in depth: separate keys for separate purposes
```

**Step 2: Update pairing flow documentation**

In `docs/plans/2025-12-26-pairingflow-component-design.md`, find the "Phase 6: LEK Import" section and update:

```markdown
**Security Improvements:**
- Responder imports LEK as non-extractable (cannot be re-exported)
- Yjs password is derived using HMAC, not direct LEK export
- Initiator device keeps LEK extractable (to pair additional devices)
- Reduced attack surface: Yjs sees derived password, not master key
```

**Step 3: Commit**

```bash
git add docs/plans/*.md
git commit -m "docs: update security documentation for derived Yjs password"
```

---

## Task 8: Build and Verify

**Files:**
- Build verification
- Runtime verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Check for any remaining exportLEK calls that should be replaced**

```bash
grep -rn "exportLEK" src/ --exclude="crypto.js"
```

Expected output should only show:
- `src/components/pairing/PairingFlow.jsx` - in `transferLEK()` function (this is correct, we need to export during pairing transfer)

If there are other usages, those need to be evaluated.

**Step 3: Verify no import errors**

```bash
npm run dev
```

Open browser, check console for any import errors related to `deriveYjsPassword`.

Expected: App starts without errors

**Step 4: Final commit**

If any fixes were needed, commit them:

```bash
git add .
git commit -m "fix: final cleanup for derived Yjs password implementation"
```

---

## Security Verification Checklist

After implementation, verify these security properties:

- [ ] LEK generated on first device is extractable (can pair new devices)
- [ ] LEK imported on paired devices is non-extractable (cannot be exported)
- [ ] Yjs password is derived, not direct LEK export
- [ ] Both devices derive identical Yjs password
- [ ] Yjs sync works with derived password
- [ ] Second device cannot export LEK (throws error)
- [ ] Pairing new devices still works (initiator can export LEK)
- [ ] `exportLEK` only used in `transferLEK()` during pairing
- [ ] No raw LEK values logged to console
- [ ] Build succeeds with no errors

---

## Rollback Plan

If issues arise:

```bash
# Revert to previous commit
git log --oneline -5
git revert <commit-hash>

# Or reset to before this work
git reset --hard HEAD~8
```

Known gotchas:
- If Yjs password derivation fails, devices won't be able to sync
- If derivation is non-deterministic, devices will derive different passwords
- Need to clear browser storage when testing to ensure clean state

---

## Performance Notes

- HMAC-SHA256 is fast (<1ms on modern hardware)
- Derivation happens once per pairing, minimal performance impact
- No additional network overhead (derived password same size as base64 LEK)

---

## Future Enhancements

1. **Key Rotation**: Add ability to rotate Yjs password without changing LEK
2. **Multiple Derivations**: Derive different passwords for different purposes (backup, relay, etc.)
3. **Hardware Key Support**: Extend to support hardware-backed non-extractable keys
4. **Audit Logging**: Log when LEK is exported (should only be during pairing)

# Testing Plan for Hypermark

## Overview

Hypermark is a sophisticated privacy-first bookmark manager with zero existing test coverage. This plan establishes a comprehensive testing strategy to improve trust in the security-critical codebase.

## Current State

- **Zero test files** - No existing tests whatsoever
- **No test framework** - Jest/Vitest not configured
- **Security-critical code** - Cryptography, device pairing, P2P sync
- **Complex state management** - Yjs CRDTs, WebRTC connections
- **Recent major changes** - QR → short code pairing, React migration

## Testing Strategy

### Phase 1: Foundation Setup
1. Install Vitest as test framework (modern, Vite-compatible)
2. Configure testing environment with Web APIs (crypto, IndexedDB)
3. Add test scripts to package.json
4. Setup coverage reporting

### Phase 2: Critical Security Testing (Priority 1)

#### Pairing Code Service (`src/services/pairing-code.js`) - CRITICAL
- **generatePairingCode()**: Validate room numbers [1-999], wordlist integrity
- **parsePairingCode()**: Test valid/invalid formats, case handling, error states
- **derivePSK()**: Deterministic PBKDF2 derivation
- **encryptMessage()/decryptMessage()**: Round-trip encryption, IV randomness

#### Cryptographic Service (`src/services/crypto.js`) - CRITICAL
- Key generation: ECDH P-256, non-extractable flags
- ECDH operations: Shared secret derivation consistency
- AES-GCM encryption: Round-trip with various payloads
- Key storage: Import/export cycle integrity
- Domain separation: Yjs password ≠ LEK

### Phase 3: Core Business Logic (Priority 2)

#### Bookmarks Service (`src/services/bookmarks.js`)
- **normalizeUrl()**: Protocol, hostname, query handling, edge cases
- **validateBookmark()**: Required fields, URL validation, sanitization
- **CRUD operations**: Create, update, delete with Yjs integration
- **Tag operations**: Case-insensitive, duplicate prevention
- **Search functions**: By tag, URL, text search

#### Key Storage Service (`src/services/key-storage.js`)
- IndexedDB operations: Store/retrieve CryptoKey objects
- Database versioning and migration
- Concurrent access patterns

### Phase 4: Component Integration Testing (Priority 3)

#### PairingFlow Component - CRITICAL USER FLOW
- **State machine**: 9+ states, bidirectional key exchange
- **Error handling**: Timeout, crypto failures, invalid codes
- **Cleanup**: Refs, timers, signaling connections
- **Security**: Message encryption with PSK

**Component Testing Implementation**:
Use `@testing-library/react` utilities for full user journey testing:
```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Example test scenarios:
// - Assert entering valid code transitions to 'confirming' state:
//   fireEvent.change(codeInput, { target: { value: 'valid code' } })
//   await waitFor(() => expect(screen.getByText('Confirming...')).toBeInTheDocument())
// - Test timeout handling:
//   await waitFor(() => expect(screen.getByText('Timeout')).toBeInTheDocument(), { timeout: 5000 })
// - Verify cleanup on unmount:
//   unmount() -> assert no memory leaks, timers cleared
```

#### Search & Bookmark UI Components
- **Form validation and submission**: Test invalid URLs, required fields, error states
- **Tag management interface**: Add/remove tags, case-insensitive handling, duplicates
- **Search debouncing and results**: 300ms delay, result filtering, empty states

**Testing Approach**:
- Use `screen.findByText()` for async operations
- `fireEvent.click()` for user interactions
- `waitFor()` for debounced search operations
- Mock Yjs data layer for isolated component testing

### Phase 5: Advanced Testing

#### E2E Critical Flows
- Complete device pairing workflow
- Bookmark creation and sync
- Search across bookmarks
- Error recovery scenarios

#### Performance & Security
- Crypto timing consistency (basic anti-timing attack)
- Memory cleanup after operations
- Large bookmark collections

## Technical Implementation

### Testing Stack
```json
{
  "vitest": "^2.0.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.5.0",
  "fake-indexeddb": "^6.0.0",
  "jsdom": "^25.0.0"
}
```

### Mock Strategy
- **WebCrypto API**: Stub crypto.subtle for deterministic testing
- **IndexedDB**: Use fake-indexeddb for storage operations
- **WebSocket/WebRTC**: Mock signaling and P2P connections
- **Yjs Strategy**:
  - **Services testing**: Use real, in-memory `Y.Doc` instances to test CRDT integration (bookmarks.js, device-registry.js)
  - **UI components**: Mock Y.Doc and Y.Map for isolated component testing

### Coverage Targets
- **Security services**: 95%+ (crypto, pairing, key-storage)
- **Business logic**: 90%+ (bookmarks, search, device-registry)
- **UI components**: 80%+ (critical flows, form validation)
- **Utilities**: 85%+ (URL handling, device ID)

## Critical Files to Modify

### New Test Files (Colocated)
- `src/services/crypto.test.js`
- `src/services/pairing-code.test.js`
- `src/services/bookmarks.test.js`
- `src/services/key-storage.test.js`
- `src/services/search-index.test.js`
- `src/components/pairing/PairingFlow.test.jsx`
- `src/hooks/useYjs.test.js`
- `src/hooks/useSearch.test.js`

### Configuration Files
- `vitest.config.js` - Test configuration with jsdom environment
- `package.json` - Add test scripts and dependencies
- `.gitignore` - Coverage output directories

#### Test Environment Configuration Details

**vitest.config.js**:
```javascript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test-utils/',
        '**/*.test.{js,jsx}',
        '**/*.config.js'
      ]
    }
  }
})
```

**src/test-utils/setup.js** (Critical global setup):
```javascript
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'

// Mock crypto.subtle if JSDOM implementation is insufficient
if (!global.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto')
  global.crypto = webcrypto
}

// Mock WebSocket for signaling service
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url
    this.readyState = 1 // OPEN
    setTimeout(() => this.onopen?.(), 0)
  }
  send() {}
  close() {}
}

// Mock localStorage if not available
if (!global.localStorage) {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  }
}
```

### Test Utilities
- `src/test-utils/crypto-mocks.js` - WebCrypto stubs
- `src/test-utils/yjs-mocks.js` - Y.Doc/Y.Map mocks
- `src/test-utils/setup.js` - Global test setup

## Verification Plan

### Automated Verification
1. Run full test suite: `npm test`
2. Coverage report: `npm run test:coverage`
3. Security-focused tests: `npm run test:security`
4. CI integration: GitHub Actions on every PR

#### Test Scripts Implementation
**package.json scripts**:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:security": "vitest run src/services/crypto.test.js src/services/pairing-code.test.js src/services/key-storage.test.js src/components/pairing/PairingFlow.test.jsx",
    "test:watch": "vitest --watch"
  }
}
```

The `test:security` script uses explicit glob patterns to run only security-critical test files, ensuring focused validation of cryptographic and authentication components.

### Manual Verification
1. Device pairing flow with test environment
2. Cross-browser compatibility (Chrome, Firefox, Safari)
3. Bookmark sync between test devices
4. Error injection testing (network failures, storage errors)

### Success Metrics
- Zero test failures on main branch
- 90%+ overall code coverage
- 95%+ coverage on security-critical services
- All critical user flows have end-to-end tests
- CI pipeline catches regressions automatically

## Risk Mitigation

### High-Risk Areas Covered
- Cryptographic operations (key leakage, algorithm failures)
- Device pairing protocol (MITM, failed exchanges)
- Data validation (injection, corruption)
- Storage persistence (key loss, corruption)

### Testing Blind Spots
- Real WebRTC connectivity (mocked in tests)
- Browser-specific crypto implementations
- Network partition scenarios
- Large-scale bookmark collections (10k+ items)

These areas require manual testing and integration testing beyond unit tests.
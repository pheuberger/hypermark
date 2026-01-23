# Testing Architecture

## Overview

Hypermark's testing architecture is designed around privacy, security, and performance requirements of a P2P bookmark manager. The multi-layered approach ensures comprehensive validation while maintaining fast feedback cycles.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E Tests (Playwright)                  │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Cross-Browser │ │ Multi-Device  │ │ Performance &     │ │
│  │ Testing       │ │ Pairing       │ │ Visual Regression │ │
│  └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│              Integration Tests (Vitest)                    │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Service Layer │ │ Storage       │ │ Component         │ │
│  │ Integration   │ │ Operations    │ │ Integration       │ │
│  └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   Unit Tests (Vitest)                      │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Cryptographic │ │ Pairing       │ │ Component         │ │
│  │ Functions     │ │ Protocol      │ │ Logic             │ │
│  └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    Test Infrastructure                     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Mock Services │ │ Test Utilities │ │ CI/CD Pipeline    │ │
│  │ & Fixtures    │ │ & Setup       │ │ & Automation      │ │
│  └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Test Configuration

#### Vitest Configuration (`vitest.config.js`)
```javascript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});
```

**Design Decisions:**
- **jsdom environment**: Enables DOM testing without browser overhead
- **Global test functions**: Reduces import boilerplate
- **V8 coverage**: Native V8 coverage for accurate metrics
- **Multiple reporters**: HTML for local development, lcov for CI

#### Playwright Configuration (`playwright.config.js`)
```javascript
export default defineConfig({
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'mobile-chrome', use: devices['Pixel 5'] },
    { name: 'mobile-safari', use: devices['iPhone 12'] }
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure'
  }
});
```

**Design Decisions:**
- **Multi-browser testing**: Ensures cross-browser compatibility
- **Mobile device simulation**: Validates responsive design
- **Trace on retry**: Debugging aid for flaky tests
- **Video on failure**: Visual debugging for failed tests

### 2. Test Utilities and Mocking

#### Comprehensive Mock System (`src/test-utils/setup.js`)
```javascript
// Global test environment setup
import "fake-indexeddb/auto";
import "@testing-library/jest-dom";
import { webcrypto } from "node:crypto";

// WebCrypto polyfill
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: webcrypto.subtle,
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto)
  }
});

// WebSocket mock for P2P testing
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data) {
    this.mockSend?.(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }
}

global.WebSocket = MockWebSocket;
```

**Design Principles:**
- **Zero external dependencies**: Tests run in isolation
- **Realistic mocking**: Mocks behave like real APIs
- **Performance focus**: Fast test execution
- **Debugging support**: Clear error messages and logging

#### Service Mocking Pattern
```javascript
// Consistent mocking across all services
const createMockService = (serviceName, methods) => {
  const mock = {};
  methods.forEach(method => {
    mock[method] = vi.fn();
  });
  mock._reset = () => methods.forEach(method => mock[method].mockReset());
  return mock;
};

// Usage example
const mockCrypto = createMockService('crypto', [
  'generateKeypair',
  'encrypt',
  'decrypt',
  'sign',
  'verify'
]);
```

### 3. Security Testing Architecture

#### Cryptographic Function Testing
```javascript
// Security-focused test structure
describe('Cryptographic Operations', () => {
  describe('Key Generation', () => {
    test('generates unique keypairs', async () => {
      const keys1 = await crypto.generateKeypair();
      const keys2 = await crypto.generateKeypair();

      expect(keys1.privateKey).not.toBe(keys2.privateKey);
      expect(keys1.publicKey).not.toBe(keys2.publicKey);
    });

    test('generates keys with correct format', async () => {
      const { publicKey, privateKey } = await crypto.generateKeypair();

      expect(publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(privateKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('Encryption/Decryption', () => {
    test('roundtrip encryption preserves data', async () => {
      const data = 'sensitive information';
      const { publicKey, privateKey } = await crypto.generateKeypair();

      const encrypted = await crypto.encrypt(data, publicKey);
      const decrypted = await crypto.decrypt(encrypted, privateKey);

      expect(decrypted).toBe(data);
      expect(encrypted).not.toContain(data);
    });
  });
});
```

**Security Test Principles:**
- **Input validation**: Test all input boundaries
- **Key uniqueness**: Ensure cryptographic randomness
- **Data integrity**: Verify encryption/decryption roundtrips
- **Error handling**: Test malformed inputs and edge cases

#### Pairing Protocol Security
```javascript
// Comprehensive pairing security tests
describe('Pairing Protocol Security', () => {
  describe('Code Generation', () => {
    test('generates unique codes', async () => {
      const code1 = await pairingCode.generate();
      const code2 = await pairingCode.generate();
      expect(code1).not.toBe(code2);
    });

    test('enforces code format requirements', async () => {
      const code = await pairingCode.generate();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });
  });

  describe('Validation Security', () => {
    test('rejects expired codes', async () => {
      const code = await pairingCode.generate();
      vi.setSystemTime(Date.now() + 11 * 60 * 1000); // 11 minutes

      await expect(pairingCode.validate(code))
        .rejects.toThrow('Code expired');
    });

    test('implements rate limiting', async () => {
      const invalidCode = 'INVALID';

      // Exceed rate limit
      for (let i = 0; i < 6; i++) {
        try {
          await pairingCode.validate(invalidCode);
        } catch (e) {
          // Expected failures
        }
      }

      await expect(pairingCode.validate(invalidCode))
        .rejects.toThrow('Rate limit exceeded');
    });
  });
});
```

### 4. Multi-Device E2E Testing

#### Device Pair Fixture
```javascript
// Advanced multi-device testing setup
export const devicePairFixture = base.extend({
  devicePair: async ({ browser }, use) => {
    // Create isolated contexts
    const context1 = await browser.newContext({
      storageState: { cookies: [], origins: [] }
    });
    const context2 = await browser.newContext({
      storageState: { cookies: [], origins: [] }
    });

    const device1 = await context1.newPage();
    const device2 = await context2.newPage();

    // Setup device identification
    await device1.addInitScript(() => {
      window.deviceId = 'device1';
    });
    await device2.addInitScript(() => {
      window.deviceId = 'device2';
    });

    await device1.goto('/');
    await device2.goto('/');

    await use({ device1, device2 });

    await context1.close();
    await context2.close();
  }
});
```

**Multi-Device Architecture:**
- **Isolated contexts**: Prevents data leakage between devices
- **Independent storage**: Each device has separate localStorage/IndexedDB
- **Network isolation**: Simulates real device separation
- **Synchronization testing**: Validates P2P communication

#### Sync Validation Patterns
```javascript
// Sophisticated sync testing
const waitForSyncComplete = async (page, timeout = 10000) => {
  await page.waitForFunction(
    () => {
      const syncStatus = window.hypermark?.syncStatus;
      const pendingOps = window.hypermark?.pendingOperations;
      return syncStatus === 'synced' && pendingOps === 0;
    },
    { timeout }
  );
};

const expectDataConsistency = async (device1, device2) => {
  const data1 = await device1.evaluate(() =>
    localStorage.getItem('hypermark-bookmarks')
  );
  const data2 = await device2.evaluate(() =>
    localStorage.getItem('hypermark-bookmarks')
  );

  expect(JSON.parse(data1)).toEqual(JSON.parse(data2));
};
```

### 5. Performance Testing Architecture

#### Memory Monitoring
```javascript
// Comprehensive performance testing
class PerformanceMonitor {
  constructor(page) {
    this.page = page;
    this.metrics = [];
  }

  async startMonitoring() {
    this.initialMemory = await this.getMemoryUsage();
    this.startTime = Date.now();
  }

  async recordMetric(operation) {
    const memory = await this.getMemoryUsage();
    const time = Date.now() - this.startTime;

    this.metrics.push({
      operation,
      memory: memory - this.initialMemory,
      time
    });
  }

  async getMemoryUsage() {
    return await this.page.evaluate(() =>
      performance.memory?.usedJSHeapSize || 0
    );
  }

  async generateReport() {
    return {
      totalTime: Date.now() - this.startTime,
      memoryPeak: Math.max(...this.metrics.map(m => m.memory)),
      operations: this.metrics
    };
  }
}
```

**Performance Architecture:**
- **Memory leak detection**: Monitors heap usage over time
- **Operation timing**: Measures individual operation performance
- **Threshold enforcement**: Fails tests on performance regression
- **Detailed reporting**: Provides actionable performance data

### 6. CI/CD Integration

#### GitHub Actions Workflow Architecture
```yaml
# Parallel execution strategy
jobs:
  unit-tests:
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - name: Run unit tests
        run: npm run test:coverage

  security-tests:
    if: contains(github.event.head_commit.modified, 'crypto') ||
        contains(github.event.head_commit.modified, 'pairing')
    steps:
      - name: Run security tests
        run: npm run test:security

  e2e-tests:
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
        shard: [1/3, 2/3, 3/3]
    steps:
      - name: Run E2E tests
        run: playwright test --project=${{ matrix.browser }} --shard=${{ matrix.shard }}
```

**CI/CD Design:**
- **Parallel execution**: Maximizes throughput
- **Conditional workflows**: Runs security tests only when needed
- **Matrix testing**: Ensures compatibility across environments
- **Artifact management**: Preserves test results and reports

#### Test Result Aggregation
```javascript
// Merge reports from parallel execution
const mergeReports = async (reportPaths) => {
  const reports = await Promise.all(
    reportPaths.map(path => fs.readFile(path, 'utf8').then(JSON.parse))
  );

  return {
    summary: {
      total: reports.reduce((sum, r) => sum + r.summary.total, 0),
      passed: reports.reduce((sum, r) => sum + r.summary.passed, 0),
      failed: reports.reduce((sum, r) => sum + r.summary.failed, 0)
    },
    tests: reports.flatMap(r => r.tests)
  };
};
```

### 7. Test Data Management

#### Fixture Generation
```javascript
// Realistic test data generation
export const generateBookmarkDataset = (size, options = {}) => {
  const domains = ['github.com', 'stackoverflow.com', 'developer.mozilla.org'];
  const tags = ['javascript', 'react', 'testing', 'documentation'];

  return Array.from({ length: size }, (_, i) => ({
    id: `bookmark-${i}`,
    title: options.titlePrefix ? `${options.titlePrefix} ${i}` : `Bookmark ${i}`,
    url: `https://${domains[i % domains.length]}/resource-${i}`,
    description: `Description for bookmark ${i}`,
    tags: tags.slice(0, (i % 3) + 1),
    created: new Date(Date.now() - i * 1000 * 60).toISOString(),
    modified: new Date(Date.now() - i * 1000 * 30).toISOString()
  }));
};

export const generateLargeBookmarkDataset = (size = 1000) => {
  return generateBookmarkDataset(size, {
    titlePrefix: 'Large Dataset Bookmark'
  });
};
```

**Data Management Principles:**
- **Realistic data**: Mirrors real-world usage patterns
- **Scalable generation**: Supports various dataset sizes
- **Deterministic**: Same input produces same output
- **Performance aware**: Optimized for test execution speed

## Quality Assurance

### Coverage Analysis
```javascript
// Custom coverage validation
const validateCoverage = (coverage, file) => {
  const requirements = getRequirementsForFile(file);

  Object.entries(requirements).forEach(([metric, threshold]) => {
    const actual = coverage[metric].pct;
    if (actual < threshold) {
      throw new Error(
        `${file}: ${metric} coverage ${actual}% below required ${threshold}%`
      );
    }
  });
};

const getRequirementsForFile = (file) => {
  const securityFiles = [
    'src/services/crypto.js',
    'src/services/pairing-code.js',
    'src/services/key-storage.js',
    'src/components/pairing/PairingFlow.jsx'
  ];

  return securityFiles.includes(file)
    ? { branches: 95, functions: 95, lines: 95, statements: 95 }
    : { branches: 80, functions: 80, lines: 80, statements: 80 };
};
```

### Flaky Test Detection
```javascript
// Automated flaky test identification
class FlakyTestDetector {
  constructor() {
    this.testResults = new Map();
  }

  recordResult(testName, passed) {
    if (!this.testResults.has(testName)) {
      this.testResults.set(testName, []);
    }
    this.testResults.get(testName).push(passed);
  }

  analyzeFlakiness() {
    const flakyTests = [];

    for (const [testName, results] of this.testResults) {
      if (results.length < 5) continue; // Need minimum runs

      const passRate = results.filter(Boolean).length / results.length;
      if (passRate > 0.1 && passRate < 0.9) {
        flakyTests.push({
          name: testName,
          passRate,
          totalRuns: results.length
        });
      }
    }

    return flakyTests;
  }
}
```

## Future Considerations

### Scalability Improvements
- **Test parallelization**: Distribute tests across multiple machines
- **Smart test selection**: Run only tests affected by changes
- **Incremental coverage**: Track coverage changes over time
- **Performance baselines**: Automated performance regression detection

### Enhanced Security Testing
- **Fuzzing integration**: Automated input fuzzing for crypto functions
- **Timing attack detection**: Validate constant-time implementations
- **Side-channel analysis**: Monitor for information leakage
- **Formal verification**: Mathematical proof of critical algorithms

### Advanced E2E Scenarios
- **Network simulation**: More realistic network conditions
- **Device diversity**: Testing across different device capabilities
- **Stress testing**: High-load multi-device scenarios
- **Chaos engineering**: Fault injection during tests

This architecture provides a robust foundation for maintaining code quality, security, and performance as Hypermark evolves while ensuring comprehensive test coverage across all critical components.
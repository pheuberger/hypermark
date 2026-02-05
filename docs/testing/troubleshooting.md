# Testing Troubleshooting Guide

## Common Issues and Solutions

### Unit Test Issues

#### ❌ `vi.fn() is not a function`
**Problem**: Mock functions not working properly in tests.

**Solution**:
```javascript
// ❌ Wrong
const mockFn = vi.fn;

// ✅ Correct
import { vi } from 'vitest';
const mockFn = vi.fn();
```

#### ❌ `WebCrypto is not available`
**Problem**: Cryptographic operations failing in test environment.

**Solution**:
```javascript
// In test setup or individual test
import { webcrypto } from 'node:crypto';

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: webcrypto.subtle,
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto)
  }
});
```

#### ❌ `IndexedDB is not defined`
**Problem**: Storage operations failing in tests.

**Solution**:
Already configured in `src/test-utils/setup.js`:
```javascript
import "fake-indexeddb/auto";
```

If still failing, verify the setup file is imported in `vitest.config.js`:
```javascript
setupFiles: ['./src/test-utils/setup.js']
```

#### ❌ Test timeouts with async operations
**Problem**: Tests timing out when dealing with promises or async operations.

**Solution**:
```javascript
// ❌ Wrong - no await
test('async operation', () => {
  service.asyncOperation();
  expect(result).toBe(expected);
});

// ✅ Correct - properly awaited
test('async operation', async () => {
  const result = await service.asyncOperation();
  expect(result).toBe(expected);
});

// For longer operations, increase timeout
test('slow operation', async () => {
  const result = await slowOperation();
  expect(result).toBe(expected);
}, 10000); // 10 second timeout
```

### Coverage Issues

#### ❌ Coverage thresholds not met
**Problem**: Tests pass but coverage fails CI.

**Check coverage report**:
```bash
npm run test:coverage
open coverage/index.html
```

**Common solutions**:
- Add tests for uncovered lines
- Remove dead code
- Add test-ignore comments for unreachable code:
```javascript
/* c8 ignore next */
if (process.env.NODE_ENV === 'development') {
  // Development-only code
}
```

#### ❌ Security files failing 95% coverage
**Problem**: Critical security components below coverage threshold.

**Solution**:
```javascript
// Test all code paths in security functions
describe('crypto service edge cases', () => {
  test('handles invalid input', () => {
    expect(() => crypto.encrypt(null)).toThrow();
  });

  test('handles network failures', async () => {
    // Mock network failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    await expect(crypto.remoteOperation()).rejects.toThrow();
  });
});
```

### Performance Test Issues

#### ❌ Memory tests failing in CI
**Problem**: Memory thresholds exceeded in CI environment.

**Solution**:
```javascript
// Adjust thresholds for CI
const isCI = process.env.CI === 'true';
const memoryThreshold = isCI ? 150 * 1024 * 1024 : 100 * 1024 * 1024;

expect(memoryUsage).toBeLessThan(memoryThreshold);
```

#### ❌ Performance tests timing out
**Problem**: Large dataset tests taking too long.

**Solution**:
```javascript
// Reduce dataset size in CI
const datasetSize = process.env.CI ? 100 : 1000;
const dataset = generateLargeBookmarkDataset(datasetSize);

// Or increase timeout
test('large dataset performance', async ({ page }) => {
  // Test implementation
}, 60000); // 60 second timeout
```

### CI/CD Issues

#### ❌ GitHub Actions failing with "No tests found"
**Problem**: Test discovery issues in CI.

**Check test file patterns**:
```javascript
// vitest.config.js
export default {
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
  }
}
```

### File System Issues

#### ❌ `ENXIO: no such device or address`
**Problem**: Vite trying to watch socket files.

**Solution**:
Already fixed in `vitest.config.js`:
```javascript
server: {
  fs: {
    strict: false
  },
  watch: {
    usePolling: false,
    ignored: ['**/node_modules/**', '**/.beads/**']
  }
}
```

#### ❌ Permission errors on temp files
**Problem**: Test cleanup failing due to permissions.

**Solution**:
```javascript
// In test cleanup
afterEach(async () => {
  try {
    await fs.rm('./tmp/test-data', { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors in tests
    if (!error.message.includes('ENOENT')) {
      console.warn('Cleanup warning:', error.message);
    }
  }
});
```

## Debug Commands

### Get detailed test output
```bash
# Verbose unit test output
npm test -- --reporter=verbose
```

### Check system requirements
```bash
# Verify Node.js version
node --version

# Check available memory
node -e "console.log(process.memoryUsage())"

# Check port availability
netstat -tulpn | grep :5173
```

### Reset test environment
```bash
# Clear all caches
npm run test -- --no-cache
rm -rf coverage/

# Reinstall dependencies
rm -rf node_modules/
npm install
```

## Getting Help

### Log Collection
When reporting issues, include:

```bash
# System information
node --version
npm --version

# Test output with debug info
npm test -- --reporter=verbose > test-output.log 2>&1
```

### Common Environment Variables
```bash
# Enable debug output
DEBUG=vitest:*

# CI environment simulation
CI=true
NODE_ENV=test

# Performance tuning
NODE_OPTIONS="--max-old-space-size=4096"
```

### When to Contact Maintainers

Contact the team when:
- Issues persist after following this guide
- Performance significantly degrades
- Security test failures that might indicate real vulnerabilities
- CI/CD pipeline consistently failing

Include in your report:
- Operating system and version
- Node.js and npm versions
- Full error messages and stack traces
- Steps to reproduce the issue
- Expected vs actual behavior
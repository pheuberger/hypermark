# Hypermark Testing Infrastructure

## Overview

Hypermark employs a comprehensive testing strategy that ensures privacy, security, and reliability across all components. Our testing infrastructure includes unit tests, integration tests, end-to-end tests, and security validation.

## Testing Stack

- **Unit/Integration Testing**: [Vitest](https://vitest.dev/) with jsdom environment
- **E2E Testing**: [Playwright](https://playwright.dev/) with multi-browser support
- **Coverage**: V8 coverage with 80% minimum thresholds
- **Security Testing**: Dedicated workflows for cryptographic components
- **CI/CD**: GitHub Actions with parallel execution and automated reporting

## Test Types

### 1. Unit Tests (`src/**/*.test.js`)
- Component logic and behavior testing
- Service layer validation
- Utility function verification
- 95% coverage required for security-critical components

### 2. Integration Tests
- Cross-service interaction testing
- Storage and persistence validation
- Cryptographic workflow testing

### 3. End-to-End Tests (`e2e/tests/*.spec.js`)
- Complete user workflow validation
- Multi-device pairing and synchronization
- Cross-browser compatibility testing
- Performance and memory usage validation

### 4. Security Tests
- Cryptographic operation validation
- Key management testing
- Pairing protocol security verification
- Automated security regression prevention

## Quick Start

```bash
# Run all unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run security-focused tests
npm run test:security

# Run tests in watch mode
npm run test:watch

# View test UI
npm run test:ui
```

## Directory Structure

```
hypermark/
├── docs/testing/           # Testing documentation
├── e2e/                   # End-to-end tests
│   ├── fixtures/          # Test data and setup
│   ├── tests/             # E2E test suites
│   └── utils/             # Test helpers
├── src/                   # Application source
│   ├── **/*.test.js       # Unit/integration tests
│   └── test-utils/        # Test utilities
├── vitest.config.js       # Vitest configuration
├── playwright.config.js   # Playwright configuration
└── .github/workflows/     # CI/CD pipelines
```

## Coverage Requirements

- **Global Minimum**: 80% for statements, branches, functions, and lines
- **Security Components**: 95% coverage required
- **Critical User Flows**: 90% coverage required

Security-critical files requiring 95% coverage:
- `src/services/crypto.js`
- `src/services/pairing-code.js`
- `src/services/key-storage.js`
- `src/components/pairing/PairingFlow.jsx`

## CI/CD Integration

### Automated Testing Workflows

1. **Main Test Pipeline** (`.github/workflows/test.yml`)
   - Runs on every push and PR
   - Matrix testing across Node.js 18.x and 20.x
   - Coverage reporting and PR comments

2. **Security Testing** (`.github/workflows/security-tests.yml`)
   - Triggered by changes to security files
   - Enforces 95% coverage on critical components
   - Notifies security team on failures

3. **E2E Testing** (`.github/workflows/e2e-tests.yml`)
   - Comprehensive browser testing (Chromium, Firefox, WebKit)
   - Mobile device simulation
   - Performance and visual regression testing
   - Parallel execution with sharding

4. **Performance Testing** (`.github/workflows/performance.yml`)
   - Weekly performance benchmarking
   - Memory usage monitoring
   - Large dataset handling validation

## Browser Support

E2E tests run across:
- **Desktop**: Chrome, Firefox, Safari/WebKit
- **Mobile**: Chrome Mobile, Safari Mobile
- **Performance**: Chromium (primary testing browser)
- **Visual Regression**: Chromium for consistency

## Key Testing Principles

### Privacy-First Testing
- No real user data in tests
- Cryptographic operations use test keys
- Network communications are mocked or sandboxed

### Security Validation
- All cryptographic functions have dedicated tests
- Key generation and storage are thoroughly validated
- Pairing protocols tested against various attack scenarios

### Performance Monitoring
- Large dataset handling (1000+ bookmarks)
- Memory usage tracking and leak detection
- Search performance under load
- Sync performance with network conditions

### Cross-Device Testing
- Multi-device pairing simulation
- Real-time sync validation
- Conflict resolution testing
- Network resilience validation

## Common Test Patterns

### Component Testing
```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('component behavior', async () => {
  const user = userEvent.setup();
  render(<Component />);

  await user.click(screen.getByRole('button'));
  expect(screen.getByText('Expected')).toBeInTheDocument();
});
```

### Service Testing
```javascript
import { vi } from 'vitest';
import { cryptoService } from '../services/crypto';

test('service functionality', async () => {
  const mockFunction = vi.fn().mockResolvedValue('result');

  const result = await cryptoService.operation();
  expect(result).toBe('expected');
});
```

### E2E Testing
```javascript
test('user workflow', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="action-button"]');
  await expect(page.locator('[data-testid="result"]')).toBeVisible();
});
```

## Troubleshooting

See [Troubleshooting Guide](./troubleshooting.md) for common issues and solutions.

## Contributing

See [Testing Guidelines](./contributing.md) for information on writing and maintaining tests.

## Architecture

See [Testing Architecture](./architecture.md) for detailed technical implementation details.
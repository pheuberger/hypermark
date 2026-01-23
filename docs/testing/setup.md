# Testing Environment Setup

## Prerequisites

- Node.js 18.x or 20.x
- npm (comes with Node.js)
- Git

## Initial Setup

### 1. Install Dependencies

```bash
# Install all dependencies including testing tools
npm install

# Verify installation
npm run test --version
npx playwright --version
```

### 2. Playwright Setup

Playwright requires browser binaries to be installed:

```bash
# Install all browsers (Chrome, Firefox, Safari)
npx playwright install

# Install only Chromium (fastest for development)
npx playwright install chromium

# Install browsers with system dependencies
npx playwright install --with-deps
```

### 3. Verify Setup

```bash
# Run unit tests to verify Vitest setup
npm test

# Run a simple E2E test to verify Playwright
npm run test:e2e -- --grep "basic navigation"

# Check coverage setup
npm run test:coverage
```

## Development Environment

### IDE Configuration

#### VS Code
Recommended extensions:
```json
{
  "recommendations": [
    "ms-vscode.vscode-json",
    "ms-playwright.playwright",
    "ZixuanChen.vitest-explorer",
    "bradlc.vscode-tailwindcss"
  ]
}
```

#### WebStorm
- Enable Vitest support in Settings → Languages & Frameworks → Node.js → Vitest
- Configure Playwright support via the Playwright plugin

### Environment Variables

Create `.env.test` for test-specific configuration:

```bash
# Test environment configuration
NODE_ENV=test
VITE_APP_ENV=test

# Test database settings (if applicable)
TEST_DATABASE_URL=memory

# Signaling server for E2E tests
VITE_SIGNALING_URL=ws://localhost:4444

# Performance test settings
PERFORMANCE_DATASET_SIZE=1000
MEMORY_THRESHOLD_MB=100
```

### Mock Services

For development, you may want to start mock services:

```bash
# Start signaling server for E2E tests
npm run signaling

# In another terminal, run E2E tests
npm run test:e2e
```

## Debugging Tests

### Unit Test Debugging

#### Debug with Node.js Inspector
```bash
# Debug specific test file
npm run test -- --reporter=verbose src/services/crypto.test.js

# Debug with Node inspector
node --inspect-brk ./node_modules/vitest/vitest.mjs run src/services/crypto.test.js
```

#### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
  "args": ["run", "${relativeFile}"],
  "console": "integratedTerminal"
}
```

### E2E Test Debugging

#### Headed Mode
```bash
# Run tests with visible browser
npm run test:e2e:headed

# Debug specific test
npx playwright test e2e/tests/device-pairing.spec.js --debug
```

#### Debug Mode
```bash
# Step through test execution
npm run test:e2e:debug

# UI mode for interactive debugging
npm run test:e2e:ui
```

#### Recording Mode
```bash
# Generate test from user actions
npx playwright codegen localhost:5173
```

### Browser Developer Tools

Access browser dev tools during E2E tests:
```javascript
// In test file, add:
test('debug test', async ({ page }) => {
  await page.pause(); // Opens debugger
  // Test continues...
});
```

## Performance Monitoring

### Memory Profiling

```bash
# Run tests with memory monitoring
node --expose-gc --inspect ./node_modules/vitest/vitest.mjs

# E2E memory profiling
npm run test:e2e -- --project=performance
```

### Coverage Analysis

```bash
# Generate detailed coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html

# Check coverage for specific files
npm run test:coverage -- src/services/crypto.js
```

## CI/CD Setup

### Local CI Simulation

```bash
# Simulate CI environment
CI=true npm run test:coverage:check

# Run security tests locally
npm run test:security

# Full E2E suite (as run in CI)
npm run test:e2e -- --workers=2 --reporter=github
```

### GitHub Actions Requirements

Ensure your repository has these secrets configured:
- `GITHUB_TOKEN` (automatically provided)
- Any additional secrets for external services

### Self-Hosted Runners

For self-hosted GitHub Actions runners:

```bash
# Install Playwright dependencies on runner
npx playwright install-deps

# Verify runner can access signaling server
curl -I http://localhost:4444
```

## Troubleshooting Common Issues

### Port Conflicts
```bash
# Check if ports are in use
lsof -i :3000  # Vite dev server
lsof -i :4444  # Signaling server

# Kill processes using ports
pkill -f "vite"
pkill -f "node.*server.js"
```

### Browser Installation Issues
```bash
# Clear Playwright cache and reinstall
npx playwright uninstall --all
npx playwright install --with-deps

# Check system requirements
npx playwright install-deps
```

### Test File Watching Issues
```bash
# Clear Vitest cache
npx vitest --run --no-cache

# Exclude problematic directories
# Add to vitest.config.js:
watchExclude: ['**/node_modules/**', '**/dist/**', '**/.beads/**']
```

### Memory Issues
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Run tests with memory monitoring
node --trace-warnings --expose-gc ./node_modules/vitest/vitest.mjs
```

## Docker Setup (Optional)

For consistent testing environments:

```dockerfile
# Dockerfile.test
FROM mcr.microsoft.com/playwright:v1.57.0-focal

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "run", "test:e2e"]
```

Build and run:
```bash
docker build -f Dockerfile.test -t hypermark-tests .
docker run --rm hypermark-tests
```

## Performance Optimization

### Parallel Test Execution
```bash
# Unit tests with specific worker count
npm test -- --reporter=verbose --threads=4

# E2E tests with sharding
npm run test:e2e -- --shard=1/4
```

### Selective Test Running
```bash
# Run only changed tests
npm test -- --changed

# Run tests matching pattern
npm test -- crypto
npm run test:e2e -- --grep "pairing"
```

### Test Data Management
```bash
# Clear test databases
rm -rf tmp/test-*

# Reset test state
npm run test:clean
```

## Next Steps

- Read [Troubleshooting Guide](./troubleshooting.md) for common issues
- See [Contributing Guidelines](./contributing.md) for test development practices
- Review [Architecture Documentation](./architecture.md) for implementation details
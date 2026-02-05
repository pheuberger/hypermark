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
```

### 2. Verify Setup

```bash
# Run unit tests to verify Vitest setup
npm test

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
    "ZixuanChen.vitest-explorer",
    "bradlc.vscode-tailwindcss"
  ]
}
```

#### WebStorm
- Enable Vitest support in Settings → Languages & Frameworks → Node.js → Vitest

### Environment Variables

Create `.env.test` for test-specific configuration:

```bash
# Test environment configuration
NODE_ENV=test
VITE_APP_ENV=test

# Test database settings (if applicable)
TEST_DATABASE_URL=memory

# Performance test settings
PERFORMANCE_DATASET_SIZE=1000
MEMORY_THRESHOLD_MB=100
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

## Performance Monitoring

### Memory Profiling

```bash
# Run tests with memory monitoring
node --expose-gc --inspect ./node_modules/vitest/vitest.mjs
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
```

### GitHub Actions Requirements

Ensure your repository has these secrets configured:
- `GITHUB_TOKEN` (automatically provided)
- Any additional secrets for external services

## Troubleshooting Common Issues

### Port Conflicts
```bash
# Check if ports are in use
lsof -i :3000  # Vite dev server

# Kill processes using ports
pkill -f "vite"
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

## Performance Optimization

### Parallel Test Execution
```bash
# Unit tests with specific worker count
npm test -- --reporter=verbose --threads=4
```

### Selective Test Running
```bash
# Run only changed tests
npm test -- --changed

# Run tests matching pattern
npm test -- crypto
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
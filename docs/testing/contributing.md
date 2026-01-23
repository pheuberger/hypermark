# Testing Contributing Guidelines

## Test Development Practices

### Writing Effective Tests

#### Test Structure
Follow the **Arrange-Act-Assert** pattern:

```javascript
test('should validate user input correctly', async () => {
  // Arrange
  const validInput = 'test@example.com';
  const invalidInput = 'not-an-email';

  // Act
  const validResult = await validateInput(validInput);
  const invalidResult = await validateInput(invalidInput);

  // Assert
  expect(validResult.isValid).toBe(true);
  expect(invalidResult.isValid).toBe(false);
  expect(invalidResult.error).toContain('Invalid email');
});
```

#### Descriptive Test Names
```javascript
// ❌ Poor test names
test('crypto test');
test('it works');

// ✅ Good test names
test('should generate unique ephemeral keypairs for each pairing request');
test('should throw error when encrypting with invalid public key');
test('should handle network timeout during key exchange gracefully');
```

#### Test Categories
Use `describe` blocks to organize related tests:

```javascript
describe('PairingFlow Component', () => {
  describe('Initial State', () => {
    test('should show initiator option by default');
    test('should have all required buttons disabled initially');
  });

  describe('Responder Flow', () => {
    test('should validate pairing code format');
    test('should show error for expired codes');
  });

  describe('Error Handling', () => {
    test('should recover from network failures');
    test('should timeout after maximum wait time');
  });
});
```

### Security Test Requirements

#### Cryptographic Functions
Every cryptographic function must test:
- Valid input handling
- Invalid input rejection
- Error conditions
- Key generation uniqueness
- Proper cleanup of sensitive data

```javascript
describe('crypto service security', () => {
  test('should generate unique keypairs', async () => {
    const keys1 = await crypto.generateKeypair();
    const keys2 = await crypto.generateKeypair();

    expect(keys1.privateKey).not.toBe(keys2.privateKey);
    expect(keys1.publicKey).not.toBe(keys2.publicKey);
  });

  test('should reject malformed public keys', async () => {
    await expect(crypto.encrypt('data', 'invalid-key'))
      .rejects.toThrow('Invalid public key');
  });

  test('should clear sensitive data from memory', async () => {
    const keys = await crypto.generateEphemeralKeypair();

    await crypto.clearEphemeralKeys();

    // Verify keys are no longer accessible
    expect(() => crypto.getEphemeralPrivateKey())
      .toThrow('No ephemeral keys available');
  });
});
```

#### Pairing Protocol Security
Test all security aspects of device pairing:

```javascript
describe('pairing protocol security', () => {
  test('should reject expired pairing codes', async () => {
    const code = await pairingCode.generate();

    // Mock time passage
    vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000)); // 11 minutes

    await expect(pairingCode.validate(code))
      .rejects.toThrow('Pairing code expired');
  });

  test('should limit pairing attempts', async () => {
    const invalidCode = 'INVALID';

    // Try multiple invalid attempts
    for (let i = 0; i < 5; i++) {
      await expect(pairingCode.validate(invalidCode))
        .rejects.toThrow('Invalid pairing code');
    }

    // Should be rate limited
    await expect(pairingCode.validate(invalidCode))
      .rejects.toThrow('Too many attempts');
  });
});
```

### Component Testing Best Practices

#### User-Centric Testing
Test components from the user's perspective:

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('user can add bookmark with all details', async () => {
  const user = userEvent.setup();

  render(<BookmarkForm onSave={mockSave} />);

  // User actions
  await user.type(screen.getByLabelText(/title/i), 'My Bookmark');
  await user.type(screen.getByLabelText(/url/i), 'https://example.com');
  await user.type(screen.getByLabelText(/description/i), 'Great resource');
  await user.type(screen.getByLabelText(/tags/i), 'learning, reference');

  await user.click(screen.getByRole('button', { name: /save/i }));

  // Verify behavior
  expect(mockSave).toHaveBeenCalledWith({
    title: 'My Bookmark',
    url: 'https://example.com',
    description: 'Great resource',
    tags: ['learning', 'reference']
  });
});
```

#### Accessibility Testing
Include accessibility checks in component tests:

```javascript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('bookmark form is accessible', async () => {
  const { container } = render(<BookmarkForm />);

  // Check for accessibility violations
  const results = await axe(container);
  expect(results).toHaveNoViolations();

  // Test keyboard navigation
  const titleInput = screen.getByLabelText(/title/i);
  await user.tab();
  expect(titleInput).toHaveFocus();
});
```

#### Error State Testing
Always test error conditions:

```javascript
test('shows validation errors for invalid input', async () => {
  const user = userEvent.setup();

  render(<BookmarkForm onSave={mockSave} />);

  // Submit without required fields
  await user.click(screen.getByRole('button', { name: /save/i }));

  // Verify error messages
  expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  expect(screen.getByText(/url is required/i)).toBeInTheDocument();

  // Verify form was not submitted
  expect(mockSave).not.toHaveBeenCalled();
});
```

### E2E Testing Guidelines

#### Page Object Pattern
Organize E2E tests using page objects:

```javascript
// e2e/pages/BookmarkPage.js
export class BookmarkPage {
  constructor(page) {
    this.page = page;
  }

  async addBookmark({ title, url, description, tags = [] }) {
    await this.page.click('[data-testid="add-bookmark"]');
    await this.page.fill('[data-testid="bookmark-title"]', title);
    await this.page.fill('[data-testid="bookmark-url"]', url);

    if (description) {
      await this.page.fill('[data-testid="bookmark-description"]', description);
    }

    if (tags.length > 0) {
      await this.page.fill('[data-testid="bookmark-tags"]', tags.join(', '));
    }

    await this.page.click('[data-testid="save-bookmark"]');

    // Wait for save to complete
    await this.page.waitForSelector('[data-testid="bookmark-saved"]');
  }

  async searchBookmarks(query) {
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.waitForTimeout(300); // Debounce
  }

  async getBookmarkCount() {
    return await this.page.locator('.bookmark-item').count();
  }
}
```

#### Multi-Device Testing
For cross-device scenarios:

```javascript
// e2e/fixtures/device-pair.js
export const devicePairFixture = base.extend({
  devicePair: async ({ browser }, use) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const device1 = await context1.newPage();
    const device2 = await context2.newPage();

    await device1.goto('/');
    await device2.goto('/');

    await use({ device1, device2 });

    await context1.close();
    await context2.close();
  }
});
```

#### Network Condition Testing
Test various network scenarios:

```javascript
test('handles intermittent connectivity', async ({ page }) => {
  // Simulate slow network
  await page.route('**/*', route => {
    setTimeout(() => route.continue(), 1000);
  });

  // Perform action that requires network
  await page.click('[data-testid="sync-now"]');

  // Should show loading state
  await expect(page.locator('[data-testid="syncing"]')).toBeVisible();

  // Should eventually complete
  await expect(page.locator('[data-testid="sync-complete"]'))
    .toBeVisible({ timeout: 10000 });
});
```

### Performance Testing

#### Benchmarking Guidelines
```javascript
test('search performance with large dataset', async ({ page }) => {
  // Setup large dataset
  await page.evaluate(() => {
    const bookmarks = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
      tags: [`tag${i % 10}`]
    }));
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  });

  await page.reload();

  // Measure search performance
  const searchStart = performance.now();
  await page.fill('[data-testid="search-input"]', 'bookmark');
  await page.waitForSelector('.bookmark-item:first-child');
  const searchTime = performance.now() - searchStart;

  // Performance assertion
  expect(searchTime).toBeLessThan(500); // Under 500ms

  console.log(`Search completed in ${searchTime}ms`);
});
```

#### Memory Leak Detection
```javascript
test('no memory leaks during navigation', async ({ page }) => {
  const getMemoryUsage = () => page.evaluate(() => performance.memory?.usedJSHeapSize);

  const initialMemory = await getMemoryUsage();

  // Perform actions that could cause leaks
  for (let i = 0; i < 10; i++) {
    await page.goto('/bookmarks');
    await page.goto('/settings');
    await page.goto('/');
  }

  // Force garbage collection if available
  await page.evaluate(() => {
    if (window.gc) window.gc();
  });

  const finalMemory = await getMemoryUsage();
  const memoryIncrease = finalMemory - initialMemory;

  // Memory increase should be reasonable
  expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
});
```

### Mock and Stub Guidelines

#### Service Mocking
```javascript
// Good mocking practice
vi.mock('../services/crypto', () => ({
  generateKeypair: vi.fn().mockResolvedValue({
    publicKey: 'mock-public-key',
    privateKey: 'mock-private-key'
  }),
  encrypt: vi.fn().mockResolvedValue('encrypted-data'),
  decrypt: vi.fn().mockResolvedValue('decrypted-data')
}));

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

#### Network Mocking
```javascript
// Mock fetch for API calls
global.fetch = vi.fn().mockImplementation((url) => {
  if (url.includes('/api/bookmarks')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([])
    });
  }

  return Promise.reject(new Error('Unmocked URL'));
});
```

#### Time Mocking
```javascript
// Use fake timers for time-dependent tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('expires after timeout', async () => {
  const promise = serviceWithTimeout();

  // Advance time
  vi.advanceTimersByTime(30000); // 30 seconds

  await expect(promise).rejects.toThrow('Timeout');
});
```

## Code Coverage Guidelines

### Coverage Targets
- **New Code**: 90%+ coverage required
- **Security Code**: 95%+ coverage required
- **Critical Paths**: 100% coverage preferred
- **Overall Project**: Maintain 80%+ coverage

### Coverage Quality
Focus on meaningful coverage:

```javascript
// ❌ Poor coverage - only tests happy path
test('saves bookmark', () => {
  const bookmark = { title: 'Test', url: 'https://test.com' };
  const result = saveBookmark(bookmark);
  expect(result).toBe(true);
});

// ✅ Good coverage - tests multiple scenarios
describe('saveBookmark', () => {
  test('saves valid bookmark successfully', () => {
    const bookmark = { title: 'Test', url: 'https://test.com' };
    expect(saveBookmark(bookmark)).toBe(true);
  });

  test('throws error for invalid URL', () => {
    const bookmark = { title: 'Test', url: 'invalid-url' };
    expect(() => saveBookmark(bookmark)).toThrow('Invalid URL');
  });

  test('handles storage failures gracefully', () => {
    // Mock storage failure
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });

    const bookmark = { title: 'Test', url: 'https://test.com' };
    expect(() => saveBookmark(bookmark)).toThrow('Storage full');
  });
});
```

### Coverage Exceptions
Use `/* c8 ignore */` sparingly and document why:

```javascript
// ✅ Acceptable - development only
/* c8 ignore next 3 */
if (process.env.NODE_ENV === 'development') {
  console.log('Debug information:', data);
}

// ✅ Acceptable - unreachable error case
/* c8 ignore next 2 */
default:
  throw new Error('Unreachable code');

// ❌ Not acceptable - should be tested
/* c8 ignore next 5 */
if (userRole === 'admin') {
  return performAdminAction();
}
```

## Continuous Integration

### Pre-commit Checks
Ensure tests pass before committing:

```bash
# Run in pre-commit hook
npm run test:coverage:check
npm run test:security
npm run lint
npm run format:check
```

### PR Requirements
Every pull request must:
1. Pass all existing tests
2. Add tests for new functionality
3. Maintain coverage thresholds
4. Include E2E tests for user-facing features
5. Update documentation if needed

### Test Maintenance

#### Regular Maintenance Tasks
- Review and update test data
- Remove obsolete tests
- Refactor duplicated test code
- Update E2E selectors when UI changes
- Monitor and fix flaky tests

#### Flaky Test Management
```javascript
// Mark known flaky tests
test.skip('flaky test - investigating timeout issues', () => {
  // Test implementation
});

// Or retry flaky tests
test.describe.configure({ retries: 2 });

test('potentially flaky network test', async () => {
  // Implementation with retries
});
```

## Review Checklist

### For Test Authors
Before submitting:
- [ ] Tests follow naming conventions
- [ ] All code paths are tested
- [ ] Error conditions are handled
- [ ] Tests are focused and independent
- [ ] Mock cleanup is proper
- [ ] Performance implications considered
- [ ] Accessibility tested (for UI components)
- [ ] Security aspects covered (for sensitive code)

### For Test Reviewers
When reviewing:
- [ ] Test quality and coverage
- [ ] Appropriate test types used
- [ ] Mock usage is reasonable
- [ ] Tests are maintainable
- [ ] Performance impact acceptable
- [ ] Security considerations addressed
- [ ] Documentation updated if needed

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Security Testing Guidelines](https://owasp.org/www-project-web-security-testing-guide/)
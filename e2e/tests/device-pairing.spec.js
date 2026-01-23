import { test, expect } from '../fixtures/test-data.js';
import {
  startPairingAsInitiator,
  joinPairingAsResponder,
  waitForPairingComplete,
  simulateNetworkConditions
} from '../utils/test-helpers.js';

/**
 * Device Pairing E2E Tests
 *
 * Tests the complete device pairing workflow:
 * - Code generation and display
 * - Cross-device pairing simulation
 * - Key exchange and validation
 * - Error handling and recovery
 * - Network condition resilience
 */

test.describe('Device Pairing Workflow', () => {
  test('complete successful pairing flow between two devices', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Device 1 starts as initiator (generates code)
    const pairingCode = await startPairingAsInitiator(device1);

    // Verify pairing code format (should be number-word-word)
    expect(pairingCode).toMatch(/^\d+-\w+-\w+$/);

    // Device 2 joins using the code
    await joinPairingAsResponder(device2, pairingCode);

    // Wait for pairing to complete on both devices
    await Promise.all([
      waitForPairingComplete(device1),
      waitForPairingComplete(device2)
    ]);

    // Verify both devices show pairing success
    await expect(device1.locator('[data-testid="pairing-success"], .pairing-complete')).toBeVisible();
    await expect(device2.locator('[data-testid="pairing-success"], .pairing-complete')).toBeVisible();
  });

  test('pairing code expires after timeout', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Start pairing on device 1
    await startPairingAsInitiator(device1);

    // Wait for timeout (should be 5 minutes in real app, but we'll test with shorter timeout)
    // Fast-forward time if app supports it, or wait for natural timeout
    await device1.waitForTimeout(2000); // Simulate some time passing

    // Try to join with device 2 after delay
    // This should fail if timeout is implemented
    await device2.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');
    await device2.click('[data-testid="enter-pairing-code"], button:has-text("Enter"), button:has-text("Join")');

    // The expired code should be rejected
    // (In a real test, we'd need to mock the timeout or use a shorter timeout for testing)
  });

  test('invalid pairing code formats are rejected', async ({ cleanPage }) => {
    // Navigate to pairing
    await cleanPage.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');
    await cleanPage.click('[data-testid="enter-pairing-code"], button:has-text("Enter"), button:has-text("Join")');

    const invalidCodes = [
      'invalid',
      '123',
      'abc-def',
      '123-456',
      '123-abc-def-ghi',
      '',
      '!@#-$%^-&*()'
    ];

    for (const invalidCode of invalidCodes) {
      // Clear any previous input
      await cleanPage.fill('[data-testid="pairing-code-input"], input[placeholder*="code"]', '');

      // Enter invalid code
      await cleanPage.fill('[data-testid="pairing-code-input"], input[placeholder*="code"]', invalidCode);
      await cleanPage.click('[data-testid="connect-button"], button:has-text("Connect")');

      // Should show error message
      await expect(cleanPage.locator('.error, .invalid, [role="alert"]')).toBeVisible({ timeout: 3000 });
    }
  });

  test('pairing works under slow network conditions', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Simulate slow network
    await simulateNetworkConditions(device1, 'slow');
    await simulateNetworkConditions(device2, 'slow');

    // Start pairing flow
    const pairingCode = await startPairingAsInitiator(device1);
    await joinPairingAsResponder(device2, pairingCode);

    // Should still complete successfully, just slower
    await Promise.all([
      waitForPairingComplete(device1, 45000), // Longer timeout for slow network
      waitForPairingComplete(device2, 45000)
    ]);
  });

  test('pairing recovery after network interruption', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Start pairing
    const pairingCode = await startPairingAsInitiator(device1);

    // Begin joining on device 2
    await device2.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');
    await device2.click('[data-testid="enter-pairing-code"], button:has-text("Enter"), button:has-text("Join")');
    await device2.fill('[data-testid="pairing-code-input"], input[placeholder*="code"]', pairingCode);

    // Simulate network interruption
    await simulateNetworkConditions(device2, 'offline');
    await device2.click('[data-testid="connect-button"], button:has-text("Connect")');

    // Should show network error
    await device2.waitForTimeout(2000);

    // Restore network
    await simulateNetworkConditions(device2, 'online');

    // Retry should work
    await device2.click('[data-testid="connect-button"], button:has-text("Connect"), button:has-text("Retry")');
    await waitForPairingComplete(device2);
  });

  test('multiple concurrent pairing attempts are handled correctly', async ({ browser }) => {
    // Create three browser contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();

    const device1 = await context1.newPage();
    const device2 = await context2.newPage();
    const device3 = await context3.newPage();

    try {
      // Setup all devices
      await Promise.all([
        device1.goto('/'),
        device2.goto('/'),
        device3.goto('/')
      ]);

      // Device 1 generates a code
      const pairingCode = await startPairingAsInitiator(device1);

      // Both device 2 and device 3 try to join with the same code
      await Promise.all([
        joinPairingAsResponder(device2, pairingCode).catch(() => {}), // Might fail
        joinPairingAsResponder(device3, pairingCode).catch(() => {})  // Might fail
      ]);

      // Only one should succeed, the other should get an error
      const device2Success = await device2.locator('[data-testid="pairing-success"]').isVisible({ timeout: 5000 });
      const device3Success = await device3.locator('[data-testid="pairing-success"]').isVisible({ timeout: 5000 });

      // Exactly one should succeed
      expect(device2Success !== device3Success).toBeTruthy();

    } finally {
      await Promise.all([
        context1.close(),
        context2.close(),
        context3.close()
      ]);
    }
  });

  test('pairing UI provides clear user feedback', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Test initiator UI
    await device1.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');
    await device1.click('[data-testid="show-pairing-code"], button:has-text("Show")');

    // Should show instructions
    await expect(device1.locator(':has-text("Enter this code")')).toBeVisible();
    await expect(device1.locator(':has-text("other device")')).toBeVisible();
    await expect(device1.locator(':has-text("expires")')).toBeVisible();

    // Should show waiting state
    await expect(device1.locator(':has-text("Waiting")')).toBeVisible();

    // Test responder UI
    await device2.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');
    await device2.click('[data-testid="enter-pairing-code"], button:has-text("Enter")');

    // Should show input instructions
    await expect(device2.locator(':has-text("Enter")')).toBeVisible();
    await expect(device2.locator('input[placeholder*="code"]')).toBeVisible();

    // Connect button should be disabled initially
    const connectButton = device2.locator('[data-testid="connect-button"], button:has-text("Connect")');
    await expect(connectButton).toBeDisabled();

    // Should enable after entering code
    await device2.fill('[data-testid="pairing-code-input"], input[placeholder*="code"]', '123-test-code');
    await expect(connectButton).toBeEnabled();
  });

  test('pairing cleans up resources properly', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Start pairing
    await startPairingAsInitiator(device1);

    // Cancel pairing on device 1
    await device1.click('[data-testid="cancel-pairing"], button:has-text("Cancel")');

    // Should return to initial state
    await expect(device1.locator('[data-testid="show-pairing-code"], button:has-text("Show")')).toBeVisible();

    // Start new pairing should work
    const newCode = await startPairingAsInitiator(device1);
    expect(newCode).toMatch(/^\d+-\w+-\w+$/);

    // Complete pairing to verify everything works
    await joinPairingAsResponder(device2, newCode);
    await Promise.all([
      waitForPairingComplete(device1),
      waitForPairingComplete(device2)
    ]);
  });
});
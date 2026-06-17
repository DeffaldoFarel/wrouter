import { test, expect, Page } from '@playwright/test';

const TEST_PASSWORD = 'e2e-test-password-12345';

/**
 * Helper to set up test password via settings API
 */
async function setupTestPassword(page: Page) {
  // First login with any password (we'll set a new one)
  await page.goto('/login');
  
  // Try to login - if no password is set, we need to set one first via API
  const response = await page.request.put('/api/settings', {
    data: { password: TEST_PASSWORD },
  });
  
  // If unauthorized, we need to login first with existing password
  if (response.status() === 401) {
    // Try common default passwords
    for (const pwd of ['admin', 'password', 'wrouter']) {
      const loginRes = await page.request.post('/api/auth/login', {
        data: { password: pwd },
      });
      if (loginRes.ok()) {
        // Now set our test password
        await page.request.put('/api/settings', {
          data: { password: TEST_PASSWORD },
        });
        break;
      }
    }
  }
}

test.describe('Authentication flow', () => {
  test('GET /api/v1/models without auth returns 401', async ({ request }) => {
    const response = await request.get('/api/v1/models');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Missing API key');
  });

  test('GET /api/v1/models with invalid API key returns 401', async ({ request }) => {
    const response = await request.get('/api/v1/models', {
      headers: {
        Authorization: 'Bearer invalid-key-12345',
      },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Invalid API key');
  });

  test('Login page loads with password input and submit button', async ({ page }) => {
    await page.goto('/login');
    
    // Check for password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('placeholder', 'Enter password');
    
    // Check for submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toContainText('Login');
  });

  test('Login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    
    // Enter wrong password
    await page.locator('input[type="password"]').fill('wrong-password-999');
    await page.locator('button[type="submit"]').click();
    
    // Wait for error message
    await expect(page.locator('text=Invalid password')).toBeVisible({ timeout: 5000 });
  });

  test('Login with correct password redirects to dashboard', async ({ page }) => {
    // Set up test password first
    await setupTestPassword(page);
    
    // Clear cookies to ensure clean state
    await page.context().clearCookies();
    
    // Go to login page
    await page.goto('/login');
    
    // Login with test password
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    
    // Verify we're on dashboard page
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 5000 });
  });
});

import { test, expect, Page } from '@playwright/test';

const TEST_PASSWORD = 'e2e-test-password-12345';

/**
 * Helper to login before each test
 */
async function login(page: Page) {
  // Set password via API first (requires auth, so we try common passwords)
  let loginSuccess = false;
  
  for (const pwd of [TEST_PASSWORD, 'admin', 'password', 'wrouter']) {
    const response = await page.request.post('/api/auth/login', {
      data: { password: pwd },
    });
    if (response.ok()) {
      loginSuccess = true;
      // Set our test password for future runs
      if (pwd !== TEST_PASSWORD) {
        await page.request.put('/api/settings', {
          data: { password: TEST_PASSWORD },
        });
      }
      break;
    }
  }
  
  if (!loginSuccess) {
    throw new Error('Could not login with any password');
  }
}

test.describe('Dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Dashboard page loads and shows "API Keys" heading', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for API Keys section
    await expect(page.locator('text=API Keys')).toBeVisible({ timeout: 10000 });
    
    // Check for other dashboard elements
    await expect(page.locator('text=Endpoint Configuration')).toBeVisible();
    await expect(page.locator('text=Token Saver')).toBeVisible();
  });

  test('Providers page loads at /dashboard/providers', async ({ page }) => {
    await page.goto('/dashboard/providers');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for providers-related content
    await expect(page.locator('text=Providers')).toBeVisible({ timeout: 10000 });
  });

  test('Usage/Logs page loads at /dashboard/logs', async ({ page }) => {
    await page.goto('/dashboard/logs');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for logs-related content (the page title is "Usage" based on nav)
    await expect(page.locator('text=Usage')).toBeVisible({ timeout: 10000 });
  });

  test('Health Check page loads at /dashboard/health', async ({ page }) => {
    await page.goto('/dashboard/health');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for health check content
    await expect(page.locator('text=Health Check')).toBeVisible({ timeout: 10000 });
  });

  test('Settings page loads at /dashboard/settings', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for settings content
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 10000 });
  });

  test('Combos page loads at /dashboard/combos', async ({ page }) => {
    await page.goto('/dashboard/combos');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for combos content
    await expect(page.locator('text=Combos')).toBeVisible({ timeout: 10000 });
  });

  test('Navigation sidebar contains all links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check sidebar navigation links
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/providers"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/combos"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/logs"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/health"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard/settings"]')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Health endpoint', () => {
  test('GET /api/health returns ok without auth', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    // Unauthenticated health check returns simple { status: "ok" }
    expect(body.status).toBe('ok');
  });

  test('GET /api/health returns provider health array when authenticated', async ({ request, page }) => {
    // Login first to get authenticated session
    const loginPasswords = ['e2e-te...2345', 'admin', 'password', 'wrouter'];
    let loggedIn = false;

    for (const pwd of loginPasswords) {
      const res = await request.post('/api/auth/login', {
        data: { password: pwd },
      });
      if (res.ok()) {
        loggedIn = true;
        break;
      }
    }

    test.skip(!loggedIn, 'Could not login to test authenticated health');

    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Authenticated response is an array of provider health objects
    expect(Array.isArray(body)).toBeTruthy();

    // Each item (if any) should have expected fields
    if (body.length > 0) {
      const provider = body[0];
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('status');
      expect(provider).toHaveProperty('enabled');
    }
  });
});

import { test, expect, Page } from '@playwright/test';

const TEST_PASSWORD = 'e2e-test-password-12345';
const TEST_API_KEY_NAME = 'e2e-test-key';
let testApiKey: string | null = null;

/**
 * Helper to login and create an API key for testing
 */
async function setupApiKey(page: Page): Promise<string> {
  // Login first
  let loginSuccess = false;
  for (const pwd of [TEST_PASSWORD, 'admin', 'password', 'wrouter']) {
    const response = await page.request.post('/api/auth/login', {
      data: { password: pwd },
    });
    if (response.ok()) {
      loginSuccess = true;
      if (pwd !== TEST_PASSWORD) {
        await page.request.put('/api/settings', {
          data: { password: TEST_PASSWORD },
        });
      }
      break;
    }
  }
  
  if (!loginSuccess) {
    throw new Error('Could not login to create API key');
  }
  
  // Check if test key already exists
  const keysResponse = await page.request.get('/api/keys');
  if (keysResponse.ok()) {
    const keys = await keysResponse.json();
    const existingKey = keys.find((k: any) => k.name === TEST_API_KEY_NAME && k.enabled);
    if (existingKey) {
      return existingKey.key;
    }
  }
  
  // Create new API key
  const createResponse = await page.request.post('/api/keys', {
    data: { name: TEST_API_KEY_NAME },
  });
  
  if (!createResponse.ok()) {
    throw new Error('Failed to create API key');
  }
  
  const newKey = await createResponse.json();
  return newKey.key;
}

test.describe('API endpoint tests', () => {
  test.beforeAll(async ({ browser }) => {
    // Create a page context to set up API key
    const context = await browser.newContext();
    const page = await context.newPage();
    testApiKey = await setupApiKey(page);
    await context.close();
  });

  test('GET /api/v1/models with valid API key returns models array', async ({ request }) => {
    if (!testApiKey) {
      test.skip();
      return;
    }
    
    const response = await request.get('/api/v1/models', {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    
    // Should return OpenAI-compatible format
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBeTruthy();
    
    // Each model should have required fields
    if (body.data.length > 0) {
      const model = body.data[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('created');
      expect(model).toHaveProperty('owned_by');
    }
  });

  test('POST /api/v1/chat/completions without body returns error', async ({ request }) => {
    if (!testApiKey) {
      test.skip();
      return;
    }
    
    const response = await request.post('/api/v1/chat/completions', {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    
    // Should return 400 for validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('invalid_request_error');
  });

  test('POST /api/v1/chat/completions with invalid model returns error', async ({ request }) => {
    if (!testApiKey) {
      test.skip();
      return;
    }
    
    const response = await request.post('/api/v1/chat/completions', {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: 'nonexistent-model-xyz-123',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
      },
    });
    
    // Should return 404 for model not found
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain('Model not found');
  });

  test('POST /api/v1/chat/completions without messages returns error', async ({ request }) => {
    if (!testApiKey) {
      test.skip();
      return;
    }
    
    const response = await request.post('/api/v1/chat/completions', {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: 'test-model',
      },
    });
    
    // Should return 400 for validation error
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('OPTIONS /api/v1/chat/completions returns CORS headers', async ({ request }) => {
    const response = await request.fetch('http://localhost:20128/api/v1/chat/completions', {
      method: 'OPTIONS',
    });
    
    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('POST /api/v1/chat/completions without auth returns 401', async ({ request }) => {
    const response = await request.post('/api/v1/chat/completions', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    });
    
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain('Missing API key');
  });
});

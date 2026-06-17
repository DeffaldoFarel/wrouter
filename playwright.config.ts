import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:20128',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start',
    port: 20128,
    timeout: 30000,
    reuseExistingServer: true,
    env: {
      JWT_SECRET: 'e2e-test-secret',
      PORT: '20128',
    },
  },
});

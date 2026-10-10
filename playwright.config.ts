import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  webServer: {
    command: 'npm run fixtures',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
});

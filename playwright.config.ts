import { defineConfig, devices } from '@playwright/test';

// The suite runs against the built package (dist/) on e2e/harness/; `npm run test:e2e` builds first.
// Not 5173 or 5183: other servers use them, and reuseExistingServer would attach to them.
const PORT = 5184;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Keyboard specs skip themselves on mobile; pointer specs run on all, with touch on mobile.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],
  webServer: {
    command: `tsx scripts/serve-e2e.ts ${PORT}`,
    url: `http://localhost:${PORT}/`,
    // Use an already-running server if there is one; it reads from disk, so it never goes stale.
    reuseExistingServer: !process.env.CI,
  },
});

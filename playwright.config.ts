import { defineConfig, devices } from '@playwright/test';

// Not 5173: other local projects use it, and reuseExistingServer would attach to their server.
const PORT = 5183;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Keyboard specs skip themselves on mobile; pointer specs run on both, with touch on mobile.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/runtime.html`,
    // Use an already-running dev server if there is one.
    reuseExistingServer: !process.env.CI,
  },
});

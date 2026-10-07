import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile-first testing. Only Chromium is available in this environment, so the
 * phone is emulated: an iPhone-13-sized viewport at its device pixel ratio,
 * with touch enabled and mobile UA. That covers layout, touch input and the
 * loop; it is not a substitute for a pass on real iOS Safari.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    // The production base path: the suite plays the build exactly as Pages serves it.
    baseURL: 'http://127.0.0.1:4173/DETECTOR/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173/DETECTOR/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

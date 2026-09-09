import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})

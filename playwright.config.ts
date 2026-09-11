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
  // The reviewed artifact is the baseline, and there is deliberately only one
  // copy of it. Playwright's default would write a second image beside the spec
  // that is byte-identical today and free to drift tomorrow. No platform suffix,
  // because the pixel gate is opt-in on one machine rather than a CI matrix.
  snapshotPathTemplate:
    '{testDir}/../../docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/{arg}{ext}',
  use: {
    browserName: 'chromium',
    // Alpine CI uses the distro Chromium; other hosts use Playwright's pinned build.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})

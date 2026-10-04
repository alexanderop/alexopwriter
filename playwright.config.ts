import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  features: 'tests/e2e/*.feature',
  steps: 'tests/e2e/*.steps.ts',
})

export default defineConfig({
  testDir,
  fullyParallel: false,
  globalTimeout: 180_000,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:${process.env['WRITER_TEST_PORT'] ?? '5186'}${process.env['VITE_BASE_PATH'] ?? '/'}`,
    launchOptions: { timeout: 15_000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `pnpm preview --port ${process.env['WRITER_TEST_PORT'] ?? '5186'}`,
    url: `http://127.0.0.1:${process.env['WRITER_TEST_PORT'] ?? '5186'}${process.env['VITE_BASE_PATH'] ?? '/'}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

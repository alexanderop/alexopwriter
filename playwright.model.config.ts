import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: 'model-smoke.spec.ts',
  timeout: 600_000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:5186${process.env['VITE_BASE_PATH'] ?? '/'}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm preview',
    url: `http://127.0.0.1:5186${process.env['VITE_BASE_PATH'] ?? '/'}`,
    reuseExistingServer: false,
  },
})

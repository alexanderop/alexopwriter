import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'
import { join } from 'node:path'

const runDirectory = process.env['WRITER_RUN_DIR']
const port = Number(process.env['WRITER_PORT'] ?? process.env['WRITER_TEST_PORT'] ?? 5186)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid WRITER_PORT')
const baseURL = `http://127.0.0.1:${port}${process.env['VITE_BASE_PATH'] ?? '/'}`

const testDir = defineBddConfig({
  features: 'tests/e2e/*.feature',
  ...(runDirectory ? { outputDir: join(runDirectory, 'generated') } : {}),
  steps: ['tests/e2e/*.steps.ts', 'tests/e2e/fixtures.ts'],
})

export default defineConfig({
  testDir,
  ...(runDirectory ? {
    outputDir: join(runDirectory, 'results'),
    reporter: [
      ['list'],
      ['json', { outputFile: join(runDirectory, 'report.json') }],
      ['html', { outputFolder: join(runDirectory, 'html'), open: 'never' }],
    ] as import('@playwright/test').ReporterDescription[],
  } : {}),
  fullyParallel: false,
  globalTimeout: 180_000,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    launchOptions: { timeout: 15_000 },
    trace: runDirectory ? 'on' : 'retain-on-failure',
    screenshot: runDirectory ? 'on' : 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: runDirectory ? [] : {
    command: `pnpm preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

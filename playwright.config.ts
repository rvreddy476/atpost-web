import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // System Chrome is used in constrained CI; traces and screenshots provide
    // diagnostics without requiring Playwright's separate FFmpeg artifact.
    video: 'off',
    ...devices['Desktop Chrome'],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH || '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
  },
  webServer: [
    {
      command: 'bun run --cwd apps/commerce dev',
      url: 'http://127.0.0.1:3001/shop',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_ENABLE_STUB_PAYMENTS: 'true',
        API_GATEWAY_URL: 'http://127.0.0.1:8080',
        AUTH_SERVICE_URL: 'http://127.0.0.1:8081',
      },
    },
    {
      command: 'bun run --cwd apps/admin dev',
      url: 'http://127.0.0.1:3002/admin',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})

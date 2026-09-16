import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * The admin console specs only. They drive :3022 directly with every /v1/**
 * call mocked, so starting the shell and commerce dev servers as well (what
 * playwright.config.ts does) is wasted minutes.
 *
 *   bunx playwright test -c playwright.admin.config.ts
 */
export default defineConfig({
  ...base,
  testMatch: /admin(-[a-z]+)?\.spec\.ts$/,
  webServer: {
    command: 'bun run --cwd apps/admin dev:e2e',
    url: 'http://127.0.0.1:3022/admin/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

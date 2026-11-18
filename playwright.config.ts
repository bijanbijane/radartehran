import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const LOCAL_HEADLESS_SHELL =
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';

const executablePath = fs.existsSync(LOCAL_HEADLESS_SHELL) ? LOCAL_HEADLESS_SHELL : undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.e2e.spec.ts'],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    locale: 'fa-IR',
    viewport: { width: 1680, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

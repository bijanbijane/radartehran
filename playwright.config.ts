import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const LOCAL_HEADLESS_SHELL =
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';
const MAC_SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = fs.existsSync(LOCAL_HEADLESS_SHELL)
  ? LOCAL_HEADLESS_SHELL
  : fs.existsSync(MAC_SYSTEM_CHROME) ? MAC_SYSTEM_CHROME : undefined;
const SMOKE_BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';

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
    baseURL: SMOKE_BASE_URL,
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
    url: `${SMOKE_BASE_URL}/api/healthz`,
    env: {
      PORT: new URL(SMOKE_BASE_URL).port || '3000',
      APP_URL: SMOKE_BASE_URL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

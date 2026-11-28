import { defineConfig } from '@playwright/test';

const baseURL = process.env.SMOKE_BASE_URL;

if (!baseURL) {
  throw new Error('SMOKE_BASE_URL must point to the isolated frontend Preview Worker.');
}

export default defineConfig({
  testDir: './tests',
  testMatch: ['frontend-preview.visual.e2e.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    locale: 'fa-IR',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const artifactDirectory = 'artifacts/frontend-preview';

test('isolated frontend preview renders desktop and mobile shells', async ({ page }) => {
  fs.mkdirSync(artifactDirectory, { recursive: true });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response, 'Preview root should return a document response').not.toBeNull();
  expect(response!.status(), 'Preview root should return HTTP 200').toBe(200);

  await expect(page).toHaveTitle(/رادار/i);
  const neighborhoodSearch = page.locator('input[aria-label="جست‌وجوی محله"]');
  await expect(neighborhoodSearch).toBeVisible();

  await page.screenshot({
    path: `${artifactDirectory}/desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(neighborhoodSearch).toBeVisible();
  await page.screenshot({
    path: `${artifactDirectory}/mobile.png`,
    fullPage: true,
    animations: 'disabled',
  });

  expect(pageErrors, 'The app shell should not throw uncaught browser exceptions').toEqual([]);
});

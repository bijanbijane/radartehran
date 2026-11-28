import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const artifactDirectory = 'artifacts/frontend-preview';

test('isolated frontend preview renders desktop and touch-enabled mobile shells without horizontal overflow', async ({ page, browser }) => {
  fs.mkdirSync(artifactDirectory, { recursive: true });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(`desktop: ${error.message}`));

  const desktopResponse = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(desktopResponse, 'Preview root should return a document response').not.toBeNull();
  expect(desktopResponse!.status(), 'Preview root should return HTTP 200').toBe(200);
  await expect(page).toHaveTitle(/رادار/i);
  await expect(page.locator('input[placeholder*="محله"]')).toBeVisible();

  await page.screenshot({
    path: `${artifactDirectory}/desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'fa-IR',
  });

  try {
    const mobilePage = await mobileContext.newPage();
    mobilePage.on('pageerror', (error) => pageErrors.push(`mobile: ${error.message}`));

    const mobileResponse = await mobilePage.goto('/', { waitUntil: 'domcontentloaded' });
    expect(mobileResponse, 'Mobile preview should return a document response').not.toBeNull();
    expect(mobileResponse!.status(), 'Mobile preview should return HTTP 200').toBe(200);
    await expect(mobilePage).toHaveTitle(/رادار/i);
    await expect(mobilePage.locator('input[placeholder*="محله"]')).toBeVisible();
    await expect(mobilePage.getByRole('main')).toBeVisible();
    await expect(mobilePage.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(mobilePage.getByRole('textbox', { name: /جست‌وجوی سراسری/ })).toBeVisible();

    for (const destination of ['محله‌ها', 'بازار', 'نقشه', 'املاک']) {
      await expect(mobilePage.getByRole('link', { name: destination, exact: true }).last()).toBeVisible();
    }
    const moreButton = mobilePage.getByRole('button', { name: 'بخش‌های بیشتر', exact: true });
    await expect(moreButton).toBeVisible();
    await moreButton.focus();
    await mobilePage.keyboard.press('Enter');

    const originalBodyOverflow = await mobilePage.locator('body').evaluate((body) => body.style.overflow);
    const moreDialog = mobilePage.getByRole('dialog', { name: 'بخش‌های بیشتر' });
    await expect(moreDialog).toBeVisible();
    await expect(moreDialog).toHaveAttribute('aria-modal', 'true');
    await expect.poll(() => mobilePage.locator('body').evaluate((body) => body.style.overflow)).toBe('hidden');

    const dialogFocusable = moreDialog.locator(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const firstDialogControl = dialogFocusable.first();
    const lastDialogControl = dialogFocusable.last();
    await expect(firstDialogControl).toBeFocused();

    await lastDialogControl.focus();
    await mobilePage.keyboard.press('Tab');
    await expect(firstDialogControl).toBeFocused();

    await firstDialogControl.focus();
    await mobilePage.keyboard.press('Shift+Tab');
    await expect(lastDialogControl).toBeFocused();

    await mobilePage.keyboard.press('Escape');
    await expect(moreDialog).toBeHidden();
    await expect(moreButton).toBeFocused();
    await expect.poll(() => mobilePage.locator('body').evaluate((body) => body.style.overflow)).toBe(originalBodyOverflow);

    const mobileLayout = await mobilePage.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      mobileViewport: window.matchMedia('(max-width: 767px)').matches,
    }));

    expect(mobileLayout.hasTouch, 'Mobile context should expose touch input').toBe(true);
    expect(mobileLayout.mobileViewport, 'Mobile context should activate mobile breakpoints').toBe(true);
    expect(
      mobileLayout.documentWidth,
      `Mobile shell should not overflow horizontally (document ${mobileLayout.documentWidth}px, viewport ${mobileLayout.viewportWidth}px)`,
    ).toBeLessThanOrEqual(mobileLayout.viewportWidth);

    await mobilePage.screenshot({
      path: `${artifactDirectory}/mobile.png`,
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await mobileContext.close();
  }

  expect(pageErrors, 'Desktop and mobile shells should not throw uncaught browser exceptions').toEqual([]);
});

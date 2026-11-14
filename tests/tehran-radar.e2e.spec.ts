/**
 * @file tests/tehran-radar.e2e.spec.ts
 * @description Playwright E2E, Desktop/Mobile Smoke, RTL, Keyboard Navigation & Accessibility Suite
 * executed via `npm run test:e2e`.
 */
import { test, expect } from '@playwright/test';

test.describe('Tehran & Multi-City Housing Radar — E2E, Responsive & Accessibility Gates', () => {
  test('1. Desktop smoke, 5-city switcher, search empty state, and RTL/accessibility semantics', async ({ page }) => {
    const uncaughtErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) {
        uncaughtErrors.push(err.message);
      }
    });

    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const searchInput = page.locator('input[aria-label="جست‌وجوی محله"]');
    await expect(searchInput).toBeVisible();

    // Verify RTL direction and accessible document title
    const htmlDir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.locator('body').getAttribute('dir');
    const hasRtl = htmlDir === 'rtl' || bodyDir === 'rtl' || (await page.locator('[dir="rtl"]').count()) > 0;
    expect(hasRtl).toBe(true);
    await expect(page).toHaveTitle(/رادار/);

    // Verify Leaflet interactive map container and price markers
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect.poll(async () => page.locator('.price-pill-icon').count()).toBeGreaterThan(10);

    // Switch cities (Tehran -> Karaj -> Tehran) and verify URL & title sync
    await page.getByRole('button', { name: 'کرج', exact: true }).first().click({ force: true });
    await expect(page).toHaveURL(/city=karaj/);
    await page.getByRole('button', { name: 'تهران', exact: true }).first().click({ force: true });

    // Search non-existent neighborhood to verify deterministic empty state
    await searchInput.fill('محله‌خیالی‌ناموجود۹۹۹');
    await searchInput.focus();
    await expect(page.locator('text=محله‌ای با این نام در این شهر یافت نشد.')).toBeVisible();

    // Search valid neighborhood ('سعادت') and press Enter
    await searchInput.fill('سعادت');
    await searchInput.press('Enter');
    await expect(page).toHaveTitle(/سعادت/);

    expect(uncaughtErrors).toEqual([]);
  });

  test('2. Keyboard accessibility (Escape dialog dismissal) and NAV-011 isolated Admin security boundary', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[aria-label="جست‌وجوی محله"]')).toBeVisible();

    // NAV-011: Verify zero Admin links or buttons exist anywhere in public header or Tools popover
    await expect(page.locator('header button:has-text("مدیریت")')).toHaveCount(0);
    await page.locator('button[aria-expanded]:has-text("ابزارها")').click({ force: true });
    await expect(page.locator('button:has-text("مدیریت")')).toHaveCount(0);

    // Open Smart Suggest modal and verify Escape key dismisses modal dialog
    await page.locator('button:has-text("پیشنهاد هوشمند محله")').first().click({ force: true });
    const suggestDialog = page.locator('[role="dialog"][aria-label="پیشنهاد هوشمند محله"]');
    await expect(suggestDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(suggestDialog).toBeHidden();

    // Navigate directly to isolated Admin route and verify Zero-Trust boundary
    await page.goto('/?view=admin', { waitUntil: 'domcontentloaded' });
    const adminPage = page.locator('[data-testid="admin-monitoring-full-page"]');
    await expect(adminPage).toBeVisible();
    await expect(adminPage).toContainText('احراز هویت مدیر سیستم (Firebase Admin Auth)');

    await page.locator('button:has-text("بررسی مجوز و بازگشایی پنل مدیریت")').click();
    await expect(adminPage).toContainText('دسترسی غیرمجاز');

    await page.locator('button:has-text("بازگشت به محیط عمومی")').click();
    await expect(adminPage).toBeHidden();
    await expect(page.locator('input[aria-label="جست‌وجوی محله"]')).toBeVisible();
  });

  test('3. Mobile viewport (390x844) layout integrity, 5-tab bottom navigation, and inspector sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[aria-label="جست‌وجوی محله"]')).toBeVisible();

    // Verify no horizontal document overflow on mobile 390x844
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    const mobileNav = page.getByRole('navigation', { name: 'نوار پیمایش موبایل' });
    await expect(mobileNav.getByRole('button')).toHaveCount(5);
    for (const destination of ['discover', 'intelligence', 'map', 'properties']) {
      await expect(mobileNav.locator(`[data-testid="mobile-nav-${destination}"]`)).toBeVisible();
    }
    await mobileNav.getByRole('button', { name: 'بیشتر' }).click({ force: true });
    const moreSections = page.getByRole('region', { name: 'بخش‌های بیشتر' });
    await expect(moreSections).toBeVisible();
    await expect(moreSections.getByRole('button', { name: 'مدیریت و پایش' })).toHaveCount(0);

    await moreSections.getByRole('button', { name: /صفحه نخست رادار/ }).click();
    await expect(page.locator('[data-testid="product-home-view"]')).toBeVisible();
    const listingHero = page.locator('[data-testid="listing-verdict-hero"]');
    await expect(listingHero).toBeVisible();
    await expect(listingHero.getByLabel('متن یا لینک آگهی')).toBeVisible();
    await expect(page.locator('[data-testid="budget-fit-verdict"]')).toBeVisible();
    const panelBox = await page.locator('[data-testid="product-home-view"]').evaluate((el) => {
      const panel = el.closest('.overflow-y-auto');
      if (!panel) return { marginTop: -1 };
      return { marginTop: parseFloat(getComputedStyle(panel).marginTop) || 0 };
    });
    expect(panelBox.marginTop).toBeLessThan(80);
    await mobileNav.getByRole('button', { name: 'نقشه' }).click();

    // Verify mobile inspector sheet handle has accessible role and label
    const sheetHandle = page.locator('[role="button"][aria-label*="پنل کالبدشکافی"]');
    await expect(sheetHandle).toBeVisible();
    await sheetHandle.click();
    const inspectorTabs = page.getByRole('tablist', { name: 'بخش‌های کارنامه محله' });
    await expect(inspectorTabs.getByRole('tab')).toHaveCount(5);
    const scorecardTab = page.getByRole('tab', { name: 'کارنامه' });
    const marketTab = page.getByRole('tab', { name: 'بازار و نمودار' });
    await scorecardTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(marketTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#inspector-panel-market')).toBeVisible();
    await expect(page.getByText('تحلیل پیشرفته و مقایسه')).toBeVisible();
  });
});

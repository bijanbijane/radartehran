/**
 * @file tests/tehran-radar.e2e.spec.ts
 * @description Playwright E2E, Desktop/Mobile Smoke, 5-City Switcher, Multi-Level RTL Oracle,
 * 8-Viewport Responsive Regression Matrix & Accessibility Suite executed via `npm run test:e2e`.
 */
import { test, expect } from '@playwright/test';
import {
  FIVE_CITY_ROUND_TRIP,
  RESPONSIVE_VIEWPORT_MATRIX,
  assertActiveCityData,
  assertNoCrossCityDataLeakage,
  assertResponsiveLayout,
  assertRtlLayout,
  switchCityAndAssertContext,
  waitForLayoutStabilization,
} from './e2e/helpers/multicityRtlResponsiveHelpers';

test.describe('Tehran & Multi-City Housing Radar — E2E, Responsive & Accessibility Gates', () => {
  test('1. Desktop smoke, 5-city switcher (no force click), search empty state, and multi-level RTL semantics', async ({ page }) => {
    const uncaughtErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) {
        uncaughtErrors.push(err.message);
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await waitForLayoutStabilization(page);

    const searchInput = page.locator('input[aria-label="جست‌وجوی محله"]');
    await expect(searchInput).toBeVisible();

    // Multi-level RTL & BiDi oracle (replaces weak single-attribute check)
    await assertRtlLayout(page);
    await expect(page).toHaveTitle(/رادار/);

    // Verify Leaflet interactive map container and price markers
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect.poll(async () => page.locator('.price-pill-icon').count()).toBeGreaterThan(10);

    // Switch through all 5 supported cities without { force: true } and verify URL, active button, map, search & inspector
    let previousCity = FIVE_CITY_ROUND_TRIP[0];
    for (let i = 1; i < FIVE_CITY_ROUND_TRIP.length; i += 1) {
      const targetCity = FIVE_CITY_ROUND_TRIP[i];
      await switchCityAndAssertContext(page, targetCity);
      await assertActiveCityData(page, targetCity);
      await assertNoCrossCityDataLeakage(page, targetCity, previousCity);
      previousCity = targetCity;
    }

    // Search non-existent neighborhood to verify deterministic empty state
    await searchInput.click();
    await searchInput.fill('محله‌خیالی‌ناموجود۹۹۹');
    await expect(page.locator('text=محله‌ای با این نام در این شهر یافت نشد.')).toBeVisible();

    // Search valid Tehran neighborhood ('سعادت') and press Enter
    await searchInput.fill('سعادت');
    await searchInput.press('Enter');
    await expect(page).toHaveTitle(/سعادت/);

    expect(uncaughtErrors).toEqual([]);
  });

  test('2. Keyboard accessibility (Escape dialog dismissal) and NAV-011 isolated Admin security boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[aria-label="جست‌وجوی محله"]')).toBeVisible();

    // NAV-011: Verify zero Admin links or buttons exist anywhere in public header or Tools popover
    await expect(page.locator('header button:has-text("مدیریت")')).toHaveCount(0);
    await page.locator('button[aria-expanded]:has-text("ابزارها")').click();
    await expect(page.locator('button:has-text("مدیریت")')).toHaveCount(0);

    // Open Smart Suggest modal and verify Escape key dismisses modal dialog
    await page.locator('button:has-text("پیشنهاد هوشمند محله")').first().click();
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
    await assertRtlLayout(page);

    const mobileNav = page.getByRole('navigation', { name: 'نوار پیمایش موبایل' });
    await expect(mobileNav.getByRole('button')).toHaveCount(5);
    for (const destination of ['discover', 'intelligence', 'map', 'properties']) {
      await expect(mobileNav.locator(`[data-testid="mobile-nav-${destination}"]`)).toBeVisible();
    }
    await mobileNav.getByRole('button', { name: 'بیشتر' }).click();
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
    const sheetHandle = page.getByRole('button', { name: /پنل کالبدشکافی/ });
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

  test('4. 8-Viewport Responsive Regression Matrix (320px to 1920px)', async ({ page }) => {
    for (const vp of RESPONSIVE_VIEWPORT_MATRIX) {
      await test.step(`Viewport ${vp.label} (${vp.width}x${vp.height})`, async () => {
        await assertResponsiveLayout(page, vp);
        await assertRtlLayout(page);
      });
    }
  });
});

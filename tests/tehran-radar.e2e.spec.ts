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
  openNeighborhoodSearch,
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
    await openNeighborhoodSearch(page);

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
    await openNeighborhoodSearch(page);
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
    await openNeighborhoodSearch(page);
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
    const sheet = page.locator('aside[data-snap-state]');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet).toHaveAttribute('data-snap-state', 'expanded');
    const initialHandleBox = await sheetHandle.boundingBox();
    expect(initialHandleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    // A secondary pointer must not replace or terminate the active primary-pointer drag.
    await sheetHandle.evaluate((element) => {
      const handle = element as HTMLButtonElement;
      const box = handle.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const dispatchPointer = (
        type: 'pointerdown' | 'pointerup',
        pointerId: number,
        clientY: number,
        isPrimary: boolean,
      ) => handle.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary,
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: x,
        clientY,
      }));

      dispatchPointer('pointerdown', 71, y, true);
      dispatchPointer('pointerdown', 72, y + 4, false);
      dispatchPointer('pointerup', 72, y + 200, false);
      dispatchPointer('pointerup', 71, y + 80, true);
    });
    await expect(sheet).toHaveAttribute('data-snap-state', 'peek');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');

    // Restore the expanded state through a fresh primary-pointer gesture.
    await sheetHandle.evaluate((element) => {
      const handle = element as HTMLButtonElement;
      const box = handle.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 73, pointerType: 'touch',
        isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y,
      }));
      handle.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 73, pointerType: 'touch',
        isPrimary: true, button: 0, buttons: 0, clientX: x, clientY: y - 80,
      }));
    });
    await expect(sheet).toHaveAttribute('data-snap-state', 'expanded');

    // Exercise the mobile handle with Chromium's touch input path, not mouse events.
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const dispatchTouch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
      x: number,
      y: number
    ) => {
      await cdpSession.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' || type === 'touchCancel'
          ? []
          : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
      });
    };

    // A deliberate downward touch drag must move the sheet to peek without toggling it closed.
    const handleCenterX = initialHandleBox!.x + initialHandleBox!.width / 2;
    const handleCenterY = initialHandleBox!.y + initialHandleBox!.height / 2;
    await dispatchTouch('touchStart', handleCenterX, handleCenterY);
    for (let step = 1; step <= 8; step += 1) {
      await page.waitForTimeout(10);
      await dispatchTouch('touchMove', handleCenterX, handleCenterY + step * 10);
    }
    await dispatchTouch('touchEnd', handleCenterX, handleCenterY + 80);
    await expect(sheet).toHaveAttribute('data-snap-state', 'peek');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');

    // An 8px+ touch movement below the snap threshold must suppress the synthetic click.
    const peekHandleBox = await sheetHandle.boundingBox();
    expect(peekHandleBox).not.toBeNull();
    const peekX = peekHandleBox!.x + peekHandleBox!.width / 2;
    const peekY = peekHandleBox!.y + peekHandleBox!.height / 2;
    await dispatchTouch('touchStart', peekX, peekY);
    await page.waitForTimeout(20);
    await dispatchTouch('touchMove', peekX, peekY + 12);
    await page.waitForTimeout(120);
    await dispatchTouch('touchEnd', peekX, peekY + 12);
    await expect(sheet).toHaveAttribute('data-snap-state', 'peek');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');

    // Upward touch drag returns the inspector to its expanded state.
    const finalHandleBox = await sheetHandle.boundingBox();
    expect(finalHandleBox).not.toBeNull();
    const finalX = finalHandleBox!.x + finalHandleBox!.width / 2;
    const finalY = finalHandleBox!.y + finalHandleBox!.height / 2;
    await dispatchTouch('touchStart', finalX, finalY);
    for (let step = 1; step <= 8; step += 1) {
      await page.waitForTimeout(10);
      await dispatchTouch('touchMove', finalX, finalY - step * 10);
    }
    await dispatchTouch('touchEnd', finalX, finalY - 80);
    await expect(sheet).toHaveAttribute('data-snap-state', 'expanded');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');

    const inspectorTabs = page.getByRole('tablist', { name: 'بخش‌های کارنامه محله' });
    await expect(inspectorTabs.getByRole('tab')).toHaveCount(5);
    const scorecardTab = page.getByRole('tab', { name: 'کارنامه' });
    const marketTab = page.getByRole('tab', { name: 'بازار و نمودار' });
    await scorecardTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(marketTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#inspector-panel-market')).toBeVisible();
    await expect(page.getByText('تحلیل پیشرفته و مقایسه')).toBeVisible();

    // Confirm a browser-generated pointercancel clears the gesture before a stale pointerup.
    const cancelBox = await sheetHandle.boundingBox();
    expect(cancelBox).not.toBeNull();
    const cancelX = cancelBox!.x + cancelBox!.width / 2;
    const cancelY = cancelBox!.y + cancelBox!.height / 2;
    await sheetHandle.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.dataset.pointerCancelSeen = 'false';
      button.addEventListener('pointercancel', (event) => {
        button.dataset.pointerCancelSeen = 'true';
        button.dataset.cancelledPointerId = String((event as PointerEvent).pointerId);
      }, { once: true });
    });
    await dispatchTouch('touchStart', cancelX, cancelY);
    await page.waitForTimeout(30);
    await dispatchTouch('touchCancel', cancelX, cancelY);
    await expect(sheetHandle).toHaveAttribute('data-pointer-cancel-seen', 'true');
    await sheetHandle.evaluate((element, point) => {
      const button = element as HTMLButtonElement;
      const pointerId = Number(button.dataset.cancelledPointerId);
      button.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: point.x,
        clientY: point.y,
      }));
    }, { x: cancelX, y: cancelY });
    await expect(sheet).toHaveAttribute('data-snap-state', 'expanded');
    await cdpSession.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdpSession.detach();
    await sheetHandle.click();
    await expect(sheet).toHaveAttribute('data-snap-state', 'collapsed');
    await expect(sheetHandle).toHaveAttribute('aria-expanded', 'false');
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

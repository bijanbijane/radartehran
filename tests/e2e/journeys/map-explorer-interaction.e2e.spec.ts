/**
 * RT-UI-MAP-PILOT-003: Map Explorer interaction regression (browser-automated).
 */
import { expect, test } from '@playwright/test';
import { waitForLayoutStabilization } from '../helpers/multicityRtlResponsiveHelpers';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-land-1024', width: 1024, height: 768 },
  { name: 'tablet-port-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 800 },
] as const;

test.describe('Map Explorer interactions (@regression)', () => {
  for (const vp of VIEWPORTS) {
    test(`map chrome at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?city=tehran&view=map', { waitUntil: 'domcontentloaded' });
      await waitForLayoutStabilization(page);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('map-explorer-toolbar')).toBeVisible();
      const sidebar = page.getByTestId('map-explorer-results-sidebar');
      const mobileSheet = page.getByTestId('map-explorer-results-sidebar-mobile');
      const mobileFab = page.getByTestId('map-explorer-mobile-results');
      if (vp.width >= 1024) {
        await expect(sidebar).toBeVisible();
      } else {
        await expect(sidebar).toBeHidden();
        const mobileResultsOpen =
          (await mobileSheet.count()) > 0 && (await mobileSheet.isVisible());
        if (mobileResultsOpen) {
          await expect(mobileSheet).toBeVisible();
        } else {
          await expect(mobileFab).toBeVisible();
        }
      }
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      expect(docOverflow).toBe(false);
    });
  }

  test('zoom, viewport filter, sidebar pick, and collapse', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?city=tehran&view=map', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);

    const zoomIn = page.getByRole('button', { name: 'بزرگ‌نمایی' });
    await zoomIn.click();
    await zoomIn.click();

    const viewportBtn = page.getByRole('button', { name: 'کادر نقشه' }).first();
    await expect(viewportBtn).toBeEnabled();
    await viewportBtn.click();
    await expect(viewportBtn).toHaveAttribute('aria-pressed', 'true');

    const firstHood = page.getByTestId('map-explorer-results-sidebar').getByRole('option').first();
    await firstHood.locator('button, [role="button"], .cursor-pointer').first().click();
    await expect(firstHood).toHaveAttribute('aria-selected', 'true');

    await page.getByTestId('map-explorer-results-sidebar').getByRole('button', { name: 'جمع کردن' }).click();
    await expect(page.getByTestId('map-explorer-sidebar-reopen')).toBeVisible();
    await page.getByTestId('map-explorer-sidebar-reopen').click();
    await expect(page.getByTestId('map-explorer-results-sidebar')).toBeVisible();
  });
});
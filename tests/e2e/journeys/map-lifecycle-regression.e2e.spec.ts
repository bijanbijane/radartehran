/**
 * RT-UI-MAP-PILOT-003: Leaflet container reuse & map route re-entry stability.
 */
import { expect, test } from '@playwright/test';
import { waitForLayoutStabilization } from '../helpers/multicityRtlResponsiveHelpers';

const MAP_REUSE_PATTERN = /Map container is being reused|markerStateAttr.*before initialization/i;

test.describe('Map lifecycle (@regression)', () => {
  test('repeated map enter/exit does not throw Leaflet reuse or render shield', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });

    for (let i = 0; i < 4; i += 1) {
      await page.goto('/?city=tehran&view=map', { waitUntil: 'domcontentloaded' });
      await waitForLayoutStabilization(page);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-testid="map-explorer-toolbar"]')).toBeVisible();
      await expect(page.locator('text=محافظ خطای رندر')).toHaveCount(0);

      await page.goto('/community/discussions?city=tehran', { waitUntil: 'domcontentloaded' });
      await waitForLayoutStabilization(page);
      await expect(page.getByTestId('product-contributions-view')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('text=محافظ خطای رندر')).toHaveCount(0);
    }

    const fatal = pageErrors.filter((m) => MAP_REUSE_PATTERN.test(m));
    expect(fatal, `Page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
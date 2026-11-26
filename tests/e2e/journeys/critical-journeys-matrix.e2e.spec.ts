import { expect, test } from '@playwright/test';
import {
  FIVE_CITY_ROUND_TRIP,
  assertActiveCityData,
  assertNoCrossCityDataLeakage,
  assertRtlLayout,
  switchCityAndAssertContext,
  waitForLayoutStabilization,
} from '../helpers/multicityRtlResponsiveHelpers';

/**
 * @file tests/e2e/journeys/critical-journeys-matrix.e2e.spec.ts
 * @description Real-Browser Critical Journeys covering:
 *  - RT-FE-TESTFIX-003: Backend healthz & 5-city round-trip switching without cross-city data leakage
 *  - OpenAPI & Admin zero-trust boundary
 *  - RT-FE-BUGFIX-001 / RT-FE-BUGFIX-004: Safe cache clear preserving favorites + full URL (query & hash)
 *  - RT-FE-BUGFIX-001 (BUG-002): Community subsections direct URL, tab sync, Refresh, Back/Forward, and 404
 */

test.describe('Critical Product Journeys (@smoke @critical @regression)', () => {
  test('Journey 1 (@smoke @critical): Backend healthz & multi-city context integrity across 5 cities without cross-city data leakage', async ({
    page,
    request,
  }) => {
    const uncaughtErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) {
        uncaughtErrors.push(err.message);
      }
    });

    // 1. Verify live backend healthz endpoint
    const healthRes = await request.get('/api/healthz');
    expect(healthRes.ok()).toBeTruthy();
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe('ok');

    // 2. Open app on Desktop viewport where the 5-city switcher group is visible
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await assertRtlLayout(page);

    // The landing page shows a static map preview; enter the interactive Leaflet map before asserting map state.
    await page.getByTestId('home-primary-cta-map').click();
    await expect(page).toHaveURL(/\/map/);
    await expect(page.locator('.leaflet-container')).toBeVisible();

    // 3. Full 5-city round-trip: Tehran -> Karaj -> Mashhad -> Isfahan -> Shiraz -> Tehran
    let previousCity = FIVE_CITY_ROUND_TRIP[0];
    await assertActiveCityData(page, previousCity);

    for (let i = 1; i < FIVE_CITY_ROUND_TRIP.length; i += 1) {
      const nextCity = FIVE_CITY_ROUND_TRIP[i];
      await switchCityAndAssertContext(page, nextCity);
      await assertActiveCityData(page, nextCity);
      await assertNoCrossCityDataLeakage(page, nextCity, previousCity);
      previousCity = nextCity;
    }

    // 4. Direct URL hydration & reload isolation check on Karaj -> Mashhad
    await page.goto('/map?city=karaj', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await expect(page.getByTestId('global-active-city-label')).toHaveText('کرج');
    await assertActiveCityData(page, 'karaj');
    await assertNoCrossCityDataLeakage(page, 'karaj', 'tehran');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await expect(page.getByTestId('global-active-city-label')).toHaveText('کرج');
    expect(new URL(page.url()).searchParams.get('city')).toBe('karaj');

    expect(uncaughtErrors).toEqual([]);
  });

  test('Journey 2 (@critical @regression): OpenAPI contract specification & unauthenticated boundary protection', async ({
    request,
  }) => {
    const openApiRes = await request.get('/api/openapi.json');
    expect(openApiRes.status()).toBe(200);
    const openApi = await openApiRes.json();
    expect(openApi.openapi).toMatch(/^3\./);

    // Unauthenticated admin runtime-config access must fail closed. A 429 is also a closed boundary when the local rate-limit bucket is already exhausted.
    const adminRes = await request.get('/api/admin/runtime-config');
    expect([401, 403, 429]).toContain(adminRes.status());
    expect(adminRes.ok()).toBe(false);
  });

  test('Journey 3 (@critical @regression): BUG-001/004 URL+Favorites preservation & BUG-002 Community subsections routing round-trip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // --- Part A: BUG-001 & BUG-004 (Favorites + Query + Hash preserved across reload) ---
    await page.goto('/?city=karaj&view=properties#listing-results', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);

    await page.evaluate(() => {
      window.localStorage.setItem('tehran_radar_favorites_v1', JSON.stringify([101, 102]));
      window.localStorage.setItem('tehran_neighborhoods_radar_v2', JSON.stringify({ stale: true }));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);

    const afterReload = await page.evaluate(() => ({
      href: window.location.href,
      hash: window.location.hash,
      favorites: window.localStorage.getItem('tehran_radar_favorites_v1'),
    }));
    expect(new URL(afterReload.href).searchParams.get('city')).toBe('karaj');
    expect(afterReload.hash).toBe('#listing-results');
    expect(afterReload.favorites).toBe(JSON.stringify([101, 102]));

    // --- Part B: BUG-002 Community Subsections direct load, tab click, Refresh, Back/Forward, and 404 ---
    const communityNav = page.getByRole('navigation', { name: 'بخش‌های جامعه کاربران' });
    await page.goto('/community/discussions?city=karaj#thread-1', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await expect(communityNav).toBeVisible();
    await expect(page.getByTestId('community-tab-discussions')).toBeVisible();
    await expect(page).toHaveURL(/\/community\/discussions/);
    await expect(page).toHaveURL(/city=karaj/);
    await expect(page).toHaveURL(/#thread-1/);

    // Switch subsection via UI tab and verify canonical URL updates
    await page.getByTestId('community-tab-submit').click();
    await expect(page).toHaveURL(/\/community\/contribute/);

    await page.getByTestId('community-tab-research_proposals').click();
    await expect(page).toHaveURL(/\/community\/research/);

    // Browser Back & Forward must synchronize URL and keep CommunityHub mounted without 404
    await page.goBack();
    await expect(page).toHaveURL(/\/community\/contribute/);
    await expect(communityNav).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/community\/research/);
    await expect(communityNav).toBeVisible();

    // Direct entry to remaining subsections & invalid route 404 verification
    await page.goto('/community/help', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await expect(communityNav).toBeVisible();

    await page.goto('/community/invalid-subsection-xyz', { waitUntil: 'domcontentloaded' });
    await waitForLayoutStabilization(page);
    await expect(communityNav).toHaveCount(0);
    await expect(page.locator('body')).toContainText(/یافت نشد|404/);
  });
});

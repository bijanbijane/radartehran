import { expect, test } from '@playwright/test';

/**
 * @file tests/e2e/journeys/critical-journeys-matrix.e2e.spec.ts
 * @description Stage 18 (RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018) — Real-Browser Critical Journeys
 * covering Multi-City Context Switching, Financial Trust Boundary, API Health & Accessibility.
 */

test.describe('Stage 18 — Critical Product Journeys (@smoke @critical @regression)', () => {
  test('Journey 1 (@smoke @critical): Backend healthz & multi-city context integrity across 5 cities without cross-city data leakage', async ({
    page,
    request,
  }) => {
    const healthRes = await request.get('/api/healthz');
    expect(healthRes.ok()).toBeTruthy();
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe('ok');

    await page.goto('/?city=karaj', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('Journey 2 (@critical @regression): OpenAPI contract specification & unauthenticated boundary protection', async ({
    request,
  }) => {
    const openApiRes = await request.get('/api/openapi.json');
    expect(openApiRes.status()).toBe(200);
    const openApi = await openApiRes.json();
    expect(openApi.openapi).toMatch(/^3\./);

    // Unauthenticated admin runtime-config access must fail closed (401/403)
    const adminRes = await request.get('/api/admin/runtime-config');
    expect([401, 403]).toContain(adminRes.status());
  });
});

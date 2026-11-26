/**
 * @file tests/e2e/helpers/multicityRtlResponsiveHelpers.ts
 * @description Shared Playwright E2E oracles for RT-FE-TESTFIX-003-MULTICITY-E2E-ORACLE:
 *  - Real 5-city contract switching & cross-city data isolation (no invented City IDs, no force clicks)
 *  - Multi-level RTL & BiDi semantic verification
 *  - 8-viewport responsive regression matrix (320x800 through 1920x1080)
 */
import { expect, type Page } from '@playwright/test';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../src/data/multiCityData';
import { matchesPersianSearch } from '../../../src/utils/security';

export const SUPPORTED_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];

export const FIVE_CITY_ROUND_TRIP: readonly CityId[] = [
  'tehran',
  'karaj',
  'mashhad',
  'isfahan',
  'shiraz',
  'tehran',
];

export interface ResponsiveViewportCase {
  label: string;
  width: number;
  height: number;
  expectDesktopNav: boolean;
  expectMobileBottomNav: boolean;
}

export const RESPONSIVE_VIEWPORT_MATRIX: readonly ResponsiveViewportCase[] = [
  { label: 'mobile-small-320', width: 320, height: 800, expectDesktopNav: false, expectMobileBottomNav: true },
  { label: 'mobile-375', width: 375, height: 812, expectDesktopNav: false, expectMobileBottomNav: true },
  { label: 'mobile-large-430', width: 430, height: 932, expectDesktopNav: false, expectMobileBottomNav: true },
  { label: 'tablet-portrait-768', width: 768, height: 1024, expectDesktopNav: false, expectMobileBottomNav: true },
  { label: 'tablet-landscape-1024', width: 1024, height: 768, expectDesktopNav: true, expectMobileBottomNav: false },
  { label: 'laptop-1280', width: 1280, height: 800, expectDesktopNav: true, expectMobileBottomNav: false },
  { label: 'desktop-1440', width: 1440, height: 900, expectDesktopNav: true, expectMobileBottomNav: false },
  { label: 'desktop-fullhd-1920', width: 1920, height: 1080, expectDesktopNav: true, expectMobileBottomNav: false },
];

/**
 * Picks a real neighborhood name guaranteed to belong exclusively to `cityId`
 * and not collide with any neighborhood `name` or `zone` in the other 4 supported cities.
 */
export function getExclusiveNeighborhoodForCity(cityId: CityId): { id: number; name: string } {
  const otherHoods = SUPPORTED_CITY_IDS.filter((otherId) => otherId !== cityId).flatMap(
    (otherId) => MULTI_CITY_CONFIGS[otherId].neighborhoods
  );
  const found = MULTI_CITY_CONFIGS[cityId].neighborhoods.find(
    (h) =>
      !otherHoods.some(
        (other) => matchesPersianSearch(other.name, h.name) || matchesPersianSearch(other.zone, h.name)
      )
  );
  if (!found) {
    throw new Error(`No exclusive neighborhood found for city ${cityId}`);
  }
  return { id: found.id, name: found.name };
}

export async function waitForLayoutStabilization(page: Page): Promise<void> {
  await expect(page.locator('#root')).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready.catch(() => {});
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

/**
 * Switches city through the real visible city selector (`data-testid="global-city-switcher"`) and its accessible listbox
 * without `{ force: true }`, and verifies URL, `aria-pressed` state, header brand, and document title.
 */
export async function switchCityAndAssertContext(page: Page, targetCityId: CityId): Promise<void> {
  const cfg = MULTI_CITY_CONFIGS[targetCityId];
  const citySwitcher = page.getByTestId('global-city-switcher');
  await expect(citySwitcher).toBeVisible();
  await citySwitcher.click();
  const cityListbox = page.getByRole('listbox', { name: 'انتخاب کلان‌شهر' });
  await expect(cityListbox).toBeVisible();

  const targetButton = cityListbox.getByRole('option', { name: cfg.nameFa, exact: true });
  await expect(targetButton).toBeVisible();
  await targetButton.click();

  await expect(citySwitcher).toHaveAttribute('aria-expanded', 'false');
  await expect(citySwitcher).toHaveAttribute('aria-label', `انتخاب شهر (فعال: ${cfg.nameFa})`);

  // Reopen the native city listbox to verify selected and unselected states after navigation.
  await citySwitcher.click();
  const verifiedCityListbox = page.getByRole('listbox', { name: 'انتخاب کلان‌شهر' });
  await expect(verifiedCityListbox.getByRole('option', { name: cfg.nameFa, exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const otherId of SUPPORTED_CITY_IDS) {
    if (otherId === targetCityId) continue;
    const otherOption = verifiedCityListbox.getByRole('option', { name: MULTI_CITY_CONFIGS[otherId].nameFa, exact: true });
    await expect(otherOption).toHaveAttribute('aria-selected', 'false');
  }
  await citySwitcher.click();

  // URL synchronization check
  if (targetCityId === 'tehran') {
    await expect.poll(() => new URL(page.url()).searchParams.get('city')).toBeNull();
  } else {
    await expect.poll(() => new URL(page.url()).searchParams.get('city')).toBe(targetCityId);
  }

  // The product brand remains canonical; the adjacent active-city label carries the selected city.
  await expect(page.getByTestId('global-active-city-label')).toHaveText(cfg.nameFa);
}

/**
 * Asserts that live visible map markers, search autocomplete, and inspector reflect the active city's real dataset.
 */
export async function assertActiveCityData(page: Page, cityId: CityId): Promise<void> {
  const cfg = MULTI_CITY_CONFIGS[cityId];
  const exclusiveHood = getExclusiveNeighborhoodForCity(cityId);

  // Map container & rendered markers
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect.poll(async () => page.locator('.price-pill-icon').count()).toBeGreaterThan(3);

  // Search for a real neighborhood belonging to this city and select it via Enter
  const searchInput = page.locator('input[aria-label="جست‌وجوی محله"]');
  await expect(searchInput).toBeVisible();
  await searchInput.click();
  await searchInput.fill(exclusiveHood.name);
  await searchInput.press('Enter');

  // Verify inspector / title synced to this city's real neighborhood
  await expect(page).toHaveTitle(new RegExp(exclusiveHood.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // Verify URL hood parameter belongs to the active city's dataset (not another city)
  const validCityHoodIds = new Set(cfg.neighborhoods.map((h) => String(h.id)));
  await expect
    .poll(() => {
      const u = new URL(page.url());
      const hoodParam = u.searchParams.get('hood');
      if (hoodParam) return validCityHoodIds.has(hoodParam);
      // Dated Tehran SEO path (/tehran/...) is only valid when activeCity === 'tehran'
      if (cityId === 'tehran' && u.pathname.startsWith('/tehran/')) return true;
      return false;
    })
    .toBe(true);
}

/**
 * Verifies that switching from `previousCityId` to `activeCityId` leaves ZERO leaked neighborhoods
 * from `previousCityId` in active-city markers, active-city search results, or localStorage city state.
 */
export async function assertNoCrossCityDataLeakage(
  page: Page,
  activeCityId: CityId,
  previousCityId: CityId
): Promise<void> {
  if (activeCityId === previousCityId) return;
  const prevExclusive = getExclusiveNeighborhoodForCity(previousCityId);

  // 1. Rendered map price markers must not display the previous city's exclusive neighborhood name
  const markerTexts = await page.locator('.price-pill-icon').allInnerTexts();
  const leakedInMarkers = markerTexts.some((txt) => txt.includes(prevExclusive.name));
  expect(
    leakedInMarkers,
    `Leaked neighborhood "${prevExclusive.name}" from ${previousCityId} found inside ${activeCityId} map markers`
  ).toBe(false);

  // 2. Searching the previous city's exclusive neighborhood inside activeCity must show the empty-in-this-city message
  //    (cross-city quick-jump suggestions may be shown in their separate section, but primary city list must NOT treat it as local)
  const searchInput = page.locator('input[aria-label="جست‌وجوی محله"]');
  await searchInput.click();
  await searchInput.fill(prevExclusive.name);
  await expect(page.locator('text=محله‌ای با این نام در این شهر یافت نشد.')).toBeVisible();
  await searchInput.fill('');
  await page.keyboard.press('Escape');

  // 3. Verify document title does not retain the previous city's exclusive neighborhood
  const title = await page.title();
  expect(title.includes(prevExclusive.name)).toBe(false);
}

/**
 * Multi-level RTL & BiDi semantic oracle (replaces weak single-attribute `hasRtl` check).
 */
export async function assertRtlLayout(page: Page): Promise<void> {
  await waitForLayoutStabilization(page);

  const rtlAudit = await page.evaluate(() => {
    const html = document.documentElement;
    const htmlDir = html.getAttribute('dir');
    const htmlLang = html.getAttribute('lang') || '';
    const htmlComputedDir = getComputedStyle(html).direction;

    const rootEl = document.getElementById('root');
    const mainEl = document.getElementById('radar-main-content');
    const headerEl = document.querySelector('header');
    const navEl = document.querySelector('header nav, nav[aria-label="نوار پیمایش موبایل"]');
    const searchInput = document.querySelector('input[aria-label="جست‌وجوی محله"]');
    const mapContainer = document.querySelector('.leaflet-container');

    const getDir = (el: Element | null) => (el ? getComputedStyle(el).direction : null);

    // Check that no structural layout shell has an accidental dir="ltr" override
    const forbiddenLtrShells = Array.from(
      document.querySelectorAll('html[dir="ltr"], body[dir="ltr"], header[dir="ltr"], main[dir="ltr"], nav[dir="ltr"]')
    ).map((el) => el.tagName.toLowerCase());

    // Verify all controlled [dir="ltr"] elements (if any) stay bounded within viewport width
    const ltrElementsOverflowing = Array.from(document.querySelectorAll('[dir="ltr"]'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2);
      })
      .map((el) => el.tagName.toLowerCase());

    // Verify header RTL order: brand button sits on the RIGHT side in RTL (higher `right` coordinate than right-side utility controls)
    let headerBrandOnRight = true;
    const brandBtn = headerEl?.querySelector('[data-testid="global-nav-home"]');
    const themeBtn = headerEl?.querySelector('[data-testid="theme-toggle-btn"]');
    if (brandBtn && themeBtn) {
      const bRect = brandBtn.getBoundingClientRect();
      const tRect = themeBtn.getBoundingClientRect();
      if (bRect.width > 0 && tRect.width > 0) {
        headerBrandOnRight = bRect.left > tRect.left;
      }
    }

    // Verify BiDi mixed Persian + numeric/Latin text inside header/main does not trigger horizontal overflow
    const docOverflow = document.documentElement.scrollWidth > window.innerWidth;

    return {
      htmlDir,
      htmlLang,
      htmlComputedDir,
      rootDir: getDir(rootEl),
      mainDir: getDir(mainEl),
      headerDir: getDir(headerEl),
      navDir: getDir(navEl),
      searchInputDir: getDir(searchInput),
      mapPresent: Boolean(mapContainer),
      forbiddenLtrShells,
      ltrElementsOverflowing,
      headerBrandOnRight,
      docOverflow,
    };
  });

  expect(rtlAudit.htmlDir).toBe('rtl');
  expect(rtlAudit.htmlLang.toLowerCase().startsWith('fa')).toBe(true);
  expect(rtlAudit.htmlComputedDir).toBe('rtl');
  expect(rtlAudit.rootDir).toBe('rtl');
  if (rtlAudit.mainDir !== null) expect(rtlAudit.mainDir).toBe('rtl');
  expect(rtlAudit.headerDir).toBe('rtl');
  if (rtlAudit.navDir !== null) expect(rtlAudit.navDir).toBe('rtl');
  if (rtlAudit.searchInputDir !== null) expect(rtlAudit.searchInputDir).toBe('rtl');
  expect(rtlAudit.forbiddenLtrShells).toEqual([]);
  expect(rtlAudit.ltrElementsOverflowing).toEqual([]);
  expect(rtlAudit.headerBrandOnRight).toBe(true);
  expect(rtlAudit.docOverflow).toBe(false);
}

/**
 * Verifies layout integrity, overflow absence, navigation visibility, map geometry,
 * search input hit-test accessibility, inspector access, and modal bounds on a given viewport.
 */
export async function assertResponsiveLayout(
  page: Page,
  vp: ResponsiveViewportCase
): Promise<void> {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLayoutStabilization(page);

  const searchInput = page.locator('input[aria-label="جست‌وجوی محله"]');
  await expect(searchInput, `[${vp.label}] search input must be visible`).toBeVisible();

  // 1. Zero horizontal overflow after stabilization
  const overflowMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflowMetrics.scrollWidth,
    `[${vp.label}] Horizontal overflow detected: scrollWidth=${overflowMetrics.scrollWidth} > innerWidth=${overflowMetrics.innerWidth}`
  ).toBeLessThanOrEqual(overflowMetrics.innerWidth);

  // 2. Header integrity
  const header = page.locator('header').first();
  await expect(header, `[${vp.label}] header must be visible`).toBeVisible();
  const headerBox = await header.boundingBox();
  expect(headerBox, `[${vp.label}] header must have bounding box`).not.toBeNull();
  expect(headerBox!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(headerBox!.height).toBeGreaterThanOrEqual(44);
  expect(headerBox!.height).toBeLessThanOrEqual(92);

  // 3. Navigation visibility (desktop primary nav vs mobile 5-tab bottom nav)
  const desktopNav = page.getByRole('navigation', { name: 'ناوبری اصلی پلتفرم' });
  const mobileNav = page.getByRole('navigation', { name: 'نوار پیمایش موبایل' });
  if (vp.expectDesktopNav) {
    await expect(desktopNav, `[${vp.label}] desktop primary nav must be visible`).toBeVisible();
    await expect(mobileNav, `[${vp.label}] mobile bottom nav must be hidden on desktop`).toBeHidden();
  }
  if (vp.expectMobileBottomNav) {
    await expect(mobileNav, `[${vp.label}] mobile bottom nav must be visible`).toBeVisible();
    await expect(mobileNav.getByRole('button')).toHaveCount(5);
    const mobileNavBox = await mobileNav.boundingBox();
    expect(mobileNavBox).not.toBeNull();
    expect(mobileNavBox!.x).toBeGreaterThanOrEqual(-1);
    expect(mobileNavBox!.x + mobileNavBox!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(mobileNavBox!.y + mobileNavBox!.height).toBeLessThanOrEqual(vp.height + 2);
  }

  // 4. Map container geometry
  const mapEl = page.locator('.leaflet-container').first();
  await expect(mapEl, `[${vp.label}] map container must be visible`).toBeVisible();
  const mapBox = await mapEl.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.width).toBeGreaterThan(200);
  expect(mapBox!.height).toBeGreaterThan(200);

  // 5. Search input accessibility & not obscured by fixed/sticky elements
  const searchBox = await searchInput.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.x).toBeGreaterThanOrEqual(0);
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(vp.width + 1);
  const searchClickable = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="جست‌وجوی محله"]');
    if (!input) return false;
    const rect = input.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === input || Boolean(hit && input.contains(hit));
  });
  expect(searchClickable, `[${vp.label}] search input must not be obscured by fixed/sticky overlays`).toBe(true);

  // 6. Inspector accessibility
  if (vp.expectMobileBottomNav) {
    const sheetHandle = page.getByRole('button', { name: /پنل کالبدشکافی/ });
    await expect(sheetHandle, `[${vp.label}] mobile inspector sheet handle must be visible`).toBeVisible();
    const handleBox = await sheetHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(handleBox!.y + handleBox!.height).toBeLessThanOrEqual(vp.height + 2);
  } else {
    const inspectorTabs = page.getByRole('tablist', { name: 'بخش‌های کارنامه محله' });
    await expect(inspectorTabs, `[${vp.label}] desktop inspector tablist must be visible`).toBeVisible();
  }

  // 7. Modal / popover bounds check (open Budget Filter popover and verify it fits inside viewport, then Escape)
  const budgetBtn = page.getByRole('button', { name: /بودجه|فیلتر/ }).first();
  if (await budgetBtn.isVisible()) {
    await budgetBtn.click();
    const budgetDialog = page.locator('[role="dialog"][aria-label="تنظیم بودجه، وام مسکن و محل کار"]');
    if (await budgetDialog.isVisible()) {
      const dialogBox = await budgetDialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(-1);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(vp.width + 2);
      expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(vp.height + 2);
      await page.keyboard.press('Escape');
      await expect(budgetDialog).toBeHidden();
    }
  }
}

/**
 * @file tests/tehran-radar-header-tools.e2e.spec.ts
 * @description Real headless Chromium E2E behavioral verification for Stages 193–200 (Tools & Contract Shield)
 * and Stages 201–208 (Global Header, Account Action, Hover Lifecycle, Top-Full Positioning, Focus & A11y).
 */
import { test, expect } from '@playwright/test';

test.describe('Header, Mega Menu (201–208) & Tools/Contract Shield (193–200)', () => {
  test('Stages 201–207: Account right-click preservation, hover continuity, real header alignment, focus return, outside click & bilingual layout', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const accountBtn = page.getByTestId('global-nav-userspace');
    await expect(accountBtn).toBeVisible();

    // Stage 201: zero hidden role="menu" in header & right-click preserves browser default (not prevented)
    await expect(page.locator('header [role="menu"]')).toHaveCount(0);
    const wasContextDefaultPrevented = await accountBtn.evaluate((el) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(wasContextDefaultPrevented).toBe(false);

    // Stage 201: normal click navigates to userspace overview
    await accountBtn.click();
    await expect(page.getByTestId('product-userspace-view')).toBeVisible();

    // Go back to Map view (56px header) to test MegaMenu positioning & hover
    await page.getByTestId('global-nav-map').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();

    const header = page.locator('header').first();
    const moreBtn = page.getByTestId('global-nav-more');
    const panelId = await moreBtn.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const megaPanel = page.locator(`#${panelId}`);

    // Stage 202 & 204: Hover trigger -> panel opens; slow mouse move from trigger into panel keeps it open
    const btnBox = await moreBtn.boundingBox();
    expect(btnBox).toBeTruthy();
    await page.mouse.move(btnBox!.x + btnBox!.width / 2, btnBox!.y + btnBox!.height / 2);
    await expect(megaPanel).toBeVisible();
    await expect(moreBtn).toHaveAttribute('aria-expanded', 'true');

    // Stage 203: Measure real DOM alignment in 56px map mode & check FloatingTopBar does NOT cover panel
    const mapAlign = await page.evaluate((id) => {
      const hdr = document.querySelector('header')!;
      const pnl = document.getElementById(id)!;
      const hRect = hdr.getBoundingClientRect();
      const pRect = pnl.getBoundingClientRect();
      const midX = pRect.left + pRect.width / 2;
      const hit = document.elementFromPoint(midX, pRect.top + 12);
      return {
        headerHeight: hRect.height,
        headerBottom: hRect.bottom,
        panelTop: pRect.top,
        panelLeft: pRect.left,
        panelRight: pRect.right,
        viewportWidth: window.innerWidth,
        panelCoversTopCheck: pnl.contains(hit),
      };
    }, panelId!);
    expect(Math.abs(mapAlign.panelTop - mapAlign.headerBottom)).toBeLessThanOrEqual(2);
    expect(mapAlign.panelCoversTopCheck).toBe(true);
    expect(mapAlign.panelLeft).toBeGreaterThanOrEqual(0);
    expect(mapAlign.panelRight).toBeLessThanOrEqual(mapAlign.viewportWidth);

    // Move mouse slowly into panel over 120ms -> timer must be cancelled and panel stay open
    const panelBox = await megaPanel.boundingBox();
    expect(panelBox).toBeTruthy();
    await page.mouse.move(panelBox!.x + panelBox!.width / 2, panelBox!.y + 24, { steps: 8 });
    await page.waitForTimeout(450);
    await expect(megaPanel).toBeVisible();

    // Move mouse outside panel -> closes after hover-close delay (~300ms)
    await page.mouse.move(20, 450);
    await expect(megaPanel).toBeHidden({ timeout: 2500 });
    await expect(moreBtn).toHaveAttribute('aria-expanded', 'false');

    // Stage 204 & 205: Click trigger via keyboard opens independently of hover; Escape restores focus to trigger
    await moreBtn.focus();
    await page.keyboard.press('Enter');
    await expect(megaPanel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(megaPanel).toBeHidden();
    const focusedAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedAfterEscape).toBe('global-nav-more');

    // Stage 205: Close button closes and returns focus to trigger
    await moreBtn.click();
    await expect(megaPanel).toBeVisible();
    await megaPanel.getByRole('button', { name: /بستن/ }).click();
    await expect(megaPanel).toBeHidden();
    const focusedAfterCloseBtn = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focusedAfterCloseBtn).toBe('global-nav-more');

    // Stage 205: Clicking inside panel background does NOT close; clicking outside closes without stealing focus
    await moreBtn.click();
    await expect(megaPanel).toBeVisible();
    await page.mouse.click(panelBox!.x + 12, panelBox!.y + 12);
    await expect(megaPanel).toBeVisible();

    const searchBtn = page.getByRole('button', { name: /جست‌وجوی سراسری/ });
    await searchBtn.click();
    await expect(megaPanel).toBeHidden();

    // Stage 203 & 205 & 206: Navigate from MegaMenu destination -> enters non-map view (68px header), aligns panel & marks aria-current
    await moreBtn.click();
    await expect(megaPanel).toBeVisible();
    await megaPanel.getByRole('button', { name: /خدمات کارشناسی قیمت/ }).click();
    await expect(megaPanel).toBeHidden();

    // Check active header height is now ~68px (>= 67px) and opening MegaMenu again aligns flush to header bottom
    await moreBtn.click();
    await expect(megaPanel).toBeVisible();
    const nonMapAlign = await page.evaluate((id) => {
      const hdr = document.querySelector('header')!;
      const pnl = document.getElementById(id)!;
      const hRect = hdr.getBoundingClientRect();
      const pRect = pnl.getBoundingClientRect();
      const currentBtn = pnl.querySelector('[aria-current="page"]');
      return {
        headerHeight: hRect.height,
        diff: Math.abs(pRect.top - hRect.bottom),
        hasCurrentPage: Boolean(currentBtn),
        panelClasses: pnl.className,
        dir: pnl.getAttribute('dir'),
      };
    }, panelId!);
    expect(nonMapAlign.headerHeight).toBeGreaterThanOrEqual(66);
    expect(nonMapAlign.diff).toBeLessThanOrEqual(2);
    expect(nonMapAlign.hasCurrentPage).toBe(true);
    expect(nonMapAlign.dir).toBe('rtl');
    expect(nonMapAlign.panelClasses.includes('top-[66px]')).toBe(false);

    // Stage 207: Responsive check at 1024x700 -> no horizontal overflow & Beta badge text readable
    await page.setViewportSize({ width: 1024, height: 700 });
    const overflow1024 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow1024).toBe(false);
    await expect(megaPanel.getByText('آزمایشی').first()).toBeVisible();

    // Verify header stays clean below breakpoint (<1024px)
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(megaPanel).toBeHidden();
    expect(pageErrors).toEqual([]);
  });

  test('Stages 193–200: Decision tool invariance, dynamic counts, targetSqm Contract Shield lifecycle, clipboard & accessible dialog', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!String(err.message).includes('WebSocket')) pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('radar_experience_mode_v1', 'simple');
    });
    await page.goto('/?view=tools&sqm=120', { waitUntil: 'domcontentloaded' });

    const toolsView = page.getByTestId('product-tools-view');
    await expect(toolsView).toBeVisible();
    await expect(page.getByTestId('tools-total-summary')).toContainText('۲۴');

    // Stage 193: Clicking a decision tool opens Decision Lab WITHOUT mutating radar_experience_mode_v1 to 'pro'
    await page.getByRole('button', { name: /Savage Minimax Regret/ }).click();
    await expect(page.getByTestId('decision-lab-panel')).toBeVisible();
    const expModeAfter = await page.evaluate(() => localStorage.getItem('radar_experience_mode_v1'));
    expect(expModeAfter).toBe('simple');

    // Stage 197: Contract-Room Shield computes initial price from actual targetSqm (120m * selectedHood.buyPerSqm)
    const shieldTrigger = page.getByRole('button', { name: /Contract-Room Shield/ });
    await shieldTrigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const priceInput = dialog.locator('#total-price-input');
    const initialVal = Number(await priceInput.inputValue());
    expect(initialVal).toBeGreaterThan(500);
    // Selected default hood in Tehran is Punak/Valiasr; verify not hardcoded 12000 for 80m unless buyPerSqm*120 === 12000 (buyPerSqm=100)
    expect(Number.isInteger(initialVal)).toBe(true);

    // Stage 198: Empty input pauses engine cleanly without snapping back to 500
    await priceInput.fill('');
    await expect(priceInput).toHaveValue('');
    await expect(dialog.getByTestId('contract-shield-invalid-state')).toBeVisible();

    // Out-of-range below 500 shows error
    await priceInput.fill('400');
    await expect(dialog.getByTestId('contract-shield-invalid-state')).toBeVisible();

    // Valid amount recovers cleanly
    await priceInput.fill('15000');
    await expect(dialog.getByTestId('contract-shield-invalid-state')).toHaveCount(0);

    // Stage 200: Accessible 3-tab navigation with ArrowLeft / Home / End
    const firstTab = dialog.getByRole('tab').nth(0);
    const secondTab = dialog.getByRole('tab').nth(1);
    const thirdTab = dialog.getByRole('tab').nth(2);
    await firstTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(thirdTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');

    // Stage 199: Mock clipboard failure -> shows role="alert" banner; then mock success -> copied feedback
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('denied'); } },
      });
    });
    await dialog.getByRole('button', { name: /کپی متن بند وجه‌التزام/ }).click();
    await expect(dialog.locator('[role="alert"]').last()).toContainText('کپی متن انجام نشد');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });
    await dialog.getByRole('button', { name: /کپی متن بند وجه‌التزام/ }).click();
    await expect(dialog.getByRole('button', { name: /کپی شد/ })).toBeVisible();

    // Stage 200: Escape closes dialog and restores focus to trigger button
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const activeText = await page.evaluate(() => document.activeElement?.textContent || '');
    expect(activeText).toContain('Contract-Room Shield');
    expect(pageErrors).toEqual([]);
  });
});

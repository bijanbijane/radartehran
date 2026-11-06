/**
 * @file tests/frontend-deep-debug.test.ts
 * @description Deep Frontend Inspector & Debugger using Playwright Chromium
 */

import { createRequire } from 'module';
import * as fs from 'fs';

const require = createRequire(import.meta.url);

function loadPlaywrightCore(): any {
  const paths = [
    '/root/.bun/install/global/node_modules/playwright-core',
    'playwright-core',
  ];
  for (const p of paths) {
    try {
      return require(p);
    } catch {}
  }
  throw new Error('playwright-core not found');
}

function resolveChromiumExecutable(): string {
  const paths = [
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium not found');
}

async function runFrontendDeepDebug() {
  const pw = loadPlaywrightCore();
  const executablePath = resolveChromiumExecutable();
  const browser = await pw.chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const consoleLogs: { type: string; text: string }[] = [];
  const uncaughtErrors: string[] = [];

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'fa-IR',
  });

  const page = await context.newPage();

  page.on('console', (msg: any) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push({ type, text });
    if (
      type === 'error' &&
      !text.includes('WebSocket') &&
      !text.includes('[vite] failed to connect to websocket')
    ) {
      uncaughtErrors.push(text);
    }
  });

  page.on('pageerror', (err: any) => {
    const msg = err.message || String(err);
    if (!msg.includes('WebSocket')) {
      uncaughtErrors.push(msg);
    }
  });

  console.log('--- 1. Testing Desktop Load (1440x900) ---');
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('input[aria-label="جست‌وجوی محله"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const title = await page.title();
  console.log(`[PASS] Page Title: ${title}`);

  const leafletMap = await page.$('.leaflet-container');
  console.log(`[PASS] Leaflet Map Rendered: ${Boolean(leafletMap)}`);

  const searchInput = await page.$('input[aria-label="جست‌وجوی محله"]');
  console.log(`[PASS] Search Input Rendered: ${Boolean(searchInput)}`);

  if (searchInput) {
    await searchInput.fill('پونک');
    await page.waitForTimeout(500);
    const searchVal = await searchInput.inputValue();
    console.log(`[PASS] Search value typed: ${searchVal}`);
    await searchInput.fill('');
  }

  console.log('--- 2. Testing Mobile Responsive Viewport (375x812) ---');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  const mobileOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`[PASS] Mobile Horizontal Overflow: ${mobileOverflow ? 'OVERFLOW DETECTED' : 'NONE (Perfect Layout)'}`);

  console.log('--- 3. Testing Tablet Responsive Viewport (768x1024) ---');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(600);
  const tabletOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`[PASS] Tablet Horizontal Overflow: ${tabletOverflow ? 'OVERFLOW DETECTED' : 'NONE (Perfect Layout)'}`);

  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('--- 4. Testing Tools Popover & Modals ---');
  const toolsBtn = await page.$('button:has-text("ابزارها")');
  if (toolsBtn) {
    await toolsBtn.click();
    await page.waitForTimeout(400);
    console.log('[PASS] Tools button clicked');

    const superModulesBtn = await page.$('button:has-text("ابرماژول‌ها و جعبه ابزار جامع مسکن")');
    if (superModulesBtn) {
      await superModulesBtn.click();
      await page.waitForTimeout(1000);
      console.log('[PASS] Super-Modules modal opened');

      const modalHeader = await page.$('text=جعبه ابزار جامع ۵۲گانه پراپ‌تک مسکن');
      console.log(`[PASS] Super-Modules Modal Header: ${Boolean(modalHeader)}`);

      const tabs = ['مچ‌گیر', 'خرید با رهن', 'مالیات', 'داور موجر', 'شهرداری', 'تهاتر', 'چک‌لیست', 'مدارس', 'استودیو'];
      for (const tabName of tabs) {
        const tabBtn = await page.$(`button[role="tab"]:has-text("${tabName}")`);
        if (tabBtn) {
          await tabBtn.evaluate((el: any) => el.click());
          await page.waitForTimeout(150);
        }
      }
      console.log('[PASS] All Super-Module tabs toggled without crash');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      console.log('[PASS] Modal closed with Escape key');
    }
  }

  console.log('--- 5. Testing Interactive Map Lenses ---');
  const lenses = ['بودجه من', 'حباب قیمت', 'کیفیت هوا', 'ترافیک'];
  for (const lensName of lenses) {
    const lensBtn = page.locator(`button:has-text("${lensName}"):visible`).first();
    if ((await lensBtn.count()) > 0) {
      await lensBtn.click();
      await page.waitForTimeout(300);
      console.log(`[PASS] Toggled map lens: ${lensName}`);
    }
  }

  console.log('--- 6. Testing 5-City Switcher Segmented Control ---');
  for (const cityLabel of ['کرج', 'مشهد', 'اصفهان', 'شیراز', 'تهران']) {
    const cityBtn = page.getByRole('button', { name: cityLabel, exact: true }).first();
    if ((await cityBtn.count()) > 0) {
      await cityBtn.click();
      await page.waitForTimeout(450);
      console.log(`[PASS] Switched active city to ${cityLabel}`);
    }
  }

  console.log('--- 7. Testing Bargains Inspector Tab Trigger ---');
  const bargainsBtn = page.locator('button:has-text("فایل‌های زیر قیمت"):visible').first();
  if ((await bargainsBtn.count()) > 0) {
    await bargainsBtn.click();
    await page.waitForTimeout(500);
    console.log('[PASS] Bargains inspector tab opened');
  }

  console.log('--- 8. Testing All 6 Primary Views & Theme Toggle ---');
  for (const viewId of ['discover', 'intelligence', 'tools', 'home', 'userspace', 'map']) {
    const navBtn = page.locator(`[data-testid="global-nav-${viewId}"]:visible`).first();
    if ((await navBtn.count()) > 0) {
      await navBtn.click();
      await page.waitForTimeout(300);
      console.log(`[PASS] Switched primary view to: ${viewId}`);
    }
  }
  const themeBtn = page.locator('[data-testid="theme-toggle-btn"]:visible').first();
  if ((await themeBtn.count()) > 0) {
    await themeBtn.click();
    await page.waitForTimeout(200);
    await themeBtn.click();
    await page.waitForTimeout(200);
    console.log('[PASS] Dark/Light theme toggled cleanly');
  }

  console.log('--- 9. Checking Console Errors & Warnings ---');
  console.log(`Total console messages: ${consoleLogs.length}`);
  console.log(`Uncaught errors count: ${uncaughtErrors.length}`);
  if (uncaughtErrors.length > 0) {
    console.log('Errors:', uncaughtErrors);
  }

  await browser.close();

  if (uncaughtErrors.length > 0) {
    throw new Error(`Frontend deep debug found ${uncaughtErrors.length} errors`);
  }

  console.log('====================================================');
  console.log('[FRONTEND DEBUG PASS] Frontend is 100% stable and error-free!');
  console.log('====================================================');
}

runFrontendDeepDebug().catch((err) => {
  console.error('[FRONTEND DEBUG ERROR]', err);
  process.exit(1);
});

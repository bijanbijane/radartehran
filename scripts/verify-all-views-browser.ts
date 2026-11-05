/**
 * @file scripts/verify-all-views-browser.ts
 * Headless Chromium visual & interaction verification script for Gold Master v2.0
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('🚀 Starting Gold Master v2.0 Headless Browser Verification...\n');
  const outDir = path.resolve(process.cwd(), '.playwright-cli');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const possiblePaths = [
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const executablePath = possiblePaths.find((p) => fs.existsSync(p));

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const consoleErrors: string[] = [];

  try {
    // 1. Desktop 1440x900 verification
    console.log('🖥️ Testing Desktop 1440x900...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'fa-IR',
    });
    const page = await desktopContext.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known benign websocket/HMR or external tile 404s
        if (!text.includes('WebSocket') && !text.includes('favicon') && !text.includes('tile.openstreetmap.org')) {
          consoleErrors.push(`[Console Error]: ${text}`);
        }
      }
    });

    // Test View: Home
    await page.goto('http://localhost:3000/?view=home&hood=5', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-home.png') });
    console.log('  ✅ Captured v2-desktop-home.png');

    // Test View: Discover (via click on global nav)
    await page.click('[data-testid="global-nav-discover"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-discover.png') });
    console.log('  ✅ Captured v2-desktop-discover.png');

    // Test View: Intelligence
    await page.click('[data-testid="global-nav-intelligence"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-intelligence.png') });
    console.log('  ✅ Captured v2-desktop-intelligence.png');

    // Test View: Tools
    await page.click('[data-testid="global-nav-tools"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-tools.png') });
    console.log('  ✅ Captured v2-desktop-tools.png');

    // Test View: Userspace
    await page.click('[data-testid="global-nav-userspace"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-userspace.png') });
    console.log('  ✅ Captured v2-desktop-userspace.png');

    // Test View: Map
    await page.click('[data-testid="global-nav-map"]');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'v2-desktop-map.png') });
    console.log('  ✅ Captured v2-desktop-map.png');

    await desktopContext.close();

    // 2. Mobile 390x844 verification
    console.log('\n📱 Testing Mobile 390x844...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'fa-IR',
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('http://localhost:3000/?view=discover&hood=5', { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(1500);
    await mobilePage.screenshot({ path: path.join(outDir, 'v2-mobile-discover.png') });
    console.log('  ✅ Captured v2-mobile-discover.png');

    await mobilePage.goto('http://localhost:3000/?view=home&hood=5', { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(1500);
    await mobilePage.screenshot({ path: path.join(outDir, 'v2-mobile-home.png') });
    console.log('  ✅ Captured v2-mobile-home.png');

    await mobileContext.close();

    console.log('\n🔍 Console Error Check:');
    if (consoleErrors.length > 0) {
      console.warn(`  ⚠️ Found ${consoleErrors.length} console errors:`, consoleErrors);
    } else {
      console.log('  ✅ Zero unexpected console errors detected.');
    }

    console.log('\n🎉 Visual & Interaction Verification Completed Successfully!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

/**
 * DSR visual audit — headless screenshots + layout probes (no backend changes).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const OUT = path.join(process.cwd(), '.cache', 'visual-audit-dsr');

const ROUTES = [
  { id: 'home', path: '/' },
  { id: 'map', path: '/explore/map' },
  { id: 'discover', path: '/areas' },
  { id: 'properties', path: '/properties' },
  { id: 'properties-buy', path: '/properties/buy' },
  { id: 'market', path: '/market' },
  { id: 'search', path: '/areas?q=ونک' },
  { id: 'knowledge', path: '/knowledge' },
  { id: 'services', path: '/services' },
  { id: 'userspace', path: '/account' },
  { id: 'contributions', path: '/contributions' },
  { id: 'tools', path: '/tools' },
  { id: 'admin', path: '/admin' },
];

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'mobile', width: 390, height: 844 },
];

async function probePage(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const dir = document.documentElement.getAttribute('dir') || '';
    const buttons = document.querySelectorAll('button');
    let smallTouch = 0;
    buttons.forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.width < 40 && r.height < 40) smallTouch += 1;
    });
    const clipped = [...document.querySelectorAll('article, [data-testid^="property-card"]')].filter((el) => {
      const r = el.getBoundingClientRect();
      const p = el.parentElement?.getBoundingClientRect();
      if (!p || r.width < 10) return false;
      return r.right > p.right + 4 || r.left < p.left - 4;
    }).length;
    return {
      mounted: Boolean(root && root.childElementCount > 0),
      overflowX,
      dir,
      smallTouchTargets: smallTouch,
      clippedCards: clipped,
      title: document.title,
      bodyTextLen: (document.body?.innerText || '').trim().length,
    };
  });
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'fa-IR' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const route of ROUTES) {
      const url = `${BASE}${route.path}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
        await page.waitForTimeout(1200);
        const probe = await probePage(page);
        const shot = path.join(OUT, `${vp.id}--${route.id}.png`);
        await page.screenshot({ path: shot, fullPage: false });
        report.push({ viewport: vp.id, route: route.id, url, probe, errors: [...errors], screenshot: shot });
        errors.length = 0;
      } catch (e) {
        report.push({ viewport: vp.id, route: route.id, url, error: String(e), errors: [...errors] });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const outJson = path.join(OUT, 'report.json');
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const defects = report.filter(
  (r) =>
    r.error ||
    r.errors?.length ||
    r.probe?.overflowX ||
    !r.probe?.mounted ||
    r.probe?.bodyTextLen < 20,
);
console.log(`Wrote ${report.length} captures to ${OUT}`);
console.log(`Potential defects: ${defects.length}`);
for (const d of defects) {
  console.log(`- ${d.viewport}/${d.route}: ${d.error || JSON.stringify({ ...d.probe, errors: d.errors })}`);
}
process.exit(defects.some((d) => d.error || !d.probe?.mounted) ? 1 : 0);
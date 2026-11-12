/**
 * @file scripts/generate-sitemap.ts
 * @description Generates public/sitemap.xml and public/robots.txt for Tehran & Iran Multi-City Housing Radar.
 * Indexes the dated Tehran neighborhood pages and the few comparisons that have a public path.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import { tehranSitemapEntries } from '../src/data/neighborhoodListingSamples';

const BASE_URL = 'https://radartehran.ir';

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSitemapContent(baseUrl: string = BASE_URL, todayIso: string = new Date().toISOString().split('T')[0]): string {
  const urls = tehranSitemapEntries(baseUrl).map((entry) => ({ ...entry, lastmod: todayIso }));

  const entriesXml = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entriesXml}
</urlset>
`;
}

export function generateRobotsContent(baseUrl: string = BASE_URL): string {
  return `# Robots.txt for Tehran Housing & Neighborhood Radar
# Canonical: ${baseUrl}
User-agent: *
Allow: /
Disallow: /api/

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml
`;
}

export function writeSitemapAndRobots(targetDir: string = path.resolve(process.cwd(), 'public')): void {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sitemapPath = path.join(targetDir, 'sitemap.xml');
  const robotsPath = path.join(targetDir, 'robots.txt');

  const sitemapContent = generateSitemapContent();
  const robotsContent = generateRobotsContent();

  fs.writeFileSync(sitemapPath, sitemapContent, 'utf-8');
  fs.writeFileSync(robotsPath, robotsContent, 'utf-8');

  console.log(`[SITEMAP BUILDER] Successfully generated:\n - ${sitemapPath}\n - ${robotsPath}`);
}

// Execute when invoked directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeSitemapAndRobots();
}

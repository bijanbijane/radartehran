/**
 * @file scripts/generate-sitemap.ts
 * @description Generates public/sitemap.xml and public/robots.txt for Tehran & Iran Multi-City Housing Radar.
 * Indexes all cities, neighborhoods, and comparative valuation pages with canonical URLs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS, CityId } from '../src/data/multiCityData';

const BASE_URL = 'https://radartehran.ir';
const VALID_CITIES: CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSitemapContent(baseUrl: string = BASE_URL, todayIso: string = new Date().toISOString().split('T')[0]): string {
  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [];

  // 1. Root / Homepage
  urls.push({
    loc: `${baseUrl}/`,
    lastmod: todayIso,
    changefreq: 'hourly',
    priority: '1.0',
  });

  // 2. City Hubs & Neighborhoods
  for (const cityId of VALID_CITIES) {
    const isTehran = cityId === 'tehran';
    const cityCfg = MULTI_CITY_CONFIGS[cityId];
    const hoods = isTehran ? INITIAL_NEIGHBORHOODS : cityCfg?.neighborhoods || [];

    // City hub
    urls.push({
      loc: `${baseUrl}/?city=${cityId}`,
      lastmod: todayIso,
      changefreq: 'daily',
      priority: isTehran ? '0.95' : '0.90',
    });

    // Neighborhoods in city
    for (const hood of hoods) {
      const cityQuery = isTehran ? '' : `city=${cityId}&`;
      urls.push({
        loc: `${baseUrl}/?${cityQuery}hood=${hood.id}`,
        lastmod: todayIso,
        changefreq: 'daily',
        priority: '0.85',
      });
    }

    // Key pairwise neighborhood comparisons (top pairs for high-density indexing)
    const sampleLimit = Math.min(hoods.length, 12);
    for (let i = 0; i < sampleLimit; i++) {
      for (let j = i + 1; j < sampleLimit; j++) {
        const cityQuery = isTehran ? '' : `city=${cityId}&`;
        urls.push({
          loc: `${baseUrl}/?${cityQuery}compare=${hoods[i].id}-${hoods[j].id}`,
          lastmod: todayIso,
          changefreq: 'weekly',
          priority: '0.75',
        });
      }
    }
  }

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
if (import.meta.url === `file://${process.argv[1]}`) {
  writeSitemapAndRobots();
}

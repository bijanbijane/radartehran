import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { API_ENDPOINT_CONTRACTS, buildOpenApiSpecification } from '../src/utils/serverConfigValidator';
import { RADAR_API_ROUTE_INVENTORY } from '../src/utils/apiContractsAndSerializationEngine';
import { sponsorFromNeighborhoodOverride, PUBLIC_SPONSOR_COLLECTION } from '../src/utils/publicSponsorSync';
import {
  INITIAL_BUYER_LEADS,
  INITIAL_SPONSOR_CRM,
  isDemonstrationBuyerLead,
  withoutDemonstrationBuyerLeads,
  withoutDemonstrationSponsorRequests,
} from '../src/data/neighborhoods';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function registeredApiRoutes(): Set<string> {
  const files = ['server.ts', ...fs.readdirSync(path.join(root, 'src/utils')).filter((name) => name.startsWith('server') || name === 'osmTileProxy.ts').map((name) => `src/utils/${name}`)];
  const keys = new Set<string>();
  for (const rel of files) {
    const text = read(rel);
    const constants = new Map<string, string[]>();
    for (const match of text.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*\[([^\]]+)\]/g)) {
      const paths = [...match[2].matchAll(/['"](\/api\/[^'"]+)['"]/g)].map((item) => item[1]);
      if (paths.length > 0) constants.set(match[1], paths);
    }
    for (const match of text.matchAll(/app\.(get|post|put|patch|delete)\(\s*(\[[^\]]+\]|[^,\n]+)/g)) {
      const method = match[1].toUpperCase();
      const expr = match[2];
      const literals = [...expr.matchAll(/['"](\/api\/[^'"]+)['"]/g)].map((item) => item[1]);
      const ident = expr.match(/^([A-Za-z0-9_]+)/);
      const paths = literals.length > 0 ? literals : ident && constants.get(ident[1]) ? constants.get(ident[1])! : [];
      for (const routePath of paths) keys.add(`${method} ${routePath}`);
    }
  }
  return keys;
}

const cloud = read('src/components/useRadarCloudSync.ts');
const rules = read('firestore.rules');
const adminPanel = read('src/components/AdminMcpAndPortabilitySandboxPanel.tsx');
const adminActions = read('src/components/useRadarAdminActions.ts');
const registered = registeredApiRoutes();
const inventory = new Set(RADAR_API_ROUTE_INVENTORY.map((item) => `${item.method} ${item.path}`));
const openApiPaths = buildOpenApiSpecification().paths as Record<string, Record<string, unknown>>;

assert.equal(PUBLIC_SPONSOR_COLLECTION, 'neighborhoodOverrides');
assert.equal(cloud.includes("collection(db, 'publicSponsors')"), false);
assert.equal(cloud.includes("where('hoodId', '>=', 1)") && cloud.includes("where('hoodId', '<=', 999)"), true);
assert.equal(sponsorFromNeighborhoodOverride({ sponsor: { name: 'نمونه', phone: '021', specialty: 'خرید', experienceYears: 4, planType: 'paid_1m' } }, 1_000)?.name, 'نمونه');
assert.equal(sponsorFromNeighborhoodOverride({ sponsor: { name: 'منقضی', phone: '021', expiresAtIso: '2000-01-01T00:00:00.000Z' } }, Date.parse('2026-01-01T00:00:00.000Z')), null);
assert.equal(rules.includes('match /publicSponsors/'), false);
assert.equal(rules.includes('match /neighborhoodOverrides/{hoodId}'), true);
assert.match(rules, /existing\(\)\.hoodId >= 1 && existing\(\)\.hoodId <= 999/);
assert.equal(JSON.stringify(API_ENDPOINT_CONTRACTS).includes('/api/v1/enterprise/audit-pipeline'), false);
assert.equal(Object.keys(openApiPaths).includes('/api/v1/enterprise/audit-pipeline'), false);
assert.equal(adminPanel.includes('/api/v1/enterprise/audit-pipeline'), false);
for (const key of registered) assert.equal(inventory.has(key), true, `registered route missing from inventory: ${key}`);
for (const key of inventory) assert.equal(registered.has(key), true, `inventory route is not registered: ${key}`);
assert.equal(inventory.has('POST /api/object-storage/attach-to-bargain'), true);
assert.equal(inventory.has('POST /api/object-storage/attach-bargain'), false);
const mixedLeads = withoutDemonstrationBuyerLeads([...INITIAL_BUYER_LEADS, { id: 'real-9', hoodId: 5, hoodName: 'پونک', fullName: 'مشتری واقعی', phone: '09120000000', dealType: 'خرید', maxBudgetText: '۱', createdAtFa: 'امروز' }]);
assert.deepEqual(mixedLeads.map((item) => item.id), ['real-9']);
assert.equal(withoutDemonstrationSponsorRequests(INITIAL_SPONSOR_CRM).length, 0);
assert.equal(isDemonstrationBuyerLead(INITIAL_BUYER_LEADS[0]), true);
assert.equal(cloud.includes('INITIAL_BUYER_LEADS') || cloud.includes('INITIAL_SPONSOR_CRM'), false);
assert.equal(adminActions.includes('neighborhoodOverrides'), true);
assert.equal(adminActions.includes("'publicSponsors'"), false);
assert.equal(cloud.includes("collection(db, 'buyerAlerts')") && cloud.includes("collection(db, 'sponsorRequests')"), true);
console.log('phase1 sponsor, api, and demonstration-record checks passed');

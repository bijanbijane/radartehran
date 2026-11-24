/** @file server/modules/geography/geographyRegistryHttpRoutes.ts — Public Read-Only Canonical Geographic Registry API (F-15) */
import crypto from 'node:crypto';
import type express from 'express';
import { getAllMultiCityNeighborhoods, MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { ALL_31_IRAN_PROVINCES } from '../../../src/data/iranProvincesDirectory';

type RegistryEntityType =
  | 'URBAN_NEIGHBORHOOD'
  | 'URBAN_ZONE'
  | 'DISTRICT'
  | 'RURAL_DISTRICT'
  | 'CITY'
  | 'COUNTY'
  | 'PROVINCE'
  | 'COUNTRY';

interface CanonicalRegistryRecord {
  geographicEntityId: string;
  entityType: RegistryEntityType;
  classificationSystemId: string;
  canonicalNameFa: string;
  alternativeNamesFa?: string[];
  nameEn?: string | null;
  parentGeographicEntityId?: string | null;
  parentNameFa?: string | null;
  provinceGeographicEntityId?: string | null;
  provinceNameFa?: string | null;
  identityStatus: string;
  verificationStatus: string;
  lifecycleStatus: string;
  boundaryStatus?: string | null;
  pointCoordinates?: { latitude: number; longitude: number } | null;
  isSyntheticFixture: boolean;
  registryIdentity: {
    identityAnchor: string;
    anchorType: string;
    issuedOrderIndex: number;
    issuedAtRegistryRevision: number;
    identityStatus: string;
    retiredAtRegistryRevision: number | null;
    retiredReason: string | null;
    survivingGeographicEntityId: string | null;
  };
}

interface BuiltRegistrySnapshot {
  revision: number;
  checksum: string;
  entities: CanonicalRegistryRecord[];
  legacyAliases: Array<{
    aliasId: string;
    legacySystemCode: string;
    legacyIdentifierValue: string;
    canonicalGeographicEntityId: string;
    aliasStatus: string;
    recordedAtRegistryRevision: number;
    resolutionEvidenceRef: string;
  }>;
}

let cachedSnapshot: BuiltRegistrySnapshot | null = null;

function buildRegistrySnapshot(): BuiltRegistrySnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const entities: CanonicalRegistryRecord[] = [];
  const legacyAliases: BuiltRegistrySnapshot['legacyAliases'] = [];
  let order = 1;

  const makeIdentity = (anchor: string) => ({
    identityAnchor: anchor,
    anchorType: 'CANONICAL_ADMIN_CODE',
    issuedOrderIndex: order++,
    issuedAtRegistryRevision: 1,
    identityStatus: 'ACTIVE',
    retiredAtRegistryRevision: null,
    retiredReason: null,
    survivingGeographicEntityId: null,
  });

  entities.push({
    geographicEntityId: 'irni:country:IR',
    entityType: 'COUNTRY',
    classificationSystemId: 'IRNI-GEO-V1',
    canonicalNameFa: 'ایران',
    nameEn: 'Iran',
    identityStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    lifecycleStatus: 'PUBLISHED',
    boundaryStatus: 'CANONICAL',
    pointCoordinates: { latitude: 32.4279, longitude: 53.688 },
    isSyntheticFixture: false,
    registryIdentity: makeIdentity('ISO-3166-1:IR'),
  });

  for (const prov of ALL_31_IRAN_PROVINCES) {
    const provId = `irni:province:${prov.id}`;
    const [provLat, provLng] = prov.center;
    entities.push({
      geographicEntityId: provId,
      entityType: 'PROVINCE',
      classificationSystemId: 'IRNI-GEO-V1',
      canonicalNameFa: prov.nameFa,
      nameEn: prov.id,
      parentGeographicEntityId: 'irni:country:IR',
      parentNameFa: 'ایران',
      provinceGeographicEntityId: provId,
      provinceNameFa: prov.nameFa,
      identityStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lifecycleStatus: 'PUBLISHED',
      boundaryStatus: 'CANONICAL',
      pointCoordinates: { latitude: provLat, longitude: provLng },
      isSyntheticFixture: false,
      registryIdentity: makeIdentity(`IR-PROV-${prov.id.toUpperCase()}`),
    });

    entities.push({
      geographicEntityId: `irni:city:${prov.id}`,
      entityType: 'CITY',
      classificationSystemId: 'IRNI-GEO-V1',
      canonicalNameFa: prov.capitalFa,
      parentGeographicEntityId: provId,
      parentNameFa: prov.nameFa,
      provinceGeographicEntityId: provId,
      provinceNameFa: prov.nameFa,
      identityStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lifecycleStatus: 'PUBLISHED',
      boundaryStatus: 'CANONICAL',
      pointCoordinates: { latitude: provLat, longitude: provLng },
      isSyntheticFixture: false,
      registryIdentity: makeIdentity(`IR-CITY-${prov.id.toUpperCase()}`),
    });
  }

  const cityToProvince: Record<string, { provId: string; provName: string }> = {
    tehran: { provId: 'irni:province:tehran', provName: 'تهران' },
    karaj: { provId: 'irni:province:alborz', provName: 'البرز' },
    mashhad: { provId: 'irni:province:khorasan-razavi', provName: 'خراسان رضوی' },
    isfahan: { provId: 'irni:province:isfahan', provName: 'اصفهان' },
    shiraz: { provId: 'irni:province:fars', provName: 'فارس' },
  };

  for (const hood of getAllMultiCityNeighborhoods()) {
    const cityId = resolveCityIdForNeighborhood(hood.id);
    const cityCfg = MULTI_CITY_CONFIGS[cityId] || MULTI_CITY_CONFIGS.tehran;
    const provInfo = cityToProvince[cityId] || cityToProvince.tehran;
    const canonicalId = `irni:neighborhood:${cityId}:${hood.id}`;

    entities.push({
      geographicEntityId: canonicalId,
      entityType: 'URBAN_NEIGHBORHOOD',
      classificationSystemId: 'IRNI-GEO-V1',
      canonicalNameFa: hood.name,
      parentGeographicEntityId: `irni:city:${cityId}`,
      parentNameFa: cityCfg.nameFa,
      provinceGeographicEntityId: provInfo.provId,
      provinceNameFa: provInfo.provName,
      identityStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      lifecycleStatus: 'PUBLISHED',
      boundaryStatus: 'AVAILABLE',
      pointCoordinates: { latitude: hood.lat, longitude: hood.lng },
      isSyntheticFixture: false,
      registryIdentity: makeIdentity(`IRNI-NH-${cityId.toUpperCase()}-${hood.id}`),
    });

    legacyAliases.push({
      aliasId: `alias:tehran_radar:${hood.id}`,
      legacySystemCode: 'TEHRAN_RADAR',
      legacyIdentifierValue: String(hood.id),
      canonicalGeographicEntityId: canonicalId,
      aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
      recordedAtRegistryRevision: 1,
      resolutionEvidenceRef: `irni-seed:${cityId}:${hood.id}`,
    });
  }

  const checksum = crypto
    .createHash('sha256')
    .update(entities.map((e) => e.geographicEntityId).join('|'))
    .digest('hex');

  cachedSnapshot = { revision: 1, checksum, entities, legacyAliases };
  return cachedSnapshot;
}

export function registerGeographyRegistryHttpRoutes(
  app: express.Express,
  deps: {
    checkRateLimit: (ip: string, bucket: 'general', limit: number, windowMs: number) => boolean;
    getClientIp: (req: express.Request) => string;
  },
): void {
  const buildHead = (snap: BuiltRegistrySnapshot) => ({
    registry_revision: snap.revision,
    registry_checksum: snap.checksum,
    canonical_entity_count: snap.entities.length,
    relationship_count: snap.entities.filter((e) => Boolean(e.parentGeographicEntityId)).length,
    source_mapping_count: snap.legacyAliases.length,
    canonical_entry_count: snap.entities.length,
    anchor_count: snap.entities.length,
    legacy_alias_count: snap.legacyAliases.length,
  });

  app.get('/api/v1/geography/registry/health', (req, res) => {
    if (!deps.checkRateLimit(deps.getClientIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌ها بیش از حد مجاز است.' });
      return;
    }
    const snap = buildRegistrySnapshot();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ status: 'ready', registry: buildHead(snap) });
  });

  app.get('/api/v1/geography/registry', (req, res) => {
    if (!deps.checkRateLimit(deps.getClientIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌ها بیش از حد مجاز است.' });
      return;
    }
    const snap = buildRegistrySnapshot();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ status: 'ok', registry: buildHead(snap) });
  });

  app.get('/api/v1/geography/legacy-aliases', (req, res) => {
    if (!deps.checkRateLimit(deps.getClientIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌ها بیش از حد مجاز است.' });
      return;
    }
    const snap = buildRegistrySnapshot();
    const systemCode = typeof req.query.legacySystemCode === 'string' ? req.query.legacySystemCode.trim().toUpperCase() : 'TEHRAN_RADAR';
    const items = snap.legacyAliases.filter((item) => item.legacySystemCode === systemCode);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      status: 'ok',
      registryRevision: snap.revision,
      items,
      source: 'IRNI_CANONICAL_REGISTRY',
    });
  });

  app.get('/api/v1/geography/entities', (req, res) => {
    if (!deps.checkRateLimit(deps.getClientIp(req), 'general', 120, 60_000)) {
      res.status(429).json({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'تعداد درخواست‌ها بیش از حد مجاز است.' });
      return;
    }
    const snap = buildRegistrySnapshot();
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim().toUpperCase() : '';
    const provinceId = typeof req.query.provinceId === 'string' ? req.query.provinceId.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const rawLimit = Number(req.query.limit ?? 50);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

    let filtered = snap.entities;
    if (entityType) filtered = filtered.filter((e) => e.entityType === entityType);
    if (provinceId) filtered = filtered.filter((e) => e.provinceGeographicEntityId === provinceId);
    if (q) {
      const qLower = q.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.canonicalNameFa.includes(q) ||
          (e.parentNameFa && e.parentNameFa.includes(q)) ||
          (e.nameEn && e.nameEn.toLowerCase().includes(qLower)),
      );
    }

    const pageItems = filtered.slice(offset, offset + limit);
    const nextOffset = offset + limit < filtered.length ? offset + limit : null;
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).json({
      status: 'ok',
      registryRevision: snap.revision,
      items: pageItems,
      pagination: { limit, offset, nextOffset },
      source: 'IRNI_CANONICAL_REGISTRY',
    });
  });
}

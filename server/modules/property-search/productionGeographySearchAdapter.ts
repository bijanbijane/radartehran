import { defaultGeographyService } from '../geography';
import type { GeographySearchAdapter } from './contracts';

function parseHoodEntityId(entityId: string): { cityId: string; hoodId: number } | null {
  const match = /^hood:([^:]+):(\d+)$/.exec(entityId);
  if (!match) return null;
  return { cityId: match[1], hoodId: Number(match[2]) };
}

function parseDistrictNumber(entityId: string): number | undefined {
  const match = /^district:[^:]+:(\d+)$/.exec(entityId);
  return match ? Number(match[1]) : undefined;
}

export function createProductionGeographySearchAdapter(): GeographySearchAdapter {
  const geo = defaultGeographyService;
  return {
    async resolveLocation(text, cityScopeId) {
      const parent = cityScopeId ? (cityScopeId.startsWith('city:') ? cityScopeId : `city:${cityScopeId}`) : undefined;
      const hits = geo.searchEntities(text, { level: 'neighborhood', parentEntityId: parent, limit: 3 });
      if (hits.length === 0) return { resolved: false };
      const ent = hits[0];
      const parsed = parseHoodEntityId(ent.id);
      if (!parsed) return { resolved: false };
      return {
        resolved: true,
        cityId: parsed.cityId,
        districtId: ent.parentId,
        hoodId: parsed.hoodId,
        displayNameFa: ent.nameFa,
        matchType: hits.length > 1 ? 'ambiguous_best' : 'neighborhood_name',
      };
    },
    async getNeighborhoodInfo(cityId, hoodId) {
      const ent = geo.resolveGeographicIdentifier(`hood:${cityId}:${hoodId}`);
      if (!ent) return null;
      return {
        cityId,
        hoodId,
        hoodNameFa: ent.nameFa,
        districtNumber: ent.parentId ? parseDistrictNumber(ent.parentId) : undefined,
        center: ent.center,
        boundingBox: ent.boundary.boundingBox,
      };
    },
    async getNeighborhoodsInDistrict(cityId, districtIdOrNum) {
      const districtId =
        typeof districtIdOrNum === 'number'
          ? `district:${cityId}:${districtIdOrNum}`
          : districtIdOrNum.startsWith('district:')
            ? districtIdOrNum
            : `district:${cityId}:${districtIdOrNum}`;
      return geo
        .listNeighborhoods(cityId)
        .filter((n) => n.parentId === districtId)
        .map((n) => parseHoodEntityId(n.id)?.hoodId)
        .filter((id): id is number => id != null);
    },
    async getNearbyNeighborhoods(lat, lng, radiusMeters) {
      return geo
        .findNearbyEntities({ lat, lng }, radiusMeters, { level: 'neighborhood', limit: 30 })
        .map((r) => parseHoodEntityId(r.entity.id)?.hoodId)
        .filter((id): id is number => id != null);
    },
    async getAllSupportedCities() {
      return geo
        .searchEntities('', { level: 'city', limit: 50 })
        .map((c) => ({
          id: c.id.replace(/^city:/, ''),
          nameFa: c.nameFa,
          nameEn: c.nameEn ?? c.id.replace(/^city:/, ''),
        }));
    },
  };
}
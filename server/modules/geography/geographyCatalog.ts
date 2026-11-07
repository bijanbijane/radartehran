/**
 * @file server/modules/geography/geographyCatalog.ts
 * @description Authoritative hierarchical geographic catalog across provinces, cities, districts, and neighborhoods.
 */

import { ALL_31_IRAN_PROVINCES } from '../../../src/data/iranProvincesDirectory';
import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { normalizeGeographicNameFa, computeLevenshteinDistance } from './geographyNormalizer';
import type { GeographicEntity, GeographicLevel } from './geographyTypes';

export class GeographyCatalog {
  private readonly entities = new Map<string, GeographicEntity>();
  private readonly childToParentIndex = new Map<string, string>(); // childId -> parentId
  private readonly parentToChildrenIndex = new Map<string, Set<string>>(); // parentId -> Set of childIds
  private readonly normalizedNameIndex = new Map<string, Set<string>>(); // normalizedName -> Set of entityIds

  constructor() {
    this.seedAuthoritativeBaseline();
  }

  /**
   * Seeds the catalog from the authoritative data sources:
   * Country -> 31 Provinces -> Configured Multi-Cities -> Districts -> Canonical Neighborhoods
   */
  private seedAuthoritativeBaseline(): void {
    const nowIso = '2026-01-01T00:00:00.000Z';

    // 1. Country: Iran
    const countryEntity: GeographicEntity = {
      id: 'country:ir',
      level: 'country',
      nameFa: 'ایران',
      nameEn: 'Iran',
      altNamesFa: ['جمهوری اسلامی ایران', 'کشور ایران'],
      code: 'IR',
      center: { lat: 32.4279, lng: 53.6880 },
      boundary: {
        provenance: 'OFFICIAL_CADASTRAL_VERIFIED',
        sourceAuthority: 'سازمان نقشه‌برداری کشور (NCC)',
        datasetVersion: 'NCC-2026-V1',
        boundingBox: { minLat: 25.0, maxLat: 39.8, minLng: 44.0, maxLng: 63.3 },
        centroid: { lat: 32.4279, lng: 53.6880 },
      },
      isActive: true,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.registerEntityInternal(countryEntity);

    // 2. 31 Provinces
    for (const prov of ALL_31_IRAN_PROVINCES) {
      const provinceEntity: GeographicEntity = {
        id: `province:${prov.id}`,
        level: 'province',
        parentId: 'country:ir',
        nameFa: prov.nameFa,
        altNamesFa: [`استان ${prov.nameFa}`],
        center: { lat: prov.center[0], lng: prov.center[1] },
        boundary: {
          provenance: 'EMPIRICAL_MUNICIPAL_SURVEY',
          sourceAuthority: 'وزارت کشور - تقسیمات کشوری',
          datasetVersion: 'MOI-DIV-2026',
          centroid: { lat: prov.center[0], lng: prov.center[1] },
        },
        metadata: {
          capitalFa: prov.capitalFa,
          regionGroup: prov.regionGroup,
          majorCities: prov.majorCities,
        },
        isActive: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      this.registerEntityInternal(provinceEntity);
    }

    // 3. Multi-City metropolitan centers
    for (const [cityKey, config] of Object.entries(MULTI_CITY_CONFIGS)) {
      const parentProvinceId = cityKey === 'tehran'
        ? 'province:tehran'
        : cityKey === 'karaj'
          ? 'province:alborz'
          : cityKey === 'mashhad'
            ? 'province:khorasan_razavi'
            : cityKey === 'isfahan'
              ? 'province:isfahan'
              : cityKey === 'shiraz'
                ? 'province:fars'
                : cityKey === 'tabriz'
                  ? 'province:east_azerbaijan'
                  : 'province:tehran';

      const cityEntity: GeographicEntity = {
        id: `city:${cityKey}`,
        level: 'city',
        parentId: parentProvinceId,
        nameFa: config.nameFa,
        altNamesFa: [`شهر ${config.nameFa}`, `کلانشهر ${config.nameFa}`],
        center: { lat: config.center[0], lng: config.center[1] },
        boundary: {
          provenance: 'EMPIRICAL_MUNICIPAL_SURVEY',
          sourceAuthority: `شهرداری ${config.nameFa}`,
          datasetVersion: 'MUN-2026-V1',
          centroid: { lat: config.center[0], lng: config.center[1] },
        },
        isActive: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      this.registerEntityInternal(cityEntity);
    }

    // 4. Tehran urban districts 1..22
    for (let d = 1; d <= 22; d++) {
      const districtEntity: GeographicEntity = {
        id: `district:tehran:${d}`,
        level: 'urban_district',
        parentId: 'city:tehran',
        nameFa: `منطقه ${d} تهران`,
        code: String(d),
        altNamesFa: [`منطقه ${d}`, `شهرداری منطقه ${d}`],
        boundary: {
          provenance: 'EMPIRICAL_MUNICIPAL_SURVEY',
          sourceAuthority: 'شهرداری تهران',
          datasetVersion: 'TEH-MUN-DIST-2026',
        },
        isActive: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      this.registerEntityInternal(districtEntity);
    }

    // 5. Canonical Neighborhoods
    const allHoods = getAllMultiCityNeighborhoods();
    for (const hood of allHoods) {
      const cityId = (hood as { cityId?: string }).cityId || resolveCityIdForNeighborhood(hood.id) || 'tehran';
      const cityEntityId = `city:${cityId}`;

      // Extract district if specified in zone
      let parentEntityId = cityEntityId;
      const zoneMatch = hood.zone?.match(/منطقه\s*(\d+)/);
      if (zoneMatch && cityId === 'tehran') {
        const distNum = parseInt(zoneMatch[1], 10);
        if (distNum >= 1 && distNum <= 22) {
          parentEntityId = `district:tehran:${distNum}`;
        }
      }

      const hoodEntity: GeographicEntity = {
        id: `hood:${cityId}:${hood.id}`,
        level: 'neighborhood',
        parentId: parentEntityId,
        nameFa: hood.name,
        code: String(hood.id),
        altNamesFa: [
          `محله ${hood.name}`,
          ...(hood.zone ? [hood.zone] : []),
        ],
        center: { lat: hood.lat, lng: hood.lng },
        boundary: {
          provenance: hood.radius ? 'APPROXIMATE_RADIUS_SYNTHESIS' : 'MISSING',
          sourceAuthority: 'رادار تهران - اطلس محلات ایران',
          datasetVersion: 'HOODS-CATALOG-V4',
          centroid: { lat: hood.lat, lng: hood.lng },
          approximateRadiusMeters: hood.radius || 1000,
        },
        metadata: {
          buyPerSqm: hood.buyPerSqm,
          rahn80m: hood.rahn80m,
          zone: hood.zone,
        },
        isActive: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      this.registerEntityInternal(hoodEntity);
    }
  }

  private registerEntityInternal(entity: GeographicEntity): void {
    this.entities.set(entity.id, entity);

    if (entity.parentId) {
      this.childToParentIndex.set(entity.id, entity.parentId);
      if (!this.parentToChildrenIndex.has(entity.parentId)) {
        this.parentToChildrenIndex.set(entity.parentId, new Set());
      }
      this.parentToChildrenIndex.get(entity.parentId)!.add(entity.id);
    }

    // Index normalized names
    const namesToIndex = [entity.nameFa, ...(entity.altNamesFa || [])];
    for (const rawName of namesToIndex) {
      const norm = normalizeGeographicNameFa(rawName);
      if (!norm) continue;
      if (!this.normalizedNameIndex.has(norm)) {
        this.normalizedNameIndex.set(norm, new Set());
      }
      this.normalizedNameIndex.get(norm)!.add(entity.id);
    }
  }

  public getEntityById(id: string): GeographicEntity | null {
    return this.entities.get(id) || null;
  }

  public listProvinces(): GeographicEntity[] {
    return Array.from(this.entities.values()).filter((e) => e.level === 'province' && e.isActive);
  }

  public listCitiesByProvince(provinceId: string): GeographicEntity[] {
    const normProvId = provinceId.startsWith('province:') ? provinceId : `province:${provinceId}`;
    return Array.from(this.entities.values()).filter(
      (e) => e.level === 'city' && e.parentId === normProvId && e.isActive,
    );
  }

  public listDistrictsByCity(cityId: string): GeographicEntity[] {
    const normCityId = cityId.startsWith('city:') ? cityId : `city:${cityId}`;
    return Array.from(this.entities.values()).filter(
      (e) => e.level === 'urban_district' && e.parentId === normCityId && e.isActive,
    );
  }

  public listNeighborhoodsByCity(cityId: string): GeographicEntity[] {
    const normCityId = cityId.startsWith('city:') ? cityId : `city:${cityId}`;
    const result: GeographicEntity[] = [];

    for (const entity of this.entities.values()) {
      if (entity.level !== 'neighborhood' || !entity.isActive) continue;

      if (entity.parentId === normCityId) {
        result.push(entity);
      } else if (entity.parentId?.startsWith('district:')) {
        // District parent check
        const parentDistrict = this.entities.get(entity.parentId);
        if (parentDistrict && parentDistrict.parentId === normCityId) {
          result.push(entity);
        }
      }
    }

    return result;
  }

  public getParent(entityId: string): GeographicEntity | null {
    const parentId = this.childToParentIndex.get(entityId);
    if (!parentId) return null;
    return this.entities.get(parentId) || null;
  }

  public getChildren(entityId: string): GeographicEntity[] {
    const childIds = this.parentToChildrenIndex.get(entityId);
    if (!childIds) return [];
    return Array.from(childIds)
      .map((id) => this.entities.get(id))
      .filter((e): e is GeographicEntity => e !== undefined && e.isActive);
  }

  /**
   * Validates whether a child entity genuinely belongs to the given parent or ancestor.
   * Prevents assigning e.g. a Shiraz neighborhood to Tehran city!
   */
  public validateParentChildRelationship(childId: string, expectedParentOrAncestorId: string): boolean {
    let currentId: string | undefined = childId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const parentId = this.childToParentIndex.get(currentId);
      if (!parentId) return false;
      if (parentId === expectedParentOrAncestorId) {
        return true;
      }
      currentId = parentId;
    }

    return false;
  }

  /**
   * Searches geographic entities with normalized Persian text and fuzzy fallback.
   */
  public searchEntities(
    query: string,
    options: {
      level?: GeographicLevel;
      parentEntityId?: string;
      limit?: number;
    } = {},
  ): GeographicEntity[] {
    const normQuery = normalizeGeographicNameFa(query);
    const limit = options.limit || 20;

    if (!normQuery) {
      if (options.level) {
        return Array.from(this.entities.values())
          .filter((e) => e.level === options.level && e.isActive)
          .slice(0, limit);
      }
      return [];
    }
    const scored: { entity: GeographicEntity; score: number }[] = [];

    for (const [normName, entityIds] of this.normalizedNameIndex.entries()) {
      for (const id of entityIds) {
        const entity = this.entities.get(id);
        if (!entity || !entity.isActive) continue;
        if (options.level && entity.level !== options.level) continue;
        if (options.parentEntityId && !this.validateParentChildRelationship(entity.id, options.parentEntityId)) {
          continue;
        }

        let score = 0;
        if (normName === normQuery) {
          score = 100;
        } else if (normName.startsWith(normQuery)) {
          score = 80;
        } else if (normName.includes(normQuery)) {
          score = 60;
        } else {
          // Fuzzy match
          const dist = computeLevenshteinDistance(normQuery, normName);
          if (dist <= 2 && normQuery.length >= 4) {
            score = 40 - dist * 5;
          }
        }

        if (score > 0) {
          scored.push({ entity, score });
        }
      }
    }

    // Sort by score descending and deduplicate by id
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const results: GeographicEntity[] = [];

    for (const item of scored) {
      if (!seen.has(item.entity.id)) {
        seen.add(item.entity.id);
        results.push(item.entity);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  public getTotalEntityCount(): number {
    return this.entities.size;
  }
}

/**
 * @file server/modules/geography/geographyImportPipeline.ts
 * @description Controlled dataset import pipeline with dry-run validation, duplicate detection, and provenance tracking.
 */

import { validateCoordinates } from './geographyNormalizer';
import type { GeographyCatalog } from './geographyCatalog';
import type {
  DatasetChangeSummary,
  GeographicEntity,
} from './geographyTypes';

export interface ImportCandidateRecord {
  readonly id: string;
  readonly level: GeographicEntity['level'];
  readonly parentId?: string;
  readonly nameFa: string;
  readonly nameEn?: string;
  readonly code?: string;
  readonly center?: { lat: number; lng: number };
  readonly boundaryProvenance: GeographicEntity['boundary']['provenance'];
  readonly sourceAuthority: string;
  readonly datasetVersion: string;
  readonly approximateRadiusMeters?: number;
}

export class GeographyImportPipeline {
  constructor(private readonly catalog: GeographyCatalog) {}

  /**
   * Imports or previews an import of candidate geographic entities.
   * If dryRun is true, evaluates all records and produces change summary without mutating the catalog.
   */
  public executeImport(
    candidates: ImportCandidateRecord[],
    options: { dryRun?: boolean } = {},
  ): DatasetChangeSummary {
    const dryRun = options.dryRun !== false;
    const errors: string[] = [];
    const seenIds = new Set<string>();

    let addedCount = 0;
    let updatedCount = 0;
    let invalidCount = 0;

    const validatedEntities: GeographicEntity[] = [];
    const nowIso = new Date().toISOString();

    for (const record of candidates) {
      if (!record || typeof record !== 'object') {
        errors.push('INVALID_RECORD: آیتم ورودی نامعتبر است.');
        invalidCount++;
        continue;
      }

      // Check ID
      if (!record.id || typeof record.id !== 'string') {
        errors.push(`MISSING_ID: شناسه موجودیت اجباری است (${record.nameFa || 'ناشناس'}).`);
        invalidCount++;
        continue;
      }

      if (seenIds.has(record.id)) {
        errors.push(`DUPLICATE_ID_IN_BATCH: شناسه تکراری در پکیج ورودی: ${record.id}`);
        invalidCount++;
        continue;
      }
      seenIds.add(record.id);

      // Check Persian Name
      if (!record.nameFa || record.nameFa.trim().length === 0) {
        errors.push(`MISSING_NAME_FA: نام فارسی برای شناسه ${record.id} خالی است.`);
        invalidCount++;
        continue;
      }

      // Check Parent relationship if level is not country
      if (record.level !== 'country') {
        if (!record.parentId) {
          errors.push(`MISSING_PARENT_ID: سطح ${record.level} با شناسه ${record.id} نیازمند parentId است.`);
          invalidCount++;
          continue;
        }

        const parentExists = this.catalog.getEntityById(record.parentId) || seenIds.has(record.parentId);
        if (!parentExists) {
          errors.push(`PARENT_NOT_FOUND: والد ${record.parentId} برای ${record.id} در کاتالوگ یافت نشد.`);
          invalidCount++;
          continue;
        }
      }

      // Check coordinates if present
      if (record.center) {
        const coordCheck = validateCoordinates(record.center.lat, record.center.lng);
        if (!coordCheck.valid) {
          errors.push(`INVALID_COORDINATES: مختصات نامعتبر برای ${record.id}: ${coordCheck.error}`);
          invalidCount++;
          continue;
        }
      }

      const existing = this.catalog.getEntityById(record.id);
      if (existing) {
        updatedCount++;
      } else {
        addedCount++;
      }

      const entity: GeographicEntity = {
        id: record.id,
        level: record.level,
        parentId: record.parentId,
        nameFa: record.nameFa.trim(),
        nameEn: record.nameEn?.trim(),
        code: record.code,
        center: record.center,
        boundary: {
          provenance: record.boundaryProvenance,
          sourceAuthority: record.sourceAuthority,
          datasetVersion: record.datasetVersion,
          importedAtIso: nowIso,
          approximateRadiusMeters: record.approximateRadiusMeters,
        },
        isActive: true,
        createdAtIso: existing?.createdAtIso || nowIso,
        updatedAtIso: nowIso,
      };

      validatedEntities.push(entity);
    }

    // Apply only if not dryRun and zero invalid records
    if (!dryRun && invalidCount === 0) {
      for (const entity of validatedEntities) {
        (this.catalog as any).registerEntityInternal(entity);
      }
    }

    return {
      totalImported: candidates.length,
      addedCount,
      updatedCount,
      deprecatedCount: 0,
      invalidCount,
      errors,
      dryRun,
    };
  }
}

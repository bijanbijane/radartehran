/** @file src/platform/storage/storageMigration.ts — Safe Legacy Key Migration */
import { getActiveStorageBackend } from './storageAdapter';

export interface StorageMigrationRule {
  readonly fromKey: string;
  readonly toKey: string;
  readonly transform?: (rawValue: string) => string | null;
}

export function runStorageMigrations(rules: readonly StorageMigrationRule[] = []): {
  readonly migratedCount: number;
  readonly corruptedRemovedCount: number;
  readonly toVersion: number;
} {
  const backend = getActiveStorageBackend();
  let migratedCount = 0;
  let corruptedRemovedCount = 0;

  for (const rule of rules) {
    const existingOld = backend.getItem(rule.fromKey);
    if (existingOld === null) continue;
    try {
      JSON.parse(existingOld);
      const nextVal = rule.transform ? rule.transform(existingOld) : existingOld;
      if (nextVal !== null && backend.getItem(rule.toKey) === null) {
        backend.setItem(rule.toKey, nextVal);
        migratedCount += 1;
      }
      backend.removeItem(rule.fromKey);
    } catch {
      backend.removeItem(rule.fromKey);
      corruptedRemovedCount += 1;
    }
  }

  return { migratedCount, corruptedRemovedCount, toVersion: 1 };
}

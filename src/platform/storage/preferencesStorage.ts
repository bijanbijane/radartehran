/** @file src/platform/storage/preferencesStorage.ts — User & Device Preferences Store */
import { readVersionedStorage, writeVersionedStorage } from './storageAdapter';

const PREFS_SCHEMA_VERSION = 1;

export interface RadarUserPreferenceRecord {
  readonly preferredWorkspaceId?: string;
  readonly preferredCityId?: string;
  readonly theme?: 'light' | 'dark';
  readonly locale?: 'fa' | 'en';
}

export function saveUserPreferencesRecord(userId: string, prefs: RadarUserPreferenceRecord): void {
  writeVersionedStorage({
    key: `rt:prefs:${userId || 'guest'}`,
    namespace: 'preferences',
    schemaVersion: PREFS_SCHEMA_VERSION,
    value: prefs,
    scopeKey: userId || 'guest',
  });
}

export function loadUserPreferencesRecord(userId: string): RadarUserPreferenceRecord {
  return readVersionedStorage<RadarUserPreferenceRecord>({
    key: `rt:prefs:${userId || 'guest'}`,
    expectedSchemaVersion: PREFS_SCHEMA_VERSION,
    expectedScopeKey: userId || 'guest',
    fallback: {},
  });
}

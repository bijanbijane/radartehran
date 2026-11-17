/** @file src/platform/api/contracts/index.ts — Platform API Contracts Barrel */
export interface ApiHealthStatusContract {
  readonly status: 'ok' | 'degraded';
  readonly timestampIso?: string;
}

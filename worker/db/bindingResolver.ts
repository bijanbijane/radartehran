/**
 * @file worker/db/bindingResolver.ts
 * @description Canonical fail-closed D1 binding resolver for RT-DB-TRIAD-001.
 *
 * Enforces strict domain isolation:
 * - USER_DB: Resolves `env.USER_DB` first, falling back ONLY to legacy alias `env.DB`.
 *   NEVER falls back to `env.RESEARCH_DB`.
 * - RESEARCH_DB: Resolves ONLY `env.RESEARCH_DB`.
 *   NEVER falls back to `env.USER_DB` or `env.DB`.
 * - IRNI Neighborhood Reference: Has NO D1 binding anywhere in WorkerEnv.
 */
import type { D1Database, WorkerEnv } from '../types';

export type UserDbBindingSource = 'USER_DB' | 'DB' | 'NONE';

export interface ResolvedUserDbResult {
  readonly ok: true;
  readonly db: D1Database;
  readonly bindingUsed: 'USER_DB' | 'DB';
}

export interface MissingDbResult {
  readonly ok: false;
  readonly statusCode: 503;
  readonly code: 'USER_DB_NOT_BOUND' | 'RESEARCH_DB_NOT_BOUND' | 'DOMAIN_BINDING_ISOLATION_VIOLATION';
  readonly messageFa: string;
}

export interface ResolvedResearchDbResult {
  readonly ok: true;
  readonly db: D1Database;
  readonly bindingUsed: 'RESEARCH_DB';
}

/**
 * Verifies at runtime that:
 * 1. Neither USER_DB nor legacy alias DB references the same handle as RESEARCH_DB.
 * 2. When both USER_DB and legacy alias DB are bound, they reference the exact same physical handle.
 */
export function hasUserResearchBindingCollision(env: WorkerEnv): boolean {
  if (env.USER_DB && env.DB && env.USER_DB !== env.DB) {
    return true;
  }
  if (env.RESEARCH_DB) {
    if (env.USER_DB && env.USER_DB === env.RESEARCH_DB) return true;
    if (env.DB && env.DB === env.RESEARCH_DB) return true;
  }
  return false;
}

/**
 * Resolves the USER_DB handle with legacy `DB` alias compatibility.
 * Never falls back to `RESEARCH_DB`.
 */
export function resolveUserDb(env: WorkerEnv): D1Database | undefined {
  if (hasUserResearchBindingCollision(env)) {
    return undefined;
  }
  return env.USER_DB ?? env.DB;
}

/**
 * Returns which binding satisfied USER_DB resolution for diagnostics.
 */
export function getUserDbBindingSource(env: WorkerEnv): UserDbBindingSource {
  if (env.USER_DB) return 'USER_DB';
  if (env.DB) return 'DB';
  return 'NONE';
}

/**
 * Fail-closed USER_DB resolver for request handlers and repositories.
 */
export function requireUserDb(env: WorkerEnv): ResolvedUserDbResult | MissingDbResult {
  if (hasUserResearchBindingCollision(env)) {
    return {
      ok: false,
      statusCode: 503,
      code: 'DOMAIN_BINDING_ISOLATION_VIOLATION',
      messageFa: 'خطای ایزوله‌سازی پایگاه داده: USER_DB و RESEARCH_DB نباید به یک منبع مشترک متصل باشند.',
    };
  }
  if (env.USER_DB) {
    return { ok: true, db: env.USER_DB, bindingUsed: 'USER_DB' };
  }
  if (env.DB) {
    return { ok: true, db: env.DB, bindingUsed: 'DB' };
  }
  return {
    ok: false,
    statusCode: 503,
    code: 'USER_DB_NOT_BOUND',
    messageFa: 'پایگاه داده کاربری (USER_DB) به سرویس متصل نیست.',
  };
}

/**
 * Resolves the isolated RESEARCH_DB handle.
 * Never falls back to `USER_DB` or `DB`.
 */
export function resolveResearchDb(env: WorkerEnv): D1Database | undefined {
  if (hasUserResearchBindingCollision(env)) {
    return undefined;
  }
  return env.RESEARCH_DB;
}

/**
 * Fail-closed RESEARCH_DB resolver for research ingestion, erasure, and analytics.
 */
export function requireResearchDb(env: WorkerEnv): ResolvedResearchDbResult | MissingDbResult {
  if (hasUserResearchBindingCollision(env)) {
    return {
      ok: false,
      statusCode: 503,
      code: 'DOMAIN_BINDING_ISOLATION_VIOLATION',
      messageFa: 'خطای ایزوله‌سازی پایگاه داده: RESEARCH_DB نباید با USER_DB مشترک باشد.',
    };
  }
  if (env.RESEARCH_DB) {
    return { ok: true, db: env.RESEARCH_DB, bindingUsed: 'RESEARCH_DB' };
  }
  return {
    ok: false,
    statusCode: 503,
    code: 'RESEARCH_DB_NOT_BOUND',
    messageFa: 'پایگاه داده پژوهشی (RESEARCH_DB) به سرویس متصل نیست.',
  };
}

export interface TriadDomainBindingDiagnostics {
  readonly userDbBound: boolean;
  readonly userDbSource: UserDbBindingSource;
  readonly legacyDbAliasBound: boolean;
  readonly researchDbBound: boolean;
  readonly isolationViolation: boolean;
  readonly irniDirectDbBindingPresent: boolean;
  readonly irniApiConfigured: boolean;
}

/**
 * Produces a secret-free diagnostic summary of the three data domains.
 */
export function getTriadDomainBindingDiagnostics(env: WorkerEnv): TriadDomainBindingDiagnostics {
  const isolationViolation = hasUserResearchBindingCollision(env);
  const irniBaseUrl = String(env.IRNI_API_BASE_URL || '').trim();
  const irniToken = String(env.IRNI_API_TOKEN || '').trim();
  return {
    userDbBound: Boolean(env.USER_DB || env.DB) && !isolationViolation,
    userDbSource: getUserDbBindingSource(env),
    legacyDbAliasBound: Boolean(env.DB),
    researchDbBound: Boolean(env.RESEARCH_DB) && !isolationViolation,
    isolationViolation,
    irniDirectDbBindingPresent: env.NEIGHBORHOOD_DB !== undefined && env.NEIGHBORHOOD_DB !== null,
    irniApiConfigured: irniBaseUrl.startsWith('https://') && irniToken.length >= 16,
  };
}

/**
 * @file worker/db/bindingResolver.ts
 * @description Canonical fail-closed D1 binding resolver for RT-DB-TRIAD-001.
 *
 * Enforces strict domain isolation:
 * - USER_DB: Resolves `env.USER_DB` first, falling back ONLY to legacy alias `env.DB`.
 *   NEVER falls back to `env.RESEARCH_DB`.
 * - RESEARCH_DB: Resolves ONLY `env.RESEARCH_DB`.
 *   NEVER falls back to `env.USER_DB` or `env.DB`.
 * - NEIGHBORHOOD_DB: IRNI-authoritative geographic reference replica; no cross-domain fallback.
 */
import type { D1Database, WorkerEnv } from '../types';

export type UserDbBindingSource = 'USER_DB' | 'DB' | 'NONE';
export interface ResolvedUserDbResult { readonly ok: true; readonly db: D1Database; readonly bindingUsed: 'USER_DB' | 'DB'; }
export interface MissingDbResult {
  readonly ok: false; readonly statusCode: 503;
  readonly code: 'USER_DB_NOT_BOUND' | 'RESEARCH_DB_NOT_BOUND' | 'NEIGHBORHOOD_DB_NOT_BOUND' | 'DOMAIN_BINDING_ISOLATION_VIOLATION';
  readonly messageFa: string;
}
export interface ResolvedResearchDbResult { readonly ok: true; readonly db: D1Database; readonly bindingUsed: 'RESEARCH_DB'; }
export interface ResolvedNeighborhoodDbResult { readonly ok: true; readonly db: D1Database; readonly bindingUsed: 'NEIGHBORHOOD_DB'; }

function userDb(env: WorkerEnv): D1Database | undefined { return env.USER_DB ?? env.DB; }

/** USER_DB and legacy DB are aliases; RESEARCH_DB and NEIGHBORHOOD_DB must be physically isolated. */
export function hasUserResearchBindingCollision(env: WorkerEnv): boolean {
  const user = userDb(env);
  if (env.USER_DB && env.DB && env.USER_DB !== env.DB) return true;
  if (user && env.RESEARCH_DB && user === env.RESEARCH_DB) return true;
  if (user && env.NEIGHBORHOOD_DB && user === env.NEIGHBORHOOD_DB) return true;
  if (env.RESEARCH_DB && env.NEIGHBORHOOD_DB && env.RESEARCH_DB === env.NEIGHBORHOOD_DB) return true;
  return false;
}
export function resolveUserDb(env: WorkerEnv): D1Database | undefined {
  return hasUserResearchBindingCollision(env) ? undefined : userDb(env);
}
export function getUserDbBindingSource(env: WorkerEnv): UserDbBindingSource {
  if (env.USER_DB) return 'USER_DB';
  if (env.DB) return 'DB';
  return 'NONE';
}
export function requireUserDb(env: WorkerEnv): ResolvedUserDbResult | MissingDbResult {
  if (hasUserResearchBindingCollision(env)) return {
    ok: false, statusCode: 503, code: 'DOMAIN_BINDING_ISOLATION_VIOLATION',
    messageFa: 'خطای ایزوله‌سازی پایگاه داده: USER_DB، RESEARCH_DB و NEIGHBORHOOD_DB باید مستقل باشند.',
  };
  const db = userDb(env);
  if (db) return { ok: true, db, bindingUsed: env.USER_DB ? 'USER_DB' : 'DB' };
  return { ok: false, statusCode: 503, code: 'USER_DB_NOT_BOUND', messageFa: 'پایگاه داده کاربری (USER_DB) متصل نیست.' };
}
export function resolveResearchDb(env: WorkerEnv): D1Database | undefined {
  return hasUserResearchBindingCollision(env) ? undefined : env.RESEARCH_DB;
}
export function requireResearchDb(env: WorkerEnv): ResolvedResearchDbResult | MissingDbResult {
  if (hasUserResearchBindingCollision(env)) return {
    ok: false, statusCode: 503, code: 'DOMAIN_BINDING_ISOLATION_VIOLATION',
    messageFa: 'خطای ایزوله‌سازی پایگاه داده: RESEARCH_DB نباید با دامنه دیگری مشترک باشد.',
  };
  if (env.RESEARCH_DB) return { ok: true, db: env.RESEARCH_DB, bindingUsed: 'RESEARCH_DB' };
  return { ok: false, statusCode: 503, code: 'RESEARCH_DB_NOT_BOUND', messageFa: 'پایگاه داده پژوهشی متصل نیست.' };
}
export function requireNeighborhoodDb(env: WorkerEnv): ResolvedNeighborhoodDbResult | MissingDbResult {
  if (hasUserResearchBindingCollision(env)) return {
    ok: false, statusCode: 503, code: 'DOMAIN_BINDING_ISOLATION_VIOLATION',
    messageFa: 'خطای ایزوله‌سازی: NEIGHBORHOOD_DB باید مستقل از USER_DB و RESEARCH_DB باشد.',
  };
  if (env.NEIGHBORHOOD_DB) return { ok: true, db: env.NEIGHBORHOOD_DB, bindingUsed: 'NEIGHBORHOOD_DB' };
  return { ok: false, statusCode: 503, code: 'NEIGHBORHOOD_DB_NOT_BOUND', messageFa: 'پایگاه داده جغرافیایی متصل نیست.' };
}
export interface TriadDomainBindingDiagnostics {
  readonly userDbBound: boolean; readonly userDbSource: UserDbBindingSource;
  readonly legacyDbAliasBound: boolean; readonly researchDbBound: boolean;
  readonly neighborhoodDbBound: boolean; readonly isolationViolation: boolean;
  readonly irniDirectDbBindingPresent: true;
}
export function getTriadDomainBindingDiagnostics(env: WorkerEnv): TriadDomainBindingDiagnostics {
  const isolationViolation = hasUserResearchBindingCollision(env);
  return {
    userDbBound: Boolean(userDb(env)) && !isolationViolation,
    userDbSource: getUserDbBindingSource(env),
    legacyDbAliasBound: Boolean(env.DB),
    researchDbBound: Boolean(env.RESEARCH_DB) && !isolationViolation,
    neighborhoodDbBound: Boolean(env.NEIGHBORHOOD_DB) && !isolationViolation,
    isolationViolation,
    irniDirectDbBindingPresent: Boolean(env.NEIGHBORHOOD_DB),
  };
}

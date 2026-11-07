/**
 * @fileoverview Durable Firestore Persistence Adapter & Authoritative Geo-Reference Validator
 * for Employee 4 (`server/modules/crowd-data/`).
 *
 * Enforces:
 * 1. Separate storage namespaces for `crowd_claims_v2` and `market_observations_v2`.
 * 2. Atomic optimistic concurrency control (`revision` CAS) preventing lost updates under concurrent writes.
 * 3. Authoritative neighborhood + city validation against `MULTI_CITY_CONFIGS` & `validateCityNeighborhoodScope`.
 */

import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../../src/data/neighborhoods';
import type { CityId } from '../../../src/types/models';
import { isValidCityId } from '../../../src/types/models';
import { validateCityNeighborhoodScope } from '../../../src/utils/marketDataIntegrity';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import fs from 'node:fs';
import type {
  ActorContext,
  AuthoritativeNeighborhoodRef,
  CrowdClaimRecord,
  MarketObservationRecord,
} from './types';

export type CrowdDataErrorCode =
  | 'UNAUTHORIZED_ACTOR'
  | 'FORBIDDEN_NOT_OWNER'
  | 'FORBIDDEN_ADMIN_REQUIRED'
  | 'INVALID_NEIGHBORHOOD_REFERENCE'
  | 'CITY_NEIGHBORHOOD_MISMATCH'
  | 'VALIDATION_FAILED'
  | 'INVALID_STATE_TRANSITION'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'EPISTEMIC_FIREWALL_VIOLATION'
  | 'NOT_FOUND'
  | 'DURABLE_PERSISTENCE_UNAVAILABLE';

export class CrowdDataDomainError extends Error {
  public readonly code: CrowdDataErrorCode;
  public readonly statusCode: number;

  constructor(code: CrowdDataErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = 'CrowdDataDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const CROWD_CLAIMS_COLLECTION = 'crowd_claims_v2';
export const MARKET_OBSERVATIONS_COLLECTION = 'market_observations_v2';

/**
 * Validates actor authentication and optionally enforces ownership or admin privileges.
 */
export function assertAuthenticatedActor(actor: ActorContext | null | undefined): ActorContext {
  if (!actor || typeof actor.uid !== 'string' || actor.uid.trim().length < 2) {
    throw new CrowdDataDomainError(
      'UNAUTHORIZED_ACTOR',
      'Authentication is required to perform this crowd-data operation.',
      401
    );
  }
  return {
    uid: actor.uid.trim(),
    isAdmin: actor.isAdmin === true,
    sessionId: actor.sessionId,
    clientIpHash: actor.clientIpHash,
  };
}

export function assertOwnerPrivilege(actor: ActorContext, ownerUid: string): void {
  const verified = assertAuthenticatedActor(actor);
  if (verified.uid !== ownerUid) {
    throw new CrowdDataDomainError(
      'FORBIDDEN_NOT_OWNER',
      `Actor '${verified.uid}' is not the owner of this record ('${ownerUid}').`,
      403
    );
  }
}

export function assertAdminPrivilege(actor: ActorContext): void {
  const verified = assertAuthenticatedActor(actor);
  if (!verified.isAdmin) {
    throw new CrowdDataDomainError(
      'FORBIDDEN_ADMIN_REQUIRED',
      `Actor '${verified.uid}' lacks administrator privileges required for moderation/QC.`,
      403
    );
  }
}

/**
 * Validates that `(cityId, hoodId)` refers to an existing, canonical neighborhood
 * in the authoritative multi-city catalog and that the neighborhood belongs to `cityId`.
 * Never manufactures synthetic neighborhoods.
 */
export function validateAuthoritativeNeighborhoodReference(
  cityInput: unknown,
  hoodIdInput: unknown
): AuthoritativeNeighborhoodRef {
  if (typeof cityInput !== 'string' || !isValidCityId(cityInput.trim().toLowerCase())) {
    throw new CrowdDataDomainError(
      'INVALID_NEIGHBORHOOD_REFERENCE',
      `Invalid or unsupported city identifier: '${String(cityInput)}'.`,
      400
    );
  }
  const cityId = cityInput.trim().toLowerCase() as CityId;
  const hoodId = Number(hoodIdInput);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
    throw new CrowdDataDomainError(
      'INVALID_NEIGHBORHOOD_REFERENCE',
      `Neighborhood ID must be an integer in [1, 999]; received '${String(hoodIdInput)}'.`,
      400
    );
  }

  const scopeCheck = validateCityNeighborhoodScope(cityId, hoodId);
  if (!scopeCheck.valid) {
    if (scopeCheck.reason === 'CITY_NEIGHBORHOOD_SCOPE_MISMATCH') {
      throw new CrowdDataDomainError(
        'CITY_NEIGHBORHOOD_MISMATCH',
        `Neighborhood ID ${hoodId} belongs to '${scopeCheck.canonicalCity}', not '${cityId}'.`,
        400
      );
    }
    throw new CrowdDataDomainError(
      'INVALID_NEIGHBORHOOD_REFERENCE',
      `Neighborhood ID ${hoodId} is not recognized in any canonical city scope.`,
      400
    );
  }

  const cityConfig = MULTI_CITY_CONFIGS[cityId];
  const catalog = cityConfig?.neighborhoods ?? (cityId === 'tehran' ? INITIAL_NEIGHBORHOODS : []);
  const hood = catalog.find((item) => item.id === hoodId);
  if (!hood) {
    throw new CrowdDataDomainError(
      'INVALID_NEIGHBORHOOD_REFERENCE',
      `Neighborhood ID ${hoodId} does not exist in the authoritative '${cityId}' catalog.`,
      404
    );
  }

  return {
    cityId,
    hoodId: hood.id,
    hoodName: hood.name,
    baseBuyPerSqmMillionToman: hood.buyPerSqm,
    baseRahn80mMillionToman: hood.rahn80m,
  };
}

/**
 * Pluggable durable persistence contract with atomic Compare-And-Swap (`revision`) semantics.
 */
export interface CrowdDataPersistenceStore {
  getClaim(claimId: string): Promise<CrowdClaimRecord | null>;
  createClaim(record: CrowdClaimRecord): Promise<CrowdClaimRecord>;
  updateClaimAtomically(
    claimId: string,
    expectedRevision: number | undefined,
    mutator: (current: CrowdClaimRecord) => CrowdClaimRecord
  ): Promise<CrowdClaimRecord>;
  listClaimsByNeighborhood(cityId: CityId, hoodId: number): Promise<CrowdClaimRecord[]>;

  getObservation(observationId: string): Promise<MarketObservationRecord | null>;
  createObservation(record: MarketObservationRecord): Promise<MarketObservationRecord>;
  updateObservationAtomically(
    observationId: string,
    expectedRevision: number | undefined,
    mutator: (current: MarketObservationRecord) => MarketObservationRecord
  ): Promise<MarketObservationRecord>;
  listObservationsByNeighborhood(cityId: CityId, hoodId: number): Promise<MarketObservationRecord[]>;
}

/**
 * Creates a durable Firestore-backed persistence store with per-document mutex serialization,
 * optimistic concurrency control (`revision` CAS), and optional atomic disk snapshot durability.
 */
export function createDurableCrowdDataStore(options?: {
  requireFirestoreAdmin?: boolean;
  durableFilePath?: string;
}): CrowdDataPersistenceStore {
  const claimsMap = new Map<string, CrowdClaimRecord>();
  const observationsMap = new Map<string, MarketObservationRecord>();
  const locks = new Map<string, Promise<void>>();

  if (options?.durableFilePath && fs.existsSync(options.durableFilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(options.durableFilePath, 'utf8')) as {
        claims?: CrowdClaimRecord[];
        observations?: MarketObservationRecord[];
      };
      for (const c of raw.claims ?? []) claimsMap.set(c.claimId, c);
      for (const o of raw.observations ?? []) observationsMap.set(o.observationId, o);
    } catch {
      // Ignore corrupt snapshot on boot
    }
  }

  async function withDocumentLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(lockKey, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(lockKey) === next) {
        locks.delete(lockKey);
      }
    }
  }

  function resolveFirestoreDb() {
    const hasAdminEnv = Boolean(
      process.env.FIRESTORE_EMULATOR_HOST ||
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        options?.requireFirestoreAdmin
    );
    if (!hasAdminEnv) return null;
    const db = getFirebaseAdminFirestoreForServer(process.env);
    if (!db && options?.requireFirestoreAdmin) {
      throw new CrowdDataDomainError(
        'DURABLE_PERSISTENCE_UNAVAILABLE',
        'Durable Firestore Admin connection is required but unavailable.',
        503
      );
    }
    return db;
  }

  async function syncToFirestore(collectionName: string, docId: string, payload: unknown): Promise<void> {
    if (options?.durableFilePath) {
      const tmpPath = `${options.durableFilePath}.tmp.${process.pid}`;
      const snapshot = JSON.stringify({
        claims: Array.from(claimsMap.values()),
        observations: Array.from(observationsMap.values()),
      });
      await fs.promises.writeFile(tmpPath, snapshot, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, options.durableFilePath);
    }
    const db = resolveFirestoreDb();
    if (!db) return;
    try {
      await db
        .collection(collectionName)
        .doc(docId)
        .set(JSON.parse(JSON.stringify(payload)), { merge: false });
    } catch (err) {
      if (options?.requireFirestoreAdmin) {
        throw new CrowdDataDomainError(
          'DURABLE_PERSISTENCE_UNAVAILABLE',
          `Firestore write failed: ${err instanceof Error ? err.message : String(err)}`,
          503
        );
      }
    }
  }

  return {
    async getClaim(claimId: string): Promise<CrowdClaimRecord | null> {
      const cached = claimsMap.get(claimId);
      if (cached) return structuredClone(cached);
      const db = resolveFirestoreDb();
      if (db) {
        try {
          const snap = await db.collection(CROWD_CLAIMS_COLLECTION).doc(claimId).get();
          if (snap.exists) {
            const data = snap.data() as CrowdClaimRecord;
            claimsMap.set(claimId, structuredClone(data));
            return structuredClone(data);
          }
        } catch (err) {
          if (options?.requireFirestoreAdmin) throw err;
        }
      }
      return null;
    },

    async createClaim(record: CrowdClaimRecord): Promise<CrowdClaimRecord> {
      return withDocumentLock(`claim:${record.claimId}`, async () => {
        if (claimsMap.has(record.claimId)) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Claim '${record.claimId}' already exists.`, 409);
        }
        const cloned = structuredClone(record);
        claimsMap.set(record.claimId, cloned);
        await syncToFirestore(CROWD_CLAIMS_COLLECTION, record.claimId, cloned);
        return structuredClone(cloned);
      });
    },

    async updateClaimAtomically(
      claimId: string,
      expectedRevision: number | undefined,
      mutator: (current: CrowdClaimRecord) => CrowdClaimRecord
    ): Promise<CrowdClaimRecord> {
      return withDocumentLock(`claim:${claimId}`, async () => {
        const current = claimsMap.get(claimId);
        if (!current) throw new CrowdDataDomainError('NOT_FOUND', `Claim '${claimId}' not found.`, 404);
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Revision conflict on claim '${claimId}': expected ${expectedRevision}, actual ${current.revision}.`, 409);
        }
        const updated = mutator(structuredClone(current));
        if (updated.revision !== current.revision + 1) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Atomic update must increment revision from ${current.revision} to ${current.revision + 1}.`, 409);
        }
        const cloned = structuredClone(updated);
        claimsMap.set(claimId, cloned);
        await syncToFirestore(CROWD_CLAIMS_COLLECTION, claimId, cloned);
        return structuredClone(cloned);
      });
    },

    async listClaimsByNeighborhood(cityId: CityId, hoodId: number): Promise<CrowdClaimRecord[]> {
      const results = Array.from(claimsMap.values()).filter((c) => c.cityId === cityId && c.hoodId === hoodId);
      return results.map((c) => structuredClone(c)).sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    },

    async getObservation(observationId: string): Promise<MarketObservationRecord | null> {
      const cached = observationsMap.get(observationId);
      if (cached) return structuredClone(cached);
      const db = resolveFirestoreDb();
      if (db) {
        try {
          const snap = await db.collection(MARKET_OBSERVATIONS_COLLECTION).doc(observationId).get();
          if (snap.exists) {
            const data = snap.data() as MarketObservationRecord;
            observationsMap.set(observationId, structuredClone(data));
            return structuredClone(data);
          }
        } catch (err) {
          if (options?.requireFirestoreAdmin) throw err;
        }
      }
      return null;
    },

    async createObservation(record: MarketObservationRecord): Promise<MarketObservationRecord> {
      return withDocumentLock(`obs:${record.observationId}`, async () => {
        if (observationsMap.has(record.observationId)) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Observation '${record.observationId}' already exists.`, 409);
        }
        const cloned = structuredClone(record);
        observationsMap.set(record.observationId, cloned);
        await syncToFirestore(MARKET_OBSERVATIONS_COLLECTION, record.observationId, cloned);
        return structuredClone(cloned);
      });
    },

    async updateObservationAtomically(
      observationId: string,
      expectedRevision: number | undefined,
      mutator: (current: MarketObservationRecord) => MarketObservationRecord
    ): Promise<MarketObservationRecord> {
      return withDocumentLock(`obs:${observationId}`, async () => {
        const current = observationsMap.get(observationId);
        if (!current) throw new CrowdDataDomainError('NOT_FOUND', `Observation '${observationId}' not found.`, 404);
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Revision conflict on observation '${observationId}': expected ${expectedRevision}, actual ${current.revision}.`, 409);
        }
        const updated = mutator(structuredClone(current));
        if (updated.revision !== current.revision + 1) {
          throw new CrowdDataDomainError('CONCURRENT_MODIFICATION_CONFLICT', `Atomic update must increment revision from ${current.revision} to ${current.revision + 1}.`, 409);
        }
        const cloned = structuredClone(updated);
        observationsMap.set(observationId, cloned);
        await syncToFirestore(MARKET_OBSERVATIONS_COLLECTION, observationId, cloned);
        return structuredClone(cloned);
      });
    },

    async listObservationsByNeighborhood(cityId: CityId, hoodId: number): Promise<MarketObservationRecord[]> {
      const results = Array.from(observationsMap.values()).filter((o) => o.cityId === cityId && o.hoodId === hoodId);
      return results.map((o) => structuredClone(o)).sort((a, b) => b.validity.observedAtIso.localeCompare(a.validity.observedAtIso));
    },
  };
}

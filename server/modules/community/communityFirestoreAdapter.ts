/** @file server/modules/community/communityFirestoreAdapter.ts — Unified Firestore Adapter & Fail-Closed Store Abstraction (Stage 3) */
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';

export const SOCIAL_COLLECTIONS = {
  posts: 'socialPosts',
  comments: 'socialComments',
  reactions: 'socialReactions',
  follows: 'socialFollows',
  reports: 'socialReports',
  moderationCases: 'socialModerationCases',
  moderationEvents: 'socialModerationEvents',
  outbox: 'socialOutbox',
  profiles: 'socialProfiles',
  idempotency: 'socialIdempotency',
} as const;

export type SocialCollectionName = (typeof SOCIAL_COLLECTIONS)[keyof typeof SOCIAL_COLLECTIONS];

export class CommunityDatabaseUnavailableError extends Error {
  public readonly statusCode = 503;
  public readonly code = 'COMMUNITY_DATABASE_UNAVAILABLE';
  constructor(message = 'پایگاه‌داده انجمن در حال حاضر در دسترس نیست.', public readonly causeError?: unknown) {
    super(message);
    this.name = 'CommunityDatabaseUnavailableError';
  }
}

export class CommunityHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    public readonly messageFa: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(messageFa);
    this.name = 'CommunityHttpError';
  }
}

export interface CommunityQueryFilter {
  field: string;
  op: '==' | '!=' | 'in' | 'array-contains';
  value: unknown;
}

export interface CommunityQueryOptions {
  filters?: CommunityQueryFilter[];
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  cursorDocId?: string | null;
}

export interface CommunityQueryPage<T extends Record<string, unknown>> {
  items: Array<T & { id: string }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunityTransaction {
  get<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string): Promise<(T & { id: string }) | null>;
  set<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T): void;
  update(col: SocialCollectionName, docId: string, patch: Record<string, unknown>): void;
  delete(col: SocialCollectionName, docId: string): void;
  incrementNumeric(col: SocialCollectionName, docId: string, deltas: Record<string, number>): void;
}

export interface CommunityDatabaseStore {
  readonly backendKind: 'firestore' | 'mock_firestore';
  getDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string): Promise<(T & { id: string }) | null>;
  queryDocs<T extends Record<string, unknown>>(col: SocialCollectionName, options?: CommunityQueryOptions): Promise<CommunityQueryPage<T>>;
  setDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T, merge?: boolean): Promise<void>;
  createIfMissing<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T): Promise<boolean>;
  runTransaction<R>(fn: (tx: CommunityTransaction) => Promise<R>): Promise<R>;
  healthCheck(): Promise<{ ok: boolean; backendKind: string; latencyMs: number; errorCode?: string }>;
  clearAllForTests?(): void;
}

export const MAX_COMMUNITY_QUERY_LIMIT = 50;
export const DEFAULT_COMMUNITY_QUERY_LIMIT = 20;

export function clampCommunityLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_COMMUNITY_QUERY_LIMIT;
  return Math.min(MAX_COMMUNITY_QUERY_LIMIT, Math.floor(n));
}

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function getNestedField(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let curr: unknown = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = (curr as Record<string, unknown>)[part];
  }
  return curr;
}

function setNestedField(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let curr: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!curr[p] || typeof curr[p] !== 'object' || Array.isArray(curr[p])) {
      curr[p] = {};
    }
    curr = curr[p] as Record<string, unknown>;
  }
  curr[parts[parts.length - 1]] = value;
}

function matchesFilter(doc: Record<string, unknown>, filter: CommunityQueryFilter): boolean {
  const actual = getNestedField(doc, filter.field);
  if (filter.op === '==') return actual === filter.value;
  if (filter.op === '!=') return actual !== filter.value;
  if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(actual);
  if (filter.op === 'array-contains') return Array.isArray(actual) && actual.includes(filter.value);
  return false;
}

export class FirestoreAdminCommunityStore implements CommunityDatabaseStore {
  public readonly backendKind = 'firestore' as const;

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  private getDb() {
    try {
      return getFirebaseAdminFirestoreForServer(this.env);
    } catch (err) {
      throw new CommunityDatabaseUnavailableError('اتصال به Firestore در دسترس نیست (Fail-Closed).', err);
    }
  }

  async getDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string): Promise<(T & { id: string }) | null> {
    try {
      const snap = await this.getDb().collection(col).doc(docId).get();
      if (!snap.exists) return null;
      return { ...(snap.data() as T), id: snap.id };
    } catch (err) {
      if (err instanceof CommunityDatabaseUnavailableError) throw err;
      throw new CommunityDatabaseUnavailableError('خواندن سند از Firestore ناموفق بود.', err);
    }
  }

  async queryDocs<T extends Record<string, unknown>>(col: SocialCollectionName, options: CommunityQueryOptions = {}): Promise<CommunityQueryPage<T>> {
    try {
      const db = this.getDb();
      const limit = clampCommunityLimit(options.limit);
      let ref: FirebaseFirestore.Query = db.collection(col);
      for (const f of options.filters ?? []) {
        ref = ref.where(f.field, f.op, f.value);
      }
      if (options.orderByField) {
        ref = ref.orderBy(options.orderByField, options.orderDirection ?? 'desc');
      }
      if (options.cursorDocId) {
        const cursorSnap = await db.collection(col).doc(options.cursorDocId).get();
        if (cursorSnap.exists) ref = ref.startAfter(cursorSnap);
      }
      const snap = await ref.limit(limit + 1).get();
      const hasMore = snap.docs.length > limit;
      const slice = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const items = slice.map((d) => ({ ...(d.data() as T), id: d.id }));
      return { items, nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].id : null, hasMore };
    } catch (err) {
      if (err instanceof CommunityDatabaseUnavailableError) throw err;
      throw new CommunityDatabaseUnavailableError('اجرای کوئری روی Firestore ناموفق بود.', err);
    }
  }

  async setDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T, merge = false): Promise<void> {
    try {
      await this.getDb().collection(col).doc(docId).set(data, { merge });
    } catch (err) {
      if (err instanceof CommunityDatabaseUnavailableError) throw err;
      throw new CommunityDatabaseUnavailableError('ذخیره‌سازی سند در Firestore ناموفق بود.', err);
    }
  }

  async createIfMissing<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T): Promise<boolean> {
    return this.runTransaction(async (tx) => {
      const existing = await tx.get(col, docId);
      if (existing) return false;
      tx.set(col, docId, data);
      return true;
    });
  }

  async runTransaction<R>(fn: (tx: CommunityTransaction) => Promise<R>): Promise<R> {
    const db = this.getDb();
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      return await db.runTransaction(async (fsTx) => {
        const wrapper: CommunityTransaction = {
          get: async <T extends Record<string, unknown>>(col: SocialCollectionName, docId: string) => {
            const snap = await fsTx.get(db.collection(col).doc(docId));
            return snap.exists ? ({ ...(snap.data() as T), id: snap.id }) : null;
          },
          set: (col, docId, data) => {
            fsTx.set(db.collection(col).doc(docId), data);
          },
          update: (col, docId, patch) => {
            fsTx.update(db.collection(col).doc(docId), patch);
          },
          delete: (col, docId) => {
            fsTx.delete(db.collection(col).doc(docId));
          },
          incrementNumeric: (col, docId, deltas) => {
            const patch: Record<string, unknown> = {};
            for (const [field, delta] of Object.entries(deltas)) {
              patch[field] = FieldValue.increment(delta);
            }
            fsTx.update(db.collection(col).doc(docId), patch);
          },
        };
        return fn(wrapper);
      });
    } catch (err) {
      if (err instanceof CommunityHttpError || err instanceof CommunityDatabaseUnavailableError) throw err;
      throw new CommunityDatabaseUnavailableError('تراکنش Firestore با خطا مواجه شد.', err);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; backendKind: string; latencyMs: number; errorCode?: string }> {
    const start = Date.now();
    try {
      await this.getDb().collection(SOCIAL_COLLECTIONS.posts).limit(1).get();
      return { ok: true, backendKind: this.backendKind, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        backendKind: this.backendKind,
        latencyMs: Date.now() - start,
        errorCode: err instanceof CommunityDatabaseUnavailableError ? err.code : 'FIRESTORE_UNREACHABLE',
      };
    }
  }
}

export class MockFirestoreCommunityStore implements CommunityDatabaseStore {
  public readonly backendKind = 'mock_firestore' as const;
  private collections = new Map<SocialCollectionName, Map<string, Record<string, unknown>>>();
  private simulatedUnavailable = false;

  constructor() {
    for (const col of Object.values(SOCIAL_COLLECTIONS)) {
      this.collections.set(col, new Map());
    }
  }

  public setSimulatedUnavailable(unavailable: boolean): void {
    this.simulatedUnavailable = unavailable;
  }

  public clearAllForTests(): void {
    this.simulatedUnavailable = false;
    for (const map of this.collections.values()) map.clear();
  }

  private assertAvailable(): void {
    if (this.simulatedUnavailable) {
      throw new CommunityDatabaseUnavailableError('اتصال شبیه‌ساز Firestore موقتاً قطع است (Fail-Closed).');
    }
  }

  private colMap(col: SocialCollectionName): Map<string, Record<string, unknown>> {
    let map = this.collections.get(col);
    if (!map) {
      map = new Map();
      this.collections.set(col, map);
    }
    return map;
  }

  async getDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string): Promise<(T & { id: string }) | null> {
    this.assertAvailable();
    const raw = this.colMap(col).get(docId);
    return raw ? ({ ...(deepClone(raw) as T), id: docId }) : null;
  }

  async queryDocs<T extends Record<string, unknown>>(col: SocialCollectionName, options: CommunityQueryOptions = {}): Promise<CommunityQueryPage<T>> {
    this.assertAvailable();
    const limit = clampCommunityLimit(options.limit);
    const filters = options.filters ?? [];
    let docs = Array.from(this.colMap(col).entries())
      .map(([id, data]) => ({ ...(deepClone(data) as T), id }))
      .filter((item) => filters.every((f) => matchesFilter(item, f)));

    if (options.orderByField) {
      const dir = options.orderDirection === 'asc' ? 1 : -1;
      docs.sort((a, b) => {
        const va = String(getNestedField(a, options.orderByField!) ?? '');
        const vb = String(getNestedField(b, options.orderByField!) ?? '');
        return va === vb ? a.id.localeCompare(b.id) : va < vb ? -1 * dir : 1 * dir;
      });
    }

    let startIdx = 0;
    if (options.cursorDocId) {
      const idx = docs.findIndex((d) => d.id === options.cursorDocId);
      if (idx >= 0) startIdx = idx + 1;
    }
    const pageSlice = docs.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < docs.length;
    return { items: pageSlice, nextCursor: hasMore && pageSlice.length > 0 ? pageSlice[pageSlice.length - 1].id : null, hasMore };
  }

  async setDoc<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T, merge = false): Promise<void> {
    this.assertAvailable();
    const map = this.colMap(col);
    const existing = merge ? map.get(docId) : undefined;
    map.set(docId, existing ? { ...deepClone(existing), ...deepClone(data), id: docId } : { ...deepClone(data), id: docId });
  }

  async createIfMissing<T extends Record<string, unknown>>(col: SocialCollectionName, docId: string, data: T): Promise<boolean> {
    this.assertAvailable();
    const map = this.colMap(col);
    if (map.has(docId)) return false;
    map.set(docId, { ...deepClone(data), id: docId });
    return true;
  }

  async runTransaction<R>(fn: (tx: CommunityTransaction) => Promise<R>): Promise<R> {
    this.assertAvailable();
    const stagedOps: Array<() => void> = [];
    const tx: CommunityTransaction = {
      get: async <T extends Record<string, unknown>>(col: SocialCollectionName, docId: string) => {
        this.assertAvailable();
        const raw = this.colMap(col).get(docId);
        return raw ? ({ ...(deepClone(raw) as T), id: docId }) : null;
      },
      set: (col, docId, data) => {
        stagedOps.push(() => {
          this.colMap(col).set(docId, { ...deepClone(data), id: docId });
        });
      },
      update: (col, docId, patch) => {
        stagedOps.push(() => {
          const map = this.colMap(col);
          const cur = map.get(docId);
          if (!cur) throw new CommunityHttpError(404, 'DOCUMENT_NOT_FOUND', 'سند موردنظر یافت نشد.');
          const copy = deepClone(cur);
          for (const [k, v] of Object.entries(patch)) {
            if (k.includes('.')) setNestedField(copy, k, deepClone(v));
            else copy[k] = deepClone(v);
          }
          map.set(docId, copy);
        });
      },
      delete: (col, docId) => {
        stagedOps.push(() => {
          this.colMap(col).delete(docId);
        });
      },
      incrementNumeric: (col, docId, deltas) => {
        stagedOps.push(() => {
          const map = this.colMap(col);
          const cur = map.get(docId);
          if (!cur) throw new CommunityHttpError(404, 'DOCUMENT_NOT_FOUND', 'سند برای به‌روزرسانی شمارنده یافت نشد.');
          const copy = deepClone(cur);
          for (const [dotField, delta] of Object.entries(deltas)) {
            const prev = Number(getNestedField(copy, dotField) ?? 0);
            setNestedField(copy, dotField, Math.max(0, prev + delta));
          }
          map.set(docId, copy);
        });
      },
    };
    const result = await fn(tx);
    for (const op of stagedOps) op();
    return result;
  }

  async healthCheck(): Promise<{ ok: boolean; backendKind: string; latencyMs: number; errorCode?: string }> {
    return this.simulatedUnavailable
      ? { ok: false, backendKind: this.backendKind, latencyMs: 0, errorCode: 'COMMUNITY_DATABASE_UNAVAILABLE' }
      : { ok: true, backendKind: this.backendKind, latencyMs: 1 };
  }
}

export function shouldUseRealFirestoreByDefault(env: Record<string, string | undefined> = process.env): boolean {
  if (env.COMMUNITY_REQUIRE_FIRESTORE === 'true') return true;
  if (env.NODE_ENV === 'production') return true;
  if (Boolean(env.FIRESTORE_EMULATOR_HOST?.trim())) return true;
  if (Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim())) return true;
  return false;
}

export function createDefaultCommunityDatabaseStore(env: Record<string, string | undefined> = process.env): CommunityDatabaseStore {
  return shouldUseRealFirestoreByDefault(env)
    ? new FirestoreAdminCommunityStore(env)
    : new MockFirestoreCommunityStore();
}

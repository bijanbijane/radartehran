/**
 * @file server/modules/real-estate-transactions/productionCrossModuleAdapters.ts
 * @description RT-TRANSACTION-CRITICAL-030 — Real Firestore-backed Cross-Module Adapters
 * and Native/Strict Firestore Document Engine for Real Estate Transactions.
 * Zero mock prefix checks (`startsWith('confirmed-pay-')`, etc.) are allowed here.
 */
import crypto from 'node:crypto';
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type {
  BrokerageOperationsTransactionAdapter,
  MediaTransactionAdapter,
  NotificationsTransactionAdapter,
  PaymentsTransactionAdapter,
  PropertyOwnershipTransactionAdapter,
  PropertyRegistryTransactionAdapter,
  RealEstateTransactionCrossModuleAdapters,
} from './store';
import { RealEstateTransactionError } from './types';

export interface FirestoreQueryFilterLike {
  field: string;
  op: '==' | '!=' | 'in' | 'array-contains';
  value: unknown;
}

export interface FirestoreTransactionHandle {
  get<T extends Record<string, unknown>>(collection: string, docId: string): Promise<(T & { id: string }) | null>;
  query<T extends Record<string, unknown>>(
    collection: string,
    filters: FirestoreQueryFilterLike[],
    limit?: number,
  ): Promise<Array<T & { id: string }>>;
  set<T extends Record<string, unknown>>(collection: string, docId: string, data: T): void;
  update(collection: string, docId: string, patch: Record<string, unknown>): void;
  delete(collection: string, docId: string): void;
}

export interface DurableFirestoreEngine {
  readonly kind: 'firestore_admin' | 'strict_firestore_test_engine';
  getDoc<T extends Record<string, unknown>>(collection: string, docId: string): Promise<(T & { id: string }) | null>;
  queryDocs<T extends Record<string, unknown>>(
    collection: string,
    filters: FirestoreQueryFilterLike[],
    options?: { orderByField?: string; orderDirection?: 'asc' | 'desc'; limit?: number; cursorDocId?: string | null },
  ): Promise<{ items: Array<T & { id: string }>; nextCursor: string | null; hasMore: boolean }>;
  setDoc<T extends Record<string, unknown>>(collection: string, docId: string, data: T): Promise<void>;
  runTransaction<R>(fn: (tx: FirestoreTransactionHandle) => Promise<R>): Promise<R>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matchesFilter(doc: Record<string, unknown>, f: FirestoreQueryFilterLike): boolean {
  const actual = doc[f.field];
  if (f.op === '==') return actual === f.value;
  if (f.op === '!=') return actual !== f.value;
  if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(actual);
  if (f.op === 'array-contains') return Array.isArray(actual) && actual.includes(f.value);
  return false;
}

/**
 * Wraps real Firebase Admin Firestore (Production & Firestore Emulator).
 */
export function createNativeFirestoreBackingAdapter(db: AdminFirestore): DurableFirestoreEngine {
  return {
    kind: 'firestore_admin',
    async getDoc<T extends Record<string, unknown>>(collection: string, docId: string) {
      const snap = await db.collection(collection).doc(docId).get();
      return snap.exists ? ({ ...(snap.data() as T), id: snap.id }) : null;
    },
    async queryDocs<T extends Record<string, unknown>>(
      collection: string,
      filters: FirestoreQueryFilterLike[],
      options: { orderByField?: string; orderDirection?: 'asc' | 'desc'; limit?: number; cursorDocId?: string | null } = {},
    ) {
      const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 20)));
      let ref: FirebaseFirestore.Query = db.collection(collection);
      for (const f of filters) ref = ref.where(f.field, f.op, f.value);
      if (options.orderByField) ref = ref.orderBy(options.orderByField, options.orderDirection ?? 'desc');
      if (options.cursorDocId) {
        const cursorSnap = await db.collection(collection).doc(options.cursorDocId).get();
        if (cursorSnap.exists) ref = ref.startAfter(cursorSnap);
      }
      const snap = await ref.limit(limit + 1).get();
      const hasMore = snap.docs.length > limit;
      const slice = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const items = slice.map((d) => ({ ...(d.data() as T), id: d.id }));
      return { items, nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].id : null, hasMore };
    },
    async setDoc<T extends Record<string, unknown>>(collection: string, docId: string, data: T) {
      await db.collection(collection).doc(docId).set(data);
    },
    async runTransaction<R>(fn: (tx: FirestoreTransactionHandle) => Promise<R>): Promise<R> {
      return db.runTransaction(async (fsTx) => {
        const handle: FirestoreTransactionHandle = {
          get: async <T extends Record<string, unknown>>(collection: string, docId: string) => {
            const snap = await fsTx.get(db.collection(collection).doc(docId));
            return snap.exists ? ({ ...(snap.data() as T), id: snap.id }) : null;
          },
          query: async <T extends Record<string, unknown>>(collection, filters, limit) => {
            let ref: FirebaseFirestore.Query = db.collection(collection);
            for (const f of filters) ref = ref.where(f.field, f.op, f.value);
            if (limit) ref = ref.limit(limit);
            const snap = await fsTx.get(ref);
            return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
          },
          set: (collection, docId, data) => {
            fsTx.set(db.collection(collection).doc(docId), data);
          },
          update: (collection, docId, patch) => {
            fsTx.update(db.collection(collection).doc(docId), patch);
          },
          delete: (collection, docId) => {
            fsTx.delete(db.collection(collection).doc(docId));
          },
        };
        return fn(handle);
      });
    },
  };
}

/**
 * Strict Native-Firestore-Semantics test engine (enforces READ_PHASE -> WRITE_PHASE + atomic rollback + restart survival via shared backing map).
 */
export function createStrictFirestoreBackingAdapterForTests(
  sharedBacking?: Map<string, Map<string, Record<string, unknown>>>,
): DurableFirestoreEngine & { backing: Map<string, Map<string, Record<string, unknown>>> } {
  let collections = sharedBacking ?? new Map<string, Map<string, Record<string, unknown>>>();
  let txChain: Promise<unknown> = Promise.resolve();

  const getCol = (root: Map<string, Map<string, Record<string, unknown>>>, name: string) => {
    let m = root.get(name);
    if (!m) {
      m = new Map();
      root.set(name, m);
    }
    return m;
  };

  return {
    kind: 'strict_firestore_test_engine',
    get backing() {
      return collections;
    },
    async getDoc<T extends Record<string, unknown>>(collection: string, docId: string) {
      const raw = collections.get(collection)?.get(docId);
      return raw ? ({ ...(deepClone(raw) as T), id: docId }) : null;
    },
    async queryDocs<T extends Record<string, unknown>>(
      collection: string,
      filters: FirestoreQueryFilterLike[],
      options: { orderByField?: string; orderDirection?: 'asc' | 'desc'; limit?: number; cursorDocId?: string | null } = {},
    ) {
      const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 20)));
      const docs = Array.from((collections.get(collection) ?? new Map()).entries())
        .map(([id, data]) => ({ ...(deepClone(data) as T), id }))
        .filter((item) => filters.every((f) => matchesFilter(item, f)));
      if (options.orderByField) {
        const dir = options.orderDirection === 'asc' ? 1 : -1;
        const field = options.orderByField;
        docs.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * dir || a.id.localeCompare(b.id));
      }
      let start = 0;
      if (options.cursorDocId) {
        const idx = docs.findIndex((d) => d.id === options.cursorDocId);
        if (idx >= 0) start = idx + 1;
      }
      const slice = docs.slice(start, start + limit);
      const hasMore = start + limit < docs.length;
      return { items: slice, nextCursor: hasMore && slice.length > 0 ? slice[slice.length - 1].id : null, hasMore };
    },
    async setDoc<T extends Record<string, unknown>>(collection: string, docId: string, data: T) {
      getCol(collections, collection).set(docId, { ...deepClone(data), id: docId });
    },
    async runTransaction<R>(fn: (tx: FirestoreTransactionHandle) => Promise<R>): Promise<R> {
      const exec = async (): Promise<R> => {
        let phase: 'READ_PHASE' | 'WRITE_PHASE' = 'READ_PHASE';
        const snap = new Map<string, Map<string, Record<string, unknown>>>();
        for (const [col, map] of collections.entries()) {
          const c = new Map<string, Record<string, unknown>>();
          for (const [k, v] of map.entries()) c.set(k, deepClone(v));
          snap.set(col, c);
        }
        const assertRead = () => {
          if (phase === 'WRITE_PHASE') {
            throw new RealEstateTransactionError('PERSISTENCE_FAILURE', 'TRANSACTION_READ_AFTER_WRITE', 500);
          }
        };
        const staged: Array<(target: Map<string, Map<string, Record<string, unknown>>>) => void> = [];
        const handle: FirestoreTransactionHandle = {
          get: async <T extends Record<string, unknown>>(col: string, docId: string) => {
            assertRead();
            const raw = snap.get(col)?.get(docId);
            return raw ? ({ ...(deepClone(raw) as T), id: docId }) : null;
          },
          query: async <T extends Record<string, unknown>>(col, filters, limit) => {
            assertRead();
            const docs = Array.from((snap.get(col) ?? new Map()).entries())
              .map(([id, data]) => ({ ...(deepClone(data) as T), id }))
              .filter((item) => filters.every((f) => matchesFilter(item, f)));
            return limit ? docs.slice(0, limit) : docs;
          },
          set: (col, docId, data) => {
            phase = 'WRITE_PHASE';
            const copy = { ...deepClone(data), id: docId };
            staged.push((t) => { getCol(t, col).set(docId, copy); });
          },
          update: (col, docId, patch) => {
            phase = 'WRITE_PHASE';
            const pCopy = deepClone(patch);
            staged.push((t) => {
              const cur = getCol(t, col).get(docId);
              if (!cur) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Doc ${col}/${docId} missing`, 404);
              getCol(t, col).set(docId, { ...cur, ...pCopy, id: docId });
            });
          },
          delete: (col, docId) => {
            phase = 'WRITE_PHASE';
            staged.push((t) => { getCol(t, col).delete(docId); });
          },
        };
        const result = await fn(handle);
        for (const op of staged) op(snap);
        // Mutate sharedBacking in-place if provided so restarted stores sharing backing see updates
        if (sharedBacking) {
          sharedBacking.clear();
          for (const [k, v] of snap.entries()) sharedBacking.set(k, v);
        } else {
          collections = snap;
        }
        return result;
      };
      const next = txChain.then(exec, exec);
      txChain = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

/**
 * Canonical Real Cross-Module Adapters wired to Firestore collections (ZERO prefix mocks).
 */
export function createCanonicalCrossModuleAdapters(
  engine: DurableFirestoreEngine,
): RealEstateTransactionCrossModuleAdapters {
  const propertyRegistry: PropertyRegistryTransactionAdapter = {
    async verifyCanonicalPropertyExists(propertyId: string): Promise<boolean> {
      if (!propertyId || !propertyId.trim()) return false;
      const doc = await engine.getDoc<Record<string, unknown>>('pr_canonical_properties', propertyId.trim());
      return Boolean(doc && doc.status === 'ACTIVE');
    },
  };

  const propertyOwnership: PropertyOwnershipTransactionAdapter = {
    async verifySellerOrLandlordAuthority(propertyId: string, partyId: string): Promise<boolean> {
      if (!propertyId || !partyId) return false;
      const page = await engine.queryDocs<Record<string, unknown>>('property_ownership_rights', [
        { field: 'propertyId', op: '==', value: propertyId },
        { field: 'partyId', op: '==', value: partyId },
        { field: 'status', op: '==', value: 'ACTIVE' },
      ], { limit: 5 });
      return page.items.some((r) =>
        ['OWNER', 'CO_OWNER', 'AUTHORIZED_LANDLORD', 'AUTHORIZED_REPRESENTATIVE'].includes(String(r.rightType || '')),
      );
    },
    async verifyOwnershipTransferConfirmed(propertyId: string, transferRef: string): Promise<boolean> {
      if (!propertyId || !transferRef) return false;
      const doc = await engine.getDoc<Record<string, unknown>>('property_ownership_transfers', transferRef.trim());
      return Boolean(doc && doc.propertyId === propertyId && doc.status === 'CONFIRMED');
    },
  };

  const brokerageOperations: BrokerageOperationsTransactionAdapter = {
    async verifyBrokerMandateAuthority(propertyId: string, partyId: string, mandateRef?: string): Promise<boolean> {
      if (!propertyId || !partyId) return false;
      const filters: FirestoreQueryFilterLike[] = [
        { field: 'propertyId', op: '==', value: propertyId },
        { field: 'partyId', op: '==', value: partyId },
        { field: 'status', op: '==', value: 'ACTIVE' },
      ];
      const page = await engine.queryDocs<Record<string, unknown>>('brokerage_mandates', filters, { limit: 10 });
      const nowMs = Date.now();
      return page.items.some((m) => {
        if (mandateRef && m.id !== mandateRef && m.mandateCode !== mandateRef) return false;
        if (typeof m.expiresAtIso === 'string' && Date.parse(m.expiresAtIso) <= nowMs) return false;
        return true;
      });
    },
  };

  const payments: PaymentsTransactionAdapter = {
    async verifySettlementOrDepositConfirmed(paymentRef: string): Promise<boolean> {
      if (!paymentRef || !paymentRef.trim()) return false;
      const intent = await engine.getDoc<Record<string, unknown>>('payment_intents', paymentRef.trim());
      return Boolean(intent && intent.status === 'SUCCEEDED' && intent.ledgerCommitted === true);
    },
  };

  const media: MediaTransactionAdapter = {
    async verifyDocumentExists(mediaDocumentId: string): Promise<boolean> {
      if (!mediaDocumentId || !mediaDocumentId.trim()) return false;
      const meta = await engine.getDoc<Record<string, unknown>>('media_object_metadata_v2', mediaDocumentId.trim());
      return Boolean(meta && meta.lifecycleState === 'ACTIVE');
    },
  };

  const notifications: NotificationsTransactionAdapter = {
    async notifyTransactionEvent(eventType: string, recipientPartyIds: string[]): Promise<{ delivered: boolean }> {
      if (!recipientPartyIds.length) return { delivered: false };
      const outboxId = `txout_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await engine.setDoc('real_estate_transaction_outbox', outboxId, {
        id: outboxId,
        eventType,
        recipientPartyIds: [...recipientPartyIds],
        status: 'PENDING_DISPATCH',
        createdAtIso: new Date().toISOString(),
      });
      return { delivered: true };
    },
  };

  return {
    propertyRegistry,
    propertyOwnership,
    brokerageOperations,
    payments,
    media,
    notifications,
  };
}

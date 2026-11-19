import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import {
  CanonicalGeographyLookupAdapter,
  GeographyLookupAdapter,
  PropertyContextReferenceAdapter,
  ReadOnlyInMemoryPropertyContextAdapter,
} from './adapters';
import { RegulatoryApplicabilityAndProfileService } from './applicabilityAndProfileService';
import { FirestoreLegalRegulatoryStore } from './firestoreStore';
import {
  FirestoreLegalRegulatoryTransactionRunner,
  resolveProductionAdminFirestore,
} from './firestoreTransactionRunner';
import { RegulatorySourceAndProvisionService } from './sourceAndProvisionService';
import {
  DeterministicLegalRegulatoryStore,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryStore,
} from './store';
import { LegalRegulatoryError } from './validationAndAuthz';

export * from './types';
export * from './validationAndAuthz';
export * from './adapters';
export * from './transactionalCore';
export * from './firestoreTransactionRunner';
export * from './store';
export * from './firestoreStore';
export * from './applicabilityEngine';
export * from './changeAndConflictEngine';
export * from './searchAndAiEngine';
export * from './sourceAndProvisionService';
export * from './applicabilityAndProfileService';
export * from './actorResolver';
export * from './routeHandlers';
export * from './routes';

export interface LegalRegulatoryModuleFacade {
  readonly store: LegalRegulatoryStore;
  readonly geographyAdapter: GeographyLookupAdapter;
  readonly sourceAndProvisionService: RegulatorySourceAndProvisionService;
  readonly applicabilityAndProfileService: RegulatoryApplicabilityAndProfileService;
  readonly collections: typeof LEGAL_REGULATORY_COLLECTIONS;
}

export interface CreateProductionLegalRegulatoryModuleOptions {
  db?: AdminFirestore;
  transactionRunner?: FirestoreLegalRegulatoryTransactionRunner;
  store?: FirestoreLegalRegulatoryStore;
  geographyAdapter?: GeographyLookupAdapter;
  propertyContextAdapter: PropertyContextReferenceAdapter;
}

/**
 * Production factory for Legal & Regulatory Intelligence.
 * Enforces durable Firestore persistence + native FirestoreLegalRegulatoryTransactionRunner
 * and requires an explicit non-in-memory PropertyContextReferenceAdapter. Zero fallbacks.
 */
export function createProductionLegalRegulatoryModule(
  options: CreateProductionLegalRegulatoryModuleOptions,
): LegalRegulatoryModuleFacade {
  if (!options || !options.propertyContextAdapter) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'Production legal-regulatory module requires an explicit PropertyContextReferenceAdapter.',
      400,
    );
  }
  if (options.propertyContextAdapter instanceof ReadOnlyInMemoryPropertyContextAdapter) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'Production legal-regulatory module cannot use ReadOnlyInMemoryPropertyContextAdapter.',
      400,
    );
  }
  if (options.store && (options.store as unknown) instanceof DeterministicLegalRegulatoryStore) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'Production legal-regulatory module cannot use DeterministicLegalRegulatoryStore.',
      400,
    );
  }
  if (options.store && !(options.store instanceof FirestoreLegalRegulatoryStore)) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'Production legal-regulatory module requires a FirestoreLegalRegulatoryStore instance.',
      400,
    );
  }

  let store: FirestoreLegalRegulatoryStore;
  if (options.store) {
    store = options.store;
  } else {
    const runner =
      options.transactionRunner ??
      new FirestoreLegalRegulatoryTransactionRunner(options.db ?? resolveProductionAdminFirestore());
    store = new FirestoreLegalRegulatoryStore({ transactionRunner: runner });
  }

  const geographyAdapter = options.geographyAdapter ?? new CanonicalGeographyLookupAdapter();
  return {
    store,
    geographyAdapter,
    sourceAndProvisionService: new RegulatorySourceAndProvisionService(store, geographyAdapter),
    applicabilityAndProfileService: new RegulatoryApplicabilityAndProfileService(
      store,
      geographyAdapter,
      options.propertyContextAdapter,
    ),
    collections: LEGAL_REGULATORY_COLLECTIONS,
  };
}

/**
 * Explicit test factory for isolated unit and integration suites.
 */
export function createTestLegalRegulatoryModule(options?: {
  store?: LegalRegulatoryStore;
  geographyAdapter?: GeographyLookupAdapter;
  propertyContextAdapter?: PropertyContextReferenceAdapter;
}): LegalRegulatoryModuleFacade {
  const store = options?.store ?? new DeterministicLegalRegulatoryStore();
  const geographyAdapter = options?.geographyAdapter ?? new CanonicalGeographyLookupAdapter();
  const propertyContextAdapter = options?.propertyContextAdapter;
  return {
    store,
    geographyAdapter,
    sourceAndProvisionService: new RegulatorySourceAndProvisionService(store, geographyAdapter),
    applicabilityAndProfileService: new RegulatoryApplicabilityAndProfileService(
      store,
      geographyAdapter,
      propertyContextAdapter,
    ),
    collections: LEGAL_REGULATORY_COLLECTIONS,
  };
}

/**
 * Backward-compatible facade constructor hardened for Stage 29:
 * - Defaults to fail-closed FirestoreLegalRegulatoryStore (zero implicit in-memory fallback).
 * - Rejects `useInMemoryStore` without explicit test store injection.
 * - Never instantiates `ReadOnlyInMemoryPropertyContextAdapter` implicitly.
 * - Rejects in-memory store or adapter when NODE_ENV === 'production'.
 */
export function createLegalRegulatoryModuleFacade(options?: {
  store?: LegalRegulatoryStore;
  geographyAdapter?: GeographyLookupAdapter;
  propertyContextAdapter?: PropertyContextReferenceAdapter;
  useInMemoryStore?: boolean;
}): LegalRegulatoryModuleFacade {
  const isProd = process.env.NODE_ENV === 'production';

  if (options?.useInMemoryStore && !options?.store) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'In-memory store cannot be enabled implicitly via useInMemoryStore; inject an explicit test store or use createTestLegalRegulatoryModule().',
      400,
    );
  }

  const store = options?.store ?? new FirestoreLegalRegulatoryStore();
  if (isProd && store instanceof DeterministicLegalRegulatoryStore) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'DeterministicLegalRegulatoryStore is prohibited when NODE_ENV=production.',
      400,
    );
  }

  const propertyContextAdapter = options?.propertyContextAdapter;
  if (isProd && propertyContextAdapter instanceof ReadOnlyInMemoryPropertyContextAdapter) {
    throw new LegalRegulatoryError(
      'VALIDATION_ERROR',
      'ReadOnlyInMemoryPropertyContextAdapter is prohibited when NODE_ENV=production.',
      400,
    );
  }

  const geographyAdapter = options?.geographyAdapter ?? new CanonicalGeographyLookupAdapter();
  const sourceAndProvisionService = new RegulatorySourceAndProvisionService(store, geographyAdapter);
  const applicabilityAndProfileService = new RegulatoryApplicabilityAndProfileService(
    store,
    geographyAdapter,
    propertyContextAdapter,
  );

  return {
    store,
    geographyAdapter,
    sourceAndProvisionService,
    applicabilityAndProfileService,
    collections: LEGAL_REGULATORY_COLLECTIONS,
  };
}

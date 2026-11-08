import {
  CanonicalGeographyLookupAdapter,
  GeographyLookupAdapter,
  PropertyContextReferenceAdapter,
  ReadOnlyInMemoryPropertyContextAdapter,
} from './adapters';
import { RegulatoryApplicabilityAndProfileService } from './applicabilityAndProfileService';
import { FirestoreLegalRegulatoryStore } from './firestoreStore';
import { RegulatorySourceAndProvisionService } from './sourceAndProvisionService';
import {
  DeterministicLegalRegulatoryStore,
  LEGAL_REGULATORY_COLLECTIONS,
  LegalRegulatoryStore,
} from './store';

export * from './types';
export * from './validationAndAuthz';
export * from './adapters';
export * from './store';
export * from './firestoreStore';
export * from './applicabilityEngine';
export * from './changeAndConflictEngine';
export * from './searchAndAiEngine';
export * from './sourceAndProvisionService';
export * from './applicabilityAndProfileService';

export interface LegalRegulatoryModuleFacade {
  readonly store: LegalRegulatoryStore;
  readonly geographyAdapter: GeographyLookupAdapter;
  readonly sourceAndProvisionService: RegulatorySourceAndProvisionService;
  readonly applicabilityAndProfileService: RegulatoryApplicabilityAndProfileService;
  readonly collections: typeof LEGAL_REGULATORY_COLLECTIONS;
}

export function createLegalRegulatoryModuleFacade(options?: {
  store?: LegalRegulatoryStore;
  geographyAdapter?: GeographyLookupAdapter;
  propertyContextAdapter?: PropertyContextReferenceAdapter;
  useInMemoryStore?: boolean;
}): LegalRegulatoryModuleFacade {
  const store =
    options?.store ??
    (options?.useInMemoryStore
      ? new DeterministicLegalRegulatoryStore()
      : new FirestoreLegalRegulatoryStore());
  const geographyAdapter = options?.geographyAdapter ?? new CanonicalGeographyLookupAdapter();
  const propertyContextAdapter =
    options?.propertyContextAdapter ?? new ReadOnlyInMemoryPropertyContextAdapter();

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

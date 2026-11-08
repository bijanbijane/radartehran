import {
  MediaEvidenceReferenceAdapter,
  PartyIdentityReferenceAdapter,
  PropertyRegistryReferenceAdapter,
  ReadOnlyMediaReferenceAdapter,
  ReadOnlyPartyIdentityAdapter,
  ReadOnlyPropertyRegistryAdapter,
} from './adapters';
import { FirestorePropertyRightsStore } from './firestoreStore';
import { HistoryAndProfileService } from './historyAndProfileService';
import { OwnershipAndSharesService } from './ownershipAndSharesService';
import { RightsEncumbrancesAndDisputesService } from './rightsEncumbrancesAndDisputesService';
import {
  DeterministicPropertyRightsStore,
  PROPERTY_RIGHTS_COLLECTIONS,
  PropertyRightsStore,
} from './store';

export * from './types';
export * from './sharesAndValidation';
export * from './adapters';
export * from './store';
export * from './firestoreStore';
export * from './shareTransferEngine';
export * from './evidenceAndDisputesEngine';
export * from './ownershipAndSharesService';
export * from './rightsEncumbrancesAndDisputesService';
export * from './historyAndProfileService';

export interface PropertyRightsModuleFacade {
  readonly store: PropertyRightsStore;
  readonly ownershipAndSharesService: OwnershipAndSharesService;
  readonly rightsEncumbrancesAndDisputesService: RightsEncumbrancesAndDisputesService;
  readonly historyAndProfileService: HistoryAndProfileService;
  readonly collections: typeof PROPERTY_RIGHTS_COLLECTIONS;
}

export function createPropertyRightsModuleFacade(options?: {
  store?: PropertyRightsStore;
  propertyAdapter?: PropertyRegistryReferenceAdapter;
  partyAdapter?: PartyIdentityReferenceAdapter;
  mediaAdapter?: MediaEvidenceReferenceAdapter;
  useInMemoryStore?: boolean;
}): PropertyRightsModuleFacade {
  const store =
    options?.store ??
    (options?.useInMemoryStore
      ? new DeterministicPropertyRightsStore()
      : new FirestorePropertyRightsStore());
  const propertyAdapter = options?.propertyAdapter ?? new ReadOnlyPropertyRegistryAdapter();
  const partyAdapter = options?.partyAdapter ?? new ReadOnlyPartyIdentityAdapter();
  const mediaAdapter = options?.mediaAdapter ?? new ReadOnlyMediaReferenceAdapter();

  const ownershipAndSharesService = new OwnershipAndSharesService(
    store,
    propertyAdapter,
    partyAdapter,
  );
  const rightsEncumbrancesAndDisputesService = new RightsEncumbrancesAndDisputesService(
    store,
    propertyAdapter,
    partyAdapter,
    mediaAdapter,
  );
  const historyAndProfileService = new HistoryAndProfileService(store);

  return {
    store,
    ownershipAndSharesService,
    rightsEncumbrancesAndDisputesService,
    historyAndProfileService,
    collections: PROPERTY_RIGHTS_COLLECTIONS,
  };
}

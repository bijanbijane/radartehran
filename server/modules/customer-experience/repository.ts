/**
 * Employee 64 — Customer Experience Persistence Repository & Catalog Adapters
 * (`server/modules/customer-experience/repository.ts`)
 *
 * Exclusive ownership: `server/modules/customer-experience/`
 */

import { runDurableTransaction } from '../core';
import type { TransactionContextLike, TransactionRunnerAdapter } from '../core/types';
import type { PropertySearchQueryFilters } from '../property-search/types';
import { INITIAL_NEIGHBORHOODS } from '../../../src/data/neighborhoods';
import { serverPublishedBargains } from '../../../src/utils/serverPublisherBargains';
import type {
  ConsentPurpose,
  CustomerCatalogPropertyItem,
  CustomerSavedSearchRecord,
  DataRightsRequestRecord,
  PropertyCatalogLookupAdapter,
  PropertyCollectionRecord,
  SavedPropertyAvailabilityState,
  SavedPropertyItemRecord,
  SearchAlertExecutionResult,
  SearchAlertSubscriptionRecord,
  SupportedCityId,
  UserActivityEntryRecord,
  UserConsentRecord,
  UserGeneratedPropertyContentRecord,
  UserPersonalizationPreferences,
  UserPrivateProfileRecord,
  UserPublicProfileView,
} from './types';

export interface InMemoryCustomerExperienceBackingStore {
  docs: Map<string, Record<string, unknown>>;
}

export function createInMemoryCustomerExperienceTxRunner(
  backingStore: InMemoryCustomerExperienceBackingStore = { docs: new Map() },
): TransactionRunnerAdapter & { backingStore: InMemoryCustomerExperienceBackingStore } {
  return {
    backingStore,
    async runTransaction<T>(work: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const stagedWrites = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string): Promise<{ exists: boolean; data?: D }> {
          if (stagedWrites.has(docPath)) {
            const val = stagedWrites.get(docPath);
            return val ? { exists: true, data: structuredClone(val) as D } : { exists: false };
          }
          const existing = backingStore.docs.get(docPath);
          return existing
            ? { exists: true, data: structuredClone(existing) as D }
            : { exists: false };
        },
        set(docPath: string, data: Record<string, unknown>, options?: { merge?: boolean }): void {
          const current = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : (backingStore.docs.get(docPath) ?? null);
          if (options?.merge && current) {
            stagedWrites.set(docPath, {
              ...structuredClone(current),
              ...structuredClone(data),
            });
          } else {
            stagedWrites.set(docPath, structuredClone(data));
          }
        },
        update(docPath: string, data: Record<string, unknown>): void {
          const current = stagedWrites.has(docPath)
            ? stagedWrites.get(docPath)
            : (backingStore.docs.get(docPath) ?? {});
          stagedWrites.set(docPath, {
            ...structuredClone(current ?? {}),
            ...structuredClone(data),
          });
        },
        delete(docPath: string): void {
          stagedWrites.set(docPath, null);
        },
      };

      const result = await work(tx);
      for (const [docPath, value] of stagedWrites.entries()) {
        if (value === null) {
          backingStore.docs.delete(docPath);
        } else {
          backingStore.docs.set(docPath, value);
        }
      }
      return result;
    },
  };
}

interface OwnerIndexRecord {
  ids: string[];
  updatedAtIso: string;
}

export class CustomerExperienceRepository {
  private readonly txRunner: TransactionRunnerAdapter;

  constructor(txRunner: TransactionRunnerAdapter) {
    this.txRunner = txRunner;
  }

  public async runInTransaction<T>(
    operationName: string,
    work: (tx: TransactionContextLike) => Promise<T>,
  ): Promise<T> {
    return runDurableTransaction(this.txRunner, { operationName }, work);
  }

  private async readDoc<T>(tx: TransactionContextLike, docPath: string): Promise<T | null> {
    const snap = await tx.get<T>(docPath);
    return snap.exists && snap.data ? snap.data : null;
  }

  private async addToIndex(tx: TransactionContextLike, indexPath: string, itemId: string): Promise<void> {
    const existing = await this.readDoc<OwnerIndexRecord>(tx, indexPath);
    const ids = existing?.ids ? [...existing.ids] : [];
    if (!ids.includes(itemId)) {
      ids.push(itemId);
      tx.set(indexPath, {
        ids,
        updatedAtIso: new Date().toISOString(),
      });
    }
  }

  private async removeFromIndex(tx: TransactionContextLike, indexPath: string, itemId: string): Promise<void> {
    const existing = await this.readDoc<OwnerIndexRecord>(tx, indexPath);
    if (!existing?.ids) return;
    const nextIds = existing.ids.filter((id) => id !== itemId);
    tx.set(indexPath, {
      ids: nextIds,
      updatedAtIso: new Date().toISOString(),
    });
  }

  private async getIndexedDocuments<T>(
    tx: TransactionContextLike,
    indexPath: string,
    collectionPrefix: string,
  ): Promise<T[]> {
    const idx = await this.readDoc<OwnerIndexRecord>(tx, indexPath);
    if (!idx?.ids || idx.ids.length === 0) return [];
    const results: T[] = [];
    for (const id of idx.ids) {
      const doc = await this.readDoc<T>(tx, `${collectionPrefix}/${id}`);
      if (doc) results.push(doc);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // 2. Profiles (Private & Public separation)
  // --------------------------------------------------------------------------

  public async getPrivateProfileInTx(
    tx: TransactionContextLike,
    uid: string,
  ): Promise<UserPrivateProfileRecord | null> {
    return this.readDoc<UserPrivateProfileRecord>(tx, `cx_profiles_private/${uid}`);
  }

  public async getPrivateProfile(uid: string): Promise<UserPrivateProfileRecord | null> {
    return this.runInTransaction('cx.getPrivateProfile', (tx) => this.getPrivateProfileInTx(tx, uid));
  }

  public setPrivateAndPublicProfileInTx(
    tx: TransactionContextLike,
    privateProfile: UserPrivateProfileRecord,
    publicProfile: UserPublicProfileView | null,
  ): void {
    tx.set(
      `cx_profiles_private/${privateProfile.uid}`,
      privateProfile as unknown as Record<string, unknown>,
    );
    if (publicProfile) {
      tx.set(
        `cx_profiles_public/${privateProfile.uid}`,
        publicProfile as unknown as Record<string, unknown>,
      );
    } else {
      tx.delete(`cx_profiles_public/${privateProfile.uid}`);
    }
  }

  public async getPublicProfile(uid: string): Promise<UserPublicProfileView | null> {
    return this.runInTransaction('cx.getPublicProfile', (tx) =>
      this.readDoc<UserPublicProfileView>(tx, `cx_profiles_public/${uid}`),
    );
  }

  // --------------------------------------------------------------------------
  // 3. Preferences
  // --------------------------------------------------------------------------

  public async getPreferencesInTx(
    tx: TransactionContextLike,
    uid: string,
  ): Promise<UserPersonalizationPreferences | null> {
    return this.readDoc<UserPersonalizationPreferences>(tx, `cx_preferences/${uid}`);
  }

  public setPreferencesInTx(tx: TransactionContextLike, prefs: UserPersonalizationPreferences): void {
    tx.set(`cx_preferences/${prefs.uid}`, prefs as unknown as Record<string, unknown>);
  }

  // --------------------------------------------------------------------------
  // 4. Saved Properties & Collections
  // --------------------------------------------------------------------------

  public savedPropertyDocId(ownerUid: string, propertyId: string): string {
    return `${ownerUid}__${propertyId}`;
  }

  public async getSavedPropertyInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    propertyId: string,
  ): Promise<SavedPropertyItemRecord | null> {
    const docId = this.savedPropertyDocId(ownerUid, propertyId);
    return this.readDoc<SavedPropertyItemRecord>(tx, `cx_saved_properties/${docId}`);
  }

  public async upsertSavedPropertyInTx(
    tx: TransactionContextLike,
    record: SavedPropertyItemRecord,
  ): Promise<void> {
    const docId = this.savedPropertyDocId(record.ownerUid, record.propertyId);
    await this.addToIndex(tx, `cx_saved_properties_by_owner/${record.ownerUid}`, docId);
    tx.set(`cx_saved_properties/${docId}`, record as unknown as Record<string, unknown>);
  }

  public async deleteSavedPropertyInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    propertyId: string,
  ): Promise<void> {
    const docId = this.savedPropertyDocId(ownerUid, propertyId);
    await this.removeFromIndex(tx, `cx_saved_properties_by_owner/${ownerUid}`, docId);
    tx.delete(`cx_saved_properties/${docId}`);
  }

  public async listSavedPropertiesByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<SavedPropertyItemRecord[]> {
    return this.getIndexedDocuments<SavedPropertyItemRecord>(
      tx,
      `cx_saved_properties_by_owner/${ownerUid}`,
      'cx_saved_properties',
    );
  }

  public async getCollectionInTx(
    tx: TransactionContextLike,
    collectionId: string,
  ): Promise<PropertyCollectionRecord | null> {
    return this.readDoc<PropertyCollectionRecord>(tx, `cx_collections/${collectionId}`);
  }

  public async upsertCollectionInTx(
    tx: TransactionContextLike,
    collection: PropertyCollectionRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_collections_by_owner/${collection.ownerUid}`, collection.id);
    tx.set(`cx_collections/${collection.id}`, collection as unknown as Record<string, unknown>);
  }

  public async deleteCollectionInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    collectionId: string,
  ): Promise<void> {
    await this.removeFromIndex(tx, `cx_collections_by_owner/${ownerUid}`, collectionId);
    tx.delete(`cx_collections/${collectionId}`);
  }

  public async listCollectionsByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<PropertyCollectionRecord[]> {
    const items = await this.getIndexedDocuments<PropertyCollectionRecord>(
      tx,
      `cx_collections_by_owner/${ownerUid}`,
      'cx_collections',
    );
    return items.sort((a, b) => a.displayOrder - b.displayOrder || a.createdAtIso.localeCompare(b.createdAtIso));
  }

  // --------------------------------------------------------------------------
  // 5. Saved Searches
  // --------------------------------------------------------------------------

  public async getSavedSearchInTx(
    tx: TransactionContextLike,
    searchId: string,
  ): Promise<CustomerSavedSearchRecord | null> {
    return this.readDoc<CustomerSavedSearchRecord>(tx, `cx_saved_searches/${searchId}`);
  }

  public async upsertSavedSearchInTx(
    tx: TransactionContextLike,
    record: CustomerSavedSearchRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_saved_searches_by_owner/${record.ownerUid}`, record.id);
    tx.set(`cx_saved_searches/${record.id}`, record as unknown as Record<string, unknown>);
  }

  public async deleteSavedSearchInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    searchId: string,
  ): Promise<void> {
    await this.removeFromIndex(tx, `cx_saved_searches_by_owner/${ownerUid}`, searchId);
    tx.delete(`cx_saved_searches/${searchId}`);
  }

  public async listSavedSearchesByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<CustomerSavedSearchRecord[]> {
    const items = await this.getIndexedDocuments<CustomerSavedSearchRecord>(
      tx,
      `cx_saved_searches_by_owner/${ownerUid}`,
      'cx_saved_searches',
    );
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  // --------------------------------------------------------------------------
  // 6. Search Alerts & Idempotent Job Execution Records
  // --------------------------------------------------------------------------

  public async getSearchAlertInTx(
    tx: TransactionContextLike,
    alertId: string,
  ): Promise<SearchAlertSubscriptionRecord | null> {
    return this.readDoc<SearchAlertSubscriptionRecord>(tx, `cx_search_alerts/${alertId}`);
  }

  public async upsertSearchAlertInTx(
    tx: TransactionContextLike,
    record: SearchAlertSubscriptionRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_search_alerts_by_owner/${record.ownerUid}`, record.id);
    tx.set(`cx_search_alerts/${record.id}`, record as unknown as Record<string, unknown>);
  }

  public async deleteSearchAlertInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    alertId: string,
  ): Promise<void> {
    await this.removeFromIndex(tx, `cx_search_alerts_by_owner/${ownerUid}`, alertId);
    tx.delete(`cx_search_alerts/${alertId}`);
  }

  public async listSearchAlertsByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<SearchAlertSubscriptionRecord[]> {
    const items = await this.getIndexedDocuments<SearchAlertSubscriptionRecord>(
      tx,
      `cx_search_alerts_by_owner/${ownerUid}`,
      'cx_search_alerts',
    );
    return items.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  public async getAlertExecutionByKeyInTx(
    tx: TransactionContextLike,
    alertId: string,
    jobExecutionKey: string,
  ): Promise<SearchAlertExecutionResult | null> {
    return this.readDoc<SearchAlertExecutionResult>(
      tx,
      `cx_alert_executions/${alertId}__${jobExecutionKey}`,
    );
  }

  public setAlertExecutionByKeyInTx(
    tx: TransactionContextLike,
    result: SearchAlertExecutionResult,
  ): void {
    tx.set(
      `cx_alert_executions/${result.alertId}__${result.jobExecutionKey}`,
      result as unknown as Record<string, unknown>,
    );
  }

  // --------------------------------------------------------------------------
  // 7. User Activity & Recently Viewed History
  // --------------------------------------------------------------------------

  public async getActivityEntryInTx(
    tx: TransactionContextLike,
    entryId: string,
  ): Promise<UserActivityEntryRecord | null> {
    return this.readDoc<UserActivityEntryRecord>(tx, `cx_activity_history/${entryId}`);
  }

  public async upsertActivityEntryInTx(
    tx: TransactionContextLike,
    entry: UserActivityEntryRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_activity_by_owner/${entry.ownerUid}`, entry.id);
    tx.set(`cx_activity_history/${entry.id}`, entry as unknown as Record<string, unknown>);
  }

  public async deleteActivityEntryInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    entryId: string,
  ): Promise<void> {
    await this.removeFromIndex(tx, `cx_activity_by_owner/${ownerUid}`, entryId);
    tx.delete(`cx_activity_history/${entryId}`);
  }

  public async listActivityByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<UserActivityEntryRecord[]> {
    const items = await this.getIndexedDocuments<UserActivityEntryRecord>(
      tx,
      `cx_activity_by_owner/${ownerUid}`,
      'cx_activity_history',
    );
    return items.sort((a, b) => b.lastViewedAtIso.localeCompare(a.lastViewedAtIso));
  }

  // --------------------------------------------------------------------------
  // 9. Privacy Consents & Data Rights Requests
  // --------------------------------------------------------------------------

  public consentDocId(ownerUid: string, purpose: ConsentPurpose): string {
    return `${ownerUid}__${purpose}`;
  }

  public async getConsentInTx(
    tx: TransactionContextLike,
    ownerUid: string,
    purpose: ConsentPurpose,
  ): Promise<UserConsentRecord | null> {
    return this.readDoc<UserConsentRecord>(tx, `cx_consents/${this.consentDocId(ownerUid, purpose)}`);
  }

  public async upsertConsentInTx(
    tx: TransactionContextLike,
    record: UserConsentRecord,
  ): Promise<void> {
    const docId = this.consentDocId(record.ownerUid, record.purpose);
    await this.addToIndex(tx, `cx_consents_by_owner/${record.ownerUid}`, docId);
    tx.set(`cx_consents/${docId}`, record as unknown as Record<string, unknown>);
  }

  public async listConsentsByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<UserConsentRecord[]> {
    return this.getIndexedDocuments<UserConsentRecord>(
      tx,
      `cx_consents_by_owner/${ownerUid}`,
      'cx_consents',
    );
  }

  public async getDataRightsRequestInTx(
    tx: TransactionContextLike,
    requestId: string,
  ): Promise<DataRightsRequestRecord | null> {
    return this.readDoc<DataRightsRequestRecord>(tx, `cx_data_rights_requests/${requestId}`);
  }

  public async upsertDataRightsRequestInTx(
    tx: TransactionContextLike,
    record: DataRightsRequestRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_data_rights_by_owner/${record.ownerUid}`, record.id);
    await this.addToIndex(tx, 'cx_data_rights_global/all', record.id);
    tx.set(`cx_data_rights_requests/${record.id}`, record as unknown as Record<string, unknown>);
  }

  public async listDataRightsByOwnerInTx(
    tx: TransactionContextLike,
    ownerUid: string,
  ): Promise<DataRightsRequestRecord[]> {
    const items = await this.getIndexedDocuments<DataRightsRequestRecord>(
      tx,
      `cx_data_rights_by_owner/${ownerUid}`,
      'cx_data_rights_requests',
    );
    return items.sort((a, b) => b.submittedAtIso.localeCompare(a.submittedAtIso));
  }

  // --------------------------------------------------------------------------
  // 11. User-Generated Content (UGC)
  // --------------------------------------------------------------------------

  public async getUgcItemInTx(
    tx: TransactionContextLike,
    ugcId: string,
  ): Promise<UserGeneratedPropertyContentRecord | null> {
    return this.readDoc<UserGeneratedPropertyContentRecord>(tx, `cx_ugc_items/${ugcId}`);
  }

  public async upsertUgcItemInTx(
    tx: TransactionContextLike,
    record: UserGeneratedPropertyContentRecord,
  ): Promise<void> {
    await this.addToIndex(tx, `cx_ugc_by_author/${record.authorUid}`, record.id);
    await this.addToIndex(tx, `cx_ugc_by_target/${record.targetType}__${record.targetId}`, record.id);
    tx.set(`cx_ugc_items/${record.id}`, record as unknown as Record<string, unknown>);
  }

  public async listUgcByTargetInTx(
    tx: TransactionContextLike,
    targetType: string,
    targetId: string,
  ): Promise<UserGeneratedPropertyContentRecord[]> {
    const items = await this.getIndexedDocuments<UserGeneratedPropertyContentRecord>(
      tx,
      `cx_ugc_by_target/${targetType}__${targetId}`,
      'cx_ugc_items',
    );
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }

  public async listUgcByAuthorInTx(
    tx: TransactionContextLike,
    authorUid: string,
  ): Promise<UserGeneratedPropertyContentRecord[]> {
    const items = await this.getIndexedDocuments<UserGeneratedPropertyContentRecord>(
      tx,
      `cx_ugc_by_author/${authorUid}`,
      'cx_ugc_items',
    );
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  }
}

/**
 * Default adapter bridging Employee 64 to the existing canonical property catalog
 * (`serverPublishedBargains`, `INITIAL_NEIGHBORHOODS`, and `executePropertySearchPipeline`).
 */
export function createDefaultPropertyCatalogAdapter(): PropertyCatalogLookupAdapter {
  const buildDataset = (): CustomerCatalogPropertyItem[] => {
    const hoodMap = new Map(INITIAL_NEIGHBORHOODS.map((h) => [h.id, h]));
    const items: CustomerCatalogPropertyItem[] = [];

    for (const [idx, b] of Array.from(serverPublishedBargains.values()).entries()) {
      const hood = hoodMap.get(b.hoodId) ?? INITIAL_NEIGHBORHOODS[0];
      const sqm = Math.max(20, b.sqm || 85);
      const totalMillions = b.priceMillions || 0;
      const rawState = String(b.lifecycleState || 'PUBLISHED').toUpperCase();
      const isPublished = rawState === 'PUBLISHED';
      const isRent = b.dealType === 'اجاره' || (b.dealType as string) === 'rent';
      items.push({
        id: b.id,
        title: b.title,
        cityId: (b.cityId as SupportedCityId) || 'tehran',
        districtNumber: ((b.hoodId - 1) % 22) + 1,
        neighborhoodId: b.hoodId,
        neighborhoodName: hood?.name || b.hoodName || `محله ${b.hoodId}`,
        propertyCategory: 'residential',
        propertyType: 'apartment',
        transactionType: isRent ? 'rent' : 'buy',
        lifecycleState: isPublished
          ? 'PUBLISHED'
          : (rawState as CustomerCatalogPropertyItem['lifecycleState']),
        moderationState: 'APPROVED',
        visibility: isPublished ? 'PUBLIC' : 'PRIVATE',
        ownerUid: b.ownerUid || 'system-publisher',
        totalPriceMillions: isRent ? 0 : totalMillions,
        pricePerSqmMillions: isRent ? 0 : Math.round((totalMillions / sqm) * 10) / 10,
        depositMillions: isRent ? totalMillions : 0,
        monthlyRentMillions: isRent ? Math.round(totalMillions * 0.03) : 0,
        areaSqm: sqm,
        bedrooms: sqm >= 130 ? 3 : sqm >= 75 ? 2 : 1,
        bathrooms: sqm >= 120 ? 2 : 1,
        floorNumber: 2,
        totalFloors: 5,
        buildingAgeYears: 4,
        amenities: ['parking', 'elevator', 'storage'],
        coordinates: {
          lat: hood?.lat ?? 35.72 + (idx % 10) * 0.004,
          lng: hood?.lng ?? 51.38 + (idx % 10) * 0.004,
        },
        featuredRank: b.discountPercent >= 12 ? 10 : 1,
        qualityScore: 85,
        verifiedFlag: true,
        hasPhotos: true,
        hasVideo: false,
        has3dTour: false,
        bargainDiscountPercent: b.discountPercent,
        publishedAt: b.createdAtIso || new Date().toISOString(),
        updatedAt: b.updatedAtIso || b.createdAtIso || new Date().toISOString(),
      });
    }

    if (items.length === 0) {
      for (const hood of INITIAL_NEIGHBORHOODS.slice(0, 5)) {
        const sqm = 95;
        const totalMillions = hood.buyPerSqm * sqm;
        items.push({
          id: `prop_hood_${hood.id}`,
          title: `آپارتمان ۹۵ متری در ${hood.name}`,
          cityId: 'tehran',
          districtNumber: ((hood.id - 1) % 22) + 1,
          neighborhoodId: hood.id,
          neighborhoodName: hood.name,
          propertyCategory: 'residential',
          propertyType: 'apartment',
          transactionType: 'buy',
          lifecycleState: 'PUBLISHED',
          moderationState: 'APPROVED',
          visibility: 'PUBLIC',
          ownerUid: 'system-catalog',
          totalPriceMillions: totalMillions,
          pricePerSqmMillions: hood.buyPerSqm,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: sqm,
          bedrooms: 2,
          bathrooms: 1,
          floorNumber: 3,
          totalFloors: 5,
          buildingAgeYears: 3,
          amenities: ['parking', 'elevator', 'storage'],
          coordinates: { lat: hood.lat, lng: hood.lng },
          featuredRank: 5,
          qualityScore: 88,
          verifiedFlag: true,
          hasPhotos: true,
          hasVideo: false,
          has3dTour: false,
          bargainDiscountPercent: 10,
          publishedAt: '2026-01-15T10:00:00.000Z',
          updatedAt: '2026-01-15T10:00:00.000Z',
        });
      }
    }

    return items;
  };

  return {
    async getPropertyById(propertyId: string, requesterUid?: string) {
      const dataset = buildDataset();
      const found = dataset.find((p) => p.id === propertyId);
      if (!found) {
        return {
          exists: false,
          accessible: false,
          availabilityState: 'DELETED' as SavedPropertyAvailabilityState,
        };
      }
      const isOwner = Boolean(requesterUid && found.ownerUid === requesterUid);
      if (found.lifecycleState === 'ARCHIVED') {
        return {
          exists: true,
          accessible: isOwner,
          availabilityState: 'DELETED' as SavedPropertyAvailabilityState,
          item: isOwner ? found : undefined,
        };
      }
      if (found.lifecycleState === 'EXPIRED') {
        return {
          exists: true,
          accessible: isOwner,
          availabilityState: 'EXPIRED' as SavedPropertyAvailabilityState,
          item: isOwner ? found : undefined,
        };
      }
      if (found.visibility !== 'PUBLIC' || found.lifecycleState !== 'PUBLISHED') {
        return {
          exists: true,
          accessible: isOwner,
          availabilityState: isOwner
            ? ('UNPUBLISHED' as SavedPropertyAvailabilityState)
            : ('RESTRICTED' as SavedPropertyAvailabilityState),
          item: isOwner ? found : undefined,
        };
      }
      return {
        exists: true,
        accessible: true,
        availabilityState: 'AVAILABLE' as SavedPropertyAvailabilityState,
        item: found,
      };
    },

    async executeSavedSearchFilters(
      filters: PropertySearchQueryFilters,
      pagination: { limit: number; cursor?: string | null },
    ) {
      const dataset = buildDataset().filter(
        (item) => item.visibility === 'PUBLIC' && item.lifecycleState === 'PUBLISHED',
      );
      const matched = dataset.filter((item) => {
        if (filters.cityId && item.cityId !== filters.cityId) return false;
        if (
          filters.neighborhoodIds &&
          filters.neighborhoodIds.length > 0 &&
          !filters.neighborhoodIds.includes(item.neighborhoodId)
        ) {
          return false;
        }
        if (filters.minAskingPriceMillion !== undefined && item.totalPriceMillions < filters.minAskingPriceMillion) {
          return false;
        }
        if (filters.maxAskingPriceMillion !== undefined && item.totalPriceMillions > filters.maxAskingPriceMillion) {
          return false;
        }
        if (filters.minAreaSqm !== undefined && item.areaSqm < filters.minAreaSqm) {
          return false;
        }
        if (filters.maxAreaSqm !== undefined && item.areaSqm > filters.maxAreaSqm) {
          return false;
        }
        if (filters.minRooms !== undefined && item.bedrooms < filters.minRooms) {
          return false;
        }
        if (filters.maxRooms !== undefined && item.bedrooms > filters.maxRooms) {
          return false;
        }
        return true;
      });
      const slice = matched.slice(0, pagination.limit);
      return {
        items: slice,
        totalMatchedCount: matched.length,
        nextCursor: matched.length > pagination.limit ? String(pagination.limit) : null,
        hasMore: matched.length > pagination.limit,
      };
    },

    async listUserOwnedListings(ownerUid: string) {
      return Array.from(serverPublishedBargains.values())
        .filter((b) => b.ownerUid === ownerUid)
        .map((b) => ({
          id: b.id,
          title: b.title,
          cityId: b.cityId || 'tehran',
          hoodId: b.hoodId,
          priceMillions: b.priceMillions,
          lifecycleState: b.lifecycleState || 'PUBLISHED',
          updatedAtIso: b.updatedAtIso || b.createdAtIso,
        }));
    },
  };
}

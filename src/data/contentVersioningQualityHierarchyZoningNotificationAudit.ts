import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';
export interface VersionedListingSnapshot { listingId: string; versionNumber: number; ownerUid: string; hoodId: number; transactionType: 'buy' | 'rent'; propertyCategory: 'residential_apartment' | 'villa' | 'commercial_office' | 'land'; sqm: number; rooms: number; priceMillion: number; primaryImageHash: string; descriptionFa: string; moderationStatus: 'APPROVED' | 'PENDING_REVALIDATION'; verificationBadgeActive: boolean; updatedAtMs: number; }
export class ListingContentVersionRegistry { private readonly historyByListingId = new Map<string, VersionedListingSnapshot[]>(); registerInitialPublishedSnapshot(snapshot: VersionedListingSnapshot): void { this.historyByListingId.set(snapshot.listingId, [{ ...snapshot, versionNumber: 1 }]); }
  applyEditAndAuditMaterialChanges(input: { listingId: string; actorUid: string; operationSucceededInStorage: boolean; patch: Partial<Pick<VersionedListingSnapshot, 'hoodId' | 'transactionType' | 'propertyCategory' | 'sqm' | 'rooms' | 'priceMillion' | 'primaryImageHash' | 'descriptionFa'>>; nowMs: number; }): { applied: boolean; rejectionReason: string | null; materialFieldsChanged: string[]; descriptiveFieldsChanged: string[]; revalidationRequired: boolean; baitAndSwitchRiskFlagged: boolean; notifySavedUsersRequired: boolean; latestSnapshot: VersionedListingSnapshot | null; } { const rejectEdit = (reason: string, snap: VersionedListingSnapshot | null) => ({ applied: false, rejectionReason: reason, materialFieldsChanged: [] as string[], descriptiveFieldsChanged: [] as string[], revalidationRequired: false,
      baitAndSwitchRiskFlagged: false, notifySavedUsersRequired: false, latestSnapshot: snap, }); const history = this.historyByListingId.get(input.listingId); if (!history || history.length === 0) return rejectEdit('LISTING_NOT_FOUND', null); const current = history[history.length - 1]; if (current.ownerUid !== input.actorUid) return rejectEdit('FORBIDDEN_NON_OWNER_EDIT', current); if (!input.operationSucceededInStorage) { return rejectEdit('STORAGE_WRITE_FAILED_NO_FALSE_REVISION_RECORDED', current); } const materialKeys: Array<keyof typeof input.patch> = ['hoodId', 'transactionType', 'propertyCategory', 'sqm', 'rooms', 'priceMillion', 'primaryImageHash'];
    const materialFieldsChanged: string[] = []; for (const k of materialKeys) { if (input.patch[k] !== undefined && input.patch[k] !== current[k]) { materialFieldsChanged.push(k); }
    } const descriptiveFieldsChanged: string[] = []; if ( input.patch.descriptionFa !== undefined &&
      input.patch.descriptionFa !== current.descriptionFa
    ) { descriptiveFieldsChanged.push('descriptionFa'); }
    const identityMaterialChanges = materialFieldsChanged.filter((f) => ['hoodId', 'transactionType', 'propertyCategory', 'sqm', 'primaryImageHash'].includes(f), ); const revalidationRequired = identityMaterialChanges.length > 0; const baitAndSwitchRiskFlagged = identityMaterialChanges.length >= 2; const nextSnapshot: VersionedListingSnapshot = { ...current, ...input.patch,
      versionNumber: current.versionNumber + 1, moderationStatus: revalidationRequired ? 'PENDING_REVALIDATION' : current.moderationStatus, verificationBadgeActive: revalidationRequired ? false : current.verificationBadgeActive, updatedAtMs: input.nowMs, }; history.push(nextSnapshot); return { applied: true,
      rejectionReason: null, materialFieldsChanged, descriptiveFieldsChanged, revalidationRequired, baitAndSwitchRiskFlagged, notifySavedUsersRequired: materialFieldsChanged.length > 0, latestSnapshot: nextSnapshot, };
  }
  getImmutableHistory(listingId: string): ReadonlyArray<VersionedListingSnapshot> { return this.historyByListingId.get(listingId) ?? []; } }
export interface PropertyQualityEvaluationInput { propertyCategory: 'residential_apartment' | 'land' | 'commercial_office'; hoodId: number | null; netAreaSqm: number | null; priceMillion: number | null;
  rooms: number | null; unitFloor: number | null; constructionYearJalali: number | null; primaryPhotoCount: number; hasValidContactPhone: boolean; contactPhoneOtpVerified: boolean;
  sourceProvenance: 'ADVERTISER_SELF_REPORTED' | 'EXTERNAL_IMPORTED' | 'ADMIN_VERIFIED_SURVEY';
  documentaryTitleReviewed: boolean;
}
export function evaluatePropertyDataQualityAndConfidence(input: PropertyQualityEvaluationInput): {
  informationCompletenessPercent: number; internalConsistencyValid: boolean; contradictionFlags: string[];
  sourceProvenance: PropertyQualityEvaluationInput['sourceProvenance'];
  contactIdentityVerified: boolean; legalDocumentaryVerified: boolean;
  completenessProvesFactualAuthenticity: false; eligibleForAutomatedValuation: boolean;
} {
  const contradictionFlags: string[] = [];
  if (input.propertyCategory === 'land' && input.unitFloor !== null && input.unitFloor > 0) {
    contradictionFlags.push('CONTRADICTION_VACANT_LAND_CANNOT_HAVE_APARTMENT_FLOOR');
  }
  if (input.netAreaSqm !== null && input.rooms !== null && input.netAreaSqm < 45 && input.rooms >= 4) {
    contradictionFlags.push('IMPLAUSIBLE_ROOM_COUNT_FOR_SMALL_AREA');
  }
  if (input.priceMillion !== null && input.priceMillion <= 0) {
    contradictionFlags.push('INVALID_NON_POSITIVE_PRICE');
  }
  const requiredChecks: boolean[] = [
    input.hoodId !== null && input.hoodId > 0,
    input.netAreaSqm !== null && input.netAreaSqm > 0,
    input.priceMillion !== null && input.priceMillion > 0,
    input.primaryPhotoCount >= 1,
    input.hasValidContactPhone,
  ];
  if (input.propertyCategory !== 'land') {
    requiredChecks.push(
      input.rooms !== null && input.rooms >= 0,
      input.unitFloor !== null,
      input.constructionYearJalali !== null && input.constructionYearJalali >= 1340,
    );
  }
  const passedCount = requiredChecks.filter(Boolean).length;
  const informationCompletenessPercent = Math.round((passedCount / requiredChecks.length) * 100);
  const internalConsistencyValid = contradictionFlags.length === 0;
  return {
    informationCompletenessPercent, internalConsistencyValid, contradictionFlags,
    sourceProvenance: input.sourceProvenance, contactIdentityVerified: input.contactPhoneOtpVerified,
    legalDocumentaryVerified: input.documentaryTitleReviewed, completenessProvesFactualAuthenticity: false,
    eligibleForAutomatedValuation: internalConsistencyValid && input.hoodId !== null && input.netAreaSqm !== null && input.netAreaSqm > 0,
  };
}
export interface BuildingEntityRecord {
  buildingId: string; parcelId: string; hoodId: number; parcelLandSqm: number;
  totalBuildingFloors: number; constructionYearJalali: number; sharedHasElevator: boolean;
}
export interface PhysicalUnitEntityRecord {
  unitId: string; buildingId: string; floorNumber: number; unitNumber: number; netUnitSqm: number; unitOwnerUid: string;
}
export class PropertyHierarchyRegistry {
  private readonly buildings = new Map<string, BuildingEntityRecord>();
  private readonly units = new Map<string, PhysicalUnitEntityRecord>();
  private readonly activeListingsByUnit = new Map<string, string[]>();
  registerBuilding(building: BuildingEntityRecord): void {
    this.buildings.set(building.buildingId, building);
  }
  registerUnit(unit: PhysicalUnitEntityRecord): { registered: boolean; rejectionReason: string | null } {
    const parentBuilding = this.buildings.get(unit.buildingId);
    if (!parentBuilding) return { registered: false, rejectionReason: 'ORPHAN_UNIT_MISSING_PARENT_BUILDING' };
    if (unit.floorNumber > parentBuilding.totalBuildingFloors) {
      return { registered: false, rejectionReason: 'UNIT_FLOOR_EXCEEDS_PARENT_BUILDING_TOTAL_FLOORS' };
    }
    this.units.set(unit.unitId, unit);
    return { registered: true, rejectionReason: null };
  }
  computeUnitValuationAreaAndCheckAccess(input: {
    unitId: string; actorUid: string; attemptedSiblingUnitId?: string; totalUnitPriceMillion: number;
    areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode;
  }): {
    authorizedForOwnUnit: boolean; authorizedForSiblingUnitInSameBuilding: boolean;
    unitPricePerSqmMillion: number | null; displayAreaUnitLabel?: string; totalUnitPriceIntlText?: string; usedUnitNetAreaNotParcelArea: true;
  } {
    const activeUnit = input.areaUnit ?? getStoredAreaUnit();
    const activeCurrency = input.intlCurrency ?? getStoredIntlCurrency();
    const displayAreaUnitLabel = formatAreaUnitLabel(activeUnit);
    const totalUnitPriceIntlText = formatMillionTomanAsIntlCurrency(Math.max(0, input.totalUnitPriceMillion || 0), activeCurrency);
    const unit = this.units.get(input.unitId);
    if (!unit) {
      return {
        authorizedForOwnUnit: false, authorizedForSiblingUnitInSameBuilding: false,
        unitPricePerSqmMillion: null, displayAreaUnitLabel, totalUnitPriceIntlText, usedUnitNetAreaNotParcelArea: true,
      };
    }
    const sibling = input.attemptedSiblingUnitId ? this.units.get(input.attemptedSiblingUnitId) : undefined;
    return {
      authorizedForOwnUnit: unit.unitOwnerUid === input.actorUid,
      authorizedForSiblingUnitInSameBuilding: sibling !== undefined ? sibling.unitOwnerUid === input.actorUid : false,
      unitPricePerSqmMillion: Number((input.totalUnitPriceMillion / unit.netUnitSqm).toFixed(2)),
      displayAreaUnitLabel, totalUnitPriceIntlText, usedUnitNetAreaNotParcelArea: true,
    };
  }
}
export type LandUseClassification =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'ADMINISTRATIVE_OFFICE'
  | 'INDUSTRIAL'
  | 'MIXED_USE'
  | 'VACANT_LAND';
export function evaluatePropertyLandUseAndZoning(input: {
  advertiserClaimedUse: LandUseClassification | null;
  observedDatasetUse: LandUseClassification | null;
  verifiedMunicipalPermitUse: LandUseClassification | null;
  rawDescriptionFa: string;
}): {
  effectiveDisplayClassification: LandUseClassification | 'UNSPECIFIED_LAND_USE';
  silentResidentialDefaultUsed: false;
  claimMatchesDatasetAndPermit: boolean;
  descriptionConflictDetected: boolean;
  authoritativeZoningVerificationStatus:
    | 'VERIFIED_BY_MUNICIPAL_PERMIT'
    | 'UNVERIFIED_ADVERTISER_OR_DATASET_CLAIM';
  certifiesLegalPermittedUse: boolean;
  statisticalCategoryWeight: number;
} {
  const effectiveDisplayClassification =
    input.verifiedMunicipalPermitUse ??
    input.observedDatasetUse ??
    input.advertiserClaimedUse ??
    'UNSPECIFIED_LAND_USE';
  const descriptionMentionsCommercialOrOffice =
    /(تجاری|موقعیت اداری|مطب|دفتر کار|سند اداری)/i.test(input.rawDescriptionFa);
  const descriptionConflictDetected =
    input.advertiserClaimedUse === 'RESIDENTIAL' && descriptionMentionsCommercialOrOffice;
  const claimMatchesDatasetAndPermit =
    input.advertiserClaimedUse !== null &&
    (input.observedDatasetUse === null || input.advertiserClaimedUse === input.observedDatasetUse) &&
    (input.verifiedMunicipalPermitUse === null ||
      input.advertiserClaimedUse === input.verifiedMunicipalPermitUse) &&
    !descriptionConflictDetected;
  const hasMunicipalPermit = input.verifiedMunicipalPermitUse !== null;
  return {
    effectiveDisplayClassification,
    silentResidentialDefaultUsed: false,
    claimMatchesDatasetAndPermit,
    descriptionConflictDetected,
    authoritativeZoningVerificationStatus: hasMunicipalPermit
      ? 'VERIFIED_BY_MUNICIPAL_PERMIT'
      : 'UNVERIFIED_ADVERTISER_OR_DATASET_CLAIM',
    certifiesLegalPermittedUse: hasMunicipalPermit,
    statisticalCategoryWeight: 1.0,
  };
}
export type NotificationChannelType = 'IN_APP' | 'WEB_PUSH' | 'EMAIL';
export type NotificationPriorityLevel =
  | 'CRITICAL_SECURITY'
  | 'TRANSACTIONAL_UPDATE'
  | 'OPTIONAL_SAVED_SEARCH_DIGEST';
export class CrossChannelNotificationOrchestrator {
  private readonly dispatchedEventKeys = new Set<string>();
  private readonly nonUrgentCountByUserHour = new Map<string, number>();
  static readonly MAX_NON_URGENT_PER_HOUR = 3;
  dispatchBusinessEventNotification(input: {
    businessEventId: string;
    recipientUid: string;
    recipientAccountActive: boolean;
    databaseTransactionCommitted: boolean;
    priority: NotificationPriorityLevel;
    enabledUserChannels: NotificationChannelType[];
    isQuietHoursLocalTehran: boolean;
    hourBucketKey: string;
  }): {
    dispatched: boolean;
    selectedChannels: NotificationChannelType[];
    suppressedReason: string | null;
    deduplicatedAcrossChannels: boolean;
    deliveryProvesUserRead: false;
  } {
    if (!input.databaseTransactionCommitted) {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'UNCOMMITTED_OR_FAILED_TRANSACTION_SUPPRESSED',
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    if (!input.recipientAccountActive) {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'RECIPIENT_ACCOUNT_INACTIVE_OR_SUSPENDED',
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    const dedupeKey = `${input.businessEventId}:${input.recipientUid}`;
    if (this.dispatchedEventKeys.has(dedupeKey)) {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'DUPLICATE_BUSINESS_EVENT_SUPPRESSED',
        deduplicatedAcrossChannels: true,
        deliveryProvesUserRead: false,
      };
    }
    if (input.priority === 'CRITICAL_SECURITY') {
      this.dispatchedEventKeys.add(dedupeKey);
      return {
        dispatched: true,
        selectedChannels: ['IN_APP', 'EMAIL'],
        suppressedReason: null,
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    if (input.isQuietHoursLocalTehran && input.priority === 'OPTIONAL_SAVED_SEARCH_DIGEST') {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'DEFERRED_FOR_QUIET_HOURS_DIGEST',
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    const rateKey = `${input.recipientUid}:${input.hourBucketKey}`;
    const currentCount = this.nonUrgentCountByUserHour.get(rateKey) ?? 0;
    if (currentCount >= CrossChannelNotificationOrchestrator.MAX_NON_URGENT_PER_HOUR) {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'USER_FATIGUE_HOURLY_CAP_REACHED_BATCHED_TO_DIGEST',
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    const preferredOrder: NotificationChannelType[] = ['IN_APP', 'WEB_PUSH', 'EMAIL'];
    const primaryChannel = preferredOrder.find((ch) => input.enabledUserChannels.includes(ch));
    if (!primaryChannel) {
      return {
        dispatched: false,
        selectedChannels: [],
        suppressedReason: 'ALL_OPTIONAL_CHANNELS_DISABLED_BY_USER_PREFERENCE',
        deduplicatedAcrossChannels: false,
        deliveryProvesUserRead: false,
      };
    }
    this.dispatchedEventKeys.add(dedupeKey); this.nonUrgentCountByUserHour.set(rateKey, currentCount + 1); return { dispatched: true, selectedChannels: [primaryChannel], suppressedReason: null, deduplicatedAcrossChannels: false, deliveryProvesUserRead: false, }; } }
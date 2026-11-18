/**
 * @file src/platform/entity-detail/adapters/ListingDetailAdapter.ts
 * @description Adapts raw Listing payloads to EntityDetailModel (Stage 7 Section 6) with Lifecycle State Machine and Property Match confidence.
 */

import type { AccessContext } from '../../authorization';
import {
  buildCanonicalEntityDetailPath,
  createEntityDetailField,
  resolveEntityDetailCapabilities,
} from '../core/EntityDetailContract';
import { normalizeEntityFinancialFields } from '../core/EntityDetailNormalizer';
import type {
  EntityDetailMediaItem,
  EntityDetailModel,
  ListingLifecycleState,
  PropertyListingMatchConfidence,
} from '../core/EntityDetailTypes';

export interface RawListingDetailInput {
  id: string;
  ownerUserId?: string;
  workspaceId?: string;
  title?: string;
  transactionType?: 'sale' | 'rent' | 'rahn_full' | string | null;
  askingSalePriceMillionToman?: number | null;
  rahnDepositMillionToman?: number | null;
  monthlyRentMillionToman?: number | null;
  builtAreaSqm?: number | null;
  publishedAtIso?: string | null;
  lastObservedAtIso?: string | null;
  updatedAtIso?: string | null;
  lastVerifiedAtIso?: string | null;
  backendStatus?: string | null;
  publisherNameFa?: string | null;
  publisherPhonePrivate?: string | null;
  cityId?: string;
  cityNameFa?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  linkedPropertyId?: string | null;
  propertyMatchConfidence?: PropertyListingMatchConfidence;
  media?: EntityDetailMediaItem[];
}

export function mapBackendListingStatusToStateMachine(rawStatus?: string | null): ListingLifecycleState {
  const normalized = (rawStatus || '').trim().toUpperCase();
  if (normalized === 'DRAFT') return 'DRAFT';
  if (normalized === 'PENDING' || normalized === 'PENDING_REVIEW') return 'PENDING_REVIEW';
  if (normalized === 'REJECTED') return 'REJECTED';
  if (normalized === 'EXPIRED') return 'EXPIRED';
  if (normalized === 'REMOVED' || normalized === 'DELETED') return 'REMOVED';
  if (normalized === 'SUSPENDED') return 'SUSPENDED';
  return 'PUBLISHED';
}

export function adaptListingDetail(
  raw: RawListingDetailInput,
  accessContext?: AccessContext
): EntityDetailModel {
  const id = String(raw.id || '').trim();
  const capabilities = resolveEntityDetailCapabilities('listing', accessContext, {
    resourceId: id,
    ownerUserId: raw.ownerUserId,
    workspaceId: raw.workspaceId,
    cityId: raw.cityId,
  });

  const canSeePrivate = Boolean(capabilities.canViewPrivateData);
  const lifecycleState = mapBackendListingStatusToStateMachine(raw.backendStatus);
  const matchConfidence: PropertyListingMatchConfidence =
    raw.linkedPropertyId ? raw.propertyMatchConfidence ?? 'PROBABLE_MATCH' : 'UNLINKED';

  const financialFields = normalizeEntityFinancialFields({
    transactionType: raw.transactionType,
    askingSalePriceMillionToman: raw.askingSalePriceMillionToman,
    rahnDepositMillionToman: raw.rahnDepositMillionToman,
    monthlyRentMillionToman: raw.monthlyRentMillionToman,
    builtAreaSqm: raw.builtAreaSqm,
    observedAt: raw.lastObservedAtIso ?? undefined,
    updatedAt: raw.updatedAtIso ?? undefined,
  });

  const relatedEntities: EntityDetailModel['relatedEntities'] = [];
  if (raw.linkedPropertyId) {
    relatedEntities.push({
      id: raw.linkedPropertyId,
      entityType: 'property',
      title:
        matchConfidence === 'EXACT_VERIFIED'
          ? `پرونده ملک تأییدشده (${raw.linkedPropertyId})`
          : `تطبیق احتمالی با ملک (${raw.linkedPropertyId})`,
      canonicalPath: buildCanonicalEntityDetailPath('property', raw.linkedPropertyId),
      matchStatus: matchConfidence,
    });
  }

  return {
    id,
    entityType: 'listing',
    title: raw.title || `آگهی شماره ${id}`,
    canonicalPath: buildCanonicalEntityDetailPath('listing', id),
    cityId: raw.cityId,
    cityNameFa: raw.cityNameFa,
    neighborhoodId: raw.neighborhoodId,
    neighborhoodNameFa: raw.neighborhoodNameFa,
    pageStatus:
      lifecycleState === 'REMOVED'
        ? 'Deleted'
        : lifecycleState === 'EXPIRED'
          ? 'Archived'
          : lifecycleState === 'SUSPENDED'
            ? 'Restricted'
            : 'Success',
    fields: {
      lifecycleState: createEntityDetailField(lifecycleState, { confidence: 'verified' }),
      builtAreaSqm: createEntityDetailField(
        typeof raw.builtAreaSqm === 'number' && raw.builtAreaSqm > 0 ? raw.builtAreaSqm : null,
        { unit: 'مترمربع', confidence: 'unverified', observedAt: raw.lastObservedAtIso ?? undefined }
      ),
      publisherNameFa: createEntityDetailField(raw.publisherNameFa ?? null, { confidence: 'unverified' }),
      publisherContact: createEntityDetailField(
        canSeePrivate ? raw.publisherPhonePrivate ?? null : null,
        {
          confidence: canSeePrivate && raw.publisherPhonePrivate ? 'verified' : 'unknown',
          limitationNoteFa: canSeePrivate ? undefined : 'اطلاعات تماس مستقیم مطابق سیاست حریم خصوصی محافظت شده است.',
        }
      ),
      propertyMatchConfidence: createEntityDetailField(matchConfidence, {
        confidence: matchConfidence === 'EXACT_VERIFIED' ? 'verified' : 'estimated',
      }),
      publishedAt: createEntityDetailField(raw.publishedAtIso ?? null, { confidence: 'verified' }),
      lastObservedAt: createEntityDetailField(raw.lastObservedAtIso ?? null, { confidence: 'verified' }),
      ...financialFields,
    },
    media: (raw.media || []).filter((m) => canSeePrivate || !m.isPrivate),
    relatedEntities,
    capabilities,
    timestamps: {
      publishedAt: raw.publishedAtIso ?? undefined,
      lastObservedAt: raw.lastObservedAtIso ?? undefined,
      updatedAt: raw.updatedAtIso ?? undefined,
      lastVerifiedAt: raw.lastVerifiedAtIso ?? undefined,
    },
  };
}

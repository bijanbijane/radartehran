import crypto from 'node:crypto';
import { ProvinceId, SupportedCityId } from '../geography/types';
import { evaluateJurisdictionHierarchyMatch } from './applicabilityEngine';
import { LegalRegulatoryStore, paginateSortedItems } from './store';
import {
  LegalRegulatoryActorContext,
  NonAuthoritativeAiSummaryRecord,
  PaginatedResult,
  PropertyCategoryType,
  PublicRegulatoryProvisionView,
  RegulatoryDocumentCategory,
  RegulatorySourceCategory,
} from './types';
import {
  assertAdminOrReviewerActor,
  assertNonEmptyText,
  assertValidIsoDate,
  isPrivilegedRegulatoryViewer,
  LegalRegulatoryError,
  toPublicRegulatoryProvision,
} from './validationAndAuthz';

export interface LegalRegulatorySearchQuery {
  keyword?: string;
  issuingAuthority?: string;
  countryCode?: 'IR';
  provinceId?: ProvinceId;
  cityId?: SupportedCityId;
  districtNumber?: number;
  neighborhoodId?: string;
  sourceCategory?: RegulatorySourceCategory;
  documentCategory?: RegulatoryDocumentCategory;
  propertyCategory?: PropertyCategoryType;
  publishedFromIso?: string;
  publishedToIso?: string;
  effectiveAsOfDateIso?: string;
  includeHistoricalOrRepealed?: boolean;
  includeUnverifiedDrafts?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface RecordNonAuthoritativeAiSuggestionInput {
  targetEntityType: 'SOURCE' | 'DOCUMENT' | 'PROVISION' | 'PROPERTY_PROFILE';
  targetEntityId: string;
  targetEntityVersion: number;
  summaryText: string;
  suggestedCategoryTags?: string[];
  modelIdentifier: string;
  promptTemplateVersion: string;
  attemptSetAuthoritative?: boolean;
  attemptOverwriteOriginalLegalText?: boolean;
  attemptEstablishCompliance?: boolean;
}

export async function executeSearchProvisions(
  store: LegalRegulatoryStore,
  query: LegalRegulatorySearchQuery,
  actor?: LegalRegulatoryActorContext,
): Promise<PaginatedResult<PublicRegulatoryProvisionView>> {
  const [allProvisions, allSources, allRules] = await Promise.all([
    store.listProvisions(),
    store.listSources(),
    store.listApplicabilityRules(),
  ]);
  const sourceMap = new Map(allSources.map((s) => [s.id, s]));
  const privileged = isPrivilegedRegulatoryViewer(actor);
  const asOfMs = query.effectiveAsOfDateIso
    ? Date.parse(assertValidIsoDate(query.effectiveAsOfDateIso, 'effectiveAsOfDateIso'))
    : null;

  const filtered = allProvisions.filter((prov) => {
    const src = sourceMap.get(prov.sourceId);
    if (!src) return false;
    if (!privileged || !query.includeUnverifiedDrafts) {
      if (
        prov.verificationStatus === 'UNVERIFIED' ||
        src.verificationStatus === 'UNVERIFIED' ||
        prov.lifecycleStatus === 'DRAFT_UNVERIFIED'
      ) {
        return false;
      }
    }
    if (!query.includeHistoricalOrRepealed) {
      if (prov.lifecycleStatus === 'REPEALED' || prov.lifecycleStatus === 'SUPERSEDED') return false;
    }
    if (query.sourceCategory && src.sourceCategory !== query.sourceCategory) return false;
    if (query.documentCategory && prov.documentCategory !== query.documentCategory) return false;
    if (
      query.issuingAuthority &&
      !src.issuingAuthority.toLowerCase().includes(query.issuingAuthority.trim().toLowerCase())
    ) {
      return false;
    }
    if (query.publishedFromIso && Date.parse(src.publicationDateIso) < Date.parse(query.publishedFromIso)) {
      return false;
    }
    if (query.publishedToIso && Date.parse(src.publicationDateIso) > Date.parse(query.publishedToIso)) {
      return false;
    }
    if (asOfMs !== null) {
      const fromMs = Date.parse(prov.effectiveFromIso);
      const toMs = prov.effectiveToIso ? Date.parse(prov.effectiveToIso) : Number.POSITIVE_INFINITY;
      const repealMs = prov.repealedAtIso ? Date.parse(prov.repealedAtIso) : Number.POSITIVE_INFINITY;
      if (asOfMs < fromMs || asOfMs >= toMs || asOfMs >= repealMs) return false;
    }
    if (query.provinceId || query.cityId || query.districtNumber !== undefined || query.neighborhoodId) {
      const geoMatch = evaluateJurisdictionHierarchyMatch(prov.jurisdictionScope, {
        countryCode: 'IR',
        provinceId: query.provinceId,
        cityId: query.cityId,
        districtNumber: query.districtNumber,
        neighborhoodId: query.neighborhoodId,
      });
      if (geoMatch.status !== 'MATCH') return false;
    }
    if (query.propertyCategory) {
      const matchingRules = allRules.filter((r) => r.provisionId === prov.id);
      const supportsCategory = matchingRules.some(
        (r) =>
          !r.conditions.requiredPropertyCategories?.length ||
          r.conditions.requiredPropertyCategories.includes(query.propertyCategory!),
      );
      if (matchingRules.length > 0 && !supportsCategory) return false;
    }
    if (query.keyword?.trim()) {
      const kw = query.keyword.trim().toLowerCase();
      const haystack = [
        prov.titleFa,
        prov.citationLabel,
        prov.originalTextVerbatim,
        prov.plainLanguageSummary ?? '',
        src.officialTitleFa,
        src.officialReferenceNumber,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });

  return paginateSortedItems(
    filtered.map((p) => toPublicRegulatoryProvision(p, actor)),
    query.limit,
    query.cursor,
  );
}

export async function executeRecordNonAuthoritativeAiSuggestion(
  store: LegalRegulatoryStore,
  input: RecordNonAuthoritativeAiSuggestionInput,
  actor: LegalRegulatoryActorContext,
): Promise<NonAuthoritativeAiSummaryRecord> {
  assertAdminOrReviewerActor(actor, ['LEGAL_REVIEWER', 'REGULATORY_ADMIN']);
  if (
    input.attemptSetAuthoritative ||
    input.attemptOverwriteOriginalLegalText ||
    input.attemptEstablishCompliance
  ) {
    throw new LegalRegulatoryError(
      'AUTHORITATIVE_AI_VIOLATION',
      'AI-generated summaries or interpretations are strictly non-authoritative and cannot overwrite official legal text or establish compliance.',
      422,
    );
  }

  const nowIso = new Date().toISOString();
  const record: NonAuthoritativeAiSummaryRecord = {
    id: `ai_sum_${crypto.randomUUID()}`,
    targetEntityType: input.targetEntityType,
    targetEntityId: assertNonEmptyText(input.targetEntityId, 'targetEntityId', 120),
    targetEntityVersion: input.targetEntityVersion,
    summaryText: assertNonEmptyText(input.summaryText, 'summaryText', 6000),
    suggestedCategoryTags: input.suggestedCategoryTags ?? [],
    modelIdentifier: assertNonEmptyText(input.modelIdentifier, 'modelIdentifier', 120),
    promptTemplateVersion: assertNonEmptyText(input.promptTemplateVersion, 'promptTemplateVersion', 120),
    generatedAtIso: nowIso,
    generatedByActorId: actor.actorId,
    isAuthoritative: false,
    requiresHumanReview: true,
    humanReviewStatus: 'UNREVIEWED',
    disclaimer:
      'AI-GENERATED NON-AUTHORITATIVE SUMMARY: Requires human legal reviewer verification. Never rely on this summary as primary statutory text or compliance certification.',
  };

  const saved = await store.saveAiSummaryRecord(record);
  if (input.targetEntityType === 'PROVISION') {
    const prov = await store.getProvisionById(input.targetEntityId);
    if (prov) {
      await store.saveProvision(
        {
          ...prov,
          nonAuthoritativeAiSummary: saved,
          updatedAtIso: nowIso,
          version: prov.version + 1,
        },
        prov.version,
      );
    }
  }
  return saved;
}

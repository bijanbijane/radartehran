/**
 * RT-UI-SEARCH-001 | Multi-Domain Search Orchestrator, Geospatial Engine,
 * Explainable Ranking, Facets, Zero-Result Assistant & Versioned Index Engine
 */

import {
  SearchBoundingBox,
  SearchDocument,
  SearchErrorCode,
  SearchExecutionResponse,
  SearchFacetsResponse,
  SearchFilterSet,
  SearchIndexJob,
  SearchPolygonGeometry,
  SearchRankingPolicy,
  SearchResultItem,
  SearchScope,
  SearchSortOption,
  SearchSynonymRecord,
  ZeroResultSuggestion,
} from '../models/search.types';
import { DEFAULT_RANKING_POLICIES, INITIAL_SEARCH_DOCUMENTS, sanitizeDocumentLocationForCaller } from './searchDomainAdapters';
import { buildSearchPlan, INITIAL_SYNONYM_REGISTRY, PLACE_HIERARCHY_REGISTRY } from './searchNormalizerAndPlanner';

export interface SearchCallerContext {
  userId?: string;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
}

export function canCallerAccessSearchDocument(doc: SearchDocument, caller: SearchCallerContext): boolean {
  if (doc.visibility === 'DELETED') return false;
  if (doc.visibility === 'PUBLIC') return true;
  if (doc.visibility === 'AUTHENTICATED') return Boolean(caller.isAuthenticated || caller.userId || caller.isAdmin);
  if (doc.visibility === 'OWNER_ONLY') return Boolean(caller.isAdmin || (caller.userId && doc.ownerUserId === caller.userId));
  if (doc.visibility === 'PARTICIPANTS_ONLY') return false;
  if (doc.visibility === 'ADMIN_ONLY') return Boolean(caller.isAdmin);
  return false;
}

export function validateUserPolygonGeometry(polygon: SearchPolygonGeometry): { valid: boolean; errorCode?: SearchErrorCode; messageFa?: string } {
  if (!polygon || !Array.isArray(polygon.coordinates) || polygon.coordinates.length < 3) {
    return { valid: false, errorCode: 'INVALID_GEOMETRY', messageFa: 'چندضلعی انتخابی باید حداقل ۳ نقطه داشته باشد.' };
  }
  if (polygon.coordinates.length > 64) return { valid: false, errorCode: 'INVALID_GEOMETRY', messageFa: 'تعداد نقاط چندضلعی بیش از حد مجاز (۶۴ نقطه) است.' };
  for (const pt of polygon.coordinates) {
    if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng) || pt.lat < 24 || pt.lat > 40 || pt.lng < 44 || pt.lng > 64) {
      return { valid: false, errorCode: 'INVALID_GEOMETRY', messageFa: 'مختصات چندضلعی خارج از محدوده مجاز جغرافیایی است.' };
    }
  }
  return { valid: true };
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function isPointWithinBoundingBox(lat: number, lng: number, box: SearchBoundingBox): boolean {
  return lat <= box.north && lat >= box.south && lng <= box.east && lng >= box.west;
}

export function isPointInPolygon(lat: number, lng: number, polygon: SearchPolygonGeometry): boolean {
  const pts = polygon.coordinates;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export class SearchIndexAndOrchestratorEngine {
  private documents: Map<string, SearchDocument> = new Map();
  private tombstones: Map<string, { sourceVersion: number; deletedAt: string }> = new Map();
  private synonyms: SearchSynonymRecord[] = [...INITIAL_SYNONYM_REGISTRY];
  private rankingPolicies: Record<SearchScope, SearchRankingPolicy> = { ...DEFAULT_RANKING_POLICIES };
  private indexJobs: SearchIndexJob[] = [];
  private zeroResultLogs: Array<{ query: string; scope: SearchScope; timestamp: string }> = [];

  constructor(initialDocs: SearchDocument[] = INITIAL_SEARCH_DOCUMENTS) {
    initialDocs.forEach((doc) => this.documents.set(doc.id, { ...doc }));
    this.indexJobs.push({
      id: 'idx-job-boot-1', jobType: 'FULL_REINDEX', scope: 'ALL', status: 'COMPLETED',
      documentsProcessed: initialDocs.length, lagMs: 42, startedAt: '2026-04-12T06:00:00Z', completedAt: '2026-04-12T06:00:01Z',
    });
  }

  public upsertDocument(doc: SearchDocument): { applied: boolean; reason: string } {
    const tombstone = this.tombstones.get(doc.id);
    if (tombstone && doc.sourceVersion <= tombstone.sourceVersion) return { applied: false, reason: 'STALE_VERSION_OLDER_THAN_TOMBSTONE' };
    const existing = this.documents.get(doc.id);
    if (existing && doc.sourceVersion < existing.sourceVersion) return { applied: false, reason: 'STALE_VERSION_IGNORED' };
    this.documents.set(doc.id, { ...doc });
    return { applied: true, reason: 'UPSERTED' };
  }

  public tombstoneDeleteDocument(docId: string, sourceVersion: number): { deleted: boolean } {
    const existing = this.documents.get(docId);
    if (existing && sourceVersion < existing.sourceVersion) return { deleted: false };
    this.tombstones.set(docId, { sourceVersion, deletedAt: new Date().toISOString() });
    if (existing) this.documents.set(docId, { ...existing, visibility: 'DELETED', sourceVersion });
    return { deleted: true };
  }

  public triggerReindex(scope: SearchScope = 'ALL'): SearchIndexJob {
    const job: SearchIndexJob = {
      id: `idx-job-${Date.now()}`, jobType: scope === 'ALL' ? 'FULL_REINDEX' : 'SCOPE_REINDEX', scope, status: 'COMPLETED',
      documentsProcessed: Array.from(this.documents.values()).filter((d) => scope === 'ALL' || d.scope === scope).length,
      lagMs: 28, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    };
    this.indexJobs.unshift(job);
    return job;
  }

  public executeSearch(params: {
    requestId?: string; rawQuery: string; scope?: SearchScope; explicitFilters?: SearchFilterSet;
    sort?: SearchSortOption; caller?: SearchCallerContext; degradedScopes?: SearchScope[];
  }): SearchExecutionResponse {
    const startMs = Date.now();
    const requestId = params.requestId || `req-${startMs}`;
    const activeScope: SearchScope = params.scope || 'ALL';
    const sort: SearchSortOption = params.sort || 'RELEVANCE';
    const caller: SearchCallerContext = params.caller || { isAuthenticated: false };
    const plan = buildSearchPlan(params.rawQuery, this.synonyms);
    const appliedFilters: SearchFilterSet = { ...plan.autoAppliedFilters, ...(params.explicitFilters || {}) };

    const degradedSet = new Set<SearchScope>(params.degradedScopes || []);
    const allVisibleDocs = Array.from(this.documents.values())
      .filter((doc) => canCallerAccessSearchDocument(doc, caller))
      .filter((doc) => !degradedSet.has(doc.scope))
      .map((doc) => sanitizeDocumentLocationForCaller(doc, caller));

    const groupedCounts: Record<SearchScope, number> = {
      ALL: 0, PROPERTIES: 0, LISTINGS: 0, NEIGHBORHOODS: 0, MARKET: 0,
      VALUATION: 0, SERVICES: 0, PROVIDERS: 0, KNOWLEDGE: 0, COMMUNITY: 0, MAP: 0, ACCOUNT: 0,
    };

    const policy = this.rankingPolicies[activeScope] || this.rankingPolicies.ALL;
    const scoredItems: SearchResultItem[] = [];

    for (const doc of allVisibleDocs) {
      if (!this.matchesStructuredAndGeoFilters(doc, appliedFilters)) continue;
      const evalResult = this.scoreDocument(doc, plan, appliedFilters, policy);
      if (plan.normalizedQuery.length > 0 && evalResult.score <= 0.08) continue;

      groupedCounts.ALL += 1;
      groupedCounts[doc.scope] = (groupedCounts[doc.scope] || 0) + 1;
      if (doc.entityType === 'LISTING') groupedCounts.LISTINGS += 1;

      const inActiveScope =
        activeScope === 'ALL' || doc.scope === activeScope ||
        (activeScope === 'LISTINGS' && doc.entityType === 'LISTING') ||
        (activeScope === 'PROVIDERS' && doc.entityType === 'SERVICE_PROVIDER') ||
        (activeScope === 'MAP' && doc.lat !== undefined && doc.lng !== undefined);

      if (inActiveScope) scoredItems.push(evalResult);
    }

    this.sortScoredItems(scoredItems, sort);
    if (scoredItems.length === 0 && plan.normalizedQuery.trim().length > 0) {
      this.zeroResultLogs.unshift({ query: plan.rawQuery, scope: activeScope, timestamp: new Date().toISOString() });
    }

    const facets = this.computeFacets(scoredItems.map((i) => i.document), groupedCounts);
    const zeroResultAssistant = scoredItems.length === 0 ? this.buildZeroResultAssistant(plan.rawQuery, appliedFilters) : undefined;

    return {
      requestId, plan, activeScope, appliedFilters, sort, totalCount: scoredItems.length, results: scoredItems,
      groupedCounts, facets,
      partialSourceFailure: degradedSet.size > 0
        ? { degradedSources: Array.from(degradedSet), warningFa: `برخی منابع (${Array.from(degradedSet).join('، ')}) موقتاً با تاخیر پاسخ دادند؛ نتایج سایر بخش‌ها نمایش داده شده است.` }
        : undefined,
      zeroResultAssistant, rankingPolicyVersion: policy.version, latencyMs: Math.max(1, Date.now() - startMs),
    };
  }

  private matchesStructuredAndGeoFilters(doc: SearchDocument, f: SearchFilterSet): boolean {
    if (f.neighborhoodId && doc.neighborhoodId && doc.neighborhoodId !== f.neighborhoodId) return false;
    if (f.districtNumber && doc.districtNumber && doc.districtNumber !== f.districtNumber) return false;
    if (f.propertyType && doc.propertyType && doc.propertyType !== f.propertyType) return false;
    if (f.transactionType && doc.transactionType && doc.transactionType !== f.transactionType) return false;
    if (f.bedrooms && doc.bedrooms !== undefined && doc.bedrooms !== f.bedrooms) return false;
    if (f.maxPriceMillionToman && doc.priceMillionToman !== undefined && doc.priceMillionToman > f.maxPriceMillionToman) return false;
    if (f.minPriceMillionToman && doc.priceMillionToman !== undefined && doc.priceMillionToman < f.minPriceMillionToman) return false;
    if (f.minAreaSqm && doc.areaSqm !== undefined && doc.areaSqm < f.minAreaSqm) return false;
    if (f.maxAreaSqm && doc.areaSqm !== undefined && doc.areaSqm > f.maxAreaSqm) return false;
    if (f.verifiedOnly && !doc.verified) return false;
    if (f.boundingBox && (doc.lat === undefined || doc.lng === undefined || !isPointWithinBoundingBox(doc.lat, doc.lng, f.boundingBox))) return false;
    if (f.polygon && (doc.lat === undefined || doc.lng === undefined || !isPointInPolygon(doc.lat, doc.lng, f.polygon))) return false;
    if (f.nearPoint && (doc.lat === undefined || doc.lng === undefined || haversineDistanceMeters(doc.lat, doc.lng, f.nearPoint.lat, f.nearPoint.lng) > f.nearPoint.radiusMeters)) return false;
    return true;
  }

  private scoreDocument(doc: SearchDocument, plan: ReturnType<typeof buildSearchPlan>, filters: SearchFilterSet, policy: SearchRankingPolicy): SearchResultItem {
    const explanationFa: string[] = [];
    const matchedTerms: string[] = [];
    const searchable = `${doc.titleFa} ${doc.subtitleFa} ${doc.summaryFa} ${doc.tags.join(' ')} ${doc.neighborhoodName || ''}`;

    let textHits = 0;
    for (const term of plan.expandedTerms) {
      if (term.length >= 2 && searchable.includes(term)) { textHits += 1; matchedTerms.push(term); }
    }

    const textScore = plan.expandedTerms.length === 0 ? 0.65 : Math.min(1, textHits / Math.max(1, plan.tokens.length));
    let entityScore = 0;
    if (filters.neighborhoodId && doc.neighborhoodId === filters.neighborhoodId) {
      entityScore = 1; explanationFa.push(`تطبیق دقیق محله (${doc.neighborhoodName})`);
    } else if (filters.districtNumber && doc.districtNumber === filters.districtNumber) {
      entityScore = 0.85; explanationFa.push(`در منطقه ${doc.districtNumber} تهران`);
    }

    if (filters.bedrooms && doc.bedrooms === filters.bedrooms) explanationFa.push(`مطابق تعداد اتاق (${doc.bedrooms}خوابه)`);
    if (filters.maxPriceMillionToman && doc.priceMillionToman && doc.priceMillionToman <= filters.maxPriceMillionToman) explanationFa.push('در محدوده بودجه انتخابی');
    if (filters.boundingBox || filters.polygon) explanationFa.push('در محدوده نقشه انتخابی شما');
    if (doc.verified) explanationFa.push('اطلاعات تاییدشده رادار');
    if (explanationFa.length === 0 && matchedTerms.length > 0) explanationFa.push(`مرتبط با عبارت «${matchedTerms.slice(0, 2).join('، ')}»`);

    const intentBonus = plan.targetScopes.includes(doc.scope) ? 0.18 : 0;
    const totalScore = Number((
      textScore * policy.weights.textualRelevance + entityScore * policy.weights.exactEntityMatch +
      (doc.qualityScore / 100) * policy.weights.qualityAndVerification + intentBonus
    ).toFixed(4));

    const distanceMeters = filters.nearPoint && doc.lat !== undefined && doc.lng !== undefined
      ? haversineDistanceMeters(doc.lat, doc.lng, filters.nearPoint.lat, filters.nearPoint.lng) : undefined;

    return { document: doc, score: totalScore, explanationFa, matchedTerms, distanceMeters };
  }

  private sortScoredItems(items: SearchResultItem[], sort: SearchSortOption): void {
    items.sort((a, b) => {
      if (sort === 'PRICE_ASC') return (a.document.priceMillionToman ?? 1e9) - (b.document.priceMillionToman ?? 1e9);
      if (sort === 'PRICE_DESC') return (b.document.priceMillionToman ?? 0) - (a.document.priceMillionToman ?? 0);
      if (sort === 'PRICE_PER_SQM_ASC') return (a.document.pricePerSqmMillionToman ?? 1e9) - (b.document.pricePerSqmMillionToman ?? 1e9);
      if (sort === 'AREA_DESC') return (b.document.areaSqm ?? 0) - (a.document.areaSqm ?? 0);
      if (sort === 'DISTANCE_ASC') return (a.distanceMeters ?? 1e9) - (b.distanceMeters ?? 1e9);
      if (sort === 'POPULARITY_DESC') return b.document.popularityScore - a.document.popularityScore;
      if (sort === 'QUALITY_SCORE_DESC' || sort === 'RATING_DESC') return b.document.qualityScore - a.document.qualityScore;
      if (sort === 'NEWEST') return b.document.freshnessTimestamp.localeCompare(a.document.freshnessTimestamp);
      return b.score - a.score;
    });
  }

  private computeFacets(docs: SearchDocument[], groupedCounts: Record<SearchScope, number>): SearchFacetsResponse {
    const scopeLabels: Array<[SearchScope, string]> = [
      ['ALL', 'همه نتایج'], ['PROPERTIES', 'املاک و آگهی‌ها'], ['NEIGHBORHOODS', 'محله‌ها و مناطق'],
      ['MARKET', 'بازار و شاخص‌ها'], ['VALUATION', 'ارزش‌گذاری'], ['SERVICES', 'خدمات و متخصصان'],
      ['KNOWLEDGE', 'دانش و پژوهش'], ['COMMUNITY', 'جامعه و پرسش‌ها'],
    ];
    return {
      scopes: scopeLabels.map(([value, labelFa]) => ({ value, labelFa, count: groupedCounts[value] || 0 })),
      districts: [1, 2, 3, 4, 5].map((d) => ({ value: String(d), labelFa: `منطقه ${d}`, count: docs.filter((doc) => doc.districtNumber === d).length })),
      propertyTypes: [
        { value: 'APARTMENT', labelFa: 'آپارتمان مسکونی', count: docs.filter((d) => d.propertyType === 'APARTMENT').length },
        { value: 'OFFICE', labelFa: 'واحد اداری', count: docs.filter((d) => d.propertyType === 'OFFICE').length },
        { value: 'OLD_HOUSE', labelFa: 'ملک کلنگی', count: docs.filter((d) => d.propertyType === 'OLD_HOUSE').length },
      ],
      transactionTypes: [
        { value: 'BUY', labelFa: 'خرید و فروش', count: docs.filter((d) => d.transactionType === 'BUY').length },
        { value: 'FULL_MORTGAGE', labelFa: 'رهن کامل', count: docs.filter((d) => d.transactionType === 'FULL_MORTGAGE').length },
      ],
      verifiedCount: docs.filter((d) => d.verified).length,
    };
  }

  private buildZeroResultAssistant(rawQuery: string, filters: SearchFilterSet): ZeroResultSuggestion {
    return {
      reasonFa: filters.maxPriceMillionToman
        ? 'با سقف بودجه و فیلترهای فعلی موردی یافت نشد؛ افزایش سقف بودجه یا حذف یکی از فیلترها پیشنهاد می‌شود.'
        : `برای عبارت «${rawQuery}» نتیجه مستقیمی یافت نشد؛ عبارت‌های مشابه یا محله‌های هم‌جوار را بررسی کنید.`,
      relaxedFilterLabelFa: filters.maxPriceMillionToman ? 'حذف محدودیت سقف بودجه' : 'نمایش همه حوزه‌های رادار',
      suggestedQueries: ['آپارتمان دوخوابه در سعادت‌آباد', 'میانگین قیمت آپارتمان در منطقه ۵', 'کارشناس رسمی ارزیابی ملک'],
      nearbyNeighborhoods: PLACE_HIERARCHY_REGISTRY.slice(0, 4).map((p) => ({ id: p.id, name: p.canonicalName, district: p.district })),
    };
  }

  public getAdminDiagnostics() {
    return {
      totalIndexedDocuments: Array.from(this.documents.values()).filter((d) => d.visibility !== 'DELETED').length,
      tombstoneCount: this.tombstones.size, synonyms: this.synonyms, rankingPolicies: Object.values(this.rankingPolicies),
      recentIndexJobs: this.indexJobs.slice(0, 10), zeroResultQueries: this.zeroResultLogs.slice(0, 15),
    };
  }

  public addSynonym(record: Omit<SearchSynonymRecord, 'id' | 'updatedAt'>): SearchSynonymRecord {
    const created: SearchSynonymRecord = { ...record, id: `syn-${Date.now()}`, updatedAt: new Date().toISOString() };
    this.synonyms.unshift(created);
    return created;
  }
}

export const defaultSearchEngine = new SearchIndexAndOrchestratorEngine();

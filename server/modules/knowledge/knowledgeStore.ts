/** @file server/modules/knowledge/knowledgeStore.ts — Durable Server-Side Knowledge Governance, Versioning, Corrections & Bookmarks Store (Stages 81–88) */
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeInput } from '../../../src/utils/security';
import { KNOWLEDGE_PUBLICATIONS } from '../../../src/features/knowledge/data/knowledgeCatalog';
import { KNOWLEDGE_GLOSSARY_TERMS } from '../../../src/features/knowledge/data/knowledgeGlossaryData';
import {
  KNOWLEDGE_DATA_BRIEFS,
  KNOWLEDGE_SOURCE_REGISTRY,
  resolvePublicationSourcesById,
  type KnowledgeDataBrief,
} from '../../../src/features/knowledge/data/knowledgeSourcesAndBriefs';
import {
  filterGlossaryTerms,
  normalizeKnowledgePersianQuery,
  validateEditorialStatusTransition,
} from '../../../src/features/knowledge/services/knowledgeSearchService';
import type {
  GlossaryTermCategory,
  KnowledgeContentType,
  KnowledgeCorrectionInput,
  KnowledgeCorrectionRecord,
  KnowledgeCorrectionStatus,
  KnowledgeCorrectionType,
  KnowledgeEditorialDecision,
  KnowledgeEditorialRole,
  KnowledgeFreshnessStatus,
  KnowledgeGlossaryTerm,
  KnowledgePublication,
  KnowledgePublicationListResponse,
  KnowledgePublicationStatus,
  KnowledgePublicationVersionSnapshot,
  KnowledgeSourceRecord,
  SavedKnowledgeBookmarkItem,
} from '../../../src/features/knowledge/types/knowledge.types';
import type { SavedValuationReport } from '../../../src/features/valuation/types/valuation.types';
import { validateAndMigrateSavedValuationReports } from '../../../src/features/valuation/services/valuationStorageAndApiClient';

export const MAX_KNOWLEDGE_PAGE_SIZE = 20;
export const MAX_SAVED_KNOWLEDGE_PER_USER = 50;
export const MAX_SAVED_VALUATIONS_PER_USER = 25;
const DEFAULT_KNOWLEDGE_STORE_PATH = path.resolve(process.cwd(), '.cache/knowledge-store-v2.json');

const clone = <T>(val: T): T => JSON.parse(JSON.stringify(val));

export interface ServerKnowledgePersistedState {
  schemaVersion: number;
  updatedAtIso: string;
  publications: KnowledgePublication[];
  sources: KnowledgeSourceRecord[];
  dataBriefs: KnowledgeDataBrief[];
  corrections: KnowledgeCorrectionRecord[];
  bookmarksByUserId: Record<string, string[]>;
  valuationReportsByUserId: Record<string, SavedValuationReport[]>;
}

function buildVersionSnapshot(pub: KnowledgePublication, versionLabel?: string, prevId?: string | null, changelogOverride?: string): KnowledgePublicationVersionSnapshot {
  const ver = versionLabel || pub.version;
  return {
    versionId: `${pub.id}-${ver}`,
    publicationId: pub.id,
    version: ver,
    publishedAtFa: pub.publishedAtFa,
    updatedAtFa: pub.updatedAtFa,
    updatedAtIso: pub.updatedAtIso || new Date().toISOString(),
    previousVersionId: prevId !== undefined ? prevId : (pub.previousVersionId ?? null),
    status: pub.status ?? pub.defaultPublicationStatus,
    changelogFa: changelogOverride || pub.changelogFa,
    titleFa: pub.titleFa,
    summaryFa: pub.summaryFa,
    geographyScopeFa: pub.geographyScopeFa,
    periodLabelFa: pub.periodLabelFa,
    formulaVersion: pub.formulaVersion,
    sourceIds: [...(pub.sourceIds ?? [])],
    rawDataSummaryFa: pub.rawDataSummaryFa,
    calculatedIndicators: clone(pub.calculatedIndicators),
    researchInterpretationFa: pub.researchInterpretationFa,
    limitationsFa: [...pub.limitationsFa],
  };
}

export function createInitialKnowledgeServerState(): ServerKnowledgePersistedState {
  const publications: KnowledgePublication[] = KNOWLEDGE_PUBLICATIONS.map((raw) => {
    const pub = clone(raw);
    pub.status = pub.status ?? pub.defaultPublicationStatus;
    pub.source = 'seed';
    const currentSnap = buildVersionSnapshot(pub);
    const history: KnowledgePublicationVersionSnapshot[] = [currentSnap];
    if (pub.previousVersionId && pub.id === 'rep-01') {
      history.push(
        buildVersionSnapshot(
          { ...pub, publishedAtFa: 'مهر ۱۴۰۵', updatedAtFa: '۱۴۰۵/۰۷/۲۵', status: 'archived' },
          'v2.3',
          null,
          'v2.3: نسخه آرشیوی پیش از تفکیک سناریوی مذاکره غرب تهران.',
        ),
      );
    }
    pub.versionHistory = history;
    pub.decisionHistory = [
      {
        decisionId: `dec-seed-${pub.id}`,
        publicationId: pub.id,
        fromStatus: 'approved',
        toStatus: pub.status,
        actorUserId: pub.technicalReviewer.id,
        actorRole: 'release_manager',
        reasonFa: 'تأیید اولیه شاخص‌ها و تطبیق مجوز منابع در بارگذاری پایه.',
        createdAt: pub.updatedAtIso || '2026-11-01T10:00:00.000Z',
      },
    ];
    return pub;
  });

  return {
    schemaVersion: 2,
    updatedAtIso: new Date().toISOString(),
    publications,
    sources: clone(KNOWLEDGE_SOURCE_REGISTRY as KnowledgeSourceRecord[]),
    dataBriefs: clone(KNOWLEDGE_DATA_BRIEFS as KnowledgeDataBrief[]),
    corrections: [],
    bookmarksByUserId: {},
    valuationReportsByUserId: {},
  };
}

function loadKnowledgeStateFromDisk(filePath: string = DEFAULT_KNOWLEDGE_STORE_PATH): ServerKnowledgePersistedState {
  const seed = createInitialKnowledgeServerState();
  try {
    if (!fs.existsSync(filePath)) return seed;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ServerKnowledgePersistedState;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.publications)) return seed;
    const byId = new Map<string, KnowledgePublication>();
    for (const p of raw.publications) {
      if (p && p.id) byId.set(p.id, p);
    }
    for (const sp of seed.publications) {
      if (!byId.has(sp.id)) byId.set(sp.id, sp);
    }
    return {
      schemaVersion: 2,
      updatedAtIso: raw.updatedAtIso || new Date().toISOString(),
      publications: Array.from(byId.values()),
      sources: Array.isArray(raw.sources) && raw.sources.length > 0 ? raw.sources : seed.sources,
      dataBriefs: Array.isArray(raw.dataBriefs) && raw.dataBriefs.length > 0 ? raw.dataBriefs : seed.dataBriefs,
      corrections: Array.isArray(raw.corrections) ? raw.corrections : [],
      bookmarksByUserId: raw.bookmarksByUserId && typeof raw.bookmarksByUserId === 'object' ? raw.bookmarksByUserId : {},
      valuationReportsByUserId:
        raw.valuationReportsByUserId && typeof raw.valuationReportsByUserId === 'object'
          ? raw.valuationReportsByUserId
          : {},
    };
  } catch {
    return seed;
  }
}

export const knowledgeServerStore: ServerKnowledgePersistedState = loadKnowledgeStateFromDisk();

export function persistKnowledgeServerStore(filePath: string = DEFAULT_KNOWLEDGE_STORE_PATH): void {
  knowledgeServerStore.updatedAtIso = new Date().toISOString();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(knowledgeServerStore, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch {
    // Ignore read-only fs in isolated environments
  }
}

export function resetKnowledgeServerStoreForTests(): void {
  try {
    if (fs.existsSync(DEFAULT_KNOWLEDGE_STORE_PATH)) fs.unlinkSync(DEFAULT_KNOWLEDGE_STORE_PATH);
  } catch { /* ignore */ }
  const fresh = createInitialKnowledgeServerState();
  knowledgeServerStore.schemaVersion = fresh.schemaVersion;
  knowledgeServerStore.updatedAtIso = fresh.updatedAtIso;
  knowledgeServerStore.publications = fresh.publications;
  knowledgeServerStore.sources = fresh.sources;
  knowledgeServerStore.dataBriefs = fresh.dataBriefs;
  knowledgeServerStore.corrections = fresh.corrections;
  knowledgeServerStore.bookmarksByUserId = fresh.bookmarksByUserId;
  knowledgeServerStore.valuationReportsByUserId = fresh.valuationReportsByUserId;
}

export function isPublicationPubliclyVisible(status: KnowledgePublicationStatus | undefined): boolean {
  return status === 'published' || status === 'archived';
}

export function queryServerKnowledgePublications(params: {
  subTab?: string;
  query?: string;
  contentType?: string;
  freshness?: string;
  geographyId?: string;
  neighborhoodId?: number;
  periodFrom?: string;
  periodTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'updated_desc' | 'published_desc' | 'title_asc';
  includeNonPublicForAdmin?: boolean;
}): KnowledgePublicationListResponse {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(MAX_KNOWLEDGE_PAGE_SIZE, Math.max(1, Number(params.pageSize) || 10));
  const q = normalizeKnowledgePersianQuery(params.query || '');
  const contentType = (params.contentType || 'all') as KnowledgeContentType | 'all';
  const freshness = (params.freshness || 'all') as KnowledgeFreshnessStatus | 'all';

  const filtered = knowledgeServerStore.publications.filter((pub) => {
    const st = pub.status;
    if (!st) return false;
    if (!params.includeNonPublicForAdmin) {
      if (!isPublicationPubliclyVisible(st)) return false;
      if (freshness === 'archived') {
        if (st !== 'archived' && pub.freshnessStatus !== 'archived') return false;
      } else {
        if (st === 'archived') return false;
        if (freshness !== 'all' && pub.freshnessStatus !== freshness) return false;
      }
    }
    if (params.subTab === 'guide' && pub.contentType !== 'guide') return false;
    if (params.subTab === 'methodology' && pub.contentType !== 'methodology') return false;
    if (params.subTab === 'reports' && (pub.contentType === 'guide' || pub.contentType === 'methodology')) return false;
    if (contentType !== 'all' && pub.contentType !== contentType) return false;
    if (params.geographyId && pub.geographyId && pub.geographyId !== params.geographyId) return false;
    if (params.neighborhoodId && Array.isArray(pub.neighborhoodIds) && !pub.neighborhoodIds.includes(params.neighborhoodId)) {
      return false;
    }
    if (params.periodFrom && pub.periodToIso && pub.periodToIso < params.periodFrom) return false;
    if (params.periodTo && pub.periodFromIso && pub.periodFromIso > params.periodTo) return false;
    if (q.length > 0) {
      const hay = normalizeKnowledgePersianQuery(
        `${pub.titleFa} ${pub.summaryFa} ${pub.categoryLabelFa} ${pub.geographyScopeFa} ${pub.author.nameFa} ${pub.formulaVersion} ${pub.relatedNeighborhoodNames.join(' ')}`,
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (params.sortBy === 'title_asc') return a.titleFa.localeCompare(b.titleFa, 'fa');
    return (Date.parse(b.updatedAtIso || '') || 0) - (Date.parse(a.updatedAtIso || '') || 0);
  });

  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    pagination: { page, pageSize, totalItems, totalPages },
    filters: {
      contentTypes: ['market_report', 'neighborhood_report', 'urban_research', 'methodology', 'guide', 'article'],
      freshnessStatuses: ['current', 'periodic', 'archived'],
    },
    serverUpdatedAtIso: knowledgeServerStore.updatedAtIso,
  };
}

export function getServerPublicationBySlugOrId(
  slugOrId: string,
  options?: { versionId?: string; includeNonPublic?: boolean },
): KnowledgePublication | null {
  const clean = sanitizeInput(slugOrId, 120).trim();
  const pub = knowledgeServerStore.publications.find((p) => p.id === clean || p.slug === clean);
  if (!pub) return null;
  if (!options?.includeNonPublic && !isPublicationPubliclyVisible(pub.status)) return null;

  if (options?.versionId && Array.isArray(pub.versionHistory)) {
    const snap = pub.versionHistory.find((v) => v.versionId === options.versionId || v.version === options.versionId);
    if (snap) {
      return {
        ...pub,
        version: snap.version,
        versionId: snap.versionId,
        previousVersionId: snap.previousVersionId,
        publishedAtFa: snap.publishedAtFa,
        updatedAtFa: snap.updatedAtFa,
        updatedAtIso: snap.updatedAtIso,
        status: snap.status,
        changelogFa: snap.changelogFa,
        titleFa: snap.titleFa,
        summaryFa: snap.summaryFa,
        rawDataSummaryFa: snap.rawDataSummaryFa,
        calculatedIndicators: clone(snap.calculatedIndicators),
        researchInterpretationFa: snap.researchInterpretationFa,
        limitationsFa: [...snap.limitationsFa],
      };
    }
  }
  return pub;
}

export function getServerPublicationSources(publicationId: string): KnowledgeSourceRecord[] | null {
  const pub = getServerPublicationBySlugOrId(publicationId, { includeNonPublic: true });
  if (!pub) return null;
  return resolvePublicationSourcesById(pub.sourceIds, knowledgeServerStore.sources);
}

/** Stage 86.1–86.6: Atomic server-side editorial transition + immutable decision history */
export function transitionServerPublicationStatus(params: {
  publicationId: string;
  toStatus: KnowledgePublicationStatus;
  actorUserId: string;
  actorRole: KnowledgeEditorialRole;
  reasonFa: string;
}): { ok: boolean; status: number; errorFa?: string; publication?: KnowledgePublication; decision?: KnowledgeEditorialDecision } {
  const pub = knowledgeServerStore.publications.find((p) => p.id === params.publicationId || p.slug === params.publicationId);
  if (!pub) return { ok: false, status: 404, errorFa: 'گزارش موردنظر در سرور یافت نشد.' };

  const fromStatus = pub.status ?? pub.defaultPublicationStatus;
  const check = validateEditorialStatusTransition({
    pub,
    fromStatus,
    toStatus: params.toStatus,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    reasonFa: params.reasonFa,
    sourcesRegistry: knowledgeServerStore.sources,
  });
  if (!check.ok) {
    return { ok: false, status: 422, errorFa: check.errorFa };
  }

  const decision: KnowledgeEditorialDecision = {
    decisionId: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    publicationId: pub.id,
    fromStatus,
    toStatus: params.toStatus,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    reasonFa: sanitizeInput(params.reasonFa, 280),
    createdAt: new Date().toISOString(),
  };

  pub.status = params.toStatus;
  if (params.toStatus === 'archived') pub.freshnessStatus = 'archived';
  if (params.toStatus === 'published' && pub.freshnessStatus === 'archived') pub.freshnessStatus = 'current';
  pub.updatedAtIso = decision.createdAt;
  pub.decisionHistory = [decision, ...(pub.decisionHistory ?? [])];
  persistKnowledgeServerStore();
  return { ok: true, status: 200, publication: pub, decision };
}

/** Stage 86.4: Publish a new version without overwriting previous version snapshots */
export function publishNewServerKnowledgeVersion(params: {
  publicationId: string;
  version: string;
  changelogFa: string;
  titleFa?: string;
  summaryFa?: string;
  actorUserId: string;
  actorRole: KnowledgeEditorialRole;
}): { ok: boolean; status: number; errorFa?: string; publication?: KnowledgePublication } {
  const pub = knowledgeServerStore.publications.find((p) => p.id === params.publicationId);
  if (!pub) return { ok: false, status: 404, errorFa: 'گزارش یافت نشد.' };
  const cleanVer = sanitizeInput(params.version, 20).trim();
  if (!/^v\d+\.\d+/.test(cleanVer)) return { ok: false, status: 422, errorFa: 'فرمت نسخه نامعتبر است.' };
  if ((pub.versionHistory ?? []).some((v) => v.version === cleanVer)) {
    return { ok: false, status: 409, errorFa: 'این شماره نسخه قبلاً ثبت شده است.' };
  }

  const prevVersionId = pub.versionId || `${pub.id}-${pub.version}`;
  pub.previousVersionId = prevVersionId;
  pub.version = cleanVer;
  pub.versionId = `${pub.id}-${cleanVer}`;
  pub.changelogFa = sanitizeInput(params.changelogFa || `انتشار نسخه ${cleanVer}`, 260);
  if (params.titleFa) pub.titleFa = sanitizeInput(params.titleFa, 160);
  if (params.summaryFa) pub.summaryFa = sanitizeInput(params.summaryFa, 400);
  pub.updatedAtIso = new Date().toISOString();

  const newSnap = buildVersionSnapshot(pub, cleanVer, prevVersionId, pub.changelogFa);
  pub.versionHistory = [newSnap, ...(pub.versionHistory ?? [])];
  persistKnowledgeServerStore();
  return { ok: true, status: 201, publication: pub };
}

const VALID_CORRECTION_TYPES = new Set<KnowledgeCorrectionType>([
  'data_error',
  'formula_error',
  'source_error',
  'interpretation_error',
  'outdated_information',
  'other',
]);

/** Stage 84.2 & 84.3: Server-authenticated structured correction submission */
export function submitServerKnowledgeCorrection(params: {
  publicationId: string;
  submitterUserId: string;
  input: KnowledgeCorrectionInput;
}): { ok: boolean; status: number; errorFa?: string; item?: KnowledgeCorrectionRecord } {
  const pub = knowledgeServerStore.publications.find((p) => p.id === params.publicationId || p.slug === params.publicationId);
  if (!pub) return { ok: false, status: 404, errorFa: 'گزارش موردنظر یافت نشد.' };

  const cType = params.input?.correctionType;
  if (!VALID_CORRECTION_TYPES.has(cType)) {
    return { ok: false, status: 422, errorFa: 'نوع خطای گزارش‌شده نامعتبر است.' };
  }
  const rawNote = String(params.input?.noteFa || '').trim();
  if (rawNote.length < 10) {
    return { ok: false, status: 422, errorFa: 'توضیح اصلاحیه باید حداقل ۱۰ نویسه باشد.' };
  }
  if (rawNote.length > 1000) {
    return { ok: false, status: 422, errorFa: 'طول توضیح اصلاحیه نباید بیش از ۱۰۰۰ نویسه باشد.' };
  }
  const targetInd = params.input.targetIndicatorId ? String(params.input.targetIndicatorId).trim() : undefined;
  if (targetInd && !pub.calculatedIndicators.some((i) => i.id === targetInd)) {
    return { ok: false, status: 422, errorFa: 'شناسه شاخص انتخاب‌شده متعلق به این گزارش نیست.' };
  }
  let cleanUrl: string | undefined;
  if (params.input.sourceUrl && String(params.input.sourceUrl).trim().length > 0) {
    const rawUrl = String(params.input.sourceUrl).trim();
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { ok: false, status: 422, errorFa: 'نشانی منبع باید با http یا https آغاز شود.' };
      }
      cleanUrl = parsed.toString();
    } catch {
      return { ok: false, status: 422, errorFa: 'نشانی منبع واردشده معتبر نیست.' };
    }
  }

  const nowIso = new Date().toISOString();
  const record: KnowledgeCorrectionRecord = {
    id: `kcorr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    publicationId: pub.id,
    publicationVersion: pub.version,
    submitterUserId: params.submitterUserId,
    correctionType: cType,
    targetSection: params.input.targetSection ? sanitizeInput(params.input.targetSection, 80) : undefined,
    targetIndicatorId: targetInd,
    noteFa: sanitizeInput(rawNote, 1000),
    evidenceDescriptionFa: params.input.evidenceDescriptionFa
      ? sanitizeInput(params.input.evidenceDescriptionFa, 500)
      : undefined,
    sourceUrl: cleanUrl,
    status: 'submitted',
    appliedInVersion: null,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    statusHistory: [
      {
        status: 'submitted',
        actorUserId: params.submitterUserId,
        noteFa: 'ثبت اولیه توسط کاربر احرازشده',
        changedAtIso: nowIso,
      },
    ],
  };

  knowledgeServerStore.corrections.unshift(record);
  persistKnowledgeServerStore();
  return { ok: true, status: 201, item: record };
}

export function transitionServerKnowledgeCorrectionStatus(params: {
  correctionId: string;
  nextStatus: KnowledgeCorrectionStatus;
  actorUserId: string;
  noteFa: string;
  appliedInVersion?: string;
}): { ok: boolean; status: number; errorFa?: string; item?: KnowledgeCorrectionRecord } {
  const item = knowledgeServerStore.corrections.find((c) => c.id === params.correctionId);
  if (!item) return { ok: false, status: 404, errorFa: 'اصلاحیه یافت نشد.' };
  if (params.nextStatus === 'applied' && !params.appliedInVersion) {
    return { ok: false, status: 422, errorFa: 'برای تغییر وضعیت به applied ذکر شماره نسخه اعمال‌شده الزامی است.' };
  }
  const nowIso = new Date().toISOString();
  item.status = params.nextStatus;
  item.reviewerNoteFa = sanitizeInput(params.noteFa || '', 300);
  if (params.appliedInVersion) item.appliedInVersion = sanitizeInput(params.appliedInVersion, 20);
  item.updatedAtIso = nowIso;
  item.statusHistory.push({
    status: params.nextStatus,
    actorUserId: params.actorUserId,
    noteFa: item.reviewerNoteFa,
    changedAtIso: nowIso,
  });
  persistKnowledgeServerStore();
  return { ok: true, status: 200, item };
}

/** Stage 85.2 & 85.4: Account-linked knowledge bookmarks with deduplication & cap */
export function getUserSavedKnowledgeBookmarks(uid: string): SavedKnowledgeBookmarkItem[] {
  const ids = knowledgeServerStore.bookmarksByUserId[uid] ?? [];
  return ids.map((pubId) => {
    const pub = knowledgeServerStore.publications.find((p) => p.id === pubId);
    if (!pub) {
      return {
        publicationId: pubId,
        slug: pubId,
        titleFa: `گزارش حذف‌شده (${pubId})`,
        version: 'نامشخص',
        status: 'archived',
        freshnessStatus: 'archived',
        savedAtIso: knowledgeServerStore.updatedAtIso,
        isArchivedOrRemoved: true,
      };
    }
    const st = pub.status ?? pub.defaultPublicationStatus;
    return {
      publicationId: pub.id,
      slug: pub.slug,
      titleFa: pub.titleFa,
      version: pub.version,
      status: st,
      freshnessStatus: pub.freshnessStatus,
      savedAtIso: pub.updatedAtIso || knowledgeServerStore.updatedAtIso,
      isArchivedOrRemoved: st === 'archived' || pub.freshnessStatus === 'archived' || !isPublicationPubliclyVisible(st),
    };
  });
}

export function saveUserKnowledgeBookmark(uid: string, publicationId: string): {
  ok: boolean;
  status: number;
  errorFa?: string;
  items?: SavedKnowledgeBookmarkItem[];
} {
  const cleanId = sanitizeInput(publicationId, 80).trim();
  const pub = knowledgeServerStore.publications.find((p) => p.id === cleanId || p.slug === cleanId);
  if (!pub) return { ok: false, status: 404, errorFa: 'گزارش موردنظر در پایگاه دانش وجود ندارد.' };
  const st = pub.status ?? pub.defaultPublicationStatus;
  if (!isPublicationPubliclyVisible(st)) {
    return { ok: false, status: 422, errorFa: 'ذخیره گزارش‌های منتشرنشده مجاز نیست.' };
  }
  const existing = knowledgeServerStore.bookmarksByUserId[uid] ?? [];
  if (existing.includes(pub.id)) {
    return { ok: true, status: 200, items: getUserSavedKnowledgeBookmarks(uid) };
  }
  if (existing.length >= MAX_SAVED_KNOWLEDGE_PER_USER) {
    return { ok: false, status: 422, errorFa: `سقف ذخیره گزارش (${MAX_SAVED_KNOWLEDGE_PER_USER} مورد) پر شده است.` };
  }
  knowledgeServerStore.bookmarksByUserId[uid] = [pub.id, ...existing];
  persistKnowledgeServerStore();
  return { ok: true, status: 201, items: getUserSavedKnowledgeBookmarks(uid) };
}

export function removeUserKnowledgeBookmark(uid: string, publicationId: string): SavedKnowledgeBookmarkItem[] {
  const cleanId = sanitizeInput(publicationId, 80).trim();
  const existing = knowledgeServerStore.bookmarksByUserId[uid] ?? [];
  knowledgeServerStore.bookmarksByUserId[uid] = existing.filter((id) => id !== cleanId);
  persistKnowledgeServerStore();
  return getUserSavedKnowledgeBookmarks(uid);
}

export function queryServerKnowledgeGlossary(query: string, category: GlossaryTermCategory | 'all' = 'all'): KnowledgeGlossaryTerm[] {
  return filterGlossaryTerms(KNOWLEDGE_GLOSSARY_TERMS, query, category);
}

/** Stage 93.2 & 93.6: Server-enforced account valuation reports (strictly bound to auth.uid) */
export function getUserValuationReports(uid: string): SavedValuationReport[] {
  return knowledgeServerStore.valuationReportsByUserId[uid] ?? [];
}

export function saveUserValuationReport(
  uid: string,
  payload: unknown,
): { ok: boolean; status: number; errorFa?: string; item?: SavedValuationReport } {
  const validated = validateAndMigrateSavedValuationReports([payload]);
  if (validated.length === 0) {
    return { ok: false, status: 422, errorFa: 'ساختار گزارش ارزش‌گذاری ارسالی معتبر نیست.' };
  }
  const nowIso = new Date().toISOString();
  const report: SavedValuationReport = {
    ...validated[0],
    ownerUserId: uid,
    storageScope: 'account_synced',
    updatedAtIso: nowIso,
  };
  const existing = knowledgeServerStore.valuationReportsByUserId[uid] ?? [];
  const deduped = existing.filter((r) => r.id !== report.id);
  knowledgeServerStore.valuationReportsByUserId[uid] = [report, ...deduped].slice(0, MAX_SAVED_VALUATIONS_PER_USER);
  persistKnowledgeServerStore();
  return { ok: true, status: 201, item: report };
}

export function getUserValuationReportById(
  uid: string,
  reportId: string,
): { ok: boolean; status: number; errorFa?: string; item?: SavedValuationReport } {
  const cleanId = sanitizeInput(reportId, 120).trim();
  const ownList = knowledgeServerStore.valuationReportsByUserId[uid] ?? [];
  const foundOwn = ownList.find((r) => r.id === cleanId);
  if (foundOwn) return { ok: true, status: 200, item: foundOwn };

  for (const [otherUid, list] of Object.entries(knowledgeServerStore.valuationReportsByUserId)) {
    if (otherUid !== uid && list.some((r) => r.id === cleanId)) {
      return { ok: false, status: 403, errorFa: 'دسترسی به گزارش ارزش‌گذاری سایر کاربران مجاز نیست.' };
    }
  }
  return { ok: false, status: 404, errorFa: 'گزارش ارزش‌گذاری موردنظر یافت نشد.' };
}

export function deleteUserValuationReport(
  uid: string,
  reportId: string,
): { ok: boolean; status: number; errorFa?: string; items?: SavedValuationReport[] } {
  const check = getUserValuationReportById(uid, reportId);
  if (!check.ok) return { ok: false, status: check.status, errorFa: check.errorFa };
  const existing = knowledgeServerStore.valuationReportsByUserId[uid] ?? [];
  const next = existing.filter((r) => r.id !== check.item!.id);
  knowledgeServerStore.valuationReportsByUserId[uid] = next;
  persistKnowledgeServerStore();
  return { ok: true, status: 200, items: next };
}


/** @file src/features/knowledge/services/knowledgeApiClient.ts — Stage 83–86 Knowledge Center API Client (Publications, Versions, Sources, Corrections, Bookmarks & Editorial Governance) */
import type { AuthUserSnapshot } from '../../../platform/auth';
import type { KnowledgeDataBrief } from '../data/knowledgeSourcesAndBriefs';
import type {
  GlossaryTermCategory,
  KnowledgeContentType,
  KnowledgeCorrectionInput,
  KnowledgeCorrectionRecord,
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
} from '../types/knowledge.types';

export interface KnowledgeApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorFa?: string;
  fetchedAtIso: string;
  serverUpdatedAtIso?: string;
}

export interface GetKnowledgePublicationsParams {
  subTab?: string;
  query?: string;
  contentType?: KnowledgeContentType | 'all';
  freshness?: KnowledgeFreshnessStatus | 'all';
  geographyId?: string;
  neighborhoodId?: number;
  periodFrom?: string;
  periodTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'updated_desc' | 'published_desc' | 'title_asc';
  signal?: AbortSignal;
}

async function resolveBearerHeader(currentUser: AuthUserSnapshot | null | undefined): Promise<{ ok: boolean; headers: Record<string, string>; errorFa?: string }> {
  if (!currentUser?.uid) {
    return { ok: false, headers: {}, errorFa: 'برای انجام این عملیات ابتدا وارد حساب کاربری معتبر خود شوید.' };
  }
  return { ok: true, headers: {} };
}

function mapHttpErrorFa(status: number, fallbackMessage?: string): string {
  if (fallbackMessage && !fallbackMessage.includes('Error') && !fallbackMessage.includes('stack')) {
    return fallbackMessage;
  }
  if (status === 401 || status === 403) return 'دسترسی مجاز نیست یا نیاز به ورود مجدد به حساب کاربری وجود دارد.';
  if (status === 404) return 'مورد درخواستی در پایگاه دانش یافت نشد.';
  if (status === 409) return 'تعارض وضعیت یا نسخه تکراری در سرور تشخیص داده شد.';
  if (status === 422) return 'اطلاعات ارسالی کامل یا معتبر نیست.';
  if (status === 429) return 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی صبر کنید.';
  return 'ارتباط با سرور مرکز دانش برقرار نشد.';
}

export async function getKnowledgePublications(
  params: GetKnowledgePublicationsParams = {},
): Promise<KnowledgeApiResult<KnowledgePublicationListResponse>> {
  const fetchedAtIso = new Date().toISOString();
  const qs = new URLSearchParams();
  if (params.subTab) qs.set('subTab', params.subTab);
  if (params.query) qs.set('query', params.query);
  if (params.contentType && params.contentType !== 'all') qs.set('contentType', params.contentType);
  if (params.freshness && params.freshness !== 'all') qs.set('freshness', params.freshness);
  if (params.geographyId) qs.set('geographyId', params.geographyId);
  if (params.neighborhoodId) qs.set('neighborhoodId', String(params.neighborhoodId));
  if (params.periodFrom) qs.set('periodFrom', params.periodFrom);
  if (params.periodTo) qs.set('periodTo', params.periodTo);
  qs.set('page', String(Math.max(1, params.page || 1)));
  qs.set('pageSize', String(Math.min(20, Math.max(1, params.pageSize || 10))));
  if (params.sortBy) qs.set('sortBy', params.sortBy);

  try {
    const res = await fetch(`/api/knowledge/publications?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: params.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    }
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      serverUpdatedAtIso: body.serverUpdatedAtIso,
      data: {
        items: Array.isArray(body.items) ? body.items : [],
        pagination: body.pagination || { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
        filters: body.filters || { contentTypes: [], freshnessStatuses: [] },
        serverUpdatedAtIso: body.serverUpdatedAtIso,
        fetchedAtIso,
      },
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, status: 0, errorFa: 'ABORTED', fetchedAtIso };
    }
    return { ok: false, status: 503, errorFa: 'عدم دسترسی به سرور مرکز دانش.', fetchedAtIso };
  }
}

export async function getKnowledgePublicationBySlug(
  slugOrId: string,
  options?: { versionId?: string; signal?: AbortSignal },
): Promise<KnowledgeApiResult<{ item: KnowledgePublication; sources: KnowledgeSourceRecord[] }>> {
  const fetchedAtIso = new Date().toISOString();
  const qs = options?.versionId ? `?versionId=${encodeURIComponent(options.versionId)}` : '';
  try {
    const res = await fetch(`/api/knowledge/publications/${encodeURIComponent(slugOrId)}${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: options?.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.item) {
      return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    }
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      serverUpdatedAtIso: body.serverUpdatedAtIso,
      data: { item: body.item, sources: Array.isArray(body.sources) ? body.sources : [] },
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, status: 0, errorFa: 'ABORTED', fetchedAtIso };
    return { ok: false, status: 503, errorFa: 'خطا در دریافت جزئیات گزارش.', fetchedAtIso };
  }
}

export async function getKnowledgePublicationVersions(
  publicationId: string,
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<{ currentVersion: string; versions: KnowledgePublicationVersionSnapshot[] }>> {
  const fetchedAtIso = new Date().toISOString();
  try {
    const res = await fetch(`/api/knowledge/publications/${encodeURIComponent(publicationId)}/versions`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: { currentVersion: body.currentVersion, versions: Array.isArray(body.versions) ? body.versions : [] },
    };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در دریافت تاریخچه نسخه‌ها.', fetchedAtIso };
  }
}

export async function getKnowledgePublicationSources(
  publicationId: string,
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<KnowledgeSourceRecord[]>> {
  const fetchedAtIso = new Date().toISOString();
  try {
    const res = await fetch(`/api/knowledge/publications/${encodeURIComponent(publicationId)}/sources`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status), fetchedAtIso };
    return { ok: true, status: res.status, fetchedAtIso, data: Array.isArray(body.sources) ? body.sources : [] };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در دریافت منابع گزارش.', fetchedAtIso };
  }
}

export async function getKnowledgePublicationStatus(
  publicationId: string,
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<{ publicationId: string; publicationStatus: KnowledgePublicationStatus; version: string; updatedAtIso: string }>> {
  const fetchedAtIso = new Date().toISOString();
  try {
    const res = await fetch(`/api/knowledge/publications/${encodeURIComponent(publicationId)}/status`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status), fetchedAtIso };
    return { ok: true, status: res.status, fetchedAtIso, data: body };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در استعلام وضعیت انتشار.', fetchedAtIso };
  }
}

export async function getKnowledgeDataBriefs(
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<KnowledgeDataBrief[]>> {
  const fetchedAtIso = new Date().toISOString();
  try {
    const res = await fetch('/api/knowledge/data-briefs', { headers: { Accept: 'application/json' }, signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status), fetchedAtIso };
    return { ok: true, status: res.status, fetchedAtIso, data: Array.isArray(body.items) ? body.items : [] };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در دریافت خلاصه داده‌ها.', fetchedAtIso };
  }
}

export async function getKnowledgeGlossary(
  params?: { query?: string; category?: GlossaryTermCategory | 'all'; signal?: AbortSignal },
): Promise<KnowledgeApiResult<KnowledgeGlossaryTerm[]>> {
  const fetchedAtIso = new Date().toISOString();
  const qs = new URLSearchParams();
  if (params?.query) qs.set('query', params.query);
  if (params?.category && params.category !== 'all') qs.set('category', params.category);
  try {
    const res = await fetch(`/api/knowledge/glossary?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: params?.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status), fetchedAtIso };
    return { ok: true, status: res.status, fetchedAtIso, data: Array.isArray(body.items) ? body.items : [] };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در دریافت فرهنگ‌نامه.', fetchedAtIso };
  }
}

export async function submitKnowledgeCorrection(
  publicationId: string,
  input: KnowledgeCorrectionInput,
  currentUser: AuthUserSnapshot | null | undefined,
): Promise<KnowledgeApiResult<KnowledgeCorrectionRecord>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = await resolveBearerHeader(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa, fetchedAtIso };
  try {
    const res = await fetch(`/api/knowledge/publications/${encodeURIComponent(publicationId)}/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return { ok: true, status: res.status, fetchedAtIso, data: body.item };
  } catch {
    return { ok: false, status: 503, errorFa: 'خطا در ارسال اصلاحیه به سرور.', fetchedAtIso };
  }
}

export async function getMySavedKnowledge(
  currentUser: AuthUserSnapshot | null | undefined,
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<{ items: SavedKnowledgeBookmarkItem[]; savedIds: string[] }>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = await resolveBearerHeader(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa, fetchedAtIso };
  try {
    const res = await fetch('/api/account/knowledge/saved', {
      method: 'GET',
      headers: { Accept: 'application/json', ...auth.headers },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: {
        items: Array.isArray(body.items) ? body.items : [],
        savedIds: Array.isArray(body.savedIds) ? body.savedIds : [],
      },
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, status: 0, errorFa: 'ABORTED', fetchedAtIso };
    return { ok: false, status: 503, errorFa: 'خطا در همگام‌سازی گزارش‌های ذخیره‌شده.', fetchedAtIso };
  }
}

export async function saveKnowledgePublication(
  publicationId: string,
  currentUser: AuthUserSnapshot | null | undefined,
): Promise<KnowledgeApiResult<{ items: SavedKnowledgeBookmarkItem[]; savedIds: string[] }>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = await resolveBearerHeader(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa, fetchedAtIso };
  try {
    const res = await fetch('/api/account/knowledge/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({ publicationId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: { items: body.items || [], savedIds: body.savedIds || [] },
    };
  } catch {
    return { ok: false, status: 503, errorFa: 'ذخیره گزارش در حساب کاربری انجام نشد.', fetchedAtIso };
  }
}

export async function removeSavedKnowledgePublication(
  publicationId: string,
  currentUser: AuthUserSnapshot | null | undefined,
): Promise<KnowledgeApiResult<{ items: SavedKnowledgeBookmarkItem[]; savedIds: string[] }>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = await resolveBearerHeader(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa, fetchedAtIso };
  try {
    const res = await fetch(`/api/account/knowledge/saved/${encodeURIComponent(publicationId)}`, {
      method: 'DELETE',
      headers: { ...auth.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: { items: body.items || [], savedIds: body.savedIds || [] },
    };
  } catch {
    return { ok: false, status: 503, errorFa: 'حذف گزارش از فهرست ذخیره‌شده انجام نشد.', fetchedAtIso };
  }
}

export async function getAdminKnowledgeGovernanceState(
  currentUser?: AuthUserSnapshot | null,
  signal?: AbortSignal,
): Promise<KnowledgeApiResult<{ items: KnowledgePublication[]; statuses: Record<string, KnowledgePublicationStatus>; corrections: KnowledgeCorrectionRecord[] }>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = currentUser ? await resolveBearerHeader(currentUser) : { ok: true, headers: {} };
  try {
    const res = await fetch('/api/admin/knowledge/publications', {
      headers: { Accept: 'application/json', ...auth.headers },
      signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: {
        items: Array.isArray(body.items) ? body.items : [],
        statuses: body.statuses || {},
        corrections: Array.isArray(body.corrections) ? body.corrections : [],
      },
    };
  } catch {
    return { ok: false, status: 503, errorFa: 'عدم دسترسی به وضعیت مدیریت مرکز دانش.', fetchedAtIso };
  }
}

export async function transitionAdminKnowledgePublicationStatus(params: {
  publicationId: string;
  toStatus: KnowledgePublicationStatus;
  actorUserId: string;
  actorRole: KnowledgeEditorialRole;
  reasonFa: string;
  currentUser?: AuthUserSnapshot | null;
}): Promise<KnowledgeApiResult<{ publication: KnowledgePublication; decision: KnowledgeEditorialDecision; statuses: Record<string, KnowledgePublicationStatus> }>> {
  const fetchedAtIso = new Date().toISOString();
  const auth = params.currentUser ? await resolveBearerHeader(params.currentUser) : { ok: true, headers: {} };
  try {
    const res = await fetch(`/api/admin/knowledge/publications/${encodeURIComponent(params.publicationId)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({
        toStatus: params.toStatus,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        reasonFa: params.reasonFa,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, errorFa: mapHttpErrorFa(res.status, body?.message), fetchedAtIso };
    return {
      ok: true,
      status: res.status,
      fetchedAtIso,
      data: { publication: body.publication, decision: body.decision, statuses: body.statuses || {} },
    };
  } catch {
    return { ok: false, status: 503, errorFa: 'ارسال دستور انتشار/آرشیو به سرور ناموفق بود.', fetchedAtIso };
  }
}

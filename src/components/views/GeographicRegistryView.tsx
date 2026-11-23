import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight, Database, MapPin } from 'lucide-react';

type RegistryEntityType =
  | 'URBAN_NEIGHBORHOOD'
  | 'URBAN_ZONE'
  | 'DISTRICT'
  | 'RURAL_DISTRICT'
  | 'CITY'
  | 'COUNTY'
  | 'PROVINCE'
  | 'COUNTRY';

interface RegistryIdentity {
  identityAnchor: string;
  anchorType: string;
  issuedOrderIndex: number;
  issuedAtRegistryRevision: number;
  identityStatus: string;
  retiredAtRegistryRevision: number | null;
  retiredReason: string | null;
  survivingGeographicEntityId: string | null;
}

interface CanonicalGeographicEntity {
  geographicEntityId: string;
  entityType: RegistryEntityType;
  classificationSystemId: string;
  canonicalNameFa: string;
  alternativeNamesFa?: string[];
  nameEn?: string | null;
  parentGeographicEntityId?: string | null;
  parentNameFa?: string | null;
  provinceGeographicEntityId?: string | null;
  provinceNameFa?: string | null;
  identityStatus: string;
  verificationStatus: string;
  lifecycleStatus: string;
  boundaryStatus?: string | null;
  boundaryReference?: string | null;
  pointCoordinates?: { latitude: number; longitude: number } | null;
  areaSqKm?: number | null;
  isSyntheticFixture: boolean;
  registryIdentity: RegistryIdentity;
}

interface RegistryHead {
  registry_revision: number;
  registry_checksum: string;
  canonical_entity_count: number;
  relationship_count: number;
  source_mapping_count: number;
  canonical_entry_count: number;
  anchor_count: number;
  legacy_alias_count: number;
}

interface ListResponse {
  status: 'ok';
  registryRevision: number;
  items: CanonicalGeographicEntity[];
  pagination: { limit: number; offset: number; nextOffset: number | null };
  source: string;
}

const ENTITY_TYPES: { id: RegistryEntityType; labelFa: string }[] = [
  { id: 'URBAN_NEIGHBORHOOD', labelFa: 'محله شهری' },
  { id: 'URBAN_ZONE', labelFa: 'ناحیه شهری' },
  { id: 'DISTRICT', labelFa: 'بخش' },
  { id: 'RURAL_DISTRICT', labelFa: 'دهستان' },
  { id: 'CITY', labelFa: 'شهر' },
  { id: 'COUNTY', labelFa: 'شهرستان' },
  { id: 'PROVINCE', labelFa: 'استان' },
  { id: 'COUNTRY', labelFa: 'کشور' },
];
const PAGE_SIZE = 50;
const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value);

function typeLabel(type: RegistryEntityType): string {
  return ENTITY_TYPES.find((item) => item.id === type)?.labelFa ?? type;
}

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' }, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : 'API_ERROR';
    throw new Error(code);
  }
  return body as T;
}

export function GeographicRegistryView(): React.ReactElement {
  const [entityType, setEntityType] = useState<RegistryEntityType>('URBAN_NEIGHBORHOOD');
  const [provinceId, setProvinceId] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<CanonicalGeographicEntity[]>([]);
  const [provinces, setProvinces] = useState<CanonicalGeographicEntity[]>([]);
  const [head, setHead] = useState<RegistryHead | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    readJson<{ status: string; registry?: RegistryHead }>('/api/v1/geography/registry/health', controller.signal)
      .then(async (health) => {
        if (health.status !== 'ready') throw new Error('GEOGRAPHIC_REGISTRY_NOT_PUBLISHED');
        const [registry, provinceResult] = await Promise.all([
          readJson<{ status: string; registry: RegistryHead }>('/api/v1/geography/registry', controller.signal),
          readJson<ListResponse>('/api/v1/geography/entities?entityType=PROVINCE&limit=100&offset=0', controller.signal),
        ]);
        if (!active) return;
        setHead(registry.registry);
        setProvinces(provinceResult.items);
      })
      .catch((cause) => {
        if (active && cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'REGISTRY_UNAVAILABLE');
      });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      entityType,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set('q', query);
    if (provinceId) params.set('provinceId', provinceId);
    readJson<ListResponse>('/api/v1/geography/entities?' + params.toString(), controller.signal)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setHasNext(result.pagination.nextOffset !== null);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active || cause?.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'GEOGRAPHIC_QUERY_FAILED');
        setItems([]);
        setHasNext(false);
        setLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [entityType, provinceId, query, page]);

  const startIndex = page * PAGE_SIZE + 1;
  const rangeLabel = useMemo(() => {
    if (!items.length) return '۰';
    return `${faNumber(startIndex)} تا ${faNumber(page * PAGE_SIZE + items.length)}`;
  }, [items.length, page, startIndex]);

  const applySearch = () => {
    setPage(0);
    setQuery(queryInput.trim());
  };
  const resetFilters = () => {
    setQueryInput('');
    setQuery('');
    setProvinceId('');
    setEntityType('URBAN_NEIGHBORHOOD');
    setPage(0);
  };

  return (
    <section dir="rtl" lang="fa" className="w-full max-w-6xl mx-auto px-3 sm:px-5 py-5 sm:py-7 space-y-5" data-testid="irni-geographic-registry-view">
      <header className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">مرجع رسمی جغرافیایی</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">رجیستری محله‌ها و تقسیمات ایران</h1>
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              داده‌ها مستقیماً از رجیستری مرجع «هوشمندی محله‌های ایران» خوانده می‌شوند؛ شناسه، نوع موجودیت و شماره ترتیب از منبع اصلی حفظ می‌شود.
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-2.5 text-emerald-700 dark:text-emerald-300">
            <Database className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        {head && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
              <span className="block text-[10px] text-slate-500">نسخه مرجع</span>
              <strong className="text-sm text-slate-900 dark:text-white tabular-nums">Revision {head.registry_revision}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
              <span className="block text-[10px] text-slate-500">موجودیت‌های مرجع</span>
              <strong className="text-sm text-slate-900 dark:text-white tabular-nums">{faNumber(head.canonical_entity_count)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
              <span className="block text-[10px] text-slate-500">روابط جغرافیایی</span>
              <strong className="text-sm text-slate-900 dark:text-white tabular-nums">{faNumber(head.relationship_count)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
              <span className="block text-[10px] text-slate-500">نگاشت شناسه‌ها</span>
              <strong className="text-sm text-slate-900 dark:text-white tabular-nums">{faNumber(head.source_mapping_count)}</strong>
            </div>
          </div>
        )}
        {head && <p className="text-[10px] text-slate-400 break-all">SHA-256: {head.registry_checksum}</p>}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_190px_220px_auto_auto] gap-2">
        <form className="flex min-w-0 gap-1.5" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="جست‌وجوی نام رسمی محله یا تقسیمات..."
            className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            aria-label="جست‌وجوی نام جغرافیایی"
          />
          <button type="submit" className="rounded-xl bg-slate-900 dark:bg-emerald-700 px-3 text-white" aria-label="جست‌وجو">
            <Search className="w-4 h-4" />
          </button>
        </form>
        <select value={entityType} onChange={(event) => { setEntityType(event.target.value as RegistryEntityType); setPage(0); }} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
          {ENTITY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.labelFa}</option>)}
        </select>
        <select value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setPage(0); }} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
          <option value="">همه استان‌ها</option>
          {provinces.map((province) => <option key={province.geographicEntityId} value={province.geographicEntityId}>{province.canonicalNameFa}</option>)}
        </select>
        <button type="button" onClick={resetFilters} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">پاک‌کردن فیلتر</button>
        <button type="button" onClick={() => { setPage(0); setQuery(queryInput.trim()); }} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center justify-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> تازه‌سازی
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{typeLabel(entityType)} · نمایش {rangeLabel}</span>
        <span>مرتب‌سازی بر اساس شماره رسمی رجیستری</span>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          دریافت مرجع جغرافیایی ناموفق بود: <span className="font-mono text-xs">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">در حال دریافت داده‌های مرجع...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">رکوردی مطابق فیلترها پیدا نشد.</div>
      ) : (
        <div className="space-y-2">
          {items.map((entity) => (
            <article key={entity.geographicEntityId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                      شماره {faNumber(entity.registryIdentity.issuedOrderIndex)}
                    </span>
                    <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{typeLabel(entity.entityType)}</span>
                    <span className="text-[10px] text-slate-400">{entity.classificationSystemId}</span>
                  </div>
                  <h2 className="mt-2 text-base font-black text-slate-900 dark:text-white">{entity.canonicalNameFa}</h2>
                  {entity.nameEn && <p className="text-xs text-slate-500">{entity.nameEn}</p>}
                  {entity.alternativeNamesFa?.length ? <p className="mt-1 text-[11px] text-slate-500">نام‌های جایگزین: {entity.alternativeNamesFa.join('، ')}</p> : null}
                </div>
                <div className="sm:text-left min-w-0 sm:max-w-[320px]">
                  <p className="text-[10px] text-slate-500">شناسه رسمی جغرافیایی</p>
                  <p className="font-mono text-[10px] leading-5 break-all text-slate-700 dark:text-slate-300">{entity.geographicEntityId}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                <div><span className="block text-[10px] text-slate-400">والد جغرافیایی</span><span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{entity.parentNameFa || '—'}</span></div>
                <div><span className="block text-[10px] text-slate-400">استان</span><span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{entity.provinceNameFa || '—'}</span></div>
                <div><span className="block text-[10px] text-slate-400">وضعیت هویت</span><span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{entity.identityStatus}</span></div>
                <div><span className="block text-[10px] text-slate-400">اعتبارسنجی</span><span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{entity.verificationStatus}</span></div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                <span>چرخه حیات: {entity.lifecycleStatus}</span>
                <span>وضعیت مرز: {entity.boundaryStatus || 'ثبت‌نشده'}</span>
                {entity.pointCoordinates && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{entity.pointCoordinates.latitude}, {entity.pointCoordinates.longitude}</span>}
                <span className="font-mono">Anchor: {entity.registryIdentity.identityAnchor}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-40">
          <ChevronRight className="w-4 h-4" /> قبلی
        </button>
        <span className="text-xs text-slate-500 tabular-nums">صفحه {faNumber(page + 1)}</span>
        <button type="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-40">
          بعدی <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

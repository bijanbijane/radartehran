import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight, Database, MapPin } from 'lucide-react';

type RegistryEntityType = 'URBAN_NEIGHBORHOOD' | 'URBAN_ZONE' | 'DISTRICT' | 'RURAL_DISTRICT' | 'CITY' | 'COUNTY' | 'PROVINCE' | 'COUNTRY';
interface RegistryIdentity {
  identityAnchor: string; anchorType: string; issuedOrderIndex: number; issuedAtRegistryRevision: number;
  identityStatus: string; retiredAtRegistryRevision: null; retiredReason: null; survivingGeographicEntityId: null;
}
interface CanonicalGeographicEntity {
  geographicEntityId: string; entityType: RegistryEntityType; classificationSystemId: string; canonicalNameFa: string;
  alternativeNamesFa: string[]; nameEn: string | null; parentGeographicEntityId: string | null; parentNameFa: string | null;
  provinceGeographicEntityId: string | null; provinceNameFa: string | null; identityStatus: string;
  verificationStatus: string; lifecycleStatus: string; boundaryStatus: string; boundaryReference: string | null;
  pointCoordinates: { latitude: number; longitude: number } | null; areaSqKm: number | null;
  isSyntheticFixture: false; registryIdentity: RegistryIdentity;
}
interface RegistryHead {
  registryRevision: number; registryChecksum: string; canonicalEntityCount: number; relationshipCount: number;
  sourceMappingCount: number; identityAnchorCount: number; legacyAliasCount: number;
}
interface RpcEnvelope<T> { status: 'ok'; contractVersion: '2.0.0'; data: T; correlationId: string; }
interface EntityPageData {
  registryRevision: number; registryChecksum: string;
  page: { items: CanonicalGeographicEntity[]; nextCursor: string | null; previousCursor: string | null;
    hasMore: boolean; pageSize: number; totalMatchedCount: number; appliedSort: { field: string; direction: string } };
}
const ENTITY_TYPES: { id: RegistryEntityType; labelFa: string }[] = [
  { id: 'URBAN_NEIGHBORHOOD', labelFa: 'محله شهری' }, { id: 'URBAN_ZONE', labelFa: 'ناحیه شهری' },
  { id: 'DISTRICT', labelFa: 'بخش' }, { id: 'RURAL_DISTRICT', labelFa: 'دهستان' },
  { id: 'CITY', labelFa: 'شهر' }, { id: 'COUNTY', labelFa: 'شهرستان' },
  { id: 'PROVINCE', labelFa: 'استان' }, { id: 'COUNTRY', labelFa: 'کشور' },
];
const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value);
const typeLabel = (type: RegistryEntityType) => ENTITY_TYPES.find((item) => item.id === type)?.labelFa ?? type;

async function readRpcData<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' }, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'code' in body ? String(body.code) : 'API_ERROR');
  if (!body || body.status !== 'ok' || body.contractVersion !== '2.0.0' || !('data' in body)) throw new Error('IRNI_RPC_V2_INVALID_RESPONSE');
  return (body as RpcEnvelope<T>).data;
}

export function GeographicRegistryView(): React.ReactElement {
  const [entityType, setEntityType] = useState<RegistryEntityType>('URBAN_NEIGHBORHOOD');
  const [provinceId, setProvinceId] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<20 | 50>(20);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<CanonicalGeographicEntity[]>([]);
  const [totalMatchedCount, setTotalMatchedCount] = useState(0);
  const [provinces, setProvinces] = useState<CanonicalGeographicEntity[]>([]);
  const [head, setHead] = useState<RegistryHead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentCursor = cursorHistory[page] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const metadata = await readRpcData<RegistryHead>('/api/v2/reference/irni/canonical/metadata', controller.signal);
        const params = new URLSearchParams({ expectedRevision: String(metadata.registryRevision), entityType: 'PROVINCE', limit: '100', sortBy: 'issuedOrderIndex', sortDirection: 'ASC' });
        const provincePage = await readRpcData<EntityPageData>('/api/v2/reference/irni/canonical/entities?' + params.toString(), controller.signal);
        if (!active) return;
        setHead(metadata);
        setProvinces(provincePage.page.items);
        setError(null);
      } catch (cause) {
        if (active && (cause as Error)?.name !== 'AbortError') { setError(cause instanceof Error ? cause.message : 'REGISTRY_UNAVAILABLE'); setLoading(false); }
      }
    })();
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!head) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      expectedRevision: String(head.registryRevision), entityType, limit: String(pageSize),
      sortBy: 'issuedOrderIndex', sortDirection: 'ASC',
    });
    if (currentCursor) params.set('cursor', currentCursor);
    if (query) params.set('canonicalNameQuery', query);
    if (provinceId) params.set('provinceGeographicEntityId', provinceId);
    readRpcData<EntityPageData>('/api/v2/reference/irni/canonical/entities?' + params.toString(), controller.signal)
      .then((result) => {
        if (!active) return;
        if (result.registryRevision !== head.registryRevision || result.registryChecksum !== head.registryChecksum) throw new Error('IRNI_REGISTRY_SNAPSHOT_MISMATCH');
        setItems(result.page.items);
        setTotalMatchedCount(result.page.totalMatchedCount);
        setNextCursor(result.page.nextCursor);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active || (cause as Error)?.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'GEOGRAPHIC_QUERY_FAILED');
        setItems([]); setTotalMatchedCount(0); setNextCursor(null); setLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [head, entityType, provinceId, query, page, pageSize, currentCursor]);

  const rangeLabel = useMemo(() => items.length === 0 ? '۰' :
    faNumber(items[0].registryIdentity.issuedOrderIndex) + ' تا ' + faNumber(items[items.length - 1].registryIdentity.issuedOrderIndex), [items]);
  const resetPage = () => { setPage(0); setCursorHistory([null]); setNextCursor(null); };
  const applySearch = () => { resetPage(); setQuery(queryInput.trim()); };
  const resetFilters = () => { setQueryInput(''); setQuery(''); setProvinceId(''); setEntityType('URBAN_NEIGHBORHOOD'); resetPage(); };
  const goNext = () => {
    if (!nextCursor) return;
    setCursorHistory((current) => [...current.slice(0, page + 1), nextCursor]);
    setPage((value) => value + 1);
  };

  return (
    <section dir="rtl" lang="fa" className="w-full max-w-[1320px] mx-auto px-4 py-6 sm:py-8 space-y-5" data-testid="irni-geographic-registry-view">
      <header className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400">مرجع رسمی جغرافیایی</p>
            <h1 className="mt-1 text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)]">رجیستری محله‌ها و تقسیمات ایران</h1>
            <p className="mt-1 text-xs leading-6 text-[var(--color-text-secondary)]">داده‌ها از رجیستری مرجع «هوشمندی محله‌های ایران» و از طریق اتصال داخلی فقط‌خواندنی دریافت می‌شوند.</p>
          </div>
          <div className="rounded-xl bg-[var(--color-brand-soft)] p-2.5 text-[var(--color-brand-600)] dark:text-emerald-300 shrink-0"><Database className="w-5 h-5" aria-hidden="true" /></div>
        </div>
        {head && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)]"><span className="block text-xs text-[var(--color-text-muted)]">موجودیت‌های canonical</span><strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.canonicalEntityCount)}</strong></div>
          <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)]"><span className="block text-xs text-[var(--color-text-muted)]">روابط جغرافیایی</span><strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.relationshipCount)}</strong></div>
          <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)] col-span-2 sm:col-span-1"><span className="block text-xs text-[var(--color-text-muted)]">نگاشت‌های منبع</span><strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.sourceMappingCount)}</strong></div>
        </div>}
        {head && <details className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)] pt-2"><summary className="cursor-pointer font-semibold hover:text-[var(--color-text-primary)]">جزئیات فنی و اعتبارسنجی مرجع</summary><div className="mt-2 space-y-1 font-mono text-xs break-all" dir="ltr"><div>Revision: {head.registryRevision}</div><div>SHA-256: {head.registryChecksum}</div></div></details>}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_200px_auto_auto] gap-2">
        <form className="flex min-w-0 gap-1.5" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
          <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="جست‌وجوی نام رسمی محله یا تقسیمات..." className="min-w-0 flex-1 min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-focus)]" aria-label="جست‌وجوی نام جغرافیایی" />
          <button type="submit" className="min-w-[44px] min-h-[44px] md:min-h-[40px] rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] px-3.5 text-white cursor-pointer" aria-label="جست‌وجو"><Search className="w-4 h-4" /></button>
        </form>
        <select aria-label="نوع موجودیت جغرافیایی" value={entityType} onChange={(event) => { setEntityType(event.target.value as RegistryEntityType); resetPage(); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2 text-xs font-semibold">{ENTITY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.labelFa}</option>)}</select>
        <select aria-label="فیلتر استان" value={provinceId} onChange={(event) => { setProvinceId(event.target.value); resetPage(); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2 text-xs font-semibold"><option value="">همه استان‌ها</option>{provinces.map((province) => <option key={province.geographicEntityId} value={province.geographicEntityId}>{province.canonicalNameFa}</option>)}</select>
        <button type="button" onClick={resetFilters} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] cursor-pointer">پاک‌کردن فیلتر</button>
        <button type="button" onClick={() => { resetPage(); setQuery(queryInput.trim()); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] inline-flex items-center justify-center gap-1.5 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /> تازه‌سازی</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="tabular-nums">{typeLabel(entityType)} · {faNumber(totalMatchedCount)} رکورد · ردیف رسمی {rangeLabel}</span>
        <div className="flex items-center gap-2"><span>تعداد در صفحه:</span><div role="group" aria-label="تعداد ردیف در صفحه" className="inline-flex rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] p-0.5">
          {([20, 50] as const).map((size) => <button key={size} type="button" aria-pressed={pageSize === size} onClick={() => { setPageSize(size); resetPage(); }} className={pageSize === size ? 'min-h-[32px] px-2.5 rounded-[6px] text-xs font-bold tabular-nums transition cursor-pointer bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs' : 'min-h-[32px] px-2.5 rounded-[6px] text-xs font-bold tabular-nums transition cursor-pointer text-[var(--color-text-secondary)]'}>{faNumber(size)}</button>)}
        </div></div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">دریافت مرجع جغرافیایی ناموفق بود. اتصال به رجیستری IRNI در دسترس نیست یا پاسخ با نسخه فعال سازگار نیست.</div>}
      {loading ? <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">در حال دریافت داده‌های مرجع...</div> :
        items.length === 0 ? <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">رکوردی مطابق فیلترها پیدا نشد.</div> :
        <>
          <div className="hidden md:block rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs" data-testid="geographic-registry-table">
              <thead className="sticky top-0 bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)]"><tr>
                <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">ردیف رسمی</th><th scope="col" className="py-3 px-3 font-bold">نام رسمی</th>
                <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">والد جغرافیایی</th><th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">استان</th>
                <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">مختصات</th><th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">وضعیت</th><th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">شناسه فنی</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">{items.map((entity) => <tr key={entity.geographicEntityId} className="hover:bg-[var(--color-bg-canvas)] transition-colors">
                <td className="py-2.5 px-3 font-semibold text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">{faNumber(entity.registryIdentity.issuedOrderIndex)}</td>
                <td className="py-2.5 px-3"><div className="font-bold text-[var(--color-text-primary)]">{entity.canonicalNameFa}</div>{entity.alternativeNamesFa.length > 0 && <div className="text-xs text-[var(--color-text-muted)] truncate max-w-[260px]">جایگزین: {entity.alternativeNamesFa.join('، ')}</div>}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{entity.parentNameFa || '—'}</td><td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{entity.provinceNameFa || '—'}</td>
                <td className="py-2.5 px-3 font-mono text-[var(--color-text-muted)] tabular-nums whitespace-nowrap" dir="ltr">{entity.pointCoordinates ? String(entity.pointCoordinates.latitude.toFixed(4)) + ', ' + String(entity.pointCoordinates.longitude.toFixed(4)) : '—'}</td>
                <td className="py-2.5 px-3 whitespace-nowrap"><span className="inline-block rounded-[6px] bg-[var(--color-brand-soft)] px-2 py-0.5 font-semibold text-[var(--color-brand-700)] dark:text-emerald-300">{entity.verificationStatus}</span></td>
                <td className="py-2.5 px-3"><details className="text-xs text-[var(--color-text-muted)]"><summary className="cursor-pointer font-semibold hover:text-[var(--color-text-primary)] whitespace-nowrap">مشاهده</summary><div className="mt-1 space-y-0.5 font-mono text-xs break-all" dir="ltr"><div>ID: {entity.geographicEntityId}</div><div>Anchor: {entity.registryIdentity.identityAnchor}</div></div></details></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">{items.map((entity) => <article key={entity.geographicEntityId} className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="rounded-[6px] bg-[var(--color-bg-muted)] px-2 py-0.5 font-semibold text-[var(--color-text-secondary)] tabular-nums">ردیف {faNumber(entity.registryIdentity.issuedOrderIndex)}</span><span className="rounded-[6px] bg-[var(--color-brand-soft)] px-2 py-0.5 font-semibold text-[var(--color-brand-700)] dark:text-emerald-300">{entity.verificationStatus}</span></div><h2 className="mt-1.5 text-sm font-bold text-[var(--color-text-primary)]">{entity.canonicalNameFa}</h2></div>
              {entity.pointCoordinates && <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] font-mono shrink-0" dir="ltr"><MapPin className="w-3.5 h-3.5 text-[var(--color-brand-600)]" aria-hidden="true" />{entity.pointCoordinates.latitude.toFixed(3)}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] pt-2 text-xs"><div><span className="block text-[var(--color-text-muted)]">والد</span><span className="font-semibold text-[var(--color-text-primary)]">{entity.parentNameFa || '—'}</span></div><div><span className="block text-[var(--color-text-muted)]">استان</span><span className="font-semibold text-[var(--color-text-primary)]">{entity.provinceNameFa || '—'}</span></div></div>
            <details className="text-xs text-[var(--color-text-muted)]"><summary className="cursor-pointer hover:text-[var(--color-text-primary)]">شناسه‌های فنی رکورد</summary><div className="mt-1 space-y-0.5 font-mono text-xs break-all" dir="ltr"><div>ID: {entity.geographicEntityId}</div><div>Anchor: {entity.registryIdentity.identityAnchor}</div></div></details>
          </article>)}</div>
        </>
      }
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-[44px] md:min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3.5 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /> قبلی</button>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">صفحه {faNumber(page + 1)}</span>
        <button type="button" disabled={!nextCursor || loading} onClick={goNext} className="min-h-[44px] md:min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3.5 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer">بعدی <ChevronLeft className="w-4 h-4" /></button>
      </div>
    </section>
  );
}

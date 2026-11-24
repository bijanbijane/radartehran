/**
 * @file src/components/views/GeographicRegistryView.tsx
 * @description Canonical IRNI Geographic Registry Explorer — Dense Desktop Table + Compact Mobile Stack (AUD-007, AUD-013, AUD-014, AUD-015).
 */
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
  const [pageSize, setPageSize] = useState<20 | 50>(20);
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
      limit: String(pageSize),
      offset: String(page * pageSize),
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
  }, [entityType, provinceId, query, page, pageSize]);

  const startIndex = page * pageSize + 1;
  const rangeLabel = useMemo(() => {
    if (!items.length) return '۰';
    return `${faNumber(startIndex)} تا ${faNumber(page * pageSize + items.length)}`;
  }, [items.length, page, pageSize, startIndex]);

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
    <section
      dir="rtl"
      lang="fa"
      className="w-full max-w-[1320px] mx-auto px-4 py-6 sm:py-8 space-y-5"
      data-testid="irni-geographic-registry-view"
    >
      <header className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400">مرجع رسمی جغرافیایی</p>
            <h1 className="mt-1 text-2xl sm:text-[28px] font-black leading-[1.35] text-[var(--color-text-primary)]">
              رجیستری محله‌ها و تقسیمات ایران
            </h1>
            <p className="mt-1 text-xs leading-6 text-[var(--color-text-secondary)]">
              داده‌ها مستقیماً از رجیستری مرجع «هوشمندی محله‌های ایران» خوانده می‌شوند؛ شناسه، نوع موجودیت و شماره ترتیب از منبع اصلی حفظ می‌شود.
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-brand-soft)] p-2.5 text-[var(--color-brand-600)] dark:text-emerald-300 shrink-0">
            <Database className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
        {head && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)]">
              <span className="block text-xs text-[var(--color-text-muted)]">موجودیت‌های رسمی</span>
              <strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.canonical_entity_count)}</strong>
            </div>
            <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)]">
              <span className="block text-xs text-[var(--color-text-muted)]">روابط جغرافیایی</span>
              <strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.relationship_count)}</strong>
            </div>
            <div className="rounded-lg bg-[var(--color-bg-muted)] p-3 border border-[var(--color-border-subtle)] col-span-2 sm:col-span-1">
              <span className="block text-xs text-[var(--color-text-muted)]">نگاشت شناسه‌های محله</span>
              <strong className="text-base font-bold text-[var(--color-text-primary)] tabular-nums">{faNumber(head.source_mapping_count)}</strong>
            </div>
          </div>
        )}
        {head && (
          <details className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)] pt-2">
            <summary className="cursor-pointer font-semibold hover:text-[var(--color-text-primary)]">
              جزئیات فنی و اعتبارسنجی مرجع
            </summary>
            <div className="mt-2 space-y-1 font-mono text-xs break-all" dir="ltr">
              <div>Revision: {head.registry_revision}</div>
              <div>SHA-256: {head.registry_checksum}</div>
            </div>
          </details>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_200px_auto_auto] gap-2">
        <form className="flex min-w-0 gap-1.5" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="جست‌وجوی نام رسمی محله یا تقسیمات..."
            className="min-w-0 flex-1 min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-focus)]"
            aria-label="جست‌وجوی نام جغرافیایی"
          />
          <button type="submit" className="min-w-[44px] min-h-[44px] md:min-h-[40px] rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] px-3.5 text-white cursor-pointer" aria-label="جست‌وجو">
            <Search className="w-4 h-4" />
          </button>
        </form>
        <select aria-label="نوع موجودیت جغرافیایی" value={entityType} onChange={(event) => { setEntityType(event.target.value as RegistryEntityType); setPage(0); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2 text-xs font-semibold">
          {ENTITY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.labelFa}</option>)}
        </select>
        <select aria-label="فیلتر استان" value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setPage(0); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2 text-xs font-semibold">
          <option value="">همه استان‌ها</option>
          {provinces.map((province) => <option key={province.geographicEntityId} value={province.geographicEntityId}>{province.canonicalNameFa}</option>)}
        </select>
        <button type="button" onClick={resetFilters} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] cursor-pointer">پاک‌کردن فیلتر</button>
        <button type="button" onClick={() => { setPage(0); setQuery(queryInput.trim()); }} className="min-h-[44px] md:min-h-[40px] rounded-[8px] border border-[var(--color-border-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] inline-flex items-center justify-center gap-1.5 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> تازه‌سازی
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="tabular-nums">{typeLabel(entityType)} · نمایش {rangeLabel}</span>
        <div className="flex items-center gap-2">
          <span>تعداد در صفحه:</span>
          <div role="group" aria-label="تعداد ردیف در صفحه" className="inline-flex rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] p-0.5">
            {([20, 50] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={pageSize === size}
                onClick={() => { setPageSize(size); setPage(0); }}
                className={`min-h-[32px] px-2.5 rounded-[6px] text-xs font-bold tabular-nums transition cursor-pointer ${
                  pageSize === size
                    ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {faNumber(size)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          دریافت مرجع جغرافیایی ناموفق بود. لطفاً مجدداً تلاش کنید.
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">در حال دریافت داده‌های مرجع...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">رکوردی مطابق فیلترها پیدا نشد.</div>
      ) : (
        <>
          {/* Desktop Dense Sticky-Header Table (AUD-013) */}
          <div className="hidden md:block rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs" data-testid="geographic-registry-table">
              <thead className="sticky top-0 bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">ردیف</th>
                  <th scope="col" className="py-3 px-3 font-bold">نام رسمی</th>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">والد جغرافیایی</th>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">استان</th>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">مختصات</th>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">وضعیت</th>
                  <th scope="col" className="py-3 px-3 font-bold whitespace-nowrap">شناسه فنی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {items.map((entity) => (
                  <tr key={entity.geographicEntityId} className="hover:bg-[var(--color-bg-canvas)] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
                      {faNumber(entity.registryIdentity.issuedOrderIndex)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[var(--color-text-primary)]">{entity.canonicalNameFa}</div>
                      {entity.alternativeNamesFa?.length ? (
                        <div className="text-xs text-[var(--color-text-muted)] truncate max-w-[260px]">
                          جایگزین: {entity.alternativeNamesFa.join('، ')}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{entity.parentNameFa || '—'}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{entity.provinceNameFa || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-[var(--color-text-muted)] tabular-nums whitespace-nowrap" dir="ltr">
                      {entity.pointCoordinates
                        ? `${entity.pointCoordinates.latitude.toFixed(4)}, ${entity.pointCoordinates.longitude.toFixed(4)}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-block rounded-[6px] bg-[var(--color-brand-soft)] px-2 py-0.5 font-semibold text-[var(--color-brand-700)] dark:text-emerald-300">
                        {entity.verificationStatus === 'VERIFIED' ? 'تاییدشده' : entity.verificationStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <details className="text-xs text-[var(--color-text-muted)]">
                        <summary className="cursor-pointer font-semibold hover:text-[var(--color-text-primary)] whitespace-nowrap">مشاهده</summary>
                        <div className="mt-1 space-y-0.5 font-mono text-xs break-all" dir="ltr">
                          <div>ID: {entity.geographicEntityId}</div>
                          <div>Anchor: {entity.registryIdentity.identityAnchor}</div>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Compact Card Stack */}
          <div className="md:hidden space-y-2.5">
            {items.map((entity) => (
              <article key={entity.geographicEntityId} className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-[6px] bg-[var(--color-bg-muted)] px-2 py-0.5 font-semibold text-[var(--color-text-secondary)] tabular-nums">
                        ردیف {faNumber(entity.registryIdentity.issuedOrderIndex)}
                      </span>
                      <span className="rounded-[6px] bg-[var(--color-brand-soft)] px-2 py-0.5 font-semibold text-[var(--color-brand-700)] dark:text-emerald-300">
                        {entity.verificationStatus === 'VERIFIED' ? 'تاییدشده' : entity.verificationStatus}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-sm font-bold text-[var(--color-text-primary)]">{entity.canonicalNameFa}</h2>
                  </div>
                  {entity.pointCoordinates && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] font-mono shrink-0" dir="ltr">
                      <MapPin className="w-3.5 h-3.5 text-[var(--color-brand-600)]" aria-hidden="true" />
                      {entity.pointCoordinates.latitude.toFixed(3)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] pt-2 text-xs">
                  <div>
                    <span className="block text-[var(--color-text-muted)]">والد</span>
                    <span className="font-semibold text-[var(--color-text-primary)]">{entity.parentNameFa || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[var(--color-text-muted)]">استان</span>
                    <span className="font-semibold text-[var(--color-text-primary)]">{entity.provinceNameFa || '—'}</span>
                  </div>
                </div>
                <details className="text-xs text-[var(--color-text-muted)]">
                  <summary className="cursor-pointer hover:text-[var(--color-text-primary)]">شناسه‌های فنی رکورد</summary>
                  <div className="mt-1 space-y-0.5 font-mono text-xs break-all" dir="ltr">
                    <div>ID: {entity.geographicEntityId}</div>
                    <div>Anchor: {entity.registryIdentity.identityAnchor}</div>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={page === 0 || loading}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          className="min-h-[44px] md:min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3.5 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" /> قبلی
        </button>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">صفحه {faNumber(page + 1)}</span>
        <button
          type="button"
          disabled={!hasNext || loading}
          onClick={() => setPage((value) => value + 1)}
          className="min-h-[44px] md:min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3.5 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
        >
          بعدی <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

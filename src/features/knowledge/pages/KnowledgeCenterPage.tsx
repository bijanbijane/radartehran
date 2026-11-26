/** @file src/features/knowledge/pages/KnowledgeCenterPage.tsx — Stages 81, 83 & 85 Server-Backed Knowledge Base with /knowledge/articles/:slug Deep Links (AUD-004, AUD-007, AUD-011, AUD-014, AUD-015) */
import React, { useEffect, useMemo, useState } from 'react';
import type { AuthUserSnapshot as User } from '../../../platform/auth';
import { BookOpen, Info, RefreshCw, Search } from 'lucide-react';
import type { CityId } from '../../../data/multiCityData';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { KnowledgeSubTabId, ModuleSubTabId } from '../../../navigation/registry/route.types';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import { KNOWLEDGE_PUBLICATIONS } from '../data/knowledgeCatalog';
import {
  KNOWLEDGE_DATA_BRIEFS,
  cacheSavedKnowledgeIdsForUser,
  loadSavedKnowledgeIds,
  type KnowledgeDataBrief,
} from '../data/knowledgeSourcesAndBriefs';
import {
  getKnowledgeDataBriefs,
  getKnowledgePublications,
  getMySavedKnowledge,
  removeSavedKnowledgePublication,
  saveKnowledgePublication,
} from '../services/knowledgeApiClient';
import { filterKnowledgePublications } from '../services/knowledgeSearchService';
import {
  KNOWLEDGE_CONTENT_TYPE_LABELS_FA,
  KNOWLEDGE_FRESHNESS_LABELS_FA,
  type KnowledgeContentType,
  type KnowledgeFreshnessStatus,
  type KnowledgePublication,
} from '../types/knowledge.types';
import { KnowledgeArticleReader } from '../components/KnowledgeArticleReader';
import { KnowledgeGlossaryView } from '../components/KnowledgeGlossaryView';
import { KnowledgeMethodologyView } from '../components/KnowledgeMethodologyView';
import { ConsumerHousingGuideView } from '../components/ConsumerHousingGuideView';

export interface KnowledgeCenterPageProps {
  activeSubTab?: KnowledgeSubTabId;
  activeCity?: CityId;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  unitPrice: number;
  fxSample: string;
  currentUser?: User | null;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
}

function extractArticleSlugFromPath(pathname: string): string | null {
  const match = /^\/knowledge\/articles\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveKnowledgeParentPath(subTab: KnowledgeSubTabId): string {
  if (subTab === 'guide') return '/knowledge/guide';
  if (subTab === 'methodology') return '/knowledge/methodology';
  if (subTab === 'glossary') return '/knowledge/glossary';
  return '/knowledge';
}

export const KnowledgeCenterPage: React.FC<KnowledgeCenterPageProps> = ({
  activeSubTab = 'reports',
  activeCity: _activeCity,
  selectedHood,
  evaluatedNeighborhoods = [],
  unitPrice,
  fxSample,
  currentUser,
  onSelectNeighborhood,
  onNavigateView,
  onOpenPulseModal,
  onOpenSeoDrawer,
}) => {
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState<KnowledgeContentType | 'all'>('all');
  const [freshness, setFreshness] = useState<KnowledgeFreshnessStatus | 'all'>('all');
  const [activePubSlug, setActivePubSlug] = useState<string | null>(() =>
    typeof window !== 'undefined' ? extractArticleSlugFromPath(window.location.pathname) : null,
  );

  const [serverPubs, setServerPubs] = useState<KnowledgePublication[]>(() => [...KNOWLEDGE_PUBLICATIONS]);
  const [dataBriefs, setDataBriefs] = useState<KnowledgeDataBrief[]>(() => [...KNOWLEDGE_DATA_BRIEFS]);
  const [catalogState, setCatalogState] = useState<'loading' | 'success' | 'empty' | 'error'>('success');
  const [catalogErrorFa, setCatalogErrorFa] = useState<string | null>(null);
  const [lastFetchedAtIso, setLastFetchedAtIso] = useState<string | null>(null);
  const [serverUpdatedAtIso, setServerUpdatedAtIso] = useState<string | null>(null);

  const [savedIds, setSavedIds] = useState<string[]>(() => loadSavedKnowledgeIds(currentUser?.uid));
  const [bookmarkStatusUnknown, setBookmarkStatusUnknown] = useState(false);
  const [savingPubId, setSavingPubId] = useState<string | null>(null);
  const [bookmarkFeedbackFa, setBookmarkFeedbackFa] = useState<string | null>(null);

  const currentTab: KnowledgeSubTabId = activeSubTab || 'reports';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setActivePubSlug(extractArticleSlugFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (currentTab === 'glossary') return;
    const controller = new AbortController();
    setCatalogState('loading');
    setCatalogErrorFa(null);

    getKnowledgePublications({
      subTab: currentTab,
      query,
      contentType,
      freshness,
      signal: controller.signal,
    }).then((res) => {
      if (controller.signal.aborted || res.errorFa === 'ABORTED') return;
      if (!res.ok || !res.data) {
        setCatalogErrorFa(res.errorFa || 'خطا در دریافت فهرست گزارش‌ها از سرور.');
        setCatalogState('error');
        return;
      }
      setServerPubs(res.data.items);
      setLastFetchedAtIso(res.fetchedAtIso);
      setServerUpdatedAtIso(res.serverUpdatedAtIso || null);
      setCatalogState(res.data.items.length === 0 ? 'empty' : 'success');
    });

    return () => controller.abort();
  }, [currentTab, query, contentType, freshness]);

  useEffect(() => {
    const controller = new AbortController();
    getKnowledgeDataBriefs(controller.signal).then((res) => {
      if (!controller.signal.aborted && res.ok && res.data && res.data.length > 0) {
        setDataBriefs(res.data);
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const uid = currentUser?.uid;
    setSavedIds([]);
    setBookmarkStatusUnknown(false);
    setBookmarkFeedbackFa(null);
    if (!uid || !currentUser) return;

    const controller = new AbortController();
    getMySavedKnowledge(currentUser, controller.signal).then((res) => {
      if (controller.signal.aborted || res.errorFa === 'ABORTED') return;
      if (!res.ok || !res.data) {
        setBookmarkStatusUnknown(true);
        return;
      }
      setSavedIds(res.data.savedIds);
      cacheSavedKnowledgeIdsForUser(uid, res.data.savedIds);
    });
    return () => controller.abort();
  }, [currentUser?.uid]);

  const activePub = useMemo(() => {
    if (!activePubSlug) return null;
    return (
      serverPubs.find((item) => item.slug === activePubSlug || item.id === activePubSlug) ||
      KNOWLEDGE_PUBLICATIONS.find((item) => item.slug === activePubSlug || item.id === activePubSlug) ||
      null
    );
  }, [activePubSlug, serverPubs]);

  const handleOpenPublication = (pub: KnowledgePublication) => {
    const slugKey = pub.slug || pub.id;
    setActivePubSlug(slugKey);
    if (typeof window !== 'undefined') {
      const nextUrl = `/knowledge/articles/${encodeURIComponent(slugKey)}`;
      if (window.location.pathname !== nextUrl) {
        window.history.pushState(null, '', nextUrl);
      }
    }
  };

  const handleClosePublication = () => {
    setActivePubSlug(null);
    if (typeof window !== 'undefined' && extractArticleSlugFromPath(window.location.pathname)) {
      window.history.pushState(null, '', resolveKnowledgeParentPath(currentTab));
    }
  };

  const handleToggleSavePublication = async (publicationId: string) => {
    setBookmarkFeedbackFa(null);
    if (!currentUser || !currentUser.uid) {
      setBookmarkFeedbackFa('برای ذخیره گزارش در حساب کاربری و همگام‌سازی بین دستگاه‌ها، ابتدا وارد حساب خود شوید.');
      return;
    }
    if (savingPubId === publicationId) return;
    setSavingPubId(publicationId);
    const isCurrentlySaved = savedIds.includes(publicationId);
    const res = isCurrentlySaved
      ? await removeSavedKnowledgePublication(publicationId, currentUser)
      : await saveKnowledgePublication(publicationId, currentUser);
    setSavingPubId(null);

    if (!res.ok || !res.data) {
      setBookmarkFeedbackFa(res.errorFa || 'خطا در به‌روزرسانی فهرست علاقه‌مندی‌ها.');
      return;
    }
    setBookmarkStatusUnknown(false);
    setSavedIds(res.data.savedIds);
    cacheSavedKnowledgeIdsForUser(currentUser.uid, res.data.savedIds);
  };

  const visiblePublications = useMemo(
    () =>
      filterKnowledgePublications(serverPubs, {
        subTab: currentTab,
        query,
        contentType,
        freshness,
      }),
    [serverPubs, currentTab, query, contentType, freshness],
  );

  const relatedPublications = useMemo(() => visiblePublications.slice(0, 3), [visiblePublications]);

  return (
    <div data-testid="product-knowledge-view" className="w-full max-w-[1320px] mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      <div className="border-b border-[var(--color-border-subtle)] pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-[var(--color-brand-fg)] flex items-center gap-1.5 mb-1">
            <BookOpen className="w-4 h-4" />
            <span>پایگاه دانش، گزارش‌های تحلیلی و روش‌شناسی رادار تهران</span>
          </span>
          <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)]">
            {currentTab === 'guide'
              ? 'راهنمای کاربردی و شروع کار با رادار تهران'
              : currentTab === 'methodology'
                ? 'روش‌شناسی، شفافیت داده و مرجع جغرافیایی'
                : currentTab === 'glossary'
                  ? 'واژه‌نامه تخصصی بازار مسکن و شهرسازی'
                  : 'پژوهش‌های مسکن، گزارش‌ها و تحلیل‌های تخصصی'}
          </h1>
        </div>
      </div>

      {/* Mandatory Epistemic Principle Banner */}
      <div className="p-3.5 rounded-[12px] bg-[var(--color-brand-soft)]/70 border border-[var(--color-border-subtle)] text-sm text-[var(--color-brand-fg)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            در تمامی پژوهش‌های رادار، سه لایه <strong>«داده خام»</strong>، <strong>«شاخص محاسبه‌شده با نسخه فرمول»</strong> و <strong>«تفسیر پژوهشی نویسنده»</strong> به‌صورت تفکیک‌شده ارائه می‌شوند.
          </p>
        </div>
        {(serverUpdatedAtIso || lastFetchedAtIso) && (
          <span className="text-xs text-[var(--color-text-muted)] shrink-0 tabular-nums">
            به‌روزرسانی:{' '}
            {(() => {
              const raw = serverUpdatedAtIso || lastFetchedAtIso || '';
              const d = new Date(raw);
              return Number.isNaN(d.getTime())
                ? toPersianNum(raw.slice(0, 10))
                : d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
            })()}
          </span>
        )}
      </div>

      {bookmarkFeedbackFa && (
        <div className="p-3 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm font-bold flex flex-wrap items-center justify-between gap-2">
          <span>{bookmarkFeedbackFa}</span>
          {!currentUser && (
            <RadarLink
              href="/account"
              onNavigate={() => onNavigateView('userspace', 'overview')}
              className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-[8px] bg-[var(--color-brand-600)] text-white text-sm font-bold"
            >
              ورود به حساب کاربری
            </RadarLink>
          )}
        </div>
      )}

      {currentTab === 'glossary' ? (
        <KnowledgeGlossaryView externalQuery={query} onNavigateView={onNavigateView} />
      ) : activePub ? (
        <KnowledgeArticleReader
          publication={activePub}
          currentUser={currentUser}
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          isSaved={savedIds.includes(activePub.id)}
          isSavingBookmark={savingPubId === activePub.id}
          bookmarkStatusUnknown={bookmarkStatusUnknown}
          onToggleSave={handleToggleSavePublication}
          onBack={handleClosePublication}
          onSelectNeighborhood={onSelectNeighborhood}
          onNavigateView={onNavigateView}
        />
      ) : currentTab === 'guide' || currentTab === 'methodology' ? (
        <div className="space-y-5">
          {currentTab === 'guide' ? (
            <ConsumerHousingGuideView evaluatedNeighborhoods={evaluatedNeighborhoods} onNavigateView={onNavigateView} />
          ) : (
            <KnowledgeMethodologyView
              selectedHood={selectedHood}
              unitPrice={unitPrice}
              fxSample={fxSample}
              onOpenPulseModal={onOpenPulseModal}
              onOpenSeoDrawer={onOpenSeoDrawer}
              onOpenRegistry={() => onNavigateView('discover', 'registry')}
            />
          )}

          {relatedPublications.length > 0 && (
            <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]" aria-label="مطالب مرتبط پایگاه دانش">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[var(--color-text-primary)]">مطالب مرتبط در پایگاه دانش</h2>
                <RadarLink
                  href="/knowledge"
                  onNavigate={() => onNavigateView('knowledge', 'reports')}
                  className="min-h-[44px] md:min-h-[36px] text-sm font-bold text-[var(--color-brand-fg)] hover:underline inline-flex items-center"
                >
                  مشاهده همه گزارش‌ها ←
                </RadarLink>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                {relatedPublications.map((pub) => {
                  const articleHref = `/knowledge/articles/${encodeURIComponent(pub.slug || pub.id)}`;
                  return (
                    <article
                      key={pub.id}
                      className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-[var(--color-brand-fg)]">{pub.categoryLabelFa}</span>
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2">{pub.titleFa}</h3>
                        <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">{pub.summaryFa}</p>
                      </div>
                      <RadarLink
                        href={articleHref}
                        onNavigate={() => handleOpenPublication(pub)}
                        className="min-h-[44px] md:min-h-[36px] text-sm font-bold text-[var(--color-brand-fg)] hover:underline inline-flex items-center"
                      >
                        مطالعه مقاله ←
                      </RadarLink>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" data-testid="knowledge-data-briefs">
            {dataBriefs.map((b) => (
              <div key={b.briefId} className="p-3.5 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs font-bold text-[var(--color-brand-fg)]">
                    {b.titleFa} · {b.periodFa} {b.calculationStatus === 'illustrative' ? '· (مثال آموزشی)' : ''}
                  </span>
                  <div className="font-bold text-[var(--color-text-primary)] truncate">{b.headlineFa}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{b.geographyFa} · {b.limitationFa}</div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-base font-bold text-[var(--color-brand-fg)] tabular-nums">{b.metricValueFa}</div>
                  <button
                    type="button"
                    onClick={() => {
                      const p = serverPubs.find((x) => x.id === b.linkedReportId) || KNOWLEDGE_PUBLICATIONS.find((x) => x.id === b.linkedReportId);
                      if (p && (p.status === 'published' || p.status === 'archived')) handleOpenPublication(p);
                    }}
                    className="min-h-[44px] md:min-h-[36px] text-sm font-bold underline text-[var(--color-text-primary)] cursor-pointer"
                  >
                    گزارش کامل ←
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Filter & Search Bar */}
          <div className="p-3.5 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="جست‌وجو در مقالات و پژوهش‌های دانشنامه"
                data-testid="knowledge-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جست‌وجو در عنوان، محله، فرمول یا نویسنده (مثلاً مترو، پونک)..."
                className="w-full min-h-[44px] md:min-h-[38px] ps-8 pe-3 py-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            <select
              aria-label="فیلتر نوع محتوا"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as KnowledgeContentType | 'all')}
              className="min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
            >
              {(Object.keys(KNOWLEDGE_CONTENT_TYPE_LABELS_FA) as Array<KnowledgeContentType | 'all'>).map((k) => (
                <option key={k} value={k}>{KNOWLEDGE_CONTENT_TYPE_LABELS_FA[k]}</option>
              ))}
            </select>
            <select
              aria-label="وضعیت به‌روزرسانی"
              value={freshness}
              onChange={(e) => setFreshness(e.target.value as KnowledgeFreshnessStatus | 'all')}
              className="min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
            >
              <option value="all">گزارش‌های جاری و دوره‌ای</option>
              <option value="current">جاری (به‌روز)</option>
              <option value="periodic">دوره‌ای</option>
              <option value="archived">آرشیوی (مرجع تاریخی)</option>
            </select>
          </div>

          {catalogErrorFa && (
            <div className="p-3 rounded-[10px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm font-bold flex items-center justify-between">
              <span>{catalogErrorFa}</span>
              <RefreshCw className="w-4 h-4" />
            </div>
          )}

          {visiblePublications.length === 0 ? (
            <div className="p-6 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-2 text-sm">
              <p className="font-bold text-[var(--color-text-primary)]">
                {catalogState === 'loading' ? 'در حال دریافت گزارش‌ها از سرور مرکز دانش...' : 'مطلبی با فیلترهای انتخاب‌شده یافت نشد.'}
              </p>
              <button
                type="button"
                onClick={() => { setQuery(''); setContentType('all'); setFreshness('all'); }}
                className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
              >
                بازنشانی فیلترها
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" data-testid="knowledge-publications-grid">
              {visiblePublications.map((pub) => {
                const fr = KNOWLEDGE_FRESHNESS_LABELS_FA[pub.freshnessStatus];
                const articleHref = `/knowledge/articles/${encodeURIComponent(pub.slug || pub.id)}`;
                return (
                  <article
                    key={pub.id}
                    className="p-5 rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] font-bold">
                          {pub.categoryLabelFa}
                        </span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${fr.badgeClass}`}>{fr.labelFa}</span>
                      </div>
                      <h2 className="text-base font-bold text-[var(--color-text-primary)] leading-[1.5]">{pub.titleFa}</h2>
                      <p className="text-[var(--color-text-secondary)] leading-relaxed">{pub.summaryFa}</p>
                      <div className="text-xs text-[var(--color-text-muted)] pt-1">
                        محدوده: <strong className="text-[var(--color-text-primary)]">{pub.geographyScopeFa}</strong> · نسخه {pub.version} · شاخص‌ها: {toPersianNum(pub.calculatedIndicators.length)} مورد
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--color-text-muted)]">{pub.publishedAtFa}</span>
                      <RadarLink
                        href={articleHref}
                        data-testid={`knowledge-open-${pub.id}`}
                        onNavigate={() => handleOpenPublication(pub)}
                        className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-sm font-bold"
                      >
                        مطالعه کامل و شاخص‌ها
                      </RadarLink>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

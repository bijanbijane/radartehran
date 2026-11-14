/** @file src/features/knowledge/pages/KnowledgeCenterPage.tsx — Stage 24 Knowledge Base, Research & Publications Center */
import React, { useMemo, useState } from 'react';
import { BookOpen, Info, Search } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { KnowledgeSubTabId, ModuleSubTabId } from '../../../navigation/registry/route.types';
import { KNOWLEDGE_PUBLICATIONS } from '../data/knowledgeCatalog';
import { KNOWLEDGE_DATA_BRIEFS, loadSavedKnowledgeIds, toggleSavedKnowledgeId } from '../data/knowledgeSourcesAndBriefs';
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

export interface KnowledgeCenterPageProps {
  activeSubTab?: KnowledgeSubTabId;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  unitPrice: number;
  fxSample: string;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenPulseModal: () => void;
  onOpenSeoDrawer: () => void;
}

const SUBTAB_LABELS: Array<{ id: KnowledgeSubTabId; labelFa: string }> = [
  { id: 'reports', labelFa: 'گزارش‌ها و پژوهش‌های شهری' },
  { id: 'guide', labelFa: 'راهنمای کاربردی' },
  { id: 'methodology', labelFa: 'روش‌شناسی و معرفت‌شناسی' },
  { id: 'glossary', labelFa: 'فرهنگ‌نامه تخصصی' },
];

export const KnowledgeCenterPage: React.FC<KnowledgeCenterPageProps> = ({
  activeSubTab = 'reports',
  selectedHood,
  evaluatedNeighborhoods = [],
  unitPrice,
  fxSample,
  onSelectNeighborhood,
  onNavigateView,
  onOpenPulseModal,
  onOpenSeoDrawer,
}) => {
  const [selectedTab, setSelectedTab] = useState<KnowledgeSubTabId>(activeSubTab);
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState<KnowledgeContentType | 'all'>('all');
  const [freshness, setFreshness] = useState<KnowledgeFreshnessStatus | 'all'>('all');
  const [activePub, setActivePub] = useState<KnowledgePublication | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>(() => loadSavedKnowledgeIds());

  const currentTab: KnowledgeSubTabId = activeSubTab || selectedTab;

  const visiblePublications = useMemo(
    () =>
      filterKnowledgePublications(KNOWLEDGE_PUBLICATIONS, {
        subTab: currentTab,
        query,
        contentType,
        freshness,
      }),
    [currentTab, query, contentType, freshness],
  );

  return (
    <div data-testid="product-knowledge-view" className="w-full max-w-6xl mx-auto px-4 py-6 space-y-5 animate-fadeIn">
      <div className="border-b border-[#DCE3DF] dark:border-slate-800 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[12px] font-bold text-[#176B63] dark:text-emerald-400 flex items-center gap-1.5 mb-1">
            <BookOpen className="w-4 h-4" />
            <span>پایگاه دانش، گزارش‌های تحلیلی و روش‌شناسی رادار تهران</span>
          </span>
          <h1 className="text-2xl font-black text-[#182522] dark:text-white">پژوهش‌های مسکن، راهنماها و شفافیت داده</h1>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {SUBTAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`knowledge-tab-${tab.id}`}
              onClick={() => {
                setSelectedTab(tab.id);
                setActivePub(null);
                onNavigateView('knowledge', tab.id);
              }}
              className={`px-3 py-1.5 rounded-[9px] font-bold cursor-pointer whitespace-nowrap transition ${
                currentTab === tab.id
                  ? 'bg-[#176B63] text-white'
                  : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200'
              }`}
            >
              {tab.labelFa}
            </button>
          ))}
        </div>
      </div>

      {/* Mandatory Epistemic Principle Banner */}
      <div className="p-3.5 rounded-[12px] bg-[#EAF3F0]/60 dark:bg-emerald-950/20 border border-[#DCE3DF] dark:border-emerald-900 text-[11.5px] text-[#14534E] dark:text-emerald-200 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          در تمامی پژوهش‌های رادار، سه لایه <strong>«داده خام»</strong>، <strong>«شاخص محاسبه‌شده با نسخه فرمول»</strong> و <strong>«تفسیر پژوهشی نویسنده»</strong> به‌صورت تفکیک‌شده ارائه می‌شوند تا معیارهای عددی با تحلیل تحریریه مخلوط نگردند.
        </p>
      </div>

      {currentTab === 'glossary' ? (
        <KnowledgeGlossaryView externalQuery={query} onNavigateView={onNavigateView} />
      ) : activePub ? (
        <KnowledgeArticleReader
          publication={activePub}
          evaluatedNeighborhoods={evaluatedNeighborhoods}
          isSaved={savedIds.includes(activePub.id)}
          onToggleSave={(id) => setSavedIds(toggleSavedKnowledgeId(id))}
          onBack={() => setActivePub(null)}
          onSelectNeighborhood={onSelectNeighborhood}
          onNavigateView={onNavigateView}
        />
      ) : (
        <>
          {currentTab === 'reports' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs" data-testid="knowledge-data-briefs">
              {KNOWLEDGE_DATA_BRIEFS.map((b) => (
                <div key={b.briefId} className="p-3.5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[10.5px] font-bold text-[#176B63] dark:text-emerald-400">{b.titleFa} · {b.periodFa}</span>
                    <div className="font-bold text-[#182522] dark:text-white truncate">{b.headlineFa}</div>
                    <div className="text-[10.5px] text-[#586760]">{b.geographyFa} · {b.limitationFa}</div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-base font-black text-[#176B63] dark:text-emerald-400 tabular-nums">{b.metricValueFa}</div>
                    <button type="button" onClick={() => { const p = KNOWLEDGE_PUBLICATIONS.find((x) => x.id === b.linkedReportId); if (p) setActivePub(p); }} className="text-[11px] font-bold underline text-[#182522] dark:text-slate-200 cursor-pointer">گزارش کامل ←</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {currentTab === 'methodology' && (
            <KnowledgeMethodologyView
              selectedHood={selectedHood}
              unitPrice={unitPrice}
              fxSample={fxSample}
              onOpenPulseModal={onOpenPulseModal}
              onOpenSeoDrawer={onOpenSeoDrawer}
            />
          )}

          {/* Filter & Search Bar */}
          <div className="p-3.5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-[#586760] absolute right-2.5 top-2.5" />
              <input
                type="text"
                data-testid="knowledge-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جست‌وجو در عنوان، محله، فرمول یا نویسنده (مثلاً مترو، پونک)..."
                className="w-full pr-8 pl-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
              />
            </div>
            <select
              aria-label="فیلتر نوع محتوا"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as KnowledgeContentType | 'all')}
              className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
            >
              {(Object.keys(KNOWLEDGE_CONTENT_TYPE_LABELS_FA) as Array<KnowledgeContentType | 'all'>).map((k) => (
                <option key={k} value={k}>{KNOWLEDGE_CONTENT_TYPE_LABELS_FA[k]}</option>
              ))}
            </select>
            <select
              aria-label="وضعیت به‌روزرسانی"
              value={freshness}
              onChange={(e) => setFreshness(e.target.value as KnowledgeFreshnessStatus | 'all')}
              className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
            >
              <option value="all">همه وضعیت‌های زمانی</option>
              <option value="current">جاری (به‌روز)</option>
              <option value="periodic">دوره‌ای</option>
              <option value="archived">آرشیوی</option>
            </select>
          </div>

          {visiblePublications.length === 0 ? (
            <div className="p-6 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-2 text-xs">
              <p className="font-bold text-[#182522] dark:text-white">مطلبی با فیلترهای انتخاب‌شده یافت نشد.</p>
              <button
                type="button"
                onClick={() => { setQuery(''); setContentType('all'); setFreshness('all'); }}
                className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer"
              >
                بازنشانی فیلترها
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs" data-testid="knowledge-publications-grid">
              {visiblePublications.map((pub) => {
                const fr = KNOWLEDGE_FRESHNESS_LABELS_FA[pub.freshnessStatus];
                return (
                  <article
                    key={pub.id}
                    className="p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10.5px]">
                        <span className="px-2 py-0.5 rounded bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#14534E] dark:text-emerald-300 font-bold">
                          {pub.categoryLabelFa}
                        </span>
                        <span className={`px-2 py-0.5 rounded border font-bold ${fr.badgeClass}`}>{fr.labelFa}</span>
                      </div>
                      <h2 className="text-base font-black text-[#182522] dark:text-white leading-[1.5]">{pub.titleFa}</h2>
                      <p className="text-[#586760] leading-relaxed">{pub.summaryFa}</p>
                      <div className="text-[11px] text-[#34433E] dark:text-slate-300 pt-1">
                        محدوده: <strong>{pub.geographyScopeFa}</strong> · نسخه {pub.version} · شاخص‌ها: {toPersianNum(pub.calculatedIndicators.length)} مورد
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-[#586760]">{pub.publishedAtFa}</span>
                      <button
                        type="button"
                        data-testid={`knowledge-open-${pub.id}`}
                        onClick={() => setActivePub(pub)}
                        className="px-3.5 py-1.5 rounded-[8px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer"
                      >
                        مطالعه کامل و شاخص‌ها
                      </button>
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

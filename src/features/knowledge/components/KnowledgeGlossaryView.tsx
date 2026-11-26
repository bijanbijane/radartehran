/** @file src/features/knowledge/components/KnowledgeGlossaryView.tsx — Searchable Real Estate, Valuation & Urban Glossary */
import React, { useMemo, useState } from 'react';
import { BookMarked, Search } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { GLOSSARY_CATEGORY_LABELS_FA, KNOWLEDGE_GLOSSARY_TERMS } from '../data/knowledgeGlossaryData';
import { filterGlossaryTerms } from '../services/knowledgeSearchService';
import type { GlossaryTermCategory } from '../types/knowledge.types';

export interface KnowledgeGlossaryViewProps {
  externalQuery?: string;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const KnowledgeGlossaryView: React.FC<KnowledgeGlossaryViewProps> = ({
  externalQuery = '',
  onNavigateView,
}) => {
  const [localQuery, setLocalQuery] = useState('');
  const [category, setCategory] = useState<GlossaryTermCategory | 'all'>('all');
  const activeQuery = localQuery || externalQuery;

  const visibleTerms = useMemo(
    () => filterGlossaryTerms(KNOWLEDGE_GLOSSARY_TERMS, activeQuery, category),
    [activeQuery, category],
  );

  return (
    <div data-testid="knowledge-glossary-view" className="space-y-4 text-xs animate-fadeIn">
      <div className="p-4 rounded-[14px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-sm text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <BookMarked className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>فرهنگ‌نامه تخصصی املاک، ارزش‌گذاری و شهرسازی تهران ({toPersianNum(visibleTerms.length)})</span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute right-2.5 top-2.5" />
            <input
              type="text"
              data-testid="knowledge-glossary-search"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="جست‌وجوی اصطلاح (مثلاً هدونیک، IQR، R122)..."
              className="w-full pr-8 pl-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(GLOSSARY_CATEGORY_LABELS_FA) as Array<GlossaryTermCategory | 'all'>).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 rounded-[7px] font-bold cursor-pointer ${
                category === cat
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] text-[#48534F] dark:text-[var(--color-text-secondary)]'
              }`}
            >
              {GLOSSARY_CATEGORY_LABELS_FA[cat]}
            </button>
          ))}
        </div>
      </div>

      {visibleTerms.length === 0 ? (
        <div className="p-6 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] text-center text-[var(--color-text-muted)]">
          اصطلاحی با این عبارت پیدا نشد. کلیدواژه ساده‌تری مثل «رهن» یا «ارزش» را جست‌وجو کنید.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visibleTerms.map((term) => (
            <article key={term.id} className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="px-2 py-0.5 rounded bg-[#EAF3F0] dark:bg-emerald-950/60 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold text-[10.5px]">
                    {GLOSSARY_CATEGORY_LABELS_FA[term.category]}
                  </span>
                  <span className="text-[10.5px] text-[var(--color-text-muted)] font-medium" dir="ltr">{term.termEn}</span>
                </div>
                <h2 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">{term.termFa}</h2>
                <p className="editorial-prose text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] text-xs">{term.shortDefinitionFa}</p>
                <div className="p-2.5 rounded-[8px] bg-[#FFF4E5]/70 dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-[11px] text-[#875000] dark:text-amber-200 font-medium">
                  تمایز حیاتی: {term.usageDistinctionFa}
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)]">مثال کاربردی: {term.exampleFa}</p>
              </div>
              {term.relatedView && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateView(term.relatedView!, term.relatedSubTab)}
                    className="px-3 py-1 rounded-[7px] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] hover:border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-400 font-bold cursor-pointer"
                  >
                    مشاهده ابزار مرتبط در رادار ←
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

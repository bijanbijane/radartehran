/** @file src/features/knowledge/components/KnowledgeArticleReader.tsx — 3-Tier Epistemic Reader, TOC, Sources, Save & Export */
import React, { useState } from 'react';
import { ArrowRight, Bookmark, Calculator, Compass, Database, Download, FileText, Flag, MapPin, ShieldCheck, UserCheck } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { KNOWLEDGE_SOURCE_REGISTRY, submitKnowledgeCorrectionNote } from '../data/knowledgeSourcesAndBriefs';
import { buildKnowledgeReportExportJson, buildKnowledgeReportPrintHtml } from '../services/knowledgeSearchService';
import { KNOWLEDGE_FRESHNESS_LABELS_FA, type KnowledgePublication } from '../types/knowledge.types';

export interface KnowledgeArticleReaderProps {
  publication: KnowledgePublication;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  isSaved?: boolean;
  onToggleSave?: (pubId: string) => void;
  onBack: () => void;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const KnowledgeArticleReader: React.FC<KnowledgeArticleReaderProps> = ({
  publication, evaluatedNeighborhoods = [], isSaved = false, onToggleSave, onBack, onSelectNeighborhood, onNavigateView,
}) => {
  const [noticeFa, setNoticeFa] = useState<string | null>(null);
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [corrText, setCorrText] = useState('');
  const freshness = KNOWLEDGE_FRESHNESS_LABELS_FA[publication.freshnessStatus];

  const handleOpenNeighborhood = (name: string) => {
    const matched = evaluatedNeighborhoods.find((h) => h.name === name);
    if (matched && onSelectNeighborhood) onSelectNeighborhood(matched);
    onNavigateView('map');
  };

  return (
    <article data-testid="knowledge-article-reader" className="p-5 sm:p-6 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-5 text-xs animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
        <button type="button" onClick={onBack} className="px-3 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer">
          <ArrowRight className="w-3.5 h-3.5" /><span>بازگشت به فهرست</span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          {onToggleSave && (
            <button type="button" data-testid="knowledge-save-btn" onClick={() => onToggleSave(publication.id)} className={`px-3 py-1.5 rounded-[8px] border font-bold flex items-center gap-1 cursor-pointer ${isSaved ? 'border-[#176B63] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#14534E] dark:text-emerald-300' : 'border-[#DCE3DF] dark:border-slate-700'}`}>
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#176B63]' : ''}`} /><span>{isSaved ? 'ذخیره‌شده' : 'ذخیره مطالعه'}</span>
            </button>
          )}
          <button type="button" data-testid="knowledge-export-html" onClick={() => { triggerDownload(`${publication.slug}.html`, buildKnowledgeReportPrintHtml(publication), 'text/html;charset=utf-8'); setNoticeFa('نسخه چاپی گزارش (HTML) آماده و ذخیره شد.'); }} className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold flex items-center gap-1 cursor-pointer">
            <FileText className="w-3.5 h-3.5" /><span>خروجی چاپی</span>
          </button>
          <button type="button" data-testid="knowledge-export-json" onClick={() => { triggerDownload(`${publication.slug}.json`, buildKnowledgeReportExportJson(publication), 'application/json'); setNoticeFa('فایل ساختاریافته JSON ذخیره شد.'); }} className="px-3 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer">
            <Download className="w-3.5 h-3.5" /><span>JSON</span>
          </button>
        </div>
      </div>

      {noticeFa && <div className="p-2.5 rounded-[8px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">{noticeFa}</div>}

      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-[6px] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#14534E] dark:text-emerald-300 font-bold">{publication.categoryLabelFa}</span>
          <span className={`px-2 py-0.5 rounded-[6px] border font-bold ${freshness.badgeClass}`}>{freshness.labelFa}</span>
          <span className="px-2 py-0.5 rounded-[6px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold" dir="ltr">{publication.version}</span>
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-bold text-[#182522] dark:text-white leading-[1.5]">{publication.titleFa}</h2>
        <p className="editorial-prose text-[#34433E] dark:text-slate-300">{publication.summaryFa}</p>

        <nav aria-label="فهرست بخش‌های سند" className="flex flex-wrap gap-2 pt-1 text-[11px]">
          <a href="#tier-1-raw" className="px-2.5 py-1 rounded bg-[#F8F9FA] dark:bg-slate-800 text-[#176B63] dark:text-emerald-400 font-bold">۱. داده خام</a>
          <a href="#tier-2-ind" className="px-2.5 py-1 rounded bg-[#F8F9FA] dark:bg-slate-800 text-[#176B63] dark:text-emerald-400 font-bold">۲. شاخص‌های محاسبه‌شده</a>
          <a href="#tier-3-interp" className="px-2.5 py-1 rounded bg-[#F8F9FA] dark:bg-slate-800 text-[#176B63] dark:text-emerald-400 font-bold">۳. تفسیر و محدودیت</a>
          <a href="#tier-4-sources" className="px-2.5 py-1 rounded bg-[#F8F9FA] dark:bg-slate-800 text-[#176B63] dark:text-emerald-400 font-bold">۴. شناسنامه منابع</a>
        </nav>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-[11px]">
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70"><span className="text-[#586760] block">محدوده و دوره:</span><strong className="text-[#182522] dark:text-white">{publication.geographyScopeFa} · {publication.periodLabelFa}</strong></div>
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70"><span className="text-[#586760] block">نویسنده پژوهش:</span><strong className="text-[#182522] dark:text-white flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-[#176B63]" /> {publication.author.nameFa}</strong></div>
          <div className="p-2.5 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70"><span className="text-[#586760] block">بازبین فنی مستقل:</span><strong className="text-[#182522] dark:text-white flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-[#176B63]" /> {publication.technicalReviewer.nameFa}</strong></div>
        </div>
      </header>

      <section id="tier-1-raw" data-testid="knowledge-tier-raw-data" className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-slate-800/60 border border-[#DCE3DF] dark:border-slate-700 space-y-1.5">
        <h3 className="font-black text-[#182522] dark:text-white flex items-center gap-1.5"><Database className="w-4 h-4 text-[#176B63]" /><span>لایه ۱: داده خام و منابع پایه (Raw Data)</span></h3>
        <p className="editorial-prose text-[#34433E] dark:text-slate-300">{publication.rawDataSummaryFa}</p>
      </section>

      <section id="tier-2-ind" data-testid="knowledge-tier-indicators" className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#176B63]/40 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-[#182522] dark:text-white flex items-center gap-1.5"><Calculator className="w-4 h-4 text-[#176B63]" /><span>لایه ۲: شاخص‌های محاسبه‌شده (Calculated Indicators)</span></h3>
          <span className="text-[11px] px-2 py-0.5 rounded bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#14534E] dark:text-emerald-300 font-bold" dir="ltr">{publication.formulaVersion}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {publication.calculatedIndicators.map((ind) => (
            <div key={ind.id} className="p-3 rounded-[10px] bg-[#F8F9FA] dark:bg-slate-800/80 border border-[#DCE3DF] dark:border-slate-700 space-y-1">
              <div className="font-bold text-[#182522] dark:text-white">{ind.labelFa}</div>
              <div className="text-base font-black text-[#176B63] dark:text-emerald-400 tabular-nums">{ind.valueDisplayFa} <span className="text-[11px] font-medium text-[#586760]">({ind.unitFa})</span></div>
              <div className="text-[10.5px] text-[#586760]">دامنه: {ind.sampleScopeFa} · دوره: {ind.periodLabelFa}</div>
              <div className="text-[10.5px] text-[#875000] dark:text-amber-300 font-medium">محدودیت شاخص: {ind.limitationFa}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="tier-3-interp" data-testid="knowledge-tier-interpretation" className="p-4 rounded-[12px] bg-[#EAF3F0]/50 dark:bg-emerald-950/20 border border-[#DCE3DF] dark:border-emerald-900 space-y-2">
        <h3 className="font-black text-[#14534E] dark:text-emerald-300 flex items-center gap-1.5"><Compass className="w-4 h-4" /><span>لایه ۳: تفسیر پژوهشی و محدودیت‌ها (تفکیک‌شده از آمار خام)</span></h3>
        <p className="editorial-prose text-[#182522] dark:text-slate-200">{publication.researchInterpretationFa}</p>
        <div className="pt-1 border-t border-[#DCE3DF] dark:border-slate-800 text-[11px] text-[#586760] space-y-1">
          <strong className="block text-[#182522] dark:text-slate-200">سابقه نسخه ({publication.version}) و محدودیت‌ها:</strong>
          <p>{publication.changelogFa}</p>
          <ul className="list-disc pr-4 space-y-0.5">{publication.limitationsFa.map((lim) => <li key={lim}>{lim}</li>)}</ul>
        </div>
      </section>

      <section id="tier-4-sources" className="p-4 rounded-[12px] bg-[#F8F9FA] dark:bg-slate-800/60 border border-[#DCE3DF] dark:border-slate-700 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[#182522] dark:text-white">شناسنامه منابع ثبت‌شده و مجوز استفاده</strong>
          <button type="button" onClick={() => setShowCorrForm((v) => !v)} className="text-[11px] font-bold text-[#875000] dark:text-amber-300 flex items-center gap-1 cursor-pointer">
            <Flag className="w-3.5 h-3.5" /><span>گزارش خطا / پیشنهاد اصلاحیه</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {KNOWLEDGE_SOURCE_REGISTRY.map((src) => (
            <div key={src.sourceId} className="p-2.5 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 space-y-1 text-[11px]">
              <div className="font-bold text-[#182522] dark:text-white">{src.titleFa}</div>
              <div className="text-[#586760]">{src.sourceTypeFa} · نسخه {src.version}</div>
              <div className="text-[#586760]">{src.reliabilityNoteFa}</div>
            </div>
          ))}
        </div>
        {showCorrForm && (
          <div className="pt-2 flex flex-wrap gap-2">
            <input type="text" value={corrText} onChange={(e) => setCorrText(e.target.value)} placeholder="شماره شاخص یا مورد نیازمند اصلاح را بنویسید..." className="flex-1 min-w-[200px] p-2 rounded-[8px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700" />
            <button type="button" onClick={() => { if (corrText.trim().length < 5) return; submitKnowledgeCorrectionNote(publication.id, corrText); setCorrText(''); setShowCorrForm(false); setNoticeFa('گزارش اصلاحیه جهت بازبینی فنی و تحریریه ثبت شد.'); }} className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer">ارسال اصلاحیه</button>
          </div>
        )}
      </section>

      <footer className="pt-2 border-t border-[#DCE3DF] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {publication.relatedNeighborhoodNames.map((name) => (
            <button key={name} type="button" onClick={() => handleOpenNeighborhood(name)} className="px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 hover:border-[#176B63] font-bold flex items-center gap-1 cursor-pointer">
              <MapPin className="w-3.5 h-3.5 text-[#176B63]" /><span>نقشه {name}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publication.crossReferences.map((xref) => (
            <button key={xref.labelFa} type="button" onClick={() => onNavigateView(xref.targetView, xref.targetSubTab)} className="px-3 py-1.5 rounded-[8px] bg-[#182522] dark:bg-white text-white dark:text-[#182522] font-bold cursor-pointer">{xref.labelFa}</button>
          ))}
        </div>
      </footer>
    </article>
  );
};

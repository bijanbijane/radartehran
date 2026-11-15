import React, { useMemo, useState } from 'react';
import { Columns3, Layers, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import {
  RT_FE_PAGE_COMPOSITION_015_SPEC_ID, RT_FE_STAGE16_BRIDGE_SPEC_ID,
  RT_PAGE_HIERARCHY_6, RT_PAGE_LAYOUT_CATALOG_10, RT_PAGE_CONTENT_REGIONS_7,
  RT_PAGE_PANEL_TYPES_7, RT_PAGE_OVERLAY_ZINDEX_7, RT_PAGE_ERROR_BOUNDARY_5,
  RT_PAGE_EXECUTION_PHASES_10, RT_PAGE_DELIVERABLES_33, RT_PAGE_INSPECTOR_PANEL_DEF,
  validatePageCompositionRegions, resolveResponsivePanelBehavior,
  evaluateOverlayStacking, validateLayoutPersistencePayload,
  type LayoutId, type RegionId,
} from '../services/rtFePageComposition015Engine';

type PageTabId = 'hierarchy_catalog' | 'inspector_overlays' | 'responsive_persistence' | 'phases_deliverables';

export const RtFePageComposition015Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PageTabId>('hierarchy_catalog');
  const [selectedLayout, setSelectedLayout] = useState<LayoutId>('map-centric');
  const [selectedRegions, setSelectedRegions] = useState<RegionId[]>(['main', 'aside', 'inspector', 'utility']);
  const [overlayStack, setOverlayStack] = useState<('drawer' | 'modal' | 'popover' | 'toast')[]>(['modal']);
  const [viewportWidth, setViewportWidth] = useState<number>(1440);
  const [panelWidth, setPanelWidth] = useState<number>(320);
  const [panelOpen, setPanelOpen] = useState<boolean>(true);
  const [savedVersion, setSavedVersion] = useState<number>(3);

  const regionCheck = useMemo(() => validatePageCompositionRegions(selectedLayout, selectedRegions), [selectedLayout, selectedRegions]);
  const overlayCheck = useMemo(() => evaluateOverlayStacking(overlayStack), [overlayStack]);
  const responsiveOut = useMemo(
    () => resolveResponsivePanelBehavior({ panel: RT_PAGE_INSPECTOR_PANEL_DEF, viewportWidthPx: viewportWidth, requestedWidthPx: panelWidth, isOpen: panelOpen }),
    [viewportWidth, panelWidth, panelOpen],
  );
  const persistenceOut = useMemo(
    () => validateLayoutPersistencePayload({ layoutId: selectedLayout, contractVersion: savedVersion, inspectorWidthPx: panelWidth, asideCollapsed: !panelOpen }, 3),
    [selectedLayout, savedVersion, panelWidth, panelOpen],
  );

  const toggleRegion = (region: RegionId) =>
    setSelectedRegions((prev) => (prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]));

  return (
    <div dir="rtl" data-testid="rt-fe-page-015-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_PAGE_COMPOSITION_015_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۰ الگوی Layout · ۷ ناحیه محتوایی · Inspector · Z-index 7-Layer · ۳۳ خروجی RT-FE-PAGE-OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله پانزدهم: نظام ترکیب صفحات، ساختار Layoutها و مدیریت نواحی محتوایی
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Layout = Structure · Feature = Content
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'hierarchy_catalog', label: '۱. سلسله‌مراتب ۶سطحی، ۱۰ Layout و اعتبارسنج نواحی' },
            { id: 'inspector_overlays', label: '۲. Inspector، مهار Overlay Stacking و Error Boundary' },
            { id: 'responsive_persistence', label: '۳. Responsive، Resize صفحه‌کلید و بازیابی تنظیمات' },
            { id: 'phases_deliverables', label: '۴. برنامه ۱۰فازی و ۳۳ خروجی RT-FE-PAGE-OUT' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as PageTabId)} data-testid={`rt-fe-page-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'hierarchy_catalog' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Layers className="w-4 h-4" /> معماری ۶سطحی ترکیب صفحه (§۱۵.۵) و اعتبارسنجی Region</h5>
            {RT_PAGE_HIERARCHY_6.map((lvl) => (
              <div key={lvl.level} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">L{lvl.level} {lvl.nameEn}</span>
                <span className="text-slate-200">{lvl.roleFa}</span>
              </div>
            ))}
            <div className="pt-2 space-y-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-300">الگوی انتخابی:</span>
                <select aria-label="انتخاب الگوی Layout" data-testid="rt-fe-page-layout-select" value={selectedLayout} onChange={(e) => setSelectedLayout(e.target.value as LayoutId)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white">
                  {RT_PAGE_LAYOUT_CATALOG_10.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.titleFa}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RT_PAGE_CONTENT_REGIONS_7.map((r) => (
                  <label key={r.id} className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 cursor-pointer">
                    <input type="checkbox" data-testid={`rt-fe-page-region-${r.id}`} checked={selectedRegions.includes(r.id)} onChange={() => toggleRegion(r.id)} />
                    <span className="font-mono" dir="ltr">{r.id}</span>
                  </label>
                ))}
              </div>
              <div data-testid="rt-fe-page-region-verdict" className={`rounded p-2 text-[11px] font-bold ${regionCheck.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
                {regionCheck.reasonFa}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><Columns3 className="w-4 h-4" /> ۱۰ الگوی رسمی Layout Registry (§۱۵.۶ & §۱۵.۷)</h5>
            {RT_PAGE_LAYOUT_CATALOG_10.map((layout) => (
              <div key={layout.code} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <div>
                  <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-indigo-300 ml-1.5" dir="ltr">{layout.code}</span>
                  <span className="text-white font-bold">{layout.titleFa}</span> — <span className="text-slate-300">{layout.descriptionFa}</span>
                </div>
                <span className="font-mono text-[10px] text-teal-300" dir="ltr">{layout.regions.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'inspector_overlays' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> جلوگیری از Overlay Stacking و قرارداد ۷لایه Z-index (§۱۵.۲۲)</h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-page-stack-valid" onClick={() => setOverlayStack(['drawer', 'modal', 'toast'])} className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-700">تست عادی (Drawer → Modal → Toast)</button>
              <button type="button" data-testid="rt-fe-page-stack-double-modal" onClick={() => setOverlayStack(['modal', 'modal'])} className="rounded bg-rose-900/60 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-800/70">تست هم‌پوشانی ۲ Modal</button>
              <button type="button" data-testid="rt-fe-page-stack-drawer-over" onClick={() => setOverlayStack(['modal', 'drawer'])} className="rounded bg-amber-900/60 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-800/70">تست Drawer روی Modal</button>
            </div>
            <div data-testid="rt-fe-page-overlay-verdict" className={`rounded p-2 text-[11px] font-bold ${overlayCheck.allowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              <span className="font-mono ml-1.5" dir="ltr">[{overlayCheck.status}]</span>{overlayCheck.reasonFa}
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              {RT_PAGE_OVERLAY_ZINDEX_7.map((z) => (
                <div key={z.token} className="rounded bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300">
                  <span className="font-mono text-cyan-300" dir="ltr">{z.token}: {z.zIndex}</span> — {z.layerFa}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300">۷ نوع پنل (§۱۵.۱۱) و ۵ سطح شکست محدود Error Boundary (§۱۵.۲۸)</h5>
            <div className="grid grid-cols-1 gap-1">
              {RT_PAGE_ERROR_BOUNDARY_5.map((eb) => (
                <div key={eb.level} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                  <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-emerald-300 ml-1.5" dir="ltr">L{eb.level} {eb.scopeFa}</span>
                  <span className="text-slate-300">{eb.fallbackFa}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_PAGE_PANEL_TYPES_7.map((p) => (
                <span key={p.id} className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">{p.labelFa}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'responsive_persistence' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><MonitorSmartphone className="w-4 h-4" /> رفتار Responsive، Resize صفحه‌کلید و map.invalidateSize (§۱۵.۲۴)</h5>
            <div className="flex flex-wrap gap-1.5">
              {[1440, 900, 390].map((vw) => (
                <button key={vw} type="button" data-testid={`rt-fe-page-vw-${vw}`} onClick={() => setViewportWidth(vw)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${viewportWidth === vw ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {vw === 1440 ? 'دسکتاپ (1440px)' : vw === 900 ? 'تبلت (900px)' : 'موبایل (390px)'}
                </button>
              ))}
              <button type="button" onClick={() => setPanelOpen((v) => !v)} className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                {panelOpen ? 'بستن پنل (آزادسازی فضا)' : 'بازکردن پنل'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-300">عرض درخواستی پنل <span className="font-mono text-cyan-300" dir="ltr">Inspector</span> (<strong className="text-white" dir="ltr">{panelWidth}px</strong>)</span>
              <button type="button" data-testid="rt-fe-page-resize-minus" onClick={() => setPanelWidth((w) => w - 24)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-white" aria-label="کاهش عرض پنل ۲۴ پیکسل">-24px</button>
              <button type="button" data-testid="rt-fe-page-resize-plus" onClick={() => setPanelWidth((w) => w + 24)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-white" aria-label="افزایش عرض پنل ۲۴ پیکسل">+24px</button>
            </div>
            <div data-testid="rt-fe-page-responsive-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] text-slate-200 space-y-1">
              <div>الگوی نمایش: <code className="text-emerald-300 font-bold" dir="ltr">{responsiveOut.presentation} ({responsiveOut.effectiveWidthPx}px)</code></div>
              <div>توضیح: <span className="text-cyan-300">{responsiveOut.noteFa}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300">سیاست نسخه‌بندی و بازیابی تنظیمات Layout (§۱۵.۲۳.۵)</h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="rt-fe-page-ver-valid" onClick={() => setSavedVersion(3)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${savedVersion === 3 ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>تنظیمات هم‌نسخه (v3)</button>
              <button type="button" data-testid="rt-fe-page-ver-stale" onClick={() => setSavedVersion(1)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${savedVersion === 1 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>تنظیمات منقضی (v1)</button>
            </div>
            <div data-testid="rt-fe-page-persistence-verdict" className={`rounded p-2.5 text-[11px] font-bold ${persistenceOut.status === 'RESTORED' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-amber-950/60 text-amber-200'}`}>
              <span className="font-mono ml-1.5" dir="ltr">[{persistenceOut.status}]</span>{persistenceOut.reasonFa}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phases_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1">
            <h5 className="font-bold text-cyan-300">نقشه اجرای ۱۰فازی (§۱۵.۳۷)</h5>
            {RT_PAGE_EXECUTION_PHASES_10.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: </strong><span className="text-slate-200">{ph.titleFa}</span> <span className="font-mono text-indigo-300" dir="ltr">({ph.outputId})</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۱۶: <code className="font-mono" dir="ltr">{RT_FE_STAGE16_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۳ خروجی نهایی مرحله پانزدهم (RT-FE-PAGE-OUT-001 تا RT-FE-PAGE-OUT-033)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_PAGE_DELIVERABLES_33.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

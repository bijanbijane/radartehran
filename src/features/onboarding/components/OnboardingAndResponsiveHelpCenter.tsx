/** @file src/features/onboarding/components/OnboardingAndResponsiveHelpCenter.tsx — Stages 32–35 Onboarding, Responsive, Accessibility & Motion Center */
import React, { useState } from 'react';
import { CheckCircle2, Compass, Layers, RotateCcw, Smartphone } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import {
  DEFAULT_GETTING_STARTED_CHECKLIST,
  ONBOARDING_GUIDE_REGISTRY,
  OnboardingProgressManager,
  SERVICES_PROVIDER_ONBOARDING_STEPS_FA,
  SERVICES_SEEKER_ONBOARDING_STEPS_FA,
  VALUATION_DISCLAIMER_FA,
  buildContextualAuthPrompt,
  resolveMapNavigationGestureHint,
  resolveZoomLockedLayerFeedback,
} from '../services/onboardingGuidanceEngine';
import {
  CrossDeviceStateContinuityEngine,
  GIS_ACCORDION_LAYER_GROUPS,
  RESPONSIVE_VIEWPORT_TIERS,
  classifyViewportTier,
  evaluateAdminMobileOperationSafety,
  resolveBottomSheetGeometry,
} from '../services/responsiveLayoutEngine';
import { WCAG_22_TARGET_STANDARD, WCAG_TEXT_SPACING_CONTRACT } from '../services/accessibilityEngine';
import type { BottomSheetSnapState } from '../types/onboardingAndResponsive.types';
import { OnboardingStageSwitch } from './OnboardingStageSwitch';
import type { OnboardingHelpStageTabId } from '../types/onboardingStageTabs';

const CONSUMER_GUIDE_TABS: ReadonlyArray<{
  id: OnboardingHelpStageTabId;
  testId: string;
  labelFa: string;
}> = [
  { id: 'stage32', testId: 'switch-stage-32-tab', labelFa: 'شروع سریع و چک‌لیست' },
  { id: 'stage33', testId: 'switch-stage-33-tab', labelFa: 'تجربه موبایل و نمایشگرها' },
  { id: 'stage34', testId: 'switch-stage-34-tab', labelFa: 'دسترس‌پذیری و صفحه‌کلید' },
  { id: 'stage35', testId: 'switch-stage-35-tab', labelFa: 'تنظیمات حرکت و کاهش انیمیشن' },
];

export interface OnboardingAndResponsiveHelpCenterProps {
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const OnboardingAndResponsiveHelpCenter: React.FC<OnboardingAndResponsiveHelpCenterProps> = ({
  evaluatedNeighborhoods = [],
  onNavigateView,
}) => {
  const [stageTab, setStageTab] = useState<OnboardingHelpStageTabId>('stage32');
  const [manager] = useState(() => new OnboardingProgressManager());
  const [checklist, setChecklist] = useState(() => DEFAULT_GETTING_STARTED_CHECKLIST.map((x) => ({ ...x })));
  const [guideStatusTick, setGuideStatusTick] = useState(0);
  const [deviceTouch, setDeviceTouch] = useState(false);
  const [serviceRole, setServiceRole] = useState<'seeker' | 'provider'>('seeker');
  const [viewportWidthPx, setViewportWidthPx] = useState(390);
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnapState>('half');
  const [expandedGisGroup, setExpandedGisGroup] = useState<string>('base_map');
  const [continuityEngine] = useState(
    () =>
      new CrossDeviceStateContinuityEngine({
        searchQuery: 'سعادت‌آباد',
        appliedFilters: { minSqm: 85, maxBudgetM: 14500 },
        selectedNeighborhoodId: 'saadat-abad',
        mapCenter: [35.7796, 51.3753],
        mapZoom: 13,
        activePanelOwner: 'results',
        formDraftValues: { areaSqm: '95', rooms: '2' },
      }),
  );
  const [wcagTextSpacing, setWcagTextSpacing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [liveStatusMsg, setLiveStatusMsg] = useState('آماده دریافت راهنمای گام‌به‌گام، میان‌برهای صفحه‌کلید و تنظیمات دسترس‌پذیری.');

  void guideStatusTick;
  const completedCount = checklist.filter((c) => c.completed).length;
  const gestureHint = resolveMapNavigationGestureHint(deviceTouch);
  const zoomLockInfo = resolveZoomLockedLayerFeedback('واحدهای مسکونی پلاک‌به‌پلاک', 11, 14);
  const authPrompt = buildContextualAuthPrompt('save_property', '/properties/tehran-104', { hood: 'سعادت‌آباد' });
  const tierContract = classifyViewportTier(viewportWidthPx);
  const sheetGeometry = resolveBottomSheetGeometry(sheetSnap, 844, 0);
  const continuityAfterResize = continuityEngine.resizeOrRotateViewport(viewportWidthPx, 844);
  const adminSafety = evaluateAdminMobileOperationSafety('gis_layer_schema_publish', viewportWidthPx);

  const toggleChecklistItem = (id: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
  };

  return (
    <section
      data-testid="onboarding-responsive-accessibility-center"
      aria-label="مرکز راهنمای تعاملی و دسترس‌پذیری رادار تهران"
      style={
        wcagTextSpacing
          ? {
              lineHeight: WCAG_TEXT_SPACING_CONTRACT.lineHeightMultiplierMin,
              letterSpacing: `${WCAG_TEXT_SPACING_CONTRACT.letterSpacingEmMin}em`,
              wordSpacing: `${WCAG_TEXT_SPACING_CONTRACT.wordSpacingEmMin}em`,
            }
          : undefined
      }
      className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 sm:p-6 space-y-5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <div>
          <span className="text-xs font-bold text-[var(--color-brand-fg)] block">
            راهنمای گام‌به‌گام، دسترس‌پذیری و تجربه چنددستگاهی
          </span>
          <h2 className="text-lg font-black text-[var(--color-text-primary)]">
            شروع کار با رادار تهران و امکانات کاربردی
          </h2>
        </div>
        <div role="tablist" aria-label="بخش‌های راهنمای کاربر" className="flex flex-wrap gap-1.5">
          {CONSUMER_GUIDE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={stageTab === t.id}
              data-testid={t.testId}
              onClick={() => setStageTab(t.id)}
              className={`min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[8px] font-bold cursor-pointer transition ${
                stageTab === t.id
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t.labelFa}
            </button>
          ))}
        </div>
      </div>

      <div role="status" aria-live="polite" data-testid="a11y-live-region" className="px-3 py-2 rounded-[8px] bg-[var(--color-brand-soft)]/70 border border-[var(--color-border-subtle)] text-[var(--color-brand-fg)] flex flex-wrap items-center justify-between gap-2">
        <span>اعلان وضعیت: <strong>{liveStatusMsg}</strong></span>
        <span className="tabular-nums font-bold">استاندارد دسترس‌پذیری: WCAG {WCAG_22_TARGET_STANDARD.wcagVersion} سطح {WCAG_22_TARGET_STANDARD.targetLevel}</span>
      </div>

      {stageTab === 'stage32' && (
        <div className="space-y-4" data-testid="stage-32-onboarding-panel">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-brand-600)]" />
                  <span>چک‌لیست شروع کار رادار (پیشرفت: {toPersianNum(completedCount)}/{toPersianNum(checklist.length)})</span>
                </h3>
                <span className="text-xs text-[#586760]">کاملاً اختیاری و غیرمسدودکننده</span>
              </div>
              <ul className="space-y-2">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800/70">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-[#182522] dark:text-slate-100">
                      <input type="checkbox" checked={item.completed} onChange={() => { toggleChecklistItem(item.id); setLiveStatusMsg(`گام «${item.titleFa}» به‌روزرسانی شد.`); }} className="accent-[var(--color-brand-600)] w-4 h-4" />
                      <span>{item.titleFa} — <span className="font-normal text-[#586760]">{item.descriptionFa}</span></span>
                    </label>
                    {onNavigateView && (
                      <button type="button" onClick={() => onNavigateView(item.actionRoute === '/market' ? 'intelligence' : item.actionRoute === '/properties' ? 'properties' : 'map')} className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 font-bold whitespace-nowrap cursor-pointer">اجرا ←</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[var(--color-brand-600)]" />
                  <span>راهنمای تطبیقی نقشه و لایه‌های وابسته به زوم</span>
                </h3>
                <button type="button" data-testid="toggle-gesture-device-btn" onClick={() => setDeviceTouch((v) => !v)} className="px-2.5 py-1 rounded-[6px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
                  {deviceTouch ? 'حالت لمسی (موبایل)' : 'حالت ماوس (دسکتاپ)'}
                </button>
              </div>
              <p className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 text-[#182522] dark:text-slate-200 font-semibold">{gestureHint.panHintFa} · {gestureHint.zoomHintFa}</p>
              <p className="p-2.5 rounded-[8px] bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">{zoomLockInfo.messageFa}</p>
              <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 space-y-1">
                <div className="font-bold text-[#182522] dark:text-white">تداوم اقدام پس از ورود (Post-Auth Action Continuation):</div>
                <p className="text-[#586760]">{authPrompt.messageFa}</p>
                <div className="text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400">
                  مسیر بازگشت خودکار پس از ورود: <span dir="ltr">{authPrompt.pendingContinuation.returnRoute}</span> · سلب مسئولیت ارزش‌گذاری: {VALUATION_DISCLAIMER_FA}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
              <h3 className="text-sm font-black text-[#182522] dark:text-white">ثبت نسخه‌دار راهنماها (تفکیک «رد شده» از «تکمیل‌شده» + اجرای مجدد)</h3>
              {ONBOARDING_GUIDE_REGISTRY.slice(0, 4).map((g) => {
                const st = manager.getGuideStatus(g.guideId);
                return (
                  <div key={g.guideId} className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#182522] dark:text-white">{g.titleFa} ({g.version})</div>
                      <div className="text-xs text-[#586760]">وضعیت فعلی: <strong>{st}</strong> · حداکثر راهنمای شناور هم‌زمان: ۱</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => { manager.completeGuide(g.guideId); setGuideStatusTick((t) => t + 1); setLiveStatusMsg(`راهنمای ${g.titleFa} تکمیل شد.`); }} className="px-2 py-1 rounded bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">تکمیل</button>
                      <button type="button" onClick={() => { manager.skipGuide(g.guideId); setGuideStatusTick((t) => t + 1); setLiveStatusMsg(`راهنمای ${g.titleFa} رد شد (Skipped !== Completed).`); }} className="px-2 py-1 rounded border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 font-bold cursor-pointer">رد کردن</button>
                      <button type="button" onClick={() => { manager.replayGuideFromHelpCenter(g.guideId); setGuideStatusTick((t) => t + 1); setLiveStatusMsg(`اجرای مجدد راهنمای ${g.titleFa} آغاز شد.`); }} className="px-2 py-1 rounded border border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-400 font-bold inline-flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3 h-3" />بازپخش</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-[#182522] dark:text-white">تفکیک مسیر ورود بازارچه خدمات (متقاضی در برابر ارائه‌دهنده)</h3>
                <div className="inline-flex rounded-[6px] border border-[#DCE3DF] dark:border-slate-700 p-0.5">
                  <button type="button" onClick={() => setServiceRole('seeker')} className={`px-2.5 py-1 rounded font-bold cursor-pointer ${serviceRole === 'seeker' ? 'bg-[var(--color-brand-600)] text-white' : ''}`}>متقاضی خدمت (۷ گام)</button>
                  <button type="button" onClick={() => setServiceRole('provider')} className={`px-2.5 py-1 rounded font-bold cursor-pointer ${serviceRole === 'provider' ? 'bg-[var(--color-brand-600)] text-white' : ''}`}>ارائه‌دهنده (۶ گام)</button>
                </div>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#34433E] dark:text-slate-200 font-medium">
                {(serviceRole === 'seeker' ? SERVICES_SEEKER_ONBOARDING_STEPS_FA : SERVICES_PROVIDER_ONBOARDING_STEPS_FA).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {stageTab === 'stage33' && (
        <div className="space-y-4" data-testid="stage-33-responsive-panel">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[var(--color-brand-600)]" />
                <span>شبیه‌ساز ۵ رده نمایشگر و حفظ وضعیت در تغییر ابعاد (Stage 33)</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {[320, 390, 768, 1024, 1440].map((w) => (
                  <button key={w} type="button" data-testid={`viewport-btn-${w}`} onClick={() => { setViewportWidthPx(w); setLiveStatusMsg(`عرض نمایشگر به ${toPersianNum(w)} پیکسل تغییر یافت؛ فیلترها و موقعیت نقشه بدون تغییر حفظ شدند.`); }} className={`px-3 py-1.5 rounded-[8px] font-bold tabular-nums cursor-pointer ${viewportWidthPx === w ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[#F6F8F6] dark:bg-slate-800 text-[#34433E] dark:text-slate-200'}`}>{toPersianNum(w)}px</button>
                ))}
              </div>
              <div className="p-3 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 space-y-1 tabular-nums">
                <div className="font-bold text-[#182522] dark:text-white">رده فعال: {tierContract.labelFa}</div>
                <div>الگوی ناوبری: <strong>{tierContract.navigationPattern}</strong> · الگوی نقشه: <strong>{tierContract.mapLayoutPattern}</strong></div>
                <div>حداقل هدف لمسی: <strong>{toPersianNum(tierContract.minTouchTargetPx)}×{toPersianNum(tierContract.minTouchTargetPx)} پیکسل</strong> · حفظ کوئری پس از چرخش صفحه: <strong>«{continuityAfterResize.preservedState.searchQuery}» (بدون ریست)</strong></div>
                <div className="text-amber-800 dark:text-amber-300 font-bold">ایمنی پنل مدیریت در این عرض: {adminSafety.messageFa}</div>
              </div>
            </div>

            <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[var(--color-brand-600)]" />
                <span>قرارداد Bottom Sheet سه‌حالته موبایل و تفکیک ژست لمسی نقشه</span>
              </h3>
              <div className="flex gap-2">
                {(['collapsed', 'half', 'expanded'] as const).map((snap) => (
                  <button key={snap} type="button" data-testid={`sheet-snap-${snap}`} onClick={() => setSheetSnap(snap)} className={`px-3 py-1.5 rounded-[8px] font-bold cursor-pointer ${sheetSnap === snap ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[#F6F8F6] dark:bg-slate-800 text-[#34433E] dark:text-slate-200'}`}>
                    {snap === 'collapsed' ? 'جمع‌شده (72–120px)' : snap === 'half' ? 'میانی (40–55%)' : 'باز کامل (80–90%)'}
                  </button>
                ))}
              </div>
              <div className="p-3 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 space-y-1 tabular-nums">
                <div>بازه ارتفاع شیت: <strong>{toPersianNum(sheetGeometry.minHeightPx)} تا {toPersianNum(sheetGeometry.maxHeightPx)} پیکسل</strong></div>
                <div>قفل اسکرول داخلی در حالت جمع: <strong>{sheetGeometry.innerScrollLocked ? 'فعال (جلوگیری از تداخل با نقشه)' : 'آزاد برای پیمایش نتایج'}</strong></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GIS_ACCORDION_LAYER_GROUPS.map((grp) => (
                  <button key={grp.groupId} type="button" aria-expanded={expandedGisGroup === grp.groupId} onClick={() => setExpandedGisGroup(grp.groupId)} className={`px-2.5 py-1 rounded border text-xs font-bold cursor-pointer ${expandedGisGroup === grp.groupId ? 'border-[var(--color-brand-600)] bg-[#EAF3F0] dark:bg-emerald-950/50 text-[var(--color-brand-700)] dark:text-emerald-200' : 'border-[#DCE3DF] dark:border-slate-700'}`}>
                    {grp.titleFa} ({toPersianNum(grp.layerIds.length)})
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs text-[#586760]">پشتیبانی از {toPersianNum(RESPONSIVE_VIEWPORT_TIERS.length)} رده شکست استاندارد (از ۳۲۰ تا ۱۹۲۰ پیکسل) با سقف ۱۵٪ ارتفاع عناصر چسبان در موبایل.</div>
        </div>
      )}

      <OnboardingStageSwitch
        stageTab={stageTab}
        evaluatedNeighborhoods={evaluatedNeighborhoods}
        wcagTextSpacing={wcagTextSpacing}
        onToggleWcagTextSpacing={() => setWcagTextSpacing((v) => !v)}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={() => setReducedMotion((v) => !v)}
        onAnnounceStatus={setLiveStatusMsg}
      />
    </section>
  );
};

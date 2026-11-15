import React, { useMemo, useState } from 'react';
import { Compass, Link2, Search, Terminal } from 'lucide-react';
import {
  RT_FE_NAVIGATION_WORKSPACE_014_SPEC_ID, RT_FE_STAGE15_BRIDGE_SPEC_ID,
  RT_NAV_SUBSYSTEMS_7, RT_NAV_GLOBAL_GROUPS_10, RT_NAV_WORKSPACES_7,
  RT_NAV_REGISTRY_SAMPLE, RT_NAV_FAILURE_STATES_10, RT_NAV_MIGRATION_PHASES_7,
  RT_NAV_DELIVERABLES_33,
  resolveDeepLinkDestination, buildValidatedBreadcrumbs,
  searchDiscoveryAndEntities, transferWorkspaceContext,
} from '../services/rtFeNavigation014Engine';

type NavTabId = 'subsystems_workspaces' | 'discovery_commands' | 'deeplink_context' | 'migration_deliverables';

export const RtFeNavigation014Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTabId>('subsystems_workspaces');
  const [searchQuery, setSearchQuery] = useState<string>('سعادت');
  const [deepLinkInput, setDeepLinkInput] = useState<string>('/neighborhoods/saadat-abad');
  const [hasAdminRole, setHasAdminRole] = useState<boolean>(false);
  const [targetWorkspace, setTargetWorkspace] = useState<string>('research');

  const searchOut = useMemo(
    () => searchDiscoveryAndEntities(searchQuery, hasAdminRole ? ['admin.access'] : []),
    [searchQuery, hasAdminRole],
  );
  const deepLinkOut = useMemo(
    () => resolveDeepLinkDestination({ rawUrl: deepLinkInput, isAuthenticated: true, userPermissions: hasAdminRole ? ['admin.access'] : [] }),
    [deepLinkInput, hasAdminRole],
  );
  const transferOut = useMemo(
    () =>
      transferWorkspaceContext(
        { workspaceId: 'market', cityId: 'tehran', neighborhoodId: 'saadat-abad', propertyType: 'apartment', marketType: 'sale', contextVersion: 2 },
        targetWorkspace,
        'PR-1024',
      ),
    [targetWorkspace],
  );
  const breadcrumbs = useMemo(
    () =>
      buildValidatedBreadcrumbs({
        entityTitleFa: 'سعادت‌آباد',
        sectionLabelFa: 'محله‌ها',
        currentPageLabelFa: 'روند قیمت مسکن',
        sectionHref: '/neighborhoods',
      }),
    [],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-nav-014-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_NAVIGATION_WORKSPACE_014_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۷ زیرسامانه · ۷ فضای کاری · Command Palette · ۳۳ خروجی RT-NAV-OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله چهاردهم: نظام ناوبری، کشف قابلیت‌ها و مدیریت فضای کاری فرانت‌اند
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Ctrl+K Discovery + Safe Deep Link
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'subsystems_workspaces', label: '۱. ۷ زیرسامانه، ۱۰ گروه منو و ۷ فضای کاری' },
            { id: 'discovery_commands', label: '۲. کشف قابلیت vs جست‌وجو و Command Palette' },
            { id: 'deeplink_context', label: '۳. Deep Link، انتقال Context، Breadcrumb و ۱۰ خطا' },
            { id: 'migration_deliverables', label: '۴. مهاجرت ۷فازی و ۳۳ خروجی RT-NAV-OUT' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as NavTabId)} data-testid={`rt-fe-nav-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'subsystems_workspaces' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Compass className="w-4 h-4" /> ۷ زیرسامانه کلان ناوبری (§۱۴.۴) و Navigation Registry</h5>
            {RT_NAV_SUBSYSTEMS_7.map((sub) => (
              <div key={sub.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px] leading-relaxed">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{sub.nameEn}</span>
                <span className="text-slate-200">{sub.roleFa}</span>
              </div>
            ))}
            <div className="pt-1 space-y-1">
              {RT_NAV_REGISTRY_SAMPLE.map((item) => (
                <div key={item.id} className="flex justify-between rounded bg-slate-950 px-2 py-1 text-[10px]">
                  <span className="text-white font-bold">{item.label}</span>
                  <span className="font-mono text-emerald-300" dir="ltr">{item.featureId} · {item.href} ({item.status})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-cyan-300">۷ فضای کاری منطقی (§۱۴.۸) و ۱۰ گروه منوی سراسری (§۱۴.۵)</h5>
            {RT_NAV_WORKSPACES_7.map((ws) => (
              <div key={ws.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <div>
                  <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-indigo-300 ml-1.5" dir="ltr">{ws.nameEn}</span>
                  <span className="text-slate-300">{ws.audienceFa} — {ws.goalFa}</span>
                </div>
                <span className="font-mono text-[10px] text-teal-300" dir="ltr">{ws.defaultRoute}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_NAV_GLOBAL_GROUPS_10.map((grp) => (
                <span key={grp.id} className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200">{grp.labelFa} (T{grp.priorityTier})</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'discovery_commands' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><Search className="w-4 h-4" /> تفکیک کشف قابلیت از جست‌وجوی موجودیت با نرمال‌سازی فارسی (§۱۴.۱۴)</h5>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                aria-label="عبارت جست‌وجوی سراسری"
                data-testid="rt-fe-nav-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[160px] rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              />
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input type="checkbox" data-testid="rt-fe-nav-admin-toggle" checked={hasAdminRole} onChange={(e) => setHasAdminRole(e.target.checked)} />
                دارای مجوز مدیریت
              </label>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-indigo-300">قابلیت‌ها و صفحات (Feature Discovery — {searchOut.features.length}):</div>
              {searchOut.features.map((f) => <div key={f.id} className="rounded bg-slate-950/70 px-2 py-1 text-[11px] text-white">{f.title} <span className="font-mono text-cyan-300" dir="ltr">({f.href})</span></div>)}
              <div className="text-[11px] font-bold text-emerald-300 pt-1">موجودیت‌ها، محله‌ها و گزارش‌ها ({searchOut.entitiesAndReports.length}):</div>
              {searchOut.entitiesAndReports.map((e) => <div key={e.id} className="rounded bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200">{e.title} <span className="font-mono text-teal-300" dir="ltr">[{e.type}]</span></div>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><Terminal className="w-4 h-4" /> پالت فرمان‌ها / Command Palette (Ctrl+K / ⌘+K — §۱۴.۱۳)</h5>
            <div className="space-y-1.5" data-testid="rt-fe-nav-command-list">
              {searchOut.commands.map((cmd) => (
                <div key={cmd.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                  <span className="font-bold text-white">{cmd.label}</span>
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-amber-300" dir="ltr">{cmd.category}</span>
                </div>
              ))}
              {searchOut.commands.length === 0 && <div className="rounded bg-slate-950 p-2 text-[11px] text-slate-400">فرمانی متناسب با عبارت یا سطح دسترسی یافت نشد.</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deeplink_context' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> اعتبارسنج Deep Link و انتقال Context (§۱۴.۱۱ / §۱۴.۱۵)</h5>
            <select aria-label="نمونه لینک عمیق" data-testid="rt-fe-nav-deeplink-select" value={deepLinkInput} onChange={(e) => setDeepLinkInput(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] text-white" dir="ltr">
              <option value="/neighborhoods/saadat-abad">/neighborhoods/saadat-abad</option>
              <option value="/admin/audit">/admin/audit (RBAC Check)</option>
              <option value="//evil.example/phish">//evil.example/phish (Open Redirect)</option>
              <option value="/market?token=jwt123">/market?token=jwt123 (Secret in URL)</option>
              <option value="/unknown-page">/unknown-page (404 vs 403)</option>
            </select>
            <div data-testid="rt-fe-nav-deeplink-verdict" className={`rounded p-2 text-[11px] font-bold ${deepLinkOut.status === 'VALID' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              <span className="font-mono ml-1.5" dir="ltr">[{deepLinkOut.status}]</span>{deepLinkOut.reasonFa}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-slate-300">انتقال از بازار به فضای کاری:</span>
              <select aria-label="فضای کاری مقصد" value={targetWorkspace} onChange={(e) => setTargetWorkspace(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white">
                <option value="research">پژوهش (Research)</option>
                <option value="property">املاک (Property)</option>
              </select>
            </div>
            <div className="rounded bg-slate-950 p-2 text-[10px] text-slate-300 space-y-1">
              <div>حفظ‌شده: <code className="text-emerald-300" dir="ltr">{transferOut.preservedFields.join(', ')}</code></div>
              <div>بازنشانی‌شده: <span className="text-amber-300">{transferOut.resetFields.join('، ')}</span></div>
              <div>Breadcrumb تأییدشده: <span className="text-cyan-300">{breadcrumbs.map((b) => b.label).join(' / ')}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-indigo-300">۱۰ وضعیت شکست ناوبری و بازیابی کنترل‌شده (§۱۴.۲۴)</h5>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {RT_NAV_FAILURE_STATES_10.map((fs) => (
                <div key={fs.condition} className="rounded bg-slate-950/70 px-2 py-1.5 text-[10px]">
                  <strong className="text-cyan-300">{fs.condition}: </strong>
                  <span className="text-slate-300">{fs.behaviorFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'migration_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">برنامه مهاجرت ۷فازی ناوبری (§۱۴.۳۶)</h5>
            {RT_NAV_MIGRATION_PHASES_7.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: {ph.titleFa}</strong> — <span className="text-slate-300">{ph.detailFa}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۱۵: <code className="font-mono" dir="ltr">{RT_FE_STAGE15_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۳ خروجی الزامی مرحله چهاردهم (RT-NAV-OUT-001 تا RT-NAV-OUT-033)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_NAV_DELIVERABLES_33.map((del) => (
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

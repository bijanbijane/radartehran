/** @file src/features/services/components/ServicesDirectoryPanel.tsx — Tools Shortcuts, Disclosure, Category Filters & Provider Grid */
import React from 'react';
import { Calculator, Hammer, Info, Scale, Search, ShieldAlert } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { ExpansionModalType } from '../../../components/ExpansionModulesModal';
import type { SuperModuleTabId } from '../../../components/FutureSuperModulesModal';
import { IDENTITY_NOT_CREDENTIAL_NOTE_FA } from '../services/servicesDirectoryService';
import { trackServiceEvent } from '../services/serviceWorkflowService';
import {
  CANONICAL_CATEGORY_LABELS_FA,
  type ServiceCanonicalCategory,
  type ServiceFilterState,
  type ServiceProviderEntity,
  type ServiceSortMode,
} from '../types/service.types';
import { ServiceProviderCard } from './ServiceProviderCard';

export interface ServicesDirectoryPanelProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  visibleProviders: ServiceProviderEntity[];
  filters: ServiceFilterState;
  setFilters: React.Dispatch<React.SetStateAction<ServiceFilterState>>;
  onOpenHedonic: () => void;
  onOpenListingVerifier: () => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenSuperModule: (t: SuperModuleTabId) => void;
  onOpenDetail: (p: ServiceProviderEntity) => void;
  onRequestQuote: (p: ServiceProviderEntity) => void;
  onSwitchToWizard: () => void;
}

export const ServicesDirectoryPanel: React.FC<ServicesDirectoryPanelProps> = ({
  evaluatedNeighborhoods,
  visibleProviders,
  filters,
  setFilters,
  onOpenHedonic,
  onOpenListingVerifier,
  onOpenExpansionModal,
  onOpenSuperModule,
  onOpenDetail,
  onRequestQuote,
  onSwitchToWizard,
}) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
      <button type="button" onClick={onOpenHedonic} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1.5 cursor-pointer transition">
        <Calculator className="w-5 h-5 text-[#176B63]" />
        <div className="font-black text-[#182522] dark:text-white">کارشناسی قیمت هدونیک</div>
        <p className="text-[11px] text-[#586760]">برآورد قیمت عادلانه و فروش فوری</p>
      </button>
      <button type="button" onClick={onOpenListingVerifier} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1.5 cursor-pointer transition">
        <ShieldAlert className="w-5 h-5 text-[#B3261E]" />
        <div className="font-black text-[#182522] dark:text-white">آنتی‌ویروس حباب آگهی</div>
        <p className="text-[11px] text-[#586760]">تشخیص آگهی طعمه یا قیمت غیرواقعی</p>
      </button>
      <button type="button" onClick={() => onOpenExpansionModal('contract')} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1.5 cursor-pointer transition">
        <Scale className="w-5 h-5 text-indigo-600" />
        <div className="font-black text-[#182522] dark:text-white">سپر حقوقی اتاق قرارداد</div>
        <p className="text-[11px] text-[#586760]">بندهای فسخ، چک صیادی و کمیسیون</p>
      </button>
      <button type="button" onClick={() => onOpenSuperModule('municipality')} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63] text-start space-y-1.5 cursor-pointer transition">
        <Hammer className="w-5 h-5 text-[#875000]" />
        <div className="font-black text-[#182522] dark:text-white">ضوابط R122 و بازدید</div>
        <p className="text-[11px] text-[#586760]">تراکم مجاز و چک‌لیست فنی بازدید</p>
      </button>
    </div>

    <div className="p-3.5 rounded-[12px] bg-[#FFF4E5]/70 dark:bg-amber-950/20 border border-[#F4D3A1] dark:border-amber-800 text-[11px] text-[#875000] dark:text-amber-200 flex items-start gap-2">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="leading-relaxed">
        {IDENTITY_NOT_CREDENTIAL_NOTE_FA} رتبه‌بندی پیش‌فرض بر اساس ارتباط با محله و پوشش است و موارد تبلیغاتی با برچسب مجزای «نمایش تبلیغاتی» متمایز می‌شوند.
      </p>
    </div>

    <div className="p-3.5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(CANONICAL_CATEGORY_LABELS_FA) as Array<ServiceCanonicalCategory | 'all'>).map((cat) => (
          <button
            key={cat}
            type="button"
            data-testid={`service-cat-${cat}`}
            onClick={() => {
              trackServiceEvent('service_category_selected', { category: cat });
              setFilters((prev) => ({ ...prev, canonicalCategory: cat, category: 'all' }));
            }}
            className={`px-2.5 py-1.5 rounded-[8px] font-bold cursor-pointer transition whitespace-nowrap ${
              (filters.canonicalCategory || 'all') === cat
                ? 'bg-[#176B63] text-white'
                : 'bg-[#F8F9FA] dark:bg-slate-800 text-[#48534F] dark:text-slate-300'
            }`}
          >
            {CANONICAL_CATEGORY_LABELS_FA[cat]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-[#586760] absolute right-2.5 top-2.5" />
          <input
            type="text"
            data-testid="service-search-input"
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="جست‌وجو بر اساس نام دفتر، محله یا تخصص..."
            className="w-full pr-8 pl-3 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700"
          />
        </div>
        <select
          aria-label="فیلتر محله"
          value={filters.hoodId}
          onChange={(e) => setFilters((prev) => ({ ...prev, hoodId: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
          className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
        >
          <option value="all">همه محله‌ها</option>
          {evaluatedNeighborhoods.map((h) => (
            <option key={h.id} value={h.id}>محله {h.name}</option>
          ))}
        </select>
        <select
          aria-label="مرتب‌سازی"
          value={filters.sortMode || 'recommended'}
          onChange={(e) => setFilters((prev) => ({ ...prev, sortMode: e.target.value as ServiceSortMode }))}
          className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
        >
          <option value="recommended">مرتب‌سازی: منطبق با محله و ارگانیک</option>
          <option value="verified_first">بیشترین مسیر تأیید هویت/صلاحیت</option>
          <option value="experienced">بیشترین سابقه اظهارشده</option>
        </select>
        <label className="flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 font-bold cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hideSponsored}
            onChange={(e) => setFilters((prev) => ({ ...prev, hideSponsored: e.target.checked }))}
            className="accent-[#176B63]"
          />
          <span>مخفی کردن تبلیغات</span>
        </label>
      </div>
    </div>

    {visibleProviders.length === 0 ? (
      <div className="p-8 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-2 text-xs">
        <p className="font-bold text-[#182522] dark:text-white">ارائه‌دهنده‌ای با فیلتر انتخاب‌شده در این رسته ثبت نشده است.</p>
        <p className="text-[#586760]">می‌توانید درخواست خود را از فرم ۷ مرحله‌ای ثبت کنید یا فیلترها را بازنشانی نمایید.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setFilters({ category: 'all', canonicalCategory: 'all', searchQuery: '', hoodId: 'all', onlyWithDeclaredPhone: false, hideSponsored: false })}
            className="px-3.5 py-1.5 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer"
          >
            نمایش همه ارائه‌دهندگان
          </button>
          <button
            type="button"
            onClick={onSwitchToWizard}
            className="px-3.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 font-bold cursor-pointer"
          >
            ثبت درخواست آزاد در این رسته
          </button>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="service-providers-grid">
        {visibleProviders.slice(0, 18).map((provider) => (
          <ServiceProviderCard
            key={provider.identity.id}
            provider={provider}
            onOpenDetail={onOpenDetail}
            onRequestQuote={onRequestQuote}
          />
        ))}
      </div>
    )}
  </>
);

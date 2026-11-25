/** @file src/components/layout/ProductQuietFooter.tsx — Shared Site-Wide Quiet Footer (F-19) */
import React from 'react';
import { Map as MapIcon } from 'lucide-react';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import { useRadarLocale } from '../AreaUnitToggle';
import { RadarLink } from '../ui/RadarPrimitives';

export interface ProductQuietFooterProps {
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenLegal?: () => void;
  onOpenSeoDirectory?: () => void;
}

const FOOTER_LINK_CLS =
  'inline-flex items-center min-h-[44px] md:min-h-[32px] hover:text-[var(--color-brand-fg)] transition cursor-pointer';

export const ProductQuietFooter: React.FC<ProductQuietFooterProps> = ({
  onNavigateView,
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';

  const navigateLegalPath = (path: '/legal/privacy' | '/legal/terms') => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    onNavigateView('knowledge', path === '/legal/terms' ? 'legal_terms' as ModuleSubTabId : 'legal_privacy' as ModuleSubTabId);
  };

  return (
    <footer
      dir={isEn ? 'ltr' : 'rtl'}
      aria-label={isEn ? 'RadarTehran platform footer' : 'پاورقی سامانه رادارتهران'}
      className="w-full border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] mt-10 pb-20 md:pb-8"
    >
      <div className="w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
              <span className="w-7 h-7 rounded-[8px] bg-[var(--color-brand-600)] text-white inline-flex items-center justify-center">
                <MapIcon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>{isEn ? 'RadarTehran' : 'رادارتهران'}</span>
            </div>
            <p className="text-xs leading-6 text-[var(--color-text-muted)] max-w-sm">
              {isEn
                ? 'Independent spatial real-estate intelligence, neighborhood comparison, and transparent buy & rent estimates across Iranian cities.'
                : 'سامانه مستقل تحلیل مکانی مسکن، مقایسه محله‌ها و برآورد شفاف قیمت خرید و رهن در کلان‌شهرهای ایران.'}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              {isEn ? 'Core Sections' : 'بخش‌های اصلی'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
              <RadarLink href="/map" onNavigate={() => onNavigateView('map')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Interactive Map' : 'نقشه تعاملی'}
              </RadarLink>
              <RadarLink href="/areas" onNavigate={() => onNavigateView('discover')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Neighborhoods' : 'محله‌ها'}
              </RadarLink>
              <RadarLink href="/market" onNavigate={() => onNavigateView('intelligence')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Market Analytics' : 'تحلیل بازار'}
              </RadarLink>
              <RadarLink href="/properties" onNavigate={() => onNavigateView('properties')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Properties' : 'املاک'}
              </RadarLink>
              <RadarLink href="/tools" onNavigate={() => onNavigateView('tools')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Tools' : 'ابزارها'}
              </RadarLink>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              {isEn ? 'Transparency & Legal' : 'شفافیت و منابع'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
              <RadarLink href="/knowledge/methodology" onNavigate={() => onNavigateView('knowledge', 'methodology')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Data Methodology' : 'روش‌شناسی داده'}
              </RadarLink>
              <RadarLink href="/services" onNavigate={() => onNavigateView('services', 'all')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Services' : 'خدمات تخصصی'}
              </RadarLink>
              <RadarLink href="/community" onNavigate={() => onNavigateView('contributions')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Community' : 'جامعه کاربران'}
              </RadarLink>
              <RadarLink href="/areas" onNavigate={() => onNavigateView('discover', 'results')} className={FOOTER_LINK_CLS}>
                {isEn ? 'Neighborhood Index' : 'فهرست محله‌ها'}
              </RadarLink>
              <RadarLink
                href="/legal/privacy"
                data-testid="footer-legal-privacy-link"
                onNavigate={() => navigateLegalPath('/legal/privacy')}
                className={FOOTER_LINK_CLS}
              >
                {isEn ? 'Privacy Policy' : 'حریم خصوصی'}
              </RadarLink>
              <RadarLink
                href="/legal/terms"
                data-testid="footer-legal-terms-link"
                onNavigate={() => navigateLegalPath('/legal/terms')}
                className={FOOTER_LINK_CLS}
              >
                {isEn ? 'Terms of Use' : 'قوانین استفاده'}
              </RadarLink>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
          <span>
            {isEn
              ? 'Displayed figures are analytical market estimates for transparency and do not replace official licensed appraisals.'
              : 'ارقام نمایش‌داده‌شده در سامانه برآورد تحلیلی جهت شفافیت بازار هستند و جایگزین کارشناسی رسمی ثبتی نیستند.'}
          </span>
          <span>{isEn ? '© RadarTehran' : '© رادارتهران'}</span>
        </div>
      </div>
    </footer>
  );
};

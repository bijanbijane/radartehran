/** @file src/features/onboarding/components/Stage43ProMarketplaceSubpanel.tsx — Stage 43 Service Marketplace Hub */
import React, { useState } from 'react';
import {
  INITIAL_STAGE43_PROVIDERS,
  INITIAL_STAGE43_QUOTES,
  INITIAL_STAGE43_REQUEST,
} from '../services/stage43MarketplaceFixtures';
import type { MarketplaceProviderRecord, ServiceQuoteRecord, ServiceRequestItem } from '../services/proMarketplaceEngine';
import { Stage43DiscoveryAndComparePanel } from './Stage43DiscoveryAndComparePanel';
import { Stage43RequestAndQuotesPanel } from './Stage43RequestAndQuotesPanel';

export const Stage43ProMarketplaceSubpanel: React.FC = () => {
  const [subTab, setSubTab] = useState<'discovery' | 'requests'>('discovery');
  const [request, setRequest] = useState<ServiceRequestItem>(INITIAL_STAGE43_REQUEST);
  const [quotes, setQuotes] = useState<ServiceQuoteRecord[]>(INITIAL_STAGE43_QUOTES);
  const [feedbackFa, setFeedbackFa] = useState<string>('');

  const handleStartDirectRequest = (provider: MarketplaceProviderRecord) => {
    setRequest((prev) => ({
      ...prev,
      mode: 'direct',
      targetProviderIds: Array.from(new Set([...prev.targetProviderIds, provider.providerId])),
    }));
    setSubTab('requests');
    setFeedbackFa(`درخواست مستقیم برای «${provider.displayNameFa}» با حفظ اطلاعات ملک (/properties/saadat-118) آماده شد.`);
  };

  return (
    <div className="space-y-4" data-testid="stage43-marketplace-subpanel" dir="rtl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">مرحله ۴۳: بازار خدمات، کشف متخصصان و پیگیری تعامل (RT-UI-PRO-MARKETPLACE-001)</h3>
            <p className="mt-1 text-xs text-slate-400">تفکیک ارائه‌دهنده، خدمت و درخواست؛ جداسازی تبلیغات؛ مقایسه شفاف پیشنهادها با حفظ سوابق اصلاح و حریم خصوصی نشانی</p>
          </div>
          <div className="flex gap-1.5">
            <button type="button" data-testid="prm-tab-discovery" onClick={() => setSubTab('discovery')} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${subTab === 'discovery' ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
              کشف و مقایسه متخصصان
            </button>
            <button type="button" data-testid="prm-tab-requests" onClick={() => setSubTab('requests')} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${subTab === 'requests' ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>
              درخواست، پیشنهادها و حریم خصوصی ({quotes.length})
            </button>
          </div>
        </div>

        {feedbackFa && (
          <div data-testid="stage43-feedback-banner" className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1.5 text-[11px] text-cyan-200">
            {feedbackFa}
          </div>
        )}

        {subTab === 'discovery' ? (
          <Stage43DiscoveryAndComparePanel providers={INITIAL_STAGE43_PROVIDERS} onStartDirectRequest={handleStartDirectRequest} />
        ) : (
          <Stage43RequestAndQuotesPanel
            request={request}
            quotes={quotes}
            onUpdateRequest={setRequest}
            onUpdateQuotes={setQuotes}
            onFeedbackFa={setFeedbackFa}
          />
        )}
      </div>
    </div>
  );
};
export default Stage43ProMarketplaceSubpanel;

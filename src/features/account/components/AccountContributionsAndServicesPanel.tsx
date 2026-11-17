/** @file src/features/account/components/AccountContributionsAndServicesPanel.tsx — My Listings, Service Requests & Account-Synced Knowledge Bookmarks */
import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Archive, BookMarked, Briefcase, Building2, MessageSquarePlus, Trash2 } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { PropertyListingRecord } from '../../properties/types/listing.types';
import type { ServiceProposalRecord, ServiceRequestRecord } from '../../services/types/service.types';
import { getMySavedKnowledge } from '../../knowledge/services/knowledgeApiClient';
import { loadSavedKnowledgeIds } from '../../knowledge/data/knowledgeSourcesAndBriefs';
import { KNOWLEDGE_PUBLICATIONS } from '../../knowledge/data/knowledgeCatalog';
import type { SavedKnowledgeBookmarkItem } from '../../knowledge/types/knowledge.types';
import { loadDataCorrectionProposals } from '../../community/services/communityTrustService';

export interface AccountContributionsAndServicesPanelProps {
  currentUser?: User | null;
  myListings: PropertyListingRecord[];
  serviceRequests: ServiceRequestRecord[];
  serviceProposals: ServiceProposalRecord[];
  onRemoveMyListing: (listingId: string) => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const AccountContributionsAndServicesPanel: React.FC<AccountContributionsAndServicesPanelProps> = ({
  currentUser,
  myListings,
  serviceRequests,
  serviceProposals,
  onRemoveMyListing,
  onNavigateView,
}) => {
  const [savedKnowledgeItems, setSavedKnowledgeItems] = useState<SavedKnowledgeBookmarkItem[]>(() => {
    const scopedIds = loadSavedKnowledgeIds(currentUser?.uid);
    return scopedIds.map((id) => {
      const pub = KNOWLEDGE_PUBLICATIONS.find((p) => p.id === id);
      const st = pub?.status ?? pub?.defaultPublicationStatus ?? 'published';
      return {
        publicationId: id,
        slug: pub?.slug || id,
        titleFa: pub?.titleFa || `گزارش پژوهشی (${id})`,
        version: pub?.version || 'v1.0',
        status: st,
        freshnessStatus: pub?.freshnessStatus || 'current',
        savedAtIso: new Date().toISOString(),
        isArchivedOrRemoved: st === 'archived' || pub?.freshnessStatus === 'archived',
      };
    });
  });

  useEffect(() => {
    if (!currentUser?.uid) {
      setSavedKnowledgeItems([]);
      return;
    }
    const ctrl = new AbortController();
    getMySavedKnowledge(currentUser, ctrl.signal).then((res) => {
      if (!ctrl.signal.aborted && res.ok && res.data) {
        setSavedKnowledgeItems(res.data.items);
      }
    });
    return () => ctrl.abort();
  }, [currentUser]);

  return (
    <div className="space-y-4 text-xs" data-testid="account-listings-and-services">
      {/* My Submitted Property Listings */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>فایل‌های ملکی ثبت‌شده من ({toPersianNum(myListings.length)})</span>
          </h2>
          <button type="button" onClick={() => onNavigateView?.('properties')} className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
            ثبت فایل جدید در بخش املاک
          </button>
        </div>

        {myListings.length === 0 ? (
          <p className="text-slate-500 py-2">هنوز آگهی یا فایلی از این حساب ثبت نکرده‌اید.</p>
        ) : (
          <div className="space-y-2.5">
            {myListings.map((rec) => (
              <div key={rec.listing.listingId} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-black text-slate-900 dark:text-white">{rec.listing.title}</div>
                  <div className="text-[11px] text-slate-500">
                    محله {rec.property.hoodName} · وضعیت: {rec.listing.status === 'pending_review' ? 'در صف بازبینی' : 'منتشرشده'}
                  </div>
                </div>
                <button type="button" onClick={() => onRemoveMyListing(rec.listing.listingId)} aria-label={`حذف ${rec.listing.title}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Service Requests & Received Proposals */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-emerald-600" />
            <span>درخواست‌های خدمات و پیشنهادهای دریافتی ({toPersianNum(serviceRequests.length)})</span>
          </h2>
          <button type="button" onClick={() => onNavigateView?.('services')} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer">
            مدیریت کامل در بازار خدمات
          </button>
        </div>

        {serviceRequests.length === 0 ? (
          <p className="text-slate-500 py-2">هنوز درخواست خدمتی ثبت نشده است.</p>
        ) : (
          <div className="space-y-2.5">
            {serviceRequests.map((req) => {
              const propCount = serviceProposals.filter((p) => p.requestId === req.id).length;
              return (
                <div key={req.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">{req.providerName}</div>
                    <div className="text-[11px] text-slate-500">
                      محله {req.neighborhoodName} · وضعیت: {req.status} · {toPersianNum(propCount)} پیشنهاد
                    </div>
                  </div>
                  <button type="button" onClick={() => onNavigateView?.('services')} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">
                    پیگیری و مقایسه
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Community Price / Quality / Data Contributions */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <MessageSquarePlus className="w-4 h-4 text-emerald-600" />
            <span>مشارکت‌های میدانی و اصلاح داده ({toPersianNum(loadDataCorrectionProposals().length)} مورد)</span>
          </h2>
          <p className="text-slate-500 mt-1">ثبت فایل زیر قیمت، اصلاح نقشه، گفت‌وگوی ساکنان و پیشنهاد موضوع پژوهش.</p>
        </div>
        <button type="button" onClick={() => onNavigateView?.('contributions', 'submit')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold cursor-pointer">
          ورود به بخش مشارکت
        </button>
      </div>

      {/* Stage 85.5: Account-Linked Saved Knowledge Studies with Version & Archived Badges */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3" data-testid="account-saved-knowledge-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <BookMarked className="w-4 h-4 text-emerald-600" />
              <span>گزارش‌های ذخیره‌شده پایگاه دانش ({toPersianNum(savedKnowledgeItems.length)} مطالعه)</span>
            </h2>
            <p className="text-slate-500 mt-1">
              {currentUser?.uid
                ? 'نشان‌شده‌های همگام‌شده با حساب کاربری شما در مرکز دانش رادار.'
                : 'نشان‌شده‌های موقت نشست فعلی (برای ذخیره دائمی وارد حساب کاربری شوید).'}
            </p>
          </div>
          <button type="button" onClick={() => onNavigateView?.('knowledge', 'reports')} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold cursor-pointer">
            مشاهده در پایگاه دانش
          </button>
        </div>

        {savedKnowledgeItems.length > 0 && (
          <div className="space-y-2 pt-1">
            {savedKnowledgeItems.slice(0, 6).map((item) => (
              <div key={item.publicationId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{item.titleFa}</div>
                  <div className="text-[10.5px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>نسخه: {item.version}</span>
                    <span>·</span>
                    <span>وضعیت: {item.status}</span>
                    {item.isArchivedOrRemoved && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                        <Archive className="w-3 h-3" />
                        <span>گزارش آرشیوشده / غیرفعال</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateView?.('knowledge', 'reports')}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  بازخوانی
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

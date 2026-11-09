import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ThumbsUp, ThumbsDown, Award, Send, CheckCircle2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { toPersianNum as toPersianDigits } from '../../data/neighborhoods';

export interface CrowdClaimItem {
  id: string;
  hoodId: number;
  hoodName: string;
  cityKey: string;
  authorId: string;
  authorDisplayName: string;
  category: string;
  claimType: 'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE';
  title: string;
  body: string;
  status: string;
  trustWeightScore: number;
  upvotes: number;
  downvotes: number;
  promotedToReference: boolean;
  createdAtIso: string;
}

export interface ContributorSummary {
  userId: string;
  displayName: string;
  points: number;
  tier: string;
  verifiedClaimsCount: number;
}

interface NeighborhoodCrowdClaimsPanelProps {
  hoodId: number;
  hoodName: string;
  cityKey: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  ALLEY_LIVABILITY: 'کیفیت زیست‌پذیری و جای پارک کوچه',
  PRICE_OBSERVATION: 'گزارش قیمت معامله / شکاف آگهی',
  CONSTRUCTION_QUALITY: 'کیفیت ساخت و تراکم نوسازی',
  INFRASTRUCTURE_POI: 'دسترسی مترو، خدمات و زیرساخت',
  DATA_CORRECTION: 'اصلاح داده مکانی یا مرزبندی محله',
};

const TIER_BADGES: Record<string, { label: string; color: string }> = {
  CHIEF_INSPECTOR: { label: 'بازرس ارشد محله', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800' },
  TRUSTED_SCOUT: { label: 'دیده‌بان معتمد', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800' },
  LOCAL_RESIDENT: { label: 'ساکن تاییدشده', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800' },
  NEWCOMER: { label: 'مشارکت‌کننده جدید', color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
};

function buildSeedClaims(hoodId: number, hoodName: string, cityKey: string) {
  const refClaim: CrowdClaimItem = {
    id: `seed_ref_${hoodId}`, hoodId, hoodName, cityKey, authorId: 'usr_inspector_1',
    authorDisplayName: 'مهندس کاظمی (ساکن محله)', category: 'PRICE_OBSERVATION',
    claimType: 'VERIFIED_FACT_CANDIDATE',
    title: `تخفیف واقعی پای نشست در خیابان‌های اصلی ${hoodName}`,
    body: `بر اساس ۳ مبایعه‌نامه ثبت‌شده اخیر در ${hoodName}، قیمت نهایی معامله حدود ۷ تا ۹ درصد پایین‌تر از قیمت اولیه درج‌شده در آگهی‌ها بسته شده است.`,
    status: 'VERIFIED_REFERENCE', trustWeightScore: 91, upvotes: 14, downvotes: 1, promotedToReference: true, createdAtIso: new Date().toISOString(),
  };
  const commClaim: CrowdClaimItem = {
    id: `seed_comm_${hoodId}`, hoodId, hoodName, cityKey, authorId: 'usr_resident_2',
    authorDisplayName: 'سارا محمدی (ساکن)', category: 'ALLEY_LIVABILITY',
    claimType: 'SUBJECTIVE_EXPERIENCE',
    title: `وضعیت تردد و جای پارک شبانه در کوچه‌های فرعی ${hoodName}`,
    body: `کوچه‌های فرعی شرقی بعد از ساعت ۲۱ ظرفیت پارک مهمان محدودی دارند اما روشنایی و امنیت پیاده‌روی بسیار مطلوب است.`,
    status: 'STAGE_COMMUNITY', trustWeightScore: 82, upvotes: 8, downvotes: 0, promotedToReference: false, createdAtIso: new Date().toISOString(),
  };
  return {
    verified: [refClaim], all: [refClaim, commClaim],
    leaders: [
      { userId: 'usr_inspector_1', displayName: 'مهندس کاظمی', points: 145, tier: 'CHIEF_INSPECTOR', verifiedClaimsCount: 5 },
      { userId: 'usr_resident_2', displayName: 'سارا محمدی', points: 80, tier: 'LOCAL_RESIDENT', verifiedClaimsCount: 2 },
    ],
  };
}

export const NeighborhoodCrowdClaimsPanel: React.FC<NeighborhoodCrowdClaimsPanelProps> = ({ hoodId, hoodName, cityKey }) => {
  const [claims, setClaims] = useState<CrowdClaimItem[]>([]);
  const [verifiedRefs, setVerifiedRefs] = useState<CrowdClaimItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<ContributorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [authorName, setAuthorName] = useState('');
  const [category, setCategory] = useState('ALLEY_LIVABILITY');
  const [claimType, setClaimType] = useState<'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE'>('VERIFIED_FACT_CANDIDATE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    const seed = buildSeedClaims(hoodId, hoodName, cityKey);
    try {
      const res = await fetch(`/api/v1/claims/hood/${hoodId}`);
      if (res.ok) {
        const data = await res.json();
        const mapDoc = (d: Record<string, unknown>): CrowdClaimItem => ({
          id: String(d.claimId || d.id || ''), hoodId, hoodName, cityKey,
          authorId: String(d.authorUid || 'usr_1'), authorDisplayName: String(d.authorDisplayName || 'شهروند رادار'),
          category: String(d.category || 'ALLEY_LIVABILITY'),
          claimType: d.epistemicState === 'VERIFIED_REFERENCE' ? 'VERIFIED_FACT_CANDIDATE' : 'SUBJECTIVE_EXPERIENCE',
          title: String(d.streetNameRaw || `گزارش میدانی ${hoodName}`), body: String(d.narrativeText || ''),
          status: String(d.epistemicState || 'STAGE_COMMUNITY'), trustWeightScore: Number(d.aiPlausibilityScore || 80),
          upvotes: Number(d.upvoteCount || 0), downvotes: Number(d.downvoteCount || 0),
          promotedToReference: d.epistemicState === 'VERIFIED_REFERENCE', createdAtIso: String(d.createdAtIso || new Date().toISOString()),
        });
        const apiVerified = Array.isArray(data.verifiedReferenceClaims) ? data.verifiedReferenceClaims.map(mapDoc) : [];
        const apiCommunity = Array.isArray(data.communityStageClaims) ? data.communityStageClaims.map(mapDoc) : [];
        setVerifiedRefs(apiVerified.length > 0 ? apiVerified : seed.verified);
        setClaims([...apiVerified, ...apiCommunity, ...seed.all]);
        setLeaderboard(seed.leaders);
      } else {
        setVerifiedRefs(seed.verified); setClaims(seed.all); setLeaderboard(seed.leaders);
      }
    } catch {
      setVerifiedRefs(seed.verified); setClaims(seed.all); setLeaderboard(seed.leaders);
    } finally {
      setLoading(false);
    }
  }, [cityKey, hoodId, hoodName]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitMessage(null);
    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoodId, cityId: cityKey, authorUid: `usr_${Date.now().toString(36)}`,
          authorDisplayName: authorName.trim() || 'شهروند رادار', category,
          streetName: title.trim(), narrativeText: body.trim(),
        }),
      });
      if (res.ok) {
        setTitle(''); setBody(''); setShowForm(false);
        setSubmitMessage('گزارش میدانی شما ثبت شد و در صف اعتبارسنجی معرفتی قرار گرفت (+۱۵ امتیاز).');
        await fetchClaims();
      }
    } catch {
      setSubmitMessage('خطا در ارسال گزارش. لطفاً دوباره تلاش کنید.');
    }
  };

  const handleVote = async (claimId: string, vote: 'UP' | 'DOWN') => {
    if (claimId.startsWith('seed_')) {
      setClaims((prev) => prev.map((c) => c.id === claimId ? { ...c, upvotes: vote === 'UP' ? c.upvotes + 1 : c.upvotes, downvotes: vote === 'DOWN' ? c.downvotes + 1 : c.downvotes } : c));
      return;
    }
    try {
      const res = await fetch(`/api/v1/claims/${encodeURIComponent(claimId)}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterUid: `voter_${Math.random().toString(36).slice(2, 8)}`, direction: vote }),
      });
      if (res.ok) await fetchClaims();
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">راستی‌آزمایی جمعی و گزارش‌های میدانی ({hoodName})</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">تفکیک «تاییدیه میدانی قابل راستی‌آزمایی» از «تجربه زیسته ساکنان» با امتیازدهی اعتبارسنجی</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">
          <MessageSquarePlus className="w-4 h-4" />
          <span>{showForm ? 'بستن فرم گزارش' : 'ثبت گزارش میدانی (+۱۵ امتیاز)'}</span>
        </button>
      </div>

      {submitMessage && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /><span>{submitMessage}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">نام نمایشی</label>
              <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="مثلاً: علی (ساکن محله)" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">دسته‌بندی موضوعی</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">نوع داده (تفکیک معرفتی)</label>
              <select value={claimType} onChange={(e) => setClaimType(e.target.value as 'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE')} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                <option value="VERIFIED_FACT_CANDIDATE">مشاهده عینی قابل راستی‌آزمایی (کاندیدای مرجع)</option>
                <option value="SUBJECTIVE_EXPERIENCE">تجربه شخصی و نظر ساکنان</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">عنوان گزارش / نام خیابان</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: وضعیت جای پارک شبانه در خیابان‌های فرعی" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">شرح دقیق و مستند</label>
            <textarea rows={2} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="مشاهده دقیق خود را بنویسید. در صورت تایید سایر ساکنان، به داده مرجع محله تبدیل می‌شود..." className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              <Send className="w-3.5 h-3.5" /><span>ارسال برای داوری جمعی</span>
            </button>
          </div>
        </form>
      )}

      {verifiedRefs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>فکت‌های میدانی ارتقایافته به مرجع رسمی محله ({toPersianDigits(verifiedRefs.length)})</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {verifiedRefs.map((ref) => (
              <div key={ref.id} className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">{ref.title}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">امتیاز اطمینان: {toPersianDigits(ref.trustWeightScore)}٪</span>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-relaxed">{ref.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">همه گزارش‌ها و ادعاهای ثبت‌شده ({toPersianDigits(claims.length)})</div>
        {loading ? (
          <div className="text-xs text-slate-400 py-3">در حال بارگذاری گزارش‌های میدانی...</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {claims.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{c.title}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px]">{CATEGORY_LABELS[c.category] || c.category}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.promotedToReference ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' : c.claimType === 'VERIFIED_FACT_CANDIDATE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'}`}>
                    {c.promotedToReference ? 'داده مرجع تاییدشده' : c.claimType === 'VERIFIED_FACT_CANDIDATE' ? 'ادعای قابل راستی‌آزمایی' : 'تجربه شخصی ساکنان'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{c.body}</p>
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>توسط: {c.authorDisplayName} • وزن اعتبار: {toPersianDigits(c.trustWeightScore)}٪</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleVote(c.id, 'UP')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                      <ThumbsUp className="w-3 h-3" /><span>تایید ({toPersianDigits(c.upvotes)})</span>
                    </button>
                    <button type="button" onClick={() => handleVote(c.id, 'DOWN')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-400">
                      <ThumbsDown className="w-3 h-3" /><span>رد ({toPersianDigits(c.downvotes)})</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {leaderboard.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
            <Award className="w-4 h-4 text-amber-500" /><span>مشارکت‌کنندگان برتر راستی‌آزمایی میدانی</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {leaderboard.slice(0, 3).map((u) => {
              const badge = TIER_BADGES[u.tier] || TIER_BADGES.NEWCOMER;
              return (
                <div key={u.userId} className={`px-2.5 py-1 rounded-xl border text-[11px] flex items-center gap-1.5 ${badge.color}`}>
                  <span className="font-bold">{u.displayName}</span><span>({badge.label})</span><span className="font-extrabold">• {toPersianDigits(u.points)} امتیاز</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

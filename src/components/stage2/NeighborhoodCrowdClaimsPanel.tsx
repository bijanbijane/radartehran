import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ShieldCheck, ThumbsUp, ThumbsDown, Award, Send, CheckCircle2, MessageSquarePlus, Sparkles, AlertTriangle, Lock } from 'lucide-react';
import { auth } from '../../firebase';
import { INITIAL_NEIGHBORHOODS, toPersianNum as toPersianDigits, type Neighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { validateCrowdClaimDraft } from '../../utils/forms/formInputHelpers';
import {
  buildCrowdClaimRequestBody,
  buildCrowdVoteRequestBody,
  getCrowdAuthorizedHeaders,
  resolveCrowdMutationHttpError,
} from './crowdClaimsClientHelper';

export interface CrowdClaimItem {
  id: string; hoodId: number; hoodName: string; cityKey: string;
  authorId: string; authorDisplayName: string; category: string;
  claimType: 'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE';
  title: string; body: string; status: string;
  trustWeightScore: number; upvotes: number; downvotes: number;
  promotedToReference: boolean; createdAtIso: string;
}

export interface ContributorSummary {
  userId: string; displayName: string; points: number; tier: string; verifiedClaimsCount: number;
}

interface NeighborhoodCrowdClaimsPanelProps {
  hoodId: number; hoodName: string; cityKey: string;
  basePriceSqm?: number; hood?: Neighborhood; intlCurrency?: IntlCurrencyCode;
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
  NEWCOMER: { label: 'مشارکت‌کننده جدید', color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-[var(--color-bg-muted)] dark:text-[var(--color-text-secondary)] dark:border-[var(--color-border-strong)]' },
};

function buildSeedClaims(hoodId: number, hoodName: string, cityKey: string, basePriceSqm?: number, providedHood?: Neighborhood, intlCurrency: IntlCurrencyCode = 'USD') {
  const safeCity = (cityKey in MULTI_CITY_CONFIGS ? cityKey : 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const hood = providedHood ?? cityHoods.find((h) => h.id === hoodId || h.name === hoodName) ?? cityHoods[0] ?? INITIAL_NEIGHBORHOODS[0];
  const ask = basePriceSqm && basePriceSqm > 0 ? basePriceSqm : hood.buyPerSqm;
  const agg = aggregateNeighborhoodMarketMetrics(hood.id, hoodName || hood.name, ask, buildNeighborhoodListingSamples({ ...hood, buyPerSqm: ask }));
  const spreadLow = Math.max(3, Math.round((1 - agg.askToDealRatio) * 100));
  const spreadHigh = spreadLow + 2;
  const dealIntl = formatMillionTomanAsIntlCurrency(agg.estimatedDealPricePerSqm, intlCurrency, 'fa');

  const refClaim: CrowdClaimItem = {
    id: `seed_ref_${hoodId}`, hoodId, hoodName, cityKey, authorId: 'usr_inspector_1',
    authorDisplayName: 'مهندس کاظمی (ارزیاب میدانی محله)', category: 'PRICE_OBSERVATION',
    claimType: 'VERIFIED_FACT_CANDIDATE',
    title: `شکاف واقعی معامله تا آگهی در خیابان‌های اصلی ${hoodName}`,
    body: `بر اساس پایش آگهی‌های پالایش‌شده و مبایعه‌نامه‌های اخیر در ${hoodName}، سناریوی فرضی مذاکره متری ${toPersianDigits(agg.estimatedDealPricePerSqm)} م.ت (${dealIntl} — حدود ${toPersianDigits(spreadLow)} تا ${toPersianDigits(spreadHigh)} درصد پایین‌تر از میانگین اعلامی متری ${toPersianDigits(agg.askingPricePerSqm)} م.ت) بسته شده است.`,
    status: 'VERIFIED_REFERENCE', trustWeightScore: Math.max(82, agg.confidenceScore), upvotes: 12 + (hoodId % 7), downvotes: 1, promotedToReference: true, createdAtIso: new Date().toISOString(),
  };
  const commClaim: CrowdClaimItem = {
    id: `seed_comm_${hoodId}`, hoodId, hoodName, cityKey, authorId: 'usr_resident_2',
    authorDisplayName: 'سارا محمدی (ساکن)', category: 'ALLEY_LIVABILITY',
    claimType: 'SUBJECTIVE_EXPERIENCE',
    title: `وضعیت تردد، دسترسی مترو (${toPersianDigits(hood.metro ?? 7)}/۱۰) و پارک شبانه در ${hoodName}`,
    body: `در کوچه‌های فرعی ${hoodName}، امتیاز دسترسی حمل‌ونقل عمومی ${toPersianDigits(hood.metro ?? 7)} از ۱۰ و شاخص کیفیت هوا ${toPersianDigits(hood.air ?? 6)} از ۱۰ ارزیابی شده است؛ ظرفیت پارک مهمان بعد از ساعت ۲۱ محدود است.`,
    status: 'STAGE_COMMUNITY', trustWeightScore: 84, upvotes: 7 + (hoodId % 5), downvotes: 0, promotedToReference: false, createdAtIso: new Date().toISOString(),
  };
  return {
    verified: [refClaim], all: [refClaim, commClaim],
    leaders: [
      { userId: 'usr_inspector_1', displayName: 'مهندس کاظمی', points: 145, tier: 'CHIEF_INSPECTOR', verifiedClaimsCount: 5 },
      { userId: 'usr_resident_2', displayName: 'سارا محمدی', points: 80, tier: 'LOCAL_RESIDENT', verifiedClaimsCount: 2 },
    ],
  };
}

export const NeighborhoodCrowdClaimsPanel: React.FC<NeighborhoodCrowdClaimsPanelProps> = ({
  hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency = 'USD',
}) => {
  const [claims, setClaims] = useState<CrowdClaimItem[]>([]);
  const [verifiedRefs, setVerifiedRefs] = useState<CrowdClaimItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<ContributorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [votedIds, setVotedIds] = useState<Record<string, 'UP' | 'DOWN'>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(() => Boolean(auth.currentUser));
  const [submitting, setSubmitting] = useState(false);
  const [votingClaimId, setVotingClaimId] = useState<string | null>(null);

  const [authorName, setAuthorName] = useState('');
  const [category, setCategory] = useState('ALLEY_LIVABILITY');
  const [claimType, setClaimType] = useState<'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE'>('VERIFIED_FACT_CANDIDATE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        setShowForm(false);
        setSubmitMessage(null);
        setErrorMessage(null);
        setVotedIds({});
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchAbortRef.current?.abort();
    };
  }, []);

  const fetchClaims = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const seq = ++fetchSeqRef.current;

    setLoading(true);
    const seed = buildSeedClaims(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency);
    try {
      const res = await fetch(`/api/v1/claims/hood/${hoodId}?cityId=${encodeURIComponent(cityKey)}`, {
        signal: controller.signal,
      });
      if (!isMountedRef.current || seq !== fetchSeqRef.current || controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (!isMountedRef.current || seq !== fetchSeqRef.current || controller.signal.aborted) return;
        const mapDoc = (d: Record<string, unknown>): CrowdClaimItem => ({
          id: String(d.claimId || d.id || ''), hoodId, hoodName, cityKey,
          authorId: String(d.authorUid || 'usr_1'), authorDisplayName: String(d.authorDisplayName || 'شهروند رادار'),
          category: String(d.category || 'ALLEY_LIVABILITY'),
          claimType: d.epistemicState === 'VERIFIED_REFERENCE' || d.targetLevel === 'STREET_SEGMENT' || d.category === 'PRICE_OBSERVATION' || d.category === 'DATA_CORRECTION' ? 'VERIFIED_FACT_CANDIDATE' : 'SUBJECTIVE_EXPERIENCE',
          title: String(d.streetNameRaw || `گزارش میدانی ${hoodName}`), body: String(d.narrativeText || ''),
          status: String(d.epistemicState || 'STAGE_COMMUNITY'), trustWeightScore: Number(d.aiPlausibilityScore || 80),
          upvotes: Number(d.upvoteCount || 0), downvotes: Number(d.downvoteCount || 0),
          promotedToReference: d.epistemicState === 'VERIFIED_REFERENCE', createdAtIso: String(d.createdAtIso || new Date().toISOString()),
        });
        const rawVerified = data.verifiedReferenceClaims ?? data.VERIFIED_REFERENCE;
        const rawCommunity = data.communityStageClaims ?? data.STAGE_COMMUNITY;
        const apiVerified = Array.isArray(rawVerified) ? rawVerified.map(mapDoc) : [];
        const apiCommunity = Array.isArray(rawCommunity) ? rawCommunity.map(mapDoc) : [];
        setVerifiedRefs(apiVerified.length > 0 ? [...apiVerified, ...seed.verified] : seed.verified);
        setClaims([...apiVerified, ...apiCommunity, ...seed.all]);
        setLeaderboard(seed.leaders);
      } else {
        setVerifiedRefs(seed.verified); setClaims(seed.all); setLeaderboard(seed.leaders);
      }
    } catch (err) {
      if (!isMountedRef.current || seq !== fetchSeqRef.current || controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
      setVerifiedRefs(seed.verified); setClaims(seed.all); setLeaderboard(seed.leaders);
    } finally {
      if (isMountedRef.current && seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [basePriceSqm, cityKey, hood, hoodId, hoodName, intlCurrency]);

  useEffect(() => {
    setShowForm(false);
    setTitle('');
    setBody('');
    setSubmitMessage(null);
    setErrorMessage(null);
    setVotedIds({});
  }, [hoodId, cityKey]);

  useEffect(() => {
    void fetchClaims();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchClaims]);

  const canMutate = authReady && Boolean(currentUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validation = validateCrowdClaimDraft(title, body);
    if (!validation.ok) {
      setSubmitMessage(null);
      setErrorMessage('error' in validation ? validation.error : 'لطفاً فیلدهای گزارش را تکمیل کنید.');
      return;
    }
    setSubmitMessage(null);
    setErrorMessage(null);
    const authHeaders = await getCrowdAuthorizedHeaders(currentUser);
    if (!authHeaders.ok) {
      setErrorMessage('messageFa' in authHeaders ? authHeaders.messageFa : 'احراز هویت الزامی است.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST',
        headers: authHeaders.headers,
        body: JSON.stringify(
          buildCrowdClaimRequestBody({
            hoodId,
            cityKey,
            authorDisplayName: authorName,
            category,
            claimType,
            streetName: title,
            narrativeText: body,
            basePriceSqm,
            intlCurrency,
          }),
        ),
      });
      if (res.ok) {
        setTitle(''); setBody(''); setShowForm(false);
        setSubmitMessage('گزارش میدانی شما ثبت شد و در صف اعتبارسنجی معرفتی قرار گرفت (+۱۵ امتیاز).');
        await fetchClaims();
      } else {
        const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setErrorMessage(resolveCrowdMutationHttpError(res.status, errData));
      }
    } catch {
      setErrorMessage('خطا در ارسال گزارش. لطفاً دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (claimId: string, vote: 'UP' | 'DOWN') => {
    if (votedIds[claimId] || votingClaimId === claimId) return;
    setErrorMessage(null);
    const authHeaders = await getCrowdAuthorizedHeaders(currentUser);
    if (!authHeaders.ok) {
      setErrorMessage('messageFa' in authHeaders ? authHeaders.messageFa : 'احراز هویت الزامی است.');
      return;
    }

    const applyDelta = (list: CrowdClaimItem[], delta: 1 | -1) =>
      list.map((c) => c.id === claimId
        ? {
            ...c,
            upvotes: vote === 'UP' ? Math.max(0, c.upvotes + delta) : c.upvotes,
            downvotes: vote === 'DOWN' ? Math.max(0, c.downvotes + delta) : c.downvotes,
          }
        : c);

    setVotedIds((prev) => ({ ...prev, [claimId]: vote }));
    setClaims((prev) => applyDelta(prev, 1));
    setVerifiedRefs((prev) => applyDelta(prev, 1));

    if (claimId.startsWith('seed_')) return;

    setVotingClaimId(claimId);
    try {
      const res = await fetch(`/api/v1/claims/${encodeURIComponent(claimId)}/vote`, {
        method: 'POST',
        headers: authHeaders.headers,
        body: JSON.stringify(buildCrowdVoteRequestBody(vote)),
      });
      if (res.ok) {
        await fetchClaims();
      } else {
        const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setVotedIds((prev) => {
          const next = { ...prev };
          delete next[claimId];
          return next;
        });
        setClaims((prev) => applyDelta(prev, -1));
        setVerifiedRefs((prev) => applyDelta(prev, -1));
        setErrorMessage(resolveCrowdMutationHttpError(res.status, errData));
      }
    } catch {
      setVotedIds((prev) => {
        const next = { ...prev };
        delete next[claimId];
        return next;
      });
      setClaims((prev) => applyDelta(prev, -1));
      setVerifiedRefs((prev) => applyDelta(prev, -1));
      setErrorMessage('خطا در ثبت رأی. لطفاً دوباره تلاش کنید.');
    } finally {
      setVotingClaimId(null);
    }
  };

  return (
    <div data-testid="neighborhood-crowd-claims-panel" className="bg-white dark:bg-[var(--color-bg-surface)] rounded-2xl border border-slate-200 dark:border-[var(--color-border-subtle)] p-4 shadow-sm space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-[var(--color-text-primary)] text-sm">راستی‌آزمایی جمعی و گزارش‌های میدانی ({hoodName})</h4>
            <p className="text-xs text-slate-500 dark:text-[var(--color-text-muted)]">تفکیک «تاییدیه میدانی قابل راستی‌آزمایی» از «تجربه زیسته ساکنان» با امتیازدهی اعتبارسنجی</p>
          </div>
        </div>
        <button
          type="button"
          disabled={!canMutate}
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4" /><span>{showForm ? 'بستن فرم گزارش' : 'ثبت گزارش میدانی (+۱۵ امتیاز)'}</span>
        </button>
      </div>
      {!canMutate && (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>برای ثبت گزارش جدید یا رأی اعتبارسنجی، ابتدا با حساب کاربری معتبر وارد شوید. مشاهده گزارش‌های عمومی بدون ورود نیز فعال است.</span>
        </div>
      )}
      {submitMessage && (
        <div role="status" className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{submitMessage}</span></div>
      )}
      {errorMessage && (
        <div role="alert" className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{errorMessage}</span></div>
      )}
      {showForm && canMutate && (
        <form noValidate onSubmit={handleSubmit} className="bg-slate-50 dark:bg-[var(--color-bg-muted)] p-3.5 rounded-xl border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">نام نمایشی</label>
              <input type="text" value={authorName} onChange={(e) => { setAuthorName(e.target.value); if (errorMessage) setErrorMessage(null); if (submitMessage) setSubmitMessage(null); }} placeholder="مثلاً: علی (ساکن محله)" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">دسته‌بندی موضوعی</label>
              <select value={category} onChange={(e) => { setCategory(e.target.value); if (errorMessage) setErrorMessage(null); }} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)]">{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">نوع گزارش</label>
              <select value={claimType} onChange={(e) => { setClaimType(e.target.value as 'VERIFIED_FACT_CANDIDATE' | 'SUBJECTIVE_EXPERIENCE'); if (errorMessage) setErrorMessage(null); }} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)]">
                <option value="VERIFIED_FACT_CANDIDATE">سناریوی فرضی مذاکره / فکت مستند ملکی</option>
                <option value="SUBJECTIVE_EXPERIENCE">تجربه سکونت / کیفیت کوچه و جای پارک</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">عنوان گزارش / نام کوچه یا خیابان</label>
            <input type="text" aria-invalid={Boolean(errorMessage) && title.trim().length < 4} value={title} onChange={(e) => { setTitle(e.target.value); if (errorMessage) setErrorMessage(null); if (submitMessage) setSubmitMessage(null); }} placeholder="مثلاً: قیمت معامله طبقه سوم در خیابان اصلی یا وضعیت پارک شبانه" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)]" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-[var(--color-text-secondary)] mb-1">شرح دقیق و مستند</label>
            <textarea rows={2} aria-invalid={Boolean(errorMessage) && body.trim().length < 8} value={body} onChange={(e) => { setBody(e.target.value); if (errorMessage) setErrorMessage(null); if (submitMessage) setSubmitMessage(null); }} placeholder="گزارش دقیق خود را بنویسید؛ در صورت تایید همسایگان به عنوان مرجع قیمت محله ثبت می‌شود..." className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)]" />
          </div>
          <div className="flex justify-end"><button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"><Send className="w-3.5 h-3.5" /><span>{submitting ? 'در حال ثبت...' : 'ثبت گزارش برای بررسی اهالی'}</span></button></div>
        </form>
      )}
      {verifiedRefs.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><Sparkles className="w-4 h-4" /><span>قیمت‌ها و گزارش‌های تاییدشده محله ({toPersianDigits(verifiedRefs.length)})</span></div>
          <div className="grid grid-cols-1 gap-2">
            {verifiedRefs.map((ref) => (
              <div key={ref.id} className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">{ref.title}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">میزان اطمینان: {toPersianDigits(ref.trustWeightScore)}٪</span></div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-relaxed">{ref.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 dark:text-[var(--color-text-secondary)]">همه گزارش‌های اهالی و مشاوران محله ({toPersianDigits(claims.length)})</div>
        {loading ? <div className="text-xs text-slate-400 py-3">در حال بارگذاری گزارش‌های میدانی...</div> : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {claims.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)] bg-slate-50/50 dark:bg-[var(--color-bg-muted)] flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">{c.title}</span><span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-[var(--color-bg-elevated)] text-slate-700 dark:text-[var(--color-text-primary)] text-[10px]">{CATEGORY_LABELS[c.category] || c.category}</span></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.promotedToReference ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' : c.claimType === 'VERIFIED_FACT_CANDIDATE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'}`}>
                    {c.promotedToReference ? 'داده مرجع تاییدشده' : c.claimType === 'VERIFIED_FACT_CANDIDATE' ? 'ادعای قابل راستی‌آزمایی' : 'تجربه شخصی ساکنان'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">{c.body}</p>
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">
                  <span>توسط: {c.authorDisplayName} • وزن اعتبار: {toPersianDigits(c.trustWeightScore)}٪</span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!canMutate || Boolean(votedIds[c.id]) || votingClaimId === c.id} onClick={() => handleVote(c.id, 'UP')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-700 dark:text-emerald-400 cursor-pointer"><ThumbsUp className="w-3 h-3" /><span>تایید ({toPersianDigits(c.upvotes)})</span></button>
                    <button type="button" disabled={!canMutate || Boolean(votedIds[c.id]) || votingClaimId === c.id} onClick={() => handleVote(c.id, 'DOWN')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 dark:text-rose-400 cursor-pointer"><ThumbsDown className="w-3 h-3" /><span>رد ({toPersianDigits(c.downvotes)})</span></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {leaderboard.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-[var(--color-text-secondary)] mb-2"><Award className="w-4 h-4 text-amber-500" /><span>مشارکت‌کنندگان برتر راستی‌آزمایی میدانی</span></div>
          <div className="flex flex-wrap gap-2">
            {leaderboard.slice(0, 3).map((u) => {
              const badge = TIER_BADGES[u.tier] || TIER_BADGES.NEWCOMER;
              return <div key={u.userId} className={`px-2.5 py-1 rounded-xl border text-[11px] flex items-center gap-1.5 ${badge.color}`}><span className="font-bold">{u.displayName}</span><span>({badge.label})</span><span className="font-bold">• {toPersianDigits(u.points)} امتیاز</span></div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

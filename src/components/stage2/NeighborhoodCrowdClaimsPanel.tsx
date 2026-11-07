/** @file src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx — Stage 2.3 Crowd Claims & Leaderboard UI */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, MapPin, MessageSquarePlus, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ContributorRoleBadge, CrowdClaimCategory, CrowdClaimDocument, SpatialTargetLevel } from '../../cells/knowledge-crowd/crowdClaimsTypes';
import { toPersianNum } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface Stage2CurrentUser { uid: string; displayName?: string | null; roleBadge?: ContributorRoleBadge; getIdToken?: () => Promise<string>; }
export interface TopContributorSummary { uid: string; displayName: string; roleBadge: ContributorRoleBadge; reputationPoints: number; trustWeight: number; verifiedClaimsCount: number; }
export interface NeighborhoodCrowdClaimsPanelProps { hoodId: number; hoodName: string; cityId?: string; currentUser?: Stage2CurrentUser | null; intlCurrency?: IntlCurrencyCode; }

const ROLE_BADGE_LABELS: Record<ContributorRoleBadge, { label: string; className: string }> = {
  CITIZEN: { label: 'شهروند', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  LOCAL_RESIDENT: { label: 'ساکن محله', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  VERIFIED_REALTOR: { label: 'مشاور تاییدشده', className: 'bg-blue-50 text-blue-800 border-blue-300' },
  OFFICIAL_EXPERT: { label: 'کارشناس رسمی', className: 'bg-amber-50 text-amber-900 border-amber-400' },
};
const CATEGORY_LABELS: Record<CrowdClaimCategory, string> = {
  ALLEY_LIVABILITY: 'کیفیت سکونت و آرامش کوچه', PRICE_OBSERVATION: 'گزارش قیمت واقعی معامله',
  CONSTRUCTION_QUALITY: 'کیفیت ساخت و نوسازی', INFRASTRUCTURE_POI: 'دسترسی، مترو و زیرساخت', DATA_CORRECTION: 'اصلاح داده مرجع محله',
};

function createSeededClaims(hoodId: number, hoodName: string): CrowdClaimDocument[] {
  const nowIso = new Date().toISOString();
  return [
    {
      claimId: `seed_ref_${hoodId}_1`, targetLevel: 'STREET_SEGMENT', cityId: 'tehran', hoodId,
      streetNameRaw: 'خیابان گلستان سوم', streetNameNormalized: 'گلستان سوم', coords: null,
      category: 'PRICE_OBSERVATION', estimatedPriceSqm: 134, parkingScore: 4, noiseLevelScore: 5, safetyScore: 5, slopeType: 'FLAT',
      narrativeText: `معامله قطعی واحد ۱۰۵ متری در گلستان سوم ${hoodName} با سند تک‌برگ و پارکینگ سندی در محدوده متری ۱۳۴ میلیون تومان ثبت شد.`,
      evidenceMediaObjectIds: ['doc_verified_1'], authorUid: 'expert_realtor_1', authorDisplayName: 'مهندس کاظمی',
      authorRoleBadge: 'OFFICIAL_EXPERT', authorTrustWeightAtSubmission: 2.4, epistemicState: 'VERIFIED_REFERENCE',
      aiPlausibilityScore: 92, plausibilityReasonFa: 'تاییدشده با اجماع کارشناسان و همخوانی با شاخص هدانیک محله.',
      upvoteCount: 6, downvoteCount: 0, weightedConsensusScore: 4.85, citationCount: 12, votesByUid: {},
      createdAtIso: nowIso, updatedAtIso: nowIso, promotedToReferenceAtIso: nowIso,
    },
    {
      claimId: `seed_comm_${hoodId}_2`, targetLevel: 'STREET_SEGMENT', cityId: 'tehran', hoodId,
      streetNameRaw: 'کوچه مهرگان شرقی', streetNameNormalized: 'مهرگان شرقی', coords: null,
      category: 'ALLEY_LIVABILITY', estimatedPriceSqm: null, parkingScore: 3, noiseLevelScore: 5, safetyScore: 4, slopeType: 'FLAT',
      narrativeText: `کوچه مهرگان شرقی در ${hoodName} بسیار دنج و مشجر است؛ شب‌ها روشنایی و امنیت عالی دارد اما بعد از ساعت ۲۱ جای پارک مهمان محدود می‌شود.`,
      evidenceMediaObjectIds: [], authorUid: 'resident_sara_2', authorDisplayName: 'سارا احمدی',
      authorRoleBadge: 'LOCAL_RESIDENT', authorTrustWeightAtSubmission: 1.35, epistemicState: 'STAGE_COMMUNITY',
      aiPlausibilityScore: 86, plausibilityReasonFa: 'گزارش کیفی کوچه/محله با ساختار استاندارد همخوانی دارد.',
      upvoteCount: 2, downvoteCount: 0, weightedConsensusScore: 2.1, citationCount: 1, votesByUid: {},
      createdAtIso: nowIso, updatedAtIso: nowIso, promotedToReferenceAtIso: null,
    },
  ];
}

export const NeighborhoodCrowdClaimsPanel: React.FC<NeighborhoodCrowdClaimsPanelProps> = ({
  hoodId, hoodName, cityId = 'tehran', currentUser, intlCurrency = 'USD',
}) => {
  const [claims, setClaims] = useState<CrowdClaimDocument[]>(() => createSeededClaims(hoodId, hoodName));
  const [streetFilter, setStreetFilter] = useState(''), [streetName, setStreetName] = useState('');
  const [targetLevel, setTargetLevel] = useState<SpatialTargetLevel>('STREET_SEGMENT');
  const [category, setCategory] = useState<CrowdClaimCategory>('ALLEY_LIVABILITY');
  const [roleBadge, setRoleBadge] = useState<ContributorRoleBadge>(currentUser?.roleBadge ?? 'LOCAL_RESIDENT');
  const [authorNameInput, setAuthorNameInput] = useState(currentUser?.displayName || '');
  const [parkingScore, setParkingScore] = useState(4), [noiseScore, setNoiseScore] = useState(4), [safetyScore, setSafetyScore] = useState(5);
  const [estimatedPriceSqm, setEstimatedPriceSqm] = useState(''), [narrativeText, setNarrativeText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadClaims = useCallback(async () => {
    try {
      const qs = streetFilter.trim() ? `?streetName=${encodeURIComponent(streetFilter.trim())}` : '';
      const res = await fetch(`/api/v1/claims/hood/${hoodId}${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: CrowdClaimDocument[] = [
        ...(Array.isArray(data.VERIFIED_REFERENCE) ? data.VERIFIED_REFERENCE : []),
        ...(Array.isArray(data.STAGE_COMMUNITY) ? data.STAGE_COMMUNITY : []),
      ];
      if (fetched.length > 0) setClaims(fetched);
    } catch { /* retain local claims */ }
  }, [hoodId, streetFilter]);

  useEffect(() => { setClaims(createSeededClaims(hoodId, hoodName)); void loadClaims(); }, [hoodId, hoodName, loadClaims]);

  const filteredClaims = useMemo(() => {
    const q = streetFilter.trim().toLowerCase();
    if (!q) return claims;
    return claims.filter((c) => c.streetNameRaw.toLowerCase().includes(q) || c.streetNameNormalized.includes(q));
  }, [claims, streetFilter]);

  const verifiedClaims = useMemo(() => filteredClaims.filter((c) => c.epistemicState === 'VERIFIED_REFERENCE'), [filteredClaims]);
  const communityClaims = useMemo(() => filteredClaims.filter((c) => c.epistemicState !== 'VERIFIED_REFERENCE'), [filteredClaims]);

  const topContributors: TopContributorSummary[] = useMemo(() => [
    { uid: 'expert_realtor_1', displayName: 'مهندس کاظمی', roleBadge: 'OFFICIAL_EXPERT', reputationPoints: 325, trustWeight: 2.4, verifiedClaimsCount: 13 },
    { uid: 'realtor_niavaran_2', displayName: 'امیرحسین شریفی', roleBadge: 'VERIFIED_REALTOR', reputationPoints: 210, trustWeight: 1.85, verifiedClaimsCount: 8 },
    { uid: 'resident_sara_2', displayName: 'سارا احمدی', roleBadge: 'LOCAL_RESIDENT', reputationPoints: 125, trustWeight: 1.35, verifiedClaimsCount: 5 },
  ], []);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNarrative = narrativeText.trim();
    if (cleanNarrative.length < 5) {
      setStatusMessage('لطفاً حداقل ۵ کاراکتر تجربه یا گزارش محلی بنویسید.');
      return;
    }
    const uid = currentUser?.uid || `citizen_${Date.now()}`;
    const displayName = (authorNameInput.trim() || currentUser?.displayName || 'ساکن محله').slice(0, 60);
    const parsedPrice = Number(estimatedPriceSqm);
    const priceVal = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
    const targetStreet = targetLevel === 'HOOD' ? `کل محله ${hoodName}` : streetName.trim() || 'کوچه اصلی';
    const nowIso = new Date().toISOString();

    const optimisticClaim: CrowdClaimDocument = {
      claimId: `clm_${Date.now()}`, targetLevel, cityId: cityId as CrowdClaimDocument['cityId'], hoodId,
      streetNameRaw: targetStreet, streetNameNormalized: targetStreet, coords: null, category,
      estimatedPriceSqm: priceVal, parkingScore, noiseLevelScore: noiseScore, safetyScore, slopeType: 'FLAT',
      narrativeText: cleanNarrative, evidenceMediaObjectIds: [], authorUid: uid, authorDisplayName: displayName,
      authorRoleBadge: roleBadge, authorTrustWeightAtSubmission: 1.15, epistemicState: 'STAGE_COMMUNITY',
      aiPlausibilityScore: 84, plausibilityReasonFa: 'ثبت فوری در لایه مشارکت مردمی (STAGE_COMMUNITY).',
      upvoteCount: 0, downvoteCount: 0, weightedConsensusScore: 0, citationCount: 0, votesByUid: {},
      createdAtIso: nowIso, updatedAtIso: nowIso, promotedToReferenceAtIso: null,
    };

    try {
      const res = await fetch('/api/v1/claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLevel, cityId, hoodId, streetName: targetStreet, category, estimatedPriceSqm: priceVal,
          parkingScore, noiseLevelScore: noiseScore, safetyScore, narrativeText: cleanNarrative,
          authorUid: uid, authorDisplayName: displayName, authorRoleBadge: roleBadge,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.claim) {
          setClaims((prev) => [json.claim as CrowdClaimDocument, ...prev]);
          setNarrativeText(''); setEstimatedPriceSqm('');
          setStatusMessage('گزارش شما به نام خودتان در وضعیت STAGE_COMMUNITY ثبت شد.');
          return;
        }
      }
    } catch { /* fallback */ }
    setClaims((prev) => [optimisticClaim, ...prev]);
    setNarrativeText(''); setEstimatedPriceSqm('');
    setStatusMessage('گزارش شما به نام خودتان در لیست مشارکت مردمی محله ثبت شد.');
  };

  const handleVote = async (claimId: string, direction: 'UP' | 'DOWN') => {
    const voterUid = currentUser?.uid || 'voter_local_resident';
    try {
      const res = await fetch(`/api/v1/claims/${claimId}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voterUid, direction }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.claim) { setClaims((prev) => prev.map((c) => (c.claimId === claimId ? (json.claim as CrowdClaimDocument) : c))); return; }
      }
    } catch { /* fallback */ }
    setClaims((prev) => prev.map((c) => {
      if (c.claimId !== claimId) return c;
      const nextConsensus = Number((c.weightedConsensusScore + (direction === 'UP' ? 1.2 : -1.2)).toFixed(2));
      return {
        ...c, upvoteCount: direction === 'UP' ? c.upvoteCount + 1 : c.upvoteCount,
        downvoteCount: direction === 'DOWN' ? c.downvoteCount + 1 : c.downvoteCount,
        weightedConsensusScore: nextConsensus,
        epistemicState: nextConsensus >= 3.0 && c.aiPlausibilityScore >= 70 ? 'VERIFIED_REFERENCE' : c.epistemicState,
      };
    }));
  };

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <div className="rounded-xl border border-amber-200 bg-gradient-to-l from-amber-50/90 to-white p-3.5 shadow-sm">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
            <Award className="h-4 w-4 text-amber-600" />
            <span>تابلوی افتخارات ۳ مشارکت‌کننده برتر محله {hoodName}</span>
          </div>
          <span className="text-xs text-amber-800">ضریب نفوذ رای: ۰.۱ تا ۵.۰</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {topContributors.map((c, idx) => (
            <div key={c.uid} className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-xs">
              <div>
                <div className="font-bold text-slate-800">#{toPersianNum(idx + 1)} {c.displayName}</div>
                <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] ${ROLE_BADGE_LABELS[c.roleBadge].className}`}>{ROLE_BADGE_LABELS[c.roleBadge].label}</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-amber-700">{toPersianNum(c.reputationPoints)} امتیاز</div>
                <div className="text-[11px] text-slate-500">ضریب اعتماد: {toPersianNum(c.trustWeight)}×</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmitClaim} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <MessageSquarePlus className="h-4 w-4 text-blue-600" />
          <span>ثبت گزارش کوچه/محله به نام خودتان در گراف دانش {hoodName}</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <input type="text" aria-label="نام نمایشی ثبت‌کننده گزارش" placeholder="نام شما (مثلاً: علی محمدی)" value={authorNameInput} onChange={(e) => setAuthorNameInput(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
          <select aria-label="نقش و نشان تخصصی مشارکت‌کننده" value={roleBadge} onChange={(e) => setRoleBadge(e.target.value as ContributorRoleBadge)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
            <option value="LOCAL_RESIDENT">ساکن محله</option><option value="CITIZEN">شهروند</option>
            <option value="VERIFIED_REALTOR">مشاور تاییدشده</option><option value="OFFICIAL_EXPERT">کارشناس رسمی</option>
          </select>
          <select aria-label="سطح هدف مکانی گزارش" value={targetLevel} onChange={(e) => setTargetLevel(e.target.value as SpatialTargetLevel)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
            <option value="STREET_SEGMENT">کوچه یا خیابان مشخص</option><option value="HOOD">کل محله {hoodName}</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {targetLevel !== 'HOOD' && <input type="text" aria-label="نام کوچه یا خیابان" placeholder="نام کوچه/خیابان (مثلاً: گلستان سوم)" value={streetName} onChange={(e) => setStreetName(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />}
          <select aria-label="دسته‌بندی موضوع گزارش" value={category} onChange={(e) => setCategory(e.target.value as CrowdClaimCategory)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input type="number" aria-label="قیمت تخمینی هر متر مربع به میلیون تومان" placeholder="قیمت تخمینی هر متر (میلیون تومان - اختیاری)" value={estimatedPriceSqm} onChange={(e) => setEstimatedPriceSqm(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-xs">
          <label className="flex items-center justify-between gap-1"><span>جای پارک (۱-۵):</span><select aria-label="امتیاز جای پارک از ۱ تا ۵" value={parkingScore} onChange={(e) => setParkingScore(Number(e.target.value))} className="rounded border px-1.5 py-0.5">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{toPersianNum(n)}</option>)}</select></label>
          <label className="flex items-center justify-between gap-1"><span>آرامش و سکوت (۱-۵):</span><select aria-label="امتیاز آرامش و سکوت از ۱ تا ۵" value={noiseScore} onChange={(e) => setNoiseScore(Number(e.target.value))} className="rounded border px-1.5 py-0.5">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{toPersianNum(n)}</option>)}</select></label>
          <label className="flex items-center justify-between gap-1"><span>امنیت (۱-۵):</span><select aria-label="امتیاز امنیت از ۱ تا ۵" value={safetyScore} onChange={(e) => setSafetyScore(Number(e.target.value))} className="rounded border px-1.5 py-0.5">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{toPersianNum(n)}</option>)}</select></label>
        </div>
        <textarea rows={2} aria-label="متن تجربه و گزارش کوچه یا محله" placeholder="تجربه واقعی خود از سکونت، شیب کوچه، ترافیک، کیفیت ساخت یا قیمت معاملات این کوچه را بنویسید..." value={narrativeText} onChange={(e) => setNarrativeText(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-xs" />
        <div className="flex items-center justify-between">
          {statusMessage ? <span className="text-xs font-medium text-emerald-700">{statusMessage}</span> : <span className="text-[11px] text-slate-500">با رسیدن امتیاز اجماع وزنی به ۳.۰+، گزارش به «مرجع تاییدشده» ارتقا می‌یابد (+۲۵ امتیاز شهرت).</span>}
          <button type="submit" aria-label="ثبت گزارش به نام کاربر" className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700">ثبت گزارش به نام من</button>
        </div>
      </form>

      <input type="text" aria-label="فیلتر گزارش‌ها بر اساس نام کوچه یا خیابان" placeholder="جست‌وجوی نام کوچه یا خیابان در گزارش‌ها..." value={streetFilter} onChange={(e) => setStreetFilter(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs" />

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
          <span>گزارش‌های تاییدشده مرجع (VERIFIED_REFERENCE — {toPersianNum(verifiedClaims.length)})</span>
        </div>
        {verifiedClaims.map((c) => (
          <div key={c.claimId} className="rounded-xl border-2 border-amber-400/80 bg-amber-50/40 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white"><CheckCircle2 className="h-3 w-3" /> نشان طلایی مرجع</span>
                <span className="font-bold text-xs text-slate-900">{c.authorDisplayName}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ROLE_BADGE_LABELS[c.authorRoleBadge].className}`}>{ROLE_BADGE_LABELS[c.authorRoleBadge].label}</span>
              </div>
              <span className="font-mono text-[11px] text-amber-900 bg-amber-100 px-2 py-0.5 rounded">REF-{c.claimId.toUpperCase()}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-800">{c.narrativeText}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.streetNameRaw}</span>
                {c.estimatedPriceSqm && <span className="font-bold text-emerald-800">متری {toPersianNum(c.estimatedPriceSqm)} م.ت ({formatMillionTomanAsIntlCurrency(c.estimatedPriceSqm, intlCurrency, 'fa')})</span>}
              </div>
              <div className="flex items-center gap-2">
                <span>اجماع وزنی: {toPersianNum(c.weightedConsensusScore)}</span>
                <button type="button" aria-label={`رای موافق به گزارش ${c.claimId}`} onClick={() => handleVote(c.claimId, 'UP')} className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-emerald-700 hover:bg-emerald-50"><ThumbsUp className="h-3 w-3" /> {toPersianNum(c.upvoteCount)}</button>
                <button type="button" aria-label={`رای مخالف به گزارش ${c.claimId}`} onClick={() => handleVote(c.claimId, 'DOWN')} className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-2 py-0.5 text-rose-700 hover:bg-rose-50"><ThumbsDown className="h-3 w-3" /> {toPersianNum(c.downvoteCount)}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700">گزارش‌های تازهٔ مردمی در انتظار اجماع (STAGE_COMMUNITY — {toPersianNum(communityClaims.length)})</div>
        {communityClaims.map((c) => (
          <div key={c.claimId} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800">{c.authorDisplayName}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ROLE_BADGE_LABELS[c.authorRoleBadge].className}`}>{ROLE_BADGE_LABELS[c.authorRoleBadge].label}</span>
                <span className="text-[11px] text-slate-500">({c.streetNameRaw})</span>
              </div>
              <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded">امتیاز امکان‌سنجی هوش مصنوعی: {toPersianNum(c.aiPlausibilityScore)}٪</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">{c.narrativeText}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>پارک: {toPersianNum(c.parkingScore ?? 4)}/۵ · آرامش: {toPersianNum(c.noiseLevelScore ?? 4)}/۵ · امنیت: {toPersianNum(c.safetyScore ?? 5)}/۵</span>
              <div className="flex items-center gap-2">
                <span>اجماع وزنی: {toPersianNum(c.weightedConsensusScore)} / ۳.۰</span>
                <button type="button" aria-label={`رای موافق به گزارش مردمی ${c.claimId}`} onClick={() => handleVote(c.claimId, 'UP')} className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50/50 px-2 py-0.5 text-emerald-700"><ThumbsUp className="h-3 w-3" /> {toPersianNum(c.upvoteCount)}</button>
                <button type="button" aria-label={`رای مخالف به گزارش مردمی ${c.claimId}`} onClick={() => handleVote(c.claimId, 'DOWN')} className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50/50 px-2 py-0.5 text-rose-700"><ThumbsDown className="h-3 w-3" /> {toPersianNum(c.downvoteCount)}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2, Filter, MapPin, MessageSquarePlus, Mountain, Search,
  ShieldCheck, Sparkles, ThumbsUp, TrainFront, UserCheck, Wifi, Wind, Zap,
} from 'lucide-react';
import { EvaluatedNeighborhood, ResidentVoteDoc, toPersianNum } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import {
  computeCompositeQoLScore, filterAndSortResidentReviews, getResidencyLabelFa,
  mergeCloudAndSeedReviews, QUICK_CONS_TAGS, QUICK_PROS_TAGS,
  RESIDENT_HELPFUL_STORAGE_KEY, RESIDENT_REVIEWS_STORAGE_KEY,
  summarizeNeighborhoodQoL, validateResidentReviewDraft,
  type ResidentDurationCode, type ResidentResidencyType,
  type ResidentReviewItem, type ReviewFilterMode,
} from './residentReviewsLogic';

export interface ResidentReviewsTabProps {
  selectedHood: EvaluatedNeighborhood;
  voteAir: number; setVoteAir: (v: number) => void;
  votePower: number; setVotePower: (v: number) => void;
  voteInternet: number; setVoteInternet: (v: number) => void;
  voteMetro: number; setVoteMetro: (v: number) => void;
  voteSecurity: number; setVoteSecurity: (v: number) => void;
  voteFlat: number; setVoteFlat: (v: number) => void;
  voteComment: string; setVoteComment: (v: string) => void;
  verifyingGeo: boolean; onResidentVote: (useGeolocation: boolean) => void;
  voteStatus: { type: 'success' | 'warning' | 'info'; text: string } | null;
  cloudVotes: ResidentVoteDoc[];
}

export function ResidentReviewsTab(props: ResidentReviewsTabProps): React.ReactElement {
  const {
    selectedHood, voteAir, setVoteAir, votePower, setVotePower, voteInternet, setVoteInternet,
    voteMetro, setVoteMetro, voteSecurity, setVoteSecurity, voteFlat, setVoteFlat,
    voteComment, setVoteComment, verifyingGeo, onResidentVote, voteStatus, cloudVotes,
  } = props;
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const [authorName, setAuthorName] = useState<string>('');
  const [residencyType, setResidencyType] = useState<ResidentResidencyType>('owner');
  const [residencyDuration, setResidencyDuration] = useState<ResidentDurationCode>('1_to_3y');
  const [selectedPros, setSelectedPros] = useState<string[]>(['همسایگان آرام و فرهنگی']);
  const [selectedCons, setSelectedCons] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<ReviewFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [formNotice, setFormNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showForm, setShowForm] = useState<boolean>(true);

  const [localReviews, setLocalReviews] = useState<ResidentReviewItem[]>(() => {
    try { const raw = localStorage.getItem(RESIDENT_REVIEWS_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [helpfulMap, setHelpfulMap] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem(RESIDENT_HELPFUL_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });

  useEffect(() => { try { localStorage.setItem(RESIDENT_REVIEWS_STORAGE_KEY, JSON.stringify(localReviews)); } catch { /* ignore */ } }, [localReviews]);
  useEffect(() => { try { localStorage.setItem(RESIDENT_HELPFUL_STORAGE_KEY, JSON.stringify(helpfulMap)); } catch { /* ignore */ } }, [helpfulMap]);

  const allHoodReviews = useMemo(() => mergeCloudAndSeedReviews(selectedHood, cloudVotes, localReviews), [selectedHood, cloudVotes, localReviews]);
  const summary = useMemo(() => summarizeNeighborhoodQoL(selectedHood, allHoodReviews, intlCurrency, radarLocale), [selectedHood, allHoodReviews, intlCurrency, radarLocale]);
  const filteredReviews = useMemo(() => filterAndSortResidentReviews(allHoodReviews, filterMode, searchQuery), [allHoodReviews, filterMode, searchQuery]);
  const draftComposite = useMemo(
    () => computeCompositeQoLScore({ air: voteAir, powerWater: votePower, internet: voteInternet, metro: voteMetro, security: voteSecurity, flatTerrain: voteFlat }),
    [voteAir, votePower, voteInternet, voteMetro, voteSecurity, voteFlat]
  );

  const toggleTag = (tag: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(tag) ? list.filter((t) => t !== tag) : [...list.slice(0, 3), tag]);
  };

  const handleSubmitReview = (useGeo: boolean) => {
    const check = validateResidentReviewDraft({
      authorName, residencyType, residencyDuration, comment: voteComment, prosTags: selectedPros, consTags: selectedCons,
      air: voteAir, powerWater: votePower, internet: voteInternet, metro: voteMetro, security: voteSecurity, flatTerrain: voteFlat,
    });
    if (!check.valid) { setFormNotice({ type: 'error', text: check.errorFa || 'لطفاً متن نظر خود را کامل کنید.' }); return; }
    const newReview: ResidentReviewItem = {
      id: `local-${selectedHood.id}-${Date.now()}`, hoodId: selectedHood.id, hoodName: selectedHood.name,
      authorName: check.sanitizedAuthor, residencyType, residencyDuration,
      air: voteAir, powerWater: votePower, internet: voteInternet, metro: voteMetro, security: voteSecurity, flatTerrain: voteFlat,
      overallQoLScore: draftComposite, comment: check.sanitizedComment, prosTags: selectedPros, consTags: selectedCons,
      locationVerified: useGeo, helpfulCount: 1, createdAtLabelFa: 'هم‌اکنون', createdAtMs: Date.now(), isLocalSubmission: true,
    };
    setLocalReviews((prev) => [newReview, ...prev.slice(0, 49)]);
    setFormNotice({ type: 'success', text: `تجربه سکونت شما با امتیاز ترکیبی ${toPersianNum(draftComposite)} از ۱۰ برای محله ${selectedHood.name} ثبت شد و در ابتدای فهرست نظرات قرار گرفت.` });
    onResidentVote(useGeo);
    setAuthorName('');
  };

  const qolAxes = [
    { key: 'air', label: 'هوا و فضای سبز', val: voteAir, set: setVoteAir, avg: summary.averages.air, icon: Wind, color: '#007AFF' },
    { key: 'power', label: 'پایداری برق و آب', val: votePower, set: setVotePower, avg: summary.averages.powerWater, icon: Zap, color: '#FF9500' },
    { key: 'net', label: 'اینترنت و فیبر نوری', val: voteInternet, set: setVoteInternet, avg: summary.averages.internet, icon: Wifi, color: '#5856D6' },
    { key: 'metro', label: 'مترو و حمل‌ونقل', val: voteMetro, set: setVoteMetro, avg: summary.averages.metro, icon: TrainFront, color: '#34C759' },
    { key: 'sec', label: 'امنیت و آرامش شبانه', val: voteSecurity, set: setVoteSecurity, avg: summary.averages.security, icon: ShieldCheck, color: '#AF52DE' },
    { key: 'flat', label: 'همواری معابر (بدون شیب)', val: voteFlat, set: setVoteFlat, avg: summary.averages.flatTerrain, icon: Mountain, color: '#00C7BE' },
  ];
  const fxBuyLabel = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm, intlCurrency, radarLocale)}` : '';

  return (
    <div className="space-y-3.5 text-xs" data-testid="resident-reviews-tab">
      <div className="apple-grouped-card p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-2.5">
          <div>
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5"><UserCheck className="w-4 h-4 text-emerald-600 stroke-[2]" /><span>ترازنامه کیفیت زندگی ساکنان {selectedHood.name}</span></h3>
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">بر پایه {toPersianNum(summary.totalReviewsCount)} تجربه ثبت‌شده ({toPersianNum(summary.verifiedReviewsCount)} تایید مکانی GPS){fxBuyLabel}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-[12px] px-3 py-1.5 text-center shrink-0">
            <div className="text-base font-black text-emerald-700 tabular-nums">{toPersianNum(summary.compositeScore)} / ۱۰</div>
            <div className="text-[10px] font-bold text-emerald-800">{toPersianNum(summary.recommendPercent)}٪ رضایت سکونت</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {qolAxes.map((ax) => {
            const IconComp = ax.icon;
            return (
              <div key={ax.key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-700 font-semibold flex items-center gap-1 truncate"><IconComp className="w-3 h-3 shrink-0" style={{ color: ax.color }} /><span className="truncate">{ax.label}</span></span>
                  <strong className="text-slate-900 font-extrabold tabular-nums">{toPersianNum(ax.avg)}</strong>
                </div>
                <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, ax.avg * 10)}%`, backgroundColor: ax.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="apple-grouped-card p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-slate-900 flex items-center gap-1.5"><MessageSquarePlus className="w-4 h-4 text-[#007AFF] stroke-[1.75]" /><span>ثبت نظر و امتیاز کیفیت زندگی در {selectedHood.name}</span></span>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="text-[11px] font-bold text-[#007AFF] hover:underline cursor-pointer">{showForm ? 'جمع کردن فرم' : 'باز کردن فرم ثبت نظر'}</button>
        </div>
        {showForm && (
          <div className="space-y-3 pt-1 border-t border-slate-200/70">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="نام یا نام مستعار (اختیاری)" aria-label="نام نویسنده نظر" className="px-2.5 py-1.5 rounded-[9px] bg-white border border-slate-200/90 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600" />
              <select value={residencyDuration} onChange={(e) => setResidencyDuration(e.target.value as ResidentDurationCode)} aria-label="مدت سکونت در محله" className="px-2.5 py-1.5 rounded-[9px] bg-white border border-slate-200/90 text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-600">
                <option value="under_1y">کمتر از ۱ سال سکونت</option><option value="1_to_3y">۱ تا ۳ سال سابقه سکونت</option><option value="over_3y">بیش از ۳ سال سکونت</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1 apple-segmented p-1 rounded-[9px] text-[11px] font-bold">
              {([{ id: 'owner', label: 'مالک ساکن' }, { id: 'tenant', label: 'مستاجر ساکن' }, { id: 'business', label: 'شاغل در محله' }] as const).map((role) => (
                <button key={role.id} type="button" onClick={() => setResidencyType(role.id)} className={`py-1 rounded-[7px] transition cursor-pointer ${residencyType === role.id ? 'apple-segmented-pill-active font-extrabold' : 'text-slate-600 hover:text-slate-900'}`}>{role.label}</button>
              ))}
            </div>
            <div className="bg-slate-50 border border-slate-200/70 rounded-[10px] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px]"><span className="font-bold text-slate-700">امتیازدهی شما به ۶ شاخص محله:</span><span className="font-black text-emerald-700 tabular-nums">میانگین شما: {toPersianNum(draftComposite)} از ۱۰</span></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {qolAxes.map((ax) => (
                  <div key={ax.key} className="space-y-0.5">
                    <div className="flex justify-between text-[10.5px]"><span className="text-slate-600 truncate">{ax.label}</span><strong className="text-slate-900 tabular-nums">{toPersianNum(ax.val)}/۱۰</strong></div>
                    <input type="range" min={1} max={10} value={ax.val} aria-label={`امتیاز ${ax.label}`} onChange={(e) => ax.set(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-bold text-slate-600">نکات مثبت و چالش‌های کلیدی (انتخاب سریع):</div>
              <div className="flex flex-wrap gap-1">
                {QUICK_PROS_TAGS.slice(0, 4).map((tag) => (
                  <button key={tag} type="button" onClick={() => toggleTag(tag, selectedPros, setSelectedPros)} className={`px-2 py-0.5 rounded-[7px] text-[10px] font-bold border transition cursor-pointer ${selectedPros.includes(tag) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>+ {tag}</button>
                ))}
                {QUICK_CONS_TAGS.slice(0, 3).map((tag) => (
                  <button key={tag} type="button" onClick={() => toggleTag(tag, selectedCons, setSelectedCons)} className={`px-2 py-0.5 rounded-[7px] text-[10px] font-bold border transition cursor-pointer ${selectedCons.includes(tag) ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>- {tag}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} value={voteComment} onChange={(e) => setVoteComment(e.target.value)} placeholder={`تجربه واقعی خود از سکونت در ${selectedHood.name} (وضعیت کوچه‌ها، پارک شبانه، همسایگان، دسترسی...) را بنویسید...`} aria-label="متن نظر ساکن محله" className="w-full px-3 py-2 rounded-[10px] bg-white border border-slate-200/90 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600" />
            {(formNotice || voteStatus) && (
              <div className={`p-2.5 rounded-[9px] text-[11px] font-medium border ${(formNotice?.type === 'error' || voteStatus?.type === 'warning') ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>{formNotice?.text || voteStatus?.text}</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={verifyingGeo} onClick={() => handleSubmitReview(true)} className="py-2 px-2.5 rounded-[10px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer shadow-xs"><MapPin className="w-3.5 h-3.5 stroke-[2]" /><span>{verifyingGeo ? 'در حال بررسی GPS...' : 'تایید مکانی و ثبت (۲×)'}</span></button>
              <button type="button" data-testid="submit-resident-review-btn" onClick={() => handleSubmitReview(false)} className="py-2 px-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"><Sparkles className="w-3.5 h-3.5 stroke-[2]" /><span>ثبت نظر ساکن</span></button>
            </div>
          </div>
        )}
      </div>

      <div className="apple-grouped-card p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-slate-900 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5 text-emerald-600" /><span>دیدگاه‌های ساکنان ({toPersianNum(filteredReviews.length)})</span></span>
          <div className="relative flex-1 max-w-[165px]">
            <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جست‌وجو در نظرات..." aria-label="جست‌وجو در نظرات ساکنان" className="w-full pr-7 pl-2 py-1 rounded-[8px] bg-slate-50 border border-slate-200/80 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 apple-segmented p-1 rounded-[9px] text-[10.5px] font-bold">
          {([{ id: 'all', label: 'همه' }, { id: 'verified', label: 'تایید مکانی 📍' }, { id: 'owners', label: 'مالکان' }, { id: 'tenants', label: 'مستاجران' }] as const).map((tab) => (
            <button key={tab.id} type="button" onClick={() => setFilterMode(tab.id)} className={`py-1 rounded-[7px] truncate transition cursor-pointer ${filterMode === tab.id ? 'apple-segmented-pill-active font-extrabold' : 'text-slate-600 hover:text-slate-900'}`}>{tab.label}</button>
          ))}
        </div>
        <div className="divide-y divide-slate-200/70">
          {filteredReviews.map((rev) => {
            const isLiked = Boolean(helpfulMap[rev.id]);
            const displayHelpful = rev.helpfulCount + (isLiked ? 1 : 0);
            return (
              <article key={rev.id} className="py-3 first:pt-1 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-xs">{rev.authorName}</span>
                      {rev.locationVerified && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-[6px]"><CheckCircle2 className="w-3 h-3" /><span>ساکن تایید مکانی</span></span>}
                    </div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5">{getResidencyLabelFa(rev.residencyType, rev.residencyDuration)} · {rev.createdAtLabelFa}</div>
                  </div>
                  <div className="bg-slate-100 border border-slate-200/80 rounded-[8px] px-2 py-1 text-left shrink-0 tabular-nums"><span className="font-black text-slate-900 text-xs">{toPersianNum(rev.overallQoLScore)}</span><span className="text-[10px] text-slate-500"> / ۱۰</span></div>
                </div>
                <p className="text-slate-700 text-[11.5px] leading-relaxed">{rev.comment}</p>
                {(rev.prosTags.length > 0 || rev.consTags.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    {rev.prosTags.map((pTag, idx) => <span key={`p-${idx}`} className="text-emerald-700 font-semibold">✓ {pTag}</span>)}
                    {rev.consTags.map((cTag, idx) => <span key={`c-${idx}`} className="text-rose-600 font-semibold">· ✗ {cTag}</span>)}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 text-[10.5px] text-slate-500 tabular-nums">
                  <span>هوا {toPersianNum(rev.air)} · آب/برق {toPersianNum(rev.powerWater)} · اینترنت {toPersianNum(rev.internet)} · مترو {toPersianNum(rev.metro)} · امنیت {toPersianNum(rev.security)}</span>
                  <button type="button" onClick={() => setHelpfulMap((prev) => ({ ...prev, [rev.id]: !prev[rev.id] }))} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] border font-bold transition cursor-pointer ${isLiked ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ThumbsUp className="w-3 h-3" /><span>مفید بود ({toPersianNum(displayHelpful)})</span></button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

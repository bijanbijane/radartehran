import React from 'react'; import type { AuthUserSnapshot } from '../platform/auth'; import { getAuthClient } from '../platform/auth'; import { collection, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'; import { db, OperationType, handleFirestoreError } from '../firebase'; import { BargainListing, BubbleReport, BuyerAlertLeadItem, calcDistanceKm, EvaluatedNeighborhood, getHoodMonthlySponsorTariff, Neighborhood, SponsorCrmRequestItem, toPersianNum } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../data/multiCityData'; import { formatBrandCityTitle } from '../utils/geo/cityGeospatialResolver'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { cleanIranianMobile, FeatureFlags, isValidIranianMobile, recordDiagnosticEvent, sanitizeInput } from '../utils/security'; import { isValidNormalizedIranianMobile, normalizeIranianMobileInput } from '../utils/forms/formInputHelpers'; import { classifyPropertyDuplicateCandidate, sanitizeSafeTelHref } from '../utils/marketDataIntegrity'; import { acquireSafeCityLocation } from '../utils/geolocationGuard'; import { detectBrowserEnvironment } from '../utils/inAppBrowserGuard'; import type { ListingMediaObject } from '../utils/objectStorage'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { persistHoodOverrideToCloud, useRadarAdminActions } from './useRadarAdminActions'; export interface UseRadarCrudActionsParams { currentUser: AuthUserSnapshot | null; isVerifiedAdmin: boolean; activeCity: CityId; mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number;
  targetSqm: number; workHubId: string; favoriteHoodIds: number[]; setFavoriteHoodIds: React.Dispatch<React.SetStateAction<number[]>>; featureFlags: FeatureFlags; setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>; neighborhoods: Neighborhood[]; setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>; evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood; selectedHoodId: number; setSelectedHoodId: React.Dispatch<React.SetStateAction<number>>; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; setMobileSheetOpen: React.Dispatch<React.SetStateAction<boolean>>; setActiveTab: React.Dispatch<React.SetStateAction<'scorecard' | 'market' | 'bargains' | 'reviews' | 'vote'>>; setShowGoldPins: React.Dispatch<React.SetStateAction<boolean>>; mapInstanceRef: React.MutableRefObject<any>; allExpansionSeeds: Neighborhood[]; bargainHoodId: number; bargainType: 'خرید' | 'اجاره'; bargainSqm: number; bargainTitle: string; setBargainTitle: React.Dispatch<React.SetStateAction<string>>; bargainStreet: string; setBargainStreet: React.Dispatch<React.SetStateAction<string>>; bargainProposedPrice: number; bargainUploadedMedia: ListingMediaObject[]; setBargainUploadedMedia: React.Dispatch<React.SetStateAction<ListingMediaObject[]>>; setBargainSubmitMsg: React.Dispatch<React.SetStateAction<{ type: 'error' | 'success'; text: string } | null>>;
  targetBargainHood: EvaluatedNeighborhood | Neighborhood; liveBargainCheck: { maxAllowedFor10Percent: number; discountPercent: number; isEligible: boolean; buyerProfitMillion: number }; sponsorHoodId: number; sponsorAgencyName: string; sponsorPhone: string; sponsorSpecialty: string; sponsorExpYears: number; sponsorPlanMonths: 1 | 3; sponsorTrackingCode: string; setSponsorTrackingCode: React.Dispatch<React.SetStateAction<string>>; setSponsorSubmitMsg: React.Dispatch<React.SetStateAction<string>>; sponsorRequests: SponsorCrmRequestItem[]; setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>; alertHoodId: number; alertFullName: string; setAlertFullName: React.Dispatch<React.SetStateAction<string>>; alertPhone: string; setAlertPhone: React.Dispatch<React.SetStateAction<string>>; alertDealType: 'خرید' | 'اجاره'; alertMaxBudget: string; setAlertSubmitMsg: React.Dispatch<React.SetStateAction<string>>;
  buyerLeads: BuyerAlertLeadItem[]; setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>; setAdminUnlocked: React.Dispatch<React.SetStateAction<boolean>>; adminPassInput: string; setAdminPassInput: React.Dispatch<React.SetStateAction<string>>; setAdminPassError: React.Dispatch<React.SetStateAction<string>>; savedAdminPassword: string; setSavedAdminPassword: React.Dispatch<React.SetStateAction<string>>; newAdminPassword: string; setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>; setAdminPassChangeMsg: React.Dispatch<React.SetStateAction<string>>;
  adminEditHoodId: number; adminEditBuySqm: number; adminEditRahn80m: number; setAdminPriceSavedMsg: React.Dispatch<React.SetStateAction<string>>; setBackupStatusMsg: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>; voteAir: number; votePower: number; voteInternet: number; voteMetro: number; voteSecurity: number; voteFlat: number; voteComment: string; setVoteComment: React.Dispatch<React.SetStateAction<string>>; setVoteStatus: React.Dispatch<React.SetStateAction<{ type: 'info' | 'success' | 'warning'; text: string } | null>>;
  setVerifyingGeo: React.Dispatch<React.SetStateAction<boolean>>; setSavingPrefs: React.Dispatch<React.SetStateAction<boolean>>; setPrefsMessage: React.Dispatch<React.SetStateAction<string>>; setLastSyncNotice: React.Dispatch<React.SetStateAction<string>>; setCallingSponsorHoodId: React.Dispatch<React.SetStateAction<number | null>>; setRevealedSponsorPhoneHoodId: React.Dispatch<React.SetStateAction<number | null>>; bestIndicator: { label: string; score: number }; marketReport: BubbleReport; setCopiedShare: React.Dispatch<React.SetStateAction<boolean>>; useLoanBooster?: boolean; deductTenantRahnInBuy?: boolean; buildingAgeSegment?: 'new' | 'mid' | 'older'; }
export function useRadarCrudActions(p: UseRadarCrudActionsParams) { const adminActions = useRadarAdminActions(p); const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const [isSavingBuyerAlert, setIsSavingBuyerAlert] = React.useState<boolean>(false); const handleSubmitBargainListing = async (e: React.FormEvent) => { e.preventDefault(); if (!p.currentUser || (!p.currentUser.emailVerified && !p.currentUser.phoneNumber)) { p.setBargainSubmitMsg({ type: 'error', text: 'برای ثبت عمومی آگهی شکار روی نقشه، ابتدا با حساب کاربری تأییدشده وارد شوید.' }); return; }
    if (!p.liveBargainCheck.isEligible) {
      p.setBargainSubmitMsg({ type: 'error', text: `فقط فایل‌های حداقل ۱۰٪ زیر میانگین محله در رادار طلایی ثبت می‌شوند! (حداکثر قیمت مجاز در ${p.targetBargainHood.name}: ${toPersianNum(p.liveBargainCheck.maxAllowedFor10Percent)} میلیون تومان)` }); return;
    }
    const hoodId = Number(p.bargainHoodId); const sqm = Math.round(Number(p.bargainSqm)); const discountPercent = Math.round(Number(p.liveBargainCheck.discountPercent)); if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || !Number.isFinite(sqm) || sqm < 25 || sqm > 1000 || !Number.isFinite(discountPercent) || discountPercent < 10 || discountPercent > 60) { p.setBargainSubmitMsg({ type: 'error', text: 'مقادیر متراژ، محله یا درصد تخفیف خارج از محدودهٔ مجاز است.' }); return; }
    const cleanTitle = (sanitizeInput(p.bargainTitle, 160) || `واحد ${toPersianNum(sqm)} متری خوش‌نقشه در ${p.targetBargainHood.name}، فروشنده واقعی`).slice(0, 160);
    const cleanStreet = (sanitizeInput(p.bargainStreet, 120) || `فرعی دنج ${p.targetBargainHood.name}`).slice(0, 120);
    const formattedPriceText = (p.bargainType === 'خرید'
      ? `متری ${toPersianNum(p.bargainProposedPrice)} میلیون تومان (کل: ${toPersianNum(((p.bargainProposedPrice * sqm) / 1000).toFixed(2))} میلیارد)`
      : `${toPersianNum(p.bargainProposedPrice)} میلیون تومان رهن کامل`).slice(0, 160); const formattedProfitText = (p.bargainType === 'خرید'
      ? `${toPersianNum((p.liveBargainCheck.buyerProfitMillion / 1000).toFixed(2))} میلیارد تومان سود خریدار نسبت به میانگین ${p.targetBargainHood.name}`
      : `${toPersianNum(p.liveBargainCheck.buyerProfitMillion)} میلیون تومان کمتر از میانگین رهن ${p.targetBargainHood.name}`).slice(0, 160);
    const isDuplicate = (p.targetBargainHood.bargains || []).some((b) => classifyPropertyDuplicateCandidate({ hoodId, type: p.bargainType, sqm, street: cleanStreet, title: cleanTitle, priceText: formattedPriceText }, { ...b, hoodId }).classification === 'confirmed_duplicate'
    ); if (isDuplicate) { p.setBargainSubmitMsg({ type: 'error', text: 'این آگهی با همین مشخصات و آدرس پیش‌تر در این محله ثبت شده است.' }); return; }
    if (p.bargainUploadedMedia.length > 0) {
      p.setBargainSubmitMsg({ type: 'error', text: 'ذخیره‌سازی رسانه هنوز فعال نیست؛ تا زمان تأمین ارائه‌دهنده ذخیره‌سازی، آگهی را بدون عکس و ویدیو ثبت کنید.' });
      return;
    }
    try {
      const response = await fetch('/api/v1/market/bargains', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          cityId: p.activeCity,
          hoodId,
          title: cleanTitle,
          listingType: p.bargainType,
          sqm,
          priceMillions: Number(p.bargainProposedPrice),
          priceText: formattedPriceText,
          discountPercent,
          buyerProfitText: formattedProfitText,
          street: cleanStreet,
          mediaObjectIds: [],
        }),
      });
      const result = await response.json().catch(() => null) as {
        status?: string;
        durable?: boolean;
        message?: string;
        bargain?: { id?: string; status?: string };
      } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true || !result.bargain?.id) {
        throw new Error(result?.message || 'ثبت پایدار آگهی در Cloudflare D1 تأیید نشد.');
      }
      p.setBargainSubmitMsg({
        type: 'success',
        text: `آگهی شکار برای محله ${p.targetBargainHood.name} ثبت شد و تا تأیید مدیریت در نقشه عمومی نمایش داده نمی‌شود.`,
      });
    } catch (error) {
      p.setBargainSubmitMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'ثبت آگهی در Cloudflare D1 انجام نشد.',
      });
      return;
    }
    p.setSelectedHoodId(hoodId); p.setActiveTab('bargains'); if (p.isVerifiedAdmin) p.setShowGoldPins(true); if (p.mapInstanceRef.current) p.mapInstanceRef.current.flyTo([p.targetBargainHood.lat, p.targetBargainHood.lng], 13, { duration: 0.7 }); p.setBargainTitle(''); p.setBargainStreet(''); p.setBargainUploadedMedia([]);
  }; const handleReserveSponsor = async (e: React.FormEvent) => { e.preventDefault(); const cleanAgency = sanitizeInput(p.sponsorAgencyName, 120); if (cleanAgency.length < 2 || !p.sponsorPhone.trim()) { p.setSponsorSubmitMsg('لطفاً نام معتبر دفتر املاک (حداقل ۲ کاراکتر) و شماره تماس را وارد نمایید.');
      return; }
    const targetHood = p.evaluatedNeighborhoods.find((n) => n.id === p.sponsorHoodId) || p.neighborhoods.find((n) => n.id === p.sponsorHoodId) || p.evaluatedNeighborhoods[0]; const cleanPhone = cleanIranianMobile(p.sponsorPhone) || sanitizeInput(p.sponsorPhone, 30);
    const cleanSpec = (sanitizeInput(p.sponsorSpecialty, 140) || `کارشناس رسمی خرید و اجاره در ${targetHood.name}`).slice(0, 140);
    const expYears = Math.min(60, Math.max(1, Number(p.sponsorExpYears) || 10)); const tariff = getHoodMonthlySponsorTariff(targetHood);
    const activePlanMonths: 1 | 3 = p.featureFlags.enableSponsorBilling ? p.sponsorPlanMonths : 1; const totalPayableMillion = activePlanMonths === 3 ? Math.round(tariff * 3 * 0.8 * 10) / 10 : tariff;
    const cleanTracking = sanitizeInput(p.sponsorTrackingCode, 60) || `TR-${Date.now().toString().slice(-6)}`;
    const durationDays = activePlanMonths === 3 ? 90 : 30; const expiresAtIso = new Date(Date.now() + durationDays * 86400000).toISOString();
    const initialSponsorStatus: 'pending' | 'approved' = p.isVerifiedAdmin ? 'approved' : 'pending';
    const newCrmItem: SponsorCrmRequestItem = {
      id: `crm-${Date.now()}`, hoodId: targetHood.id, hoodName: targetHood.name,
      agencyName: cleanAgency, phone: cleanPhone, specialty: cleanSpec,
      experienceYears: expYears, monthlyTariffMillion: tariff, planMonths: activePlanMonths,
      totalPayableMillion, trackingCode: cleanTracking, expiresAtIso,
      status: initialSponsorStatus, createdAtFa: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
    };
    if (!p.currentUser || (!p.currentUser.emailVerified && !p.currentUser.phoneNumber)) { p.setSponsorSubmitMsg('ثبت درخواست اسپانسر نیازمند ورود با حساب کاربری تأییدشده است.'); return; }
    let reqDocId = `${p.currentUser.uid}_${Date.now()}`; let persistedOnServer = false;
    try {
      
      const operationCity = resolveCityIdForNeighborhood(targetHood.id);
      const apiRes = await fetch('/api/sponsors/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ hoodId: targetHood.id, hoodName: targetHood.name, city: operationCity, agencyName: cleanAgency, phone: cleanPhone, specialty: cleanSpec, experienceYears: expYears, planMonths: activePlanMonths }), cache: 'no-store' });
      const apiJson = (await apiRes.json().catch(() => null)) as { status?: string; message?: string; request?: { id?: string; monthlyTariffMillion?: number; totalPayableMillion?: number; trackingCode?: string } } | null;
      if (apiRes.status === 400 || apiRes.status === 409) { p.setSponsorSubmitMsg(apiJson?.message || 'اطلاعات درخواست اسپانسر نامعتبر است.'); return; }
      if (apiRes.ok && apiJson?.status === 'ok' && apiJson.request) {
        persistedOnServer = true; if (apiJson.request.id) reqDocId = apiJson.request.id; if (typeof apiJson.request.monthlyTariffMillion === 'number') newCrmItem.monthlyTariffMillion = apiJson.request.monthlyTariffMillion; if (typeof apiJson.request.totalPayableMillion === 'number') newCrmItem.totalPayableMillion = apiJson.request.totalPayableMillion; if (apiJson.request.trackingCode) newCrmItem.trackingCode = apiJson.request.trackingCode; newCrmItem.id = `cloud-${reqDocId}`;
        if (p.isVerifiedAdmin) { await updateDoc(doc(db, 'sponsorRequests', reqDocId), { status: 'approved', expiresAtIso }).catch(() => { recordDiagnosticEvent('Sponsor', `Admin auto-approve updateDoc deferred for ${reqDocId}`, 'fallback'); }); }
      }
    } catch { /* fallback to Firestore SDK */ }
    if (!persistedOnServer) {
      try {
        await setDoc(doc(db, 'sponsorRequests', reqDocId), { hoodId: targetHood.id, hoodName: targetHood.name.slice(0, 80), agencyName: cleanAgency, phone: cleanPhone, specialty: cleanSpec, experienceYears: expYears, monthlyTariffMillion: tariff, planMonths: activePlanMonths, totalPayableMillion, trackingCode: cleanTracking, ...(p.isVerifiedAdmin ? { expiresAtIso } : {}), status: initialSponsorStatus, createdAt: serverTimestamp() });
      } catch (err) {
        p.setSponsorSubmitMsg('ثبت درخواست اسپانسر در پایگاه داده انجام نشد.');
        try { handleFirestoreError(err, OperationType.WRITE, `sponsorRequests/${reqDocId}`); } catch { /* local */ }
        return;
      }
    }
    p.setSponsorRequests((prev) => [newCrmItem, ...(prev || [])]);
    if (initialSponsorStatus === 'approved') {
      const planType = p.featureFlags.enableSponsorBilling ? (activePlanMonths === 3 ? 'paid_3m' : 'paid_1m') : 'free';
      const newSponsorObj = { name: cleanAgency, phone: cleanPhone, specialty: cleanSpec, experienceYears: expYears, expiresAtIso, planType: planType as 'free' | 'paid_1m' | 'paid_3m' };
      await persistHoodOverrideToCloud(targetHood.id, (targetHood as EvaluatedNeighborhood).baseBuyPerSqm ?? targetHood.buyPerSqm, Math.max(50, targetHood.rahn80m), newSponsorObj).catch(() => {});
      p.setNeighborhoods((prev) => !prev.some((n) => n.id === p.sponsorHoodId)
        ? [...prev, { ...targetHood, buyPerSqm: targetHood.baseBuyPerSqm ?? targetHood.buyPerSqm, sponsor: newSponsorObj }]
        : prev.map((n) => (n.id !== p.sponsorHoodId ? n : { ...n, sponsor: newSponsorObj })));
    }
    p.setSelectedHoodId(p.sponsorHoodId);
    p.setSponsorSubmitMsg(
      initialSponsorStatus === 'approved'
        ? `فاکتور ${toPersianNum(activePlanMonths)} ماهه (${toPersianNum(totalPayableMillion)} میلیون تومان - کد پیگیری: ${cleanTracking}) در پنل CRM ثبت شد و تابلوی انحصاری «حامی رسمی محله ${targetHood.name}» به مدت ${toPersianNum(durationDays)} روز فعال گردید.`
        : `درخواست اسپانسری ${toPersianNum(activePlanMonths)} ماهه (${toPersianNum(totalPayableMillion)} میلیون تومان - کد پیگیری: ${cleanTracking}) برای محله ${targetHood.name} ثبت شد و پس از تایید مدیریت فعال می‌گردد.`
    );
    p.setSponsorTrackingCode('');
    if (p.mapInstanceRef.current) p.mapInstanceRef.current.flyTo([targetHood.lat, targetHood.lng], 13, { duration: 0.6 });
  };
  const handleRegisterBuyerAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBuyerAlert) return;
    if (!p.currentUser || (!p.currentUser.emailVerified && !p.currentUser.phoneNumber)) {
      p.setAlertSubmitMsg('ثبت شماره خریدار نیازمند ورود به حساب کاربری تأییدشده است.'); return;
    }
    if (!p.alertPhone.trim() || !p.alertFullName.trim()) {
      p.setAlertSubmitMsg('لطفاً نام و شماره موبایل معتبر ۱۱ رقمی ایران (شروع با ۰۹) وارد نمایید.'); return;
    }
    const targetHood = p.evaluatedNeighborhoods.find((n) => n.id === p.alertHoodId) || p.neighborhoods.find((n) => n.id === p.alertHoodId) || p.evaluatedNeighborhoods[0];
    const cleanName = sanitizeInput(p.alertFullName, 100);
    const cleanPhone = normalizeIranianMobileInput(p.alertPhone);
    if (!isValidNormalizedIranianMobile(cleanPhone) || !isValidIranianMobile(cleanPhone) || cleanName.trim().length < 2) {
      p.setAlertSubmitMsg('لطفاً نام و شماره موبایل معتبر ۱۱ رقمی ایران (شروع با ۰۹) وارد نمایید.'); return;
    }
    const cleanBudget = (sanitizeInput(p.alertMaxBudget, 120) || 'متناسب با میانگین محله').slice(0, 120);
    setIsSavingBuyerAlert(true); p.setAlertSubmitMsg('در حال ثبت امن درخواست...');
    try {
      
      let serverErrorMessage = '';
      try {
        const response = await fetch('/api/buyer-alerts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            city: resolveCityIdForNeighborhood(targetHood.id), hoodId: targetHood.id, hoodName: targetHood.name,
            fullName: cleanName, phone: cleanPhone, dealType: p.alertDealType, maxBudgetText: cleanBudget,
            privacyConsent: true, consentVersion: 'buyer-alert-2026-10-v1',
          }),
          cache: 'no-store',
        });
        const result = (await response.json().catch(() => null)) as { status?: string; message?: string; durable?: boolean } | null;
        if (response.ok && result?.status === 'ok' && result?.durable === true) {
          if (p.isVerifiedAdmin) {
            p.setBuyerLeads((prev) => [{
              id: `lead-${Date.now()}`, hoodId: targetHood.id, hoodName: targetHood.name,
              fullName: cleanName, phone: cleanPhone, dealType: p.alertDealType,
              maxBudgetText: cleanBudget, createdAtFa: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
            }, ...(prev || [])]);
          }
          p.setAlertSubmitMsg(result.message || `درخواست شما با شماره ${toPersianNum(cleanPhone)} برای محلهٔ ${targetHood.name} با مهلت ۹۰ روزه ثبت شد.`);
          p.setAlertFullName(''); p.setAlertPhone('');
          return;
        }
        if (!response.ok || result?.status !== 'ok' || result?.durable !== true) {
          serverErrorMessage = result?.message || '';
        }
      } catch { /* Network failure: proceed to client-side fallback below */ }
      const alertDocId = `${p.currentUser.uid}_hood_${targetHood.id}`;
      try {
        const alertRef = doc(db, 'buyerAlerts', alertDocId);
        const existingAlert = await getDoc(alertRef);
        const mutableAlertFields = { hoodName: targetHood.name.slice(0, 80), fullName: cleanName, phone: cleanPhone, dealType: p.alertDealType, maxBudgetText: cleanBudget };
        if (existingAlert.exists()) await updateDoc(alertRef, { ...mutableAlertFields, updatedAt: serverTimestamp() });
        else await setDoc(alertRef, { ...mutableAlertFields, userId: p.currentUser.uid, hoodId: targetHood.id, consentVersion: 'buyer-alert-2026-10-v1', consentAt: serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)), createdAt: serverTimestamp() });
        p.setAlertSubmitMsg(`درخواست شما با شماره ${toPersianNum(cleanPhone)} برای محلهٔ ${targetHood.name} با مهلت ۹۰ روزه ثبت شد.`);
        p.setAlertFullName(''); p.setAlertPhone('');
      } catch (err) {
        try { handleFirestoreError(err, OperationType.WRITE, `buyerAlerts/${alertDocId}`); } catch { /* ignore */ }
        p.setAlertSubmitMsg(serverErrorMessage || 'درخواست در پایگاه داده پایدار ذخیره نشد. لطفاً دوباره تلاش کنید.');
      }
    } catch {
      p.setAlertSubmitMsg('ارتباط با سرور برقرار نشد؛ درخواست شما ثبت نشد.');
    } finally { setIsSavingBuyerAlert(false); }
  };
  const submitVoteData = async (locationVerified: boolean, statusMsg: string) => {
    const voteCooldownKey = `${p.currentUser?.uid || 'guest'}_${p.selectedHood.id}`;
    const recordLocalVoteCooldown = () => {
      try {
        const votedMap = JSON.parse(localStorage.getItem('tehran_radar_voted_hoods_v1') || '{}');
        votedMap[voteCooldownKey] = Date.now();
        localStorage.setItem('tehran_radar_voted_hoods_v1', JSON.stringify(votedMap));
      } catch { /* ignore */ }
    };
    if (!p.currentUser) {
      p.setVoteStatus({ type: 'warning', text: 'رأی مهمان در میانگین مشترک محله ثبت نمی‌شود. برای اثرگذاری، با حساب کاربری تأییدشده وارد شوید.' });
      return;
    }
    if (!p.currentUser.emailVerified && !p.currentUser.phoneNumber) {
      p.setVoteStatus({ type: 'warning', text: 'برای ثبت رأی در فضای ابری، ایمیل حساب کاربری شما باید تأیید شده باشد.' });
      return;
    }
    const cleanComment = (sanitizeInput(p.voteComment, 500) || 'ثبت امتیاز کیفیت زندگی توسط ساکن محله').slice(0, 500);
    const cleanName = (sanitizeInput(p.currentUser.displayName, 100) || 'کاربر تاییدشده').slice(0, 100);
    try {
      const response = await fetch('/api/v1/market/votes', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          cityId: p.activeCity,
          hoodId: p.selectedHood.id,
          air: Number(p.voteAir),
          powerWater: Number(p.votePower),
          internet: Number(p.voteInternet),
          metro: Number(p.voteMetro),
          security: Number(p.voteSecurity),
          flatTerrain: Number(p.voteFlat),
          comment: cleanComment,
          userDisplayName: cleanName,
          locationVerified: Boolean(locationVerified),
        }),
      });
      const result = await response.json().catch(() => null) as { status?: string; durable?: boolean; message?: string } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true) {
        throw new Error(result?.message || 'ذخیره پایدار رأی در Cloudflare D1 تأیید نشد.');
      }
      recordLocalVoteCooldown();
      p.setVoteComment('');
      p.setVoteStatus({ type: 'success', text: statusMsg });
    } catch {
      p.setVoteStatus({ type: 'warning', text: 'ثبت رأی در پایگاه داده Cloudflare انجام نشد. اتصال حساب و وضعیت سرویس را بررسی کنید.' });
    }
  };
  const handleResidentVote = (useGeolocation: boolean) => {
    const voteCooldownKey = `${p.currentUser?.uid || 'guest'}_${p.selectedHood.id}`;
    try {
      const votedMap = JSON.parse(localStorage.getItem('tehran_radar_voted_hoods_v1') || '{}');
      if (Date.now() - Number(votedMap[voteCooldownKey] || 0) < 86400000) {
        p.setVoteStatus({ type: 'warning', text: `شما در ۲۴ ساعت گذشته برای محله ${p.selectedHood.name} رای ثبت کردهاید. هر کاربر روزانه یک بار امکان ثبت امتیاز در هر محله را دارد.` });
        return;
      }
    } catch { /* ignore */ }
    if (useGeolocation && navigator.geolocation) {
      p.setVerifyingGeo(true);
      p.setVoteStatus({ type: 'info', text: 'در حال بررسی موقعیت مکانی مرورگر برای تایید حضور در محله...' });
      void acquireSafeCityLocation(p.activeCity, 7000).then((geoRes) => {
        p.setVerifyingGeo(false);
        if (geoRes.status !== 'SUCCESS_INSIDE_TEHRAN' && geoRes.status !== 'SUCCESS_INSIDE_CITY') { submitVoteData(false, `${geoRes.persianMessage} رای شما به صورت عادی ثبت شد.`); return; }
        const dist = calcDistanceKm(geoRes.coordinates.lat, geoRes.coordinates.lng, p.selectedHood.lat, p.selectedHood.lng);
        const isInside = dist !== null && dist <= 4.5;
        submitVoteData(isInside, isInside
          ? `حضور شما در محدوده ${p.selectedHood.name} (فاصله ${toPersianNum(dist)} کیلومتر) تایید شد و امتیاز شما با ضریب ۲ برابر ثبت گردید.`
          : `موقعیت شما (${toPersianNum(dist)} کیلومتر تا مرکز ${p.selectedHood.name}) بررسی شد و رای شما در کارنامه محله ثبت گردید.`);
      });
    } else {
      submitVoteData(false, `رای شما برای محله ${p.selectedHood.name} با موفقیت ثبت و میانگین امتیازها به‌روزرسانی شد.`);
    }
  };
  const handleLocateNearestHood = () => {
    void acquireSafeCityLocation(p.activeCity, 6000).then((geoRes) => {
      if (geoRes.status !== 'SUCCESS_INSIDE_TEHRAN' && geoRes.status !== 'SUCCESS_INSIDE_CITY') { p.setLastSyncNotice(geoRes.persianMessage); return; }
      let bestHood = p.evaluatedNeighborhoods[0], minDist = Infinity;
      for (const h of p.evaluatedNeighborhoods) {
        const d = calcDistanceKm(geoRes.coordinates.lat, geoRes.coordinates.lng, h.lat, h.lng);
        if (d !== null && d < minDist) { minDist = d; bestHood = h; }
      }
      if (bestHood) {
        p.onSelectNeighborhood(bestHood); p.setMobileSheetOpen(true);
        p.setLastSyncNotice(`نزدیک‌ترین محله به موقعیت شما: ${bestHood.name} (${toPersianNum(minDist)} کیلومتر)`);
      }
    });
  };
  const intlQuerySuffix = `${locale !== 'fa' ? `&lang=${locale}` : ''}${intlCurrency !== 'IRT' ? `&currency=${intlCurrency}` : ''}${areaUnit !== 'sqm' ? `&unit=${areaUnit}` : ''}`;
  const handleCopyBudgetShareLink = () => {
    if (!p.selectedHood) return;
    const hubQuery = p.workHubId && p.workHubId !== 'none' ? `&hub=${encodeURIComponent(p.workHubId)}` : '';
    const leverageQuery = `${p.useLoanBooster ? '&loan=1' : ''}${p.deductTenantRahnInBuy ? '&rahnDeduct=1' : ''}${p.buildingAgeSegment && p.buildingAgeSegment !== 'new' ? `&age=${p.buildingAgeSegment}` : ''}`;
    const url = `${window.location.origin}${window.location.pathname}?city=${p.activeCity}&hood=${p.selectedHood.id}&mode=${p.mode}&dep=${p.deposit}&rent=${p.monthlyRent}&buy=${p.buyTotalBudget}&sqm=${p.targetSqm}${hubQuery}${leverageQuery}${intlQuerySuffix}`;
    navigator.clipboard?.writeText(url).catch(() => {}); p.setPrefsMessage('لینک نقشه با بودجه شما کپی شد!'); setTimeout(() => p.setPrefsMessage(''), 2500);
  };
  const handleSaveUserPreferences = async () => {
    let targetUid = p.currentUser?.uid;
    if (!targetUid) {
      const envCheck = detectBrowserEnvironment();
      if (envCheck.isRestrictedWebView) { p.setPrefsMessage(envCheck.recommendedActionPersian); return; }
      getAuthClient().startGoogleLogin(`${window.location.pathname}${window.location.search}`);
      return;
    }
    p.setSavingPrefs(true);
    try {
      const response = await fetch('/api/v1/market/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          cityId: p.activeCity,
          mode: p.mode,
          deposit: Math.min(100000, Math.max(0, Number(p.deposit) || 0)),
          monthlyRent: Math.min(1000, Math.max(0, Number(p.monthlyRent) || 0)),
          buyTotalBudget: Math.min(1000000, Math.max(500, Number(p.buyTotalBudget) || 500)),
          targetSqm: Math.min(1000, Math.max(20, Number(p.targetSqm) || 80)),
          workHubId: (p.workHubId || 'none').slice(0, 40),
          favoriteHoodIds: p.favoriteHoodIds.filter((id) => Number.isInteger(id) && id >= 1 && id <= 999).slice(0, 25),
        }),
      });
      const result = await response.json().catch(() => null) as { status?: string; durable?: boolean; message?: string } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true) {
        throw new Error(result?.message || 'ذخیره پایدار تنظیمات در Cloudflare D1 تأیید نشد.');
      }
      p.setPrefsMessage('ذخیره شد'); setTimeout(() => p.setPrefsMessage(''), 2500);
    } catch {
      p.setPrefsMessage('ذخیره تنظیمات در Cloudflare انجام نشد. اتصال حساب و وضعیت سرویس را بررسی کنید.');
    } finally { p.setSavingPrefs(false); } }; const handleTrackSponsorCall = async (hood: Neighborhood, sponsor: { name: string; phone: string }) => { p.setCallingSponsorHoodId(hood.id); p.setRevealedSponsorPhoneHoodId(hood.id); navigator.clipboard?.writeText(sponsor.phone).catch(() => {});
    p.setLastSyncNotice(`شماره تماس ${sponsor.name} (${sponsor.phone}) کپی و نمایش داده شد`);
    try { await fetch('/api/track-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hoodId: hood.id, hoodName: hood.name, agencyName: sponsor.name, phone: sponsor.phone }) });
    } catch { /* ignore */ } finally { setTimeout(() => p.setCallingSponsorHoodId(null), 1500); }
    if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) { const safeTel = sanitizeSafeTelHref(sponsor.phone); if (safeTel) { const telAnchor = document.createElement('a'); telAnchor.href = safeTel; telAnchor.click(); } } }; const handleCopyShareCard = () => { if (!p.selectedHood) return; const cityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
    const cityPrefix = p.activeCity !== 'tehran' ? `city=${p.activeCity}&` : ''; const shareUrl = `${window.location.origin}/?${cityPrefix}hood=${p.selectedHood.id}${intlQuerySuffix}`;
    const unitBuy = convertPricePerSqmToUnit(p.selectedHood.buyPerSqm, areaUnit); const unitLabel = formatAreaUnitLabel(areaUnit); const buyFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)})` : ''; const rahnFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.selectedHood.rahn80m, intlCurrency, locale)})` : '';
    const topBargain = p.selectedHood.bargains?.[0];
    const bargainLine = topBargain ? `${topBargain.title} (${topBargain.priceText})` : `${unitLabel} ${toPersianNum(Math.round(unitBuy * 0.88))} میلیون تومان (۱۲٪ زیر میانگین محله)`;
    const shareText = `کارنامه محله ${p.selectedHood.name} (${p.selectedHood.zone}) | ${formatBrandCityTitle(cityNameFa)}\nامتیاز کیفیت زندگی: ${toPersianNum(p.selectedHood.overallScore)} از ۱۰\nبهترین شاخص محله: ${p.bestIndicator.label} (${toPersianNum(p.bestIndicator.score)} از ۱۰)\nمیانگین خرید (${unitLabel}): ${toPersianNum(unitBuy)} میلیون تومان${buyFx}\nرهن کامل ۸۰ متری: ${toPersianNum(p.selectedHood.rahn80m)} میلیون تومان${rahnFx}\nوضعیت بازار: ${p.marketReport.badgeText}\nفایل زیر قیمت امروز: ${bargainLine}\nلینک مستقیم کارنامه محله ${p.selectedHood.name}: ${shareUrl}`;
    navigator.clipboard?.writeText(shareText).catch(() => {}); p.setCopiedShare(true); setTimeout(() => p.setCopiedShare(false), 2500); }; return { handleSubmitBargainListing, handleReserveSponsor, handleRegisterBuyerAlert, isSavingBuyerAlert, ...adminActions, handleResidentVote, handleLocateNearestHood, handleCopyBudgetShareLink, handleSaveUserPreferences, handleTrackSponsorCall, handleCopyShareCard, }; }
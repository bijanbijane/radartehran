import React from 'react'; import type { AuthUserSnapshot } from '../platform/auth'; import { getAuthClient } from '../platform/auth'; import { BubbleReport, BuyerAlertLeadItem, calcDistanceKm, EvaluatedNeighborhood, Neighborhood, SponsorCrmRequestItem, toPersianNum } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { formatBrandCityTitle } from '../utils/geo/cityGeospatialResolver'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { FeatureFlags, sanitizeInput } from '../utils/security'; import { classifyPropertyDuplicateCandidate, sanitizeSafeTelHref } from '../utils/marketDataIntegrity'; import { acquireSafeCityLocation } from '../utils/geolocationGuard'; import { detectBrowserEnvironment } from '../utils/inAppBrowserGuard'; import type { ListingMediaObject } from '../utils/objectStorage'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { useRadarAdminActions } from './useRadarAdminActions'; export interface UseRadarCrudActionsParams { currentUser: AuthUserSnapshot | null; isVerifiedAdmin: boolean; activeCity: CityId; mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number;
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': window.crypto.randomUUID() },
        body: JSON.stringify({
          cityId: p.activeCity,
          hoodId,
          hoodName: p.targetBargainHood.name,
          title: cleanTitle,
          type: p.bargainType,
          sqm,
          priceMillions: p.bargainType === 'خرید' ? Number(p.bargainProposedPrice) * sqm : Number(p.bargainProposedPrice),
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
        bargainId?: string; listingStatus?: string;
      } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true || !result.bargainId) {
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
  }; const handleReserveSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAgency = sanitizeInput(p.sponsorAgencyName, 120);
    const cleanPhone = sanitizeInput(p.sponsorPhone, 30);
    if (cleanAgency.length < 2 || !cleanPhone) {
      p.setSponsorSubmitMsg('نام دفتر املاک و شماره تماس معتبر را وارد کنید.');
      return;
    }
    if (!p.currentUser || (!p.currentUser.emailVerified && !p.currentUser.phoneNumber)) {
      p.setSponsorSubmitMsg('ثبت درخواست اسپانسر نیازمند ورود با حساب تأییدشده است.');
      return;
    }
    const targetHood = p.evaluatedNeighborhoods.find((n) => n.id === p.sponsorHoodId)
      || p.neighborhoods.find((n) => n.id === p.sponsorHoodId)
      || p.evaluatedNeighborhoods[0];
    const cleanSpec = sanitizeInput(p.sponsorSpecialty, 120);
    const experienceYears = Math.min(80, Math.max(0, Number(p.sponsorExpYears) || 0));
    const monthlyTariffMillion = getHoodMonthlySponsorTariff(targetHood);
    const planMonths: 1 | 3 = p.featureFlags.enableSponsorBilling && p.sponsorPlanMonths === 3 ? 3 : 1;
    const totalPayableMillion = planMonths === 3
      ? Math.round(monthlyTariffMillion * 3 * 0.8 * 10) / 10
      : monthlyTariffMillion;
    const expiresAtIso = new Date(Date.now() + (planMonths === 3 ? 90 : 30) * 86400000).toISOString();
    const trackingCode = sanitizeInput(p.sponsorTrackingCode, 60) || `TR-${Date.now().toString().slice(-6)}`;
    try {
      const response = await fetch('/api/v1/market/sponsor-requests', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': window.crypto.randomUUID(),
        },
        body: JSON.stringify({
          cityId: p.activeCity,
          hoodId: targetHood.id,
          hoodName: targetHood.name,
          agencyName: cleanAgency,
          phone: cleanPhone,
          specialty: cleanSpec,
          experienceYears,
          monthlyTariffMillion,
          planMonths,
          totalPayableMillion,
          trackingCode,
          expiresAtIso: p.isVerifiedAdmin ? expiresAtIso : undefined,
        }),
      });
      const result = await response.json().catch(() => null) as {
        status?: string; durable?: boolean; requestId?: string; requestStatus?: string;
        trackingCode?: string; monthlyTariffMillion?: number; totalPayableMillion?: number; message?: string; code?: string;
      } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true || !result.requestId) {
        throw new Error(result?.code === 'MARKET_PII_ENCRYPTION_UNAVAILABLE'
          ? 'رمزهای رمزنگاری اطلاعات تماس در Cloudflare تنظیم نشده‌اند؛ شماره تماس ذخیره نشد.'
          : result?.message || 'ثبت درخواست اسپانسر در Cloudflare D1 تأیید نشد.');
      }
      const approved = result.requestStatus === 'approved';
      const newItem: SponsorCrmRequestItem = {
        id: `cloud-${result.requestId}`,
        hoodId: targetHood.id,
        hoodName: targetHood.name,
        agencyName: cleanAgency,
        phone: cleanPhone,
        specialty: cleanSpec,
        experienceYears,
        monthlyTariffMillion: Number(result.monthlyTariffMillion ?? monthlyTariffMillion),
        planMonths,
        totalPayableMillion: Number(result.totalPayableMillion ?? totalPayableMillion),
        trackingCode: result.trackingCode || trackingCode,
        ...(approved ? { expiresAtIso } : {}),
        status: approved ? 'approved' : 'pending',
        createdAtFa: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
      };
      p.setSponsorRequests((previous) => [newItem, ...(previous || [])]);
      if (approved) {
        const planType = p.featureFlags.enableSponsorBilling ? (planMonths === 3 ? 'paid_3m' : 'paid_1m') : 'free';
        const sponsor = {
          name: cleanAgency,
          phone: cleanPhone,
          specialty: cleanSpec,
          experienceYears,
          expiresAtIso,
          planType: planType as 'free' | 'paid_1m' | 'paid_3m',
        };
        p.setNeighborhoods((previous) => previous.map((hood) => hood.id === targetHood.id ? { ...hood, sponsor } : hood));
      }
      p.setSelectedHoodId(targetHood.id);
      p.setSponsorSubmitMsg(approved
        ? `درخواست اسپانسر برای محله ${targetHood.name} در Cloudflare D1 تأیید و ثبت شد. کد پیگیری: ${newItem.trackingCode}`
        : `درخواست اسپانسر برای محله ${targetHood.name} در Cloudflare D1 ثبت شد و پس از تأیید مدیریت فعال می‌شود.`);
      p.setSponsorTrackingCode('');
    } catch (error) {
      p.setSponsorSubmitMsg(error instanceof Error ? error.message : 'ارتباط با Cloudflare برقرار نشد؛ درخواست ثبت نشد.');
    }
  };
  const handleRegisterBuyerAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBuyerAlert) return;
    if (!p.currentUser || (!p.currentUser.emailVerified && !p.currentUser.phoneNumber)) {
      p.setAlertSubmitMsg('ثبت درخواست خریدار نیازمند ورود با حساب تأییدشده است.');
      return;
    }
    const cleanName = sanitizeInput(p.alertFullName, 100);
    const cleanPhone = sanitizeInput(p.alertPhone, 30);
    if (cleanName.length < 2 || !cleanPhone) {
      p.setAlertSubmitMsg('نام و شماره موبایل معتبر را وارد کنید.');
      return;
    }
    const cleanBudget = sanitizeInput(p.alertMaxBudget, 120);
    const asciiBudget = cleanBudget
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const budgetMatch = asciiBudget.match(/[0-9]+(?:\\.[0-9]+)?/);
    const parsedBudget = budgetMatch ? Number(budgetMatch[0]) : NaN;
    const maxBudgetMillion = /میلیارد/.test(cleanBudget) ? parsedBudget * 1000 : parsedBudget;
    if (!Number.isFinite(maxBudgetMillion) || maxBudgetMillion <= 0) {
      p.setAlertSubmitMsg('حداکثر بودجه را به‌صورت عددی و با واحد میلیون یا میلیارد تومان وارد کنید.');
      return;
    }
    const targetHood = p.evaluatedNeighborhoods.find((n) => n.id === p.alertHoodId)
      || p.neighborhoods.find((n) => n.id === p.alertHoodId)
      || p.evaluatedNeighborhoods[0];
    setIsSavingBuyerAlert(true);
    p.setAlertSubmitMsg('در حال ثبت امن درخواست...');
    try {
      const response = await fetch('/api/v1/market/buyer-alerts', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': window.crypto.randomUUID(),
        },
        body: JSON.stringify({
          cityId: p.activeCity,
          hoodId: targetHood.id,
          fullName: cleanName,
          phone: cleanPhone,
          dealType: p.alertDealType,
          maxBudgetMillion,
          consentVersion: 'buyer-alert-2026-10-v1',
        }),
      });
      const result = await response.json().catch(() => null) as {
        status?: string; durable?: boolean; alertId?: string; expiresAtIso?: string; message?: string; code?: string;
      } | null;
      if (!response.ok || result?.status !== 'ok' || result.durable !== true || !result.alertId) {
        throw new Error(result?.code === 'MARKET_PII_ENCRYPTION_UNAVAILABLE'
          ? 'رمزهای رمزنگاری اطلاعات تماس در Cloudflare تنظیم نشده‌اند؛ شماره تماس ذخیره نشد.'
          : result?.message || 'ثبت درخواست خریدار در Cloudflare D1 تأیید نشد.');
      }
      if (p.isVerifiedAdmin) {
        p.setBuyerLeads((previous) => [{
          id: `cloud-${result.alertId}`,
          hoodId: targetHood.id,
          hoodName: targetHood.name,
          fullName: cleanName,
          phone: cleanPhone,
          dealType: p.alertDealType,
          maxBudgetText: cleanBudget,
          createdAtFa: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
          createdAtIso: new Date().toISOString(),
          expiresAtIso: result.expiresAtIso || '',
          consentVersion: 'buyer-alert-2026-10-v1',
          submittedByUid: p.currentUser!.uid,
        }, ...(previous || [])]);
      }
      p.setAlertSubmitMsg(result.message || `درخواست خریدار برای محله ${targetHood.name} در Cloudflare D1 ثبت شد.`);
      p.setAlertFullName('');
      p.setAlertPhone('');
    } catch (error) {
      p.setAlertSubmitMsg(error instanceof Error ? error.message : 'ارتباط با Cloudflare برقرار نشد؛ درخواست ثبت نشد.');
    } finally {
      setIsSavingBuyerAlert(false);
    }
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
import React from 'react';
import { approveSponsorRequest, batchSaveNeighborhoodOverrides, buildSanitizedSponsorMap, deleteSponsorRequest, saveFeatureFlags, saveNeighborhoodOverride, updateSponsorRequestExpiry, type SaveNeighborhoodOverrideInput } from '../data/neighborhoodRemoteRepository';
import { BuyerAlertLeadItem, EvaluatedNeighborhood, INITIAL_NEIGHBORHOODS, Neighborhood, SponsorCrmRequestItem, toPersianNum, validateAndBuildRestoredState, } from '../data/neighborhoods'; import { computeExtendedSponsorExpirationIso, computeSponsorExpirationIso, escapeCsvCell, FeatureFlags, } from '../utils/security'; import { validateAdminLockPassword } from '../utils/forms/formInputHelpers'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, getStoredRadarLocale } from '../utils/areaUnit'; 
export const persistHoodOverrideToCloud = async (overrideHoodId: number, buyVal: number, rahnVal: number, rawSponsorVal?: any, cityId = 'tehran'): Promise<void> => {
  const sponsorVal = rawSponsorVal === null ? null : rawSponsorVal !== undefined ? buildSanitizedSponsorMap(rawSponsorVal) : undefined;
  const payload: SaveNeighborhoodOverrideInput = {
    cityId,
    hoodId: overrideHoodId,
    buyPerSqm: buyVal,
    rahn80m: rahnVal,
    pros: undefined,
    cons: undefined,
    ...(sponsorVal !== undefined ? { sponsor: sponsorVal } : {}),
  };
  await saveNeighborhoodOverride(payload);
};
export interface UseRadarAdminActionsParams { isVerifiedAdmin: boolean; activeCity: string; neighborhoods: Neighborhood[]; setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>; evaluatedNeighborhoods: EvaluatedNeighborhood[]; allExpansionSeeds: Neighborhood[]; featureFlags: FeatureFlags; setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>; favoriteHoodIds: number[]; setFavoriteHoodIds: React.Dispatch<React.SetStateAction<number[]>>; sponsorRequests: SponsorCrmRequestItem[]; setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>; buyerLeads: BuyerAlertLeadItem[]; setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>; setAdminUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  adminPassInput: string; setAdminPassInput: React.Dispatch<React.SetStateAction<string>>; setAdminPassError: React.Dispatch<React.SetStateAction<string>>; savedAdminPassword: string; setSavedAdminPassword: React.Dispatch<React.SetStateAction<string>>; newAdminPassword: string; setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>; setAdminPassChangeMsg: React.Dispatch<React.SetStateAction<string>>; adminEditHoodId: number; adminEditBuySqm: number; adminEditRahn80m: number;
  setAdminPriceSavedMsg: React.Dispatch<React.SetStateAction<string>>; setBackupStatusMsg: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>; }
const syncApprovedSponsorRequestsExpiry = async (hoodId: number, expiresAtIso: string, cityId = 'tehran'): Promise<void> => {
  const response = await fetch(`/api/v1/market/state?cityId=${encodeURIComponent(cityId)}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`MARKET_STATE_HTTP_${response.status}`);
  const state = await response.json() as { sponsors?: Array<{ id?: string; hoodId?: number; status?: string }> };
  const requests = (state.sponsors || []).filter((item) => item.hoodId === hoodId && item.status === 'approved');
  await Promise.all(requests.map((item) => updateSponsorRequestExpiry(String(item.id || '').replace(/^cloud-/, ''), expiresAtIso)));
};
export function useRadarAdminActions(p: UseRadarAdminActionsParams) {
  const handleAdminApproveSponsor = async (reqItem: SponsorCrmRequestItem) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.'); return; }
    const planMonths: 1 | 3 = reqItem.planMonths === 3 ? 3 : 1; const resolvedExpiry = reqItem.expiresAtIso || computeSponsorExpirationIso(planMonths); const planType = p.featureFlags.enableSponsorBilling ? (planMonths === 3 ? 'paid_3m' : 'paid_1m') : 'free'; const approvedSponsor = { name: reqItem.agencyName, phone: reqItem.phone, specialty: reqItem.specialty, experienceYears: reqItem.experienceYears, expiresAtIso: resolvedExpiry, planType: planType as 'free' | 'paid_1m' | 'paid_3m' };
    const seedHood = p.evaluatedNeighborhoods.find((n) => n.id === reqItem.hoodId) || p.neighborhoods.find((n) => n.id === reqItem.hoodId) || p.allExpansionSeeds.find((n) => n.id === reqItem.hoodId);
    const baseBuy = seedHood ? ((seedHood as EvaluatedNeighborhood).baseBuyPerSqm ?? seedHood.buyPerSqm) : 100; const baseRahn = seedHood ? Math.max(50, seedHood.rahn80m) : 1000;
    if (String(reqItem.id).startsWith('cloud-')) {
      try {
        await approveSponsorRequest(String(reqItem.id).replace(/^cloud-/, ''), resolvedExpiry, p.activeCity);
        await persistHoodOverrideToCloud(reqItem.hoodId, baseBuy, baseRahn, approvedSponsor, p.activeCity);
      } catch {
        p.setAdminPriceSavedMsg('ثبت تأیید اسپانسر در Cloudflare D1 انجام نشد؛ وضعیت محلی تغییر نکرد.');
        return;
      }
    }
    p.setSponsorRequests((prev) => (prev || []).map((r) => (r.id === reqItem.id ? { ...r, status: 'approved', expiresAtIso: resolvedExpiry } : r)));
    p.setNeighborhoods((prev) => { const exists = prev.some((n) => n.id === reqItem.hoodId); if (!exists && seedHood) return [...prev, { ...seedHood, buyPerSqm: baseBuy, sponsor: approvedSponsor }]; return prev.map((n) => (n.id !== reqItem.hoodId ? n : { ...n, sponsor: approvedSponsor })); });
  };
  const handleExtendSponsor30Days = (hoodId: number) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: تمدید اسپانسر نیازمند احراز هویت ادمین است.'); return; }
    const target = p.evaluatedNeighborhoods.find((n) => n.id === hoodId) || p.neighborhoods.find((n) => n.id === hoodId);
    if (!target?.sponsor) return;
    const nextExpiry = computeExtendedSponsorExpirationIso(target.sponsor.expiresAtIso, 30); const nextSponsor = buildSanitizedSponsorMap({ ...target.sponsor, expiresAtIso: nextExpiry })!;
    const baseBuy = (target as EvaluatedNeighborhood).baseBuyPerSqm ?? target.buyPerSqm; const baseRahn = Math.max(50, target.rahn80m);
    void persistHoodOverrideToCloud(hoodId, baseBuy, baseRahn, nextSponsor, p.activeCity).then(() => syncApprovedSponsorRequestsExpiry(hoodId, nextExpiry, p.activeCity)).catch(() => { p.setAdminPriceSavedMsg('ثبت تمدید اسپانسر در Cloudflare D1 ناموفق بود.'); });
    p.setSponsorRequests((prev) => (prev || []).map((r) => (r.hoodId === hoodId && r.status === 'approved' ? { ...r, expiresAtIso: nextExpiry } : r)));
    p.setNeighborhoods((prev) => prev.some((n) => n.id === hoodId) ? prev.map((n) => (n.id !== hoodId ? n : { ...n, sponsor: nextSponsor })) : [...prev, { ...target, buyPerSqm: baseBuy, sponsor: nextSponsor }]);
  };
  const handleReleaseHoodSponsor = async (hoodId: number) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: آزادسازی اسپانسر نیازمند احراز هویت ادمین است.'); return; }
    const response = await fetch('/api/v1/admin/market/sponsors/release', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ cityId: p.activeCity, hoodId }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { code?: string };
      p.setAdminPriceSavedMsg(result.code || 'آزادسازی اسپانسر در Cloudflare D1 ناموفق بود.');
      return;
    }
    const pastIso = new Date(Date.now() - 86400000).toISOString();
    p.setSponsorRequests((prev) => (prev || []).map((r) => (r.hoodId === hoodId && r.status === 'approved' ? { ...r, expiresAtIso: pastIso } : r)));
    p.setNeighborhoods((prev) => prev.map((n) => (n.id !== hoodId ? n : { ...n, sponsor: undefined })));
    p.setAdminPriceSavedMsg('اسپانسر محله در Cloudflare D1 آزاد شد.');
  };
  const handleAdminDeleteSponsorRequest = async (reqId: string) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.'); return; }
    try {
      if (String(reqId).startsWith('cloud-')) await deleteSponsorRequest(String(reqId).replace(/^cloud-/, ''));
      p.setSponsorRequests((prev) => (prev || []).filter((r) => r.id !== reqId));
    } catch {
      p.setAdminPriceSavedMsg('حذف درخواست اسپانسر از Cloudflare D1 انجام نشد.');
    }
  };
  const handleAdminDeleteBargain = async (hoodId: number, bargainId: string) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.'); return; }
    try {
      const cleanId = String(bargainId).replace(/^cloud-/, '');
      const response = await fetch(`/api/v1/market/bargains/${encodeURIComponent(cleanId)}`, {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const result = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) throw new Error(result.code || `BARGAIN_DELETE_HTTP_${response.status}`);
      p.setNeighborhoods((prev) => prev.map((n) => n.id !== hoodId ? n : { ...n, bargains: (n.bargains || []).filter((b) => b.id !== bargainId) }));
      p.setAdminPriceSavedMsg('آگهی از Cloudflare D1 حذف شد.');
    } catch (error) {
      p.setAdminPriceSavedMsg(error instanceof Error ? error.message : 'حذف آگهی انجام نشد.');
    }
  };
  const handleAdminApproveBargain = async (hoodId: number, bargainId: string) => {
    if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.'); return; }
    const cleanDocId = String(bargainId).replace(/^cloud-/, '');
    try {
      const response = await fetch('/api/v1/admin/market/bargains/approve', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ bargainId: cleanDocId }),
      });
      const result = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) throw new Error(result.code || `BARGAIN_APPROVAL_HTTP_${response.status}`);
      p.setNeighborhoods((prev) => prev.map((n) => n.id !== hoodId ? n : {
        ...n, bargains: (n.bargains || []).map((b) => (b.id === bargainId ? { ...b, status: 'approved' as const } : b)),
      }));
      p.setAdminPriceSavedMsg('آگهی در Cloudflare D1 تأیید و منتشر شد.');
    } catch (error) {
      p.setAdminPriceSavedMsg(error instanceof Error ? error.message : 'تأیید آگهی انجام نشد.');
    }
  };
  const handleDownloadBuyerLeadsCsv = () => {
    if (!p.isVerifiedAdmin) {
      p.setAdminPriceSavedMsg('خطا: دانلود لیست خریداران فقط برای حساب رسمی ادمین مجاز است.');
      return;
    }
    const headers = ['ردیف', 'نام و نام خانوادگی', 'شماره موبایل', 'محله هدف', 'نوع معامله', 'حداکثر بودجه', 'زمان ثبت'];
    const rows = (p.buyerLeads || []).map((lead, idx) => [escapeCsvCell(idx + 1), escapeCsvCell(lead.fullName || ''), escapeCsvCell(lead.phone || ''), escapeCsvCell(lead.hoodName || ''), escapeCsvCell(lead.dealType || 'خرید'), escapeCsvCell(lead.maxBudgetText || ''), escapeCsvCell(lead.createdAtFa || '')]);
    const csvContent = '\uFEFF' + [headers.map((h) => escapeCsvCell(h)).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })); const link = document.createElement('a');
    link.href = url; link.setAttribute('download', `tehran-radar-buyer-leads-${Date.now()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };
  const handleAdminQuickPriceSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.isVerifiedAdmin) {
      p.setAdminPriceSavedMsg('خطا: ویرایش قیمت‌ها نیازمند احراز هویت با حساب رسمی ادمین است.');
      return;
    }
    const hoodId = Number(p.adminEditHoodId);
    const targetSeed =
      INITIAL_NEIGHBORHOODS.find((hood) => hood.id === hoodId) ||
      p.allExpansionSeeds.find((hood) => hood.id === hoodId) ||
      p.neighborhoods.find((hood) => hood.id === hoodId);
    if (!targetSeed || hoodId < 1 || hoodId > 9999) {
      p.setAdminPriceSavedMsg('خطا: شناسهٔ محله نامعتبر است (شناسه‌های ۱ تا ۹۹۹ پشتیبانی می‌شوند).');
      return;
    }
    const nextBuy = Math.round(Number(p.adminEditBuySqm));
    const nextRahn = Math.round(Number(p.adminEditRahn80m));
    if (!Number.isFinite(nextBuy) || nextBuy < 10 || nextBuy > 5000 || !Number.isFinite(nextRahn) || nextRahn < 50 || nextRahn > 100000) {
      p.setAdminPriceSavedMsg('خطا: قیمت خرید باید بین ۱۰ تا ۵۰۰۰ میلیون و رهن بین ۵۰ تا ۱۰۰۰۰۰ میلیون تومان باشد.');
      return;
    }
    try {
      const currentHood = p.neighborhoods.find((hood) => hood.id === hoodId) || targetSeed;
      await persistHoodOverrideToCloud(hoodId, nextBuy, nextRahn, currentHood.sponsor, p.activeCity);
      p.setNeighborhoods((prev) => {
        const exists = prev.some((n) => n.id === hoodId);
        if (!exists) return [...prev, { ...targetSeed, buyPerSqm: nextBuy, rahn80m: nextRahn }];
        return prev.map((n) => (n.id !== hoodId ? n : { ...n, buyPerSqm: nextBuy, rahn80m: nextRahn }));
      });
      const areaUnit = getStoredAreaUnit();
      const intlCurrency = getStoredIntlCurrency();
      const unitBuy = convertPricePerSqmToUnit(nextBuy, areaUnit);
      const unitLabel = formatAreaUnitLabel(areaUnit);
      const intlSuffix = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, getStoredRadarLocale())}/${unitLabel})` : '';
      p.setAdminPriceSavedMsg(`قیمت محله ${targetSeed.name} با موفقیت به هر ${unitLabel} ${toPersianNum(unitBuy)} میلیون${intlSuffix} و رهن ${toPersianNum(nextRahn)} میلیون در Cloudflare D1 ذخیره شد.`);
    } catch (error) {
      p.setAdminPriceSavedMsg(error instanceof Error ? error.message : 'ذخیرهٔ قیمت در Cloudflare D1 ناموفق بود.');
    }
  };
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.isVerifiedAdmin) {
      p.setAdminUnlocked(false);
      p.setAdminPassError('دسترسی غیرمجاز: ورود به پنل مدیریت نیازمند احراز هویت با حساب رسمی ادمین (Google Auth) است.');
      return;
    }
    if (p.savedAdminPassword && p.adminPassInput.trim() !== p.savedAdminPassword) {
      p.setAdminPassError('رمز قفل جلسه نامعتبر است.');
      return;
    }
    p.setAdminUnlocked(true); p.setAdminPassError(''); p.setAdminPassInput('');
  };
  const handleAdminChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const passError = validateAdminLockPassword(p.isVerifiedAdmin, p.newAdminPassword);
    if (passError) {
      p.setAdminPassChangeMsg(passError);
      return;
    }
    p.setSavedAdminPassword(p.newAdminPassword.trim());
    p.setNewAdminPassword('');
    p.setAdminPassChangeMsg('رمز قفل جلسه فعلی پنل مدیریت تنظیم شد (فقط در حافظه جلسه فعلی).');
  };
  const handleToggleFeatureFlag = async (key: keyof FeatureFlags) => {
    if (!p.isVerifiedAdmin) return;
    const nextFlags: FeatureFlags = { ...p.featureFlags, [key]: !p.featureFlags[key] };
    p.setFeatureFlags(nextFlags);
    try {
      await saveFeatureFlags(nextFlags);
    } catch {
      p.setFeatureFlags((prev) => ({ ...prev, [key]: !nextFlags[key] }));
      p.setAdminPriceSavedMsg('ذخیرهٔ Feature Flag در Cloudflare D1 ناموفق بود؛ مقدار قبلی بازیابی شد.');
    }
  };
  const handleDownloadFullBackupJson = () => {
    if (!p.isVerifiedAdmin) {
      p.setBackupStatusMsg({ type: 'error', text: 'خطای دسترسی: پشتیبان‌گیری دیتابیس فقط برای مدیر تاییدشده سیستم مجاز است.' });
      return;
    }
    try {
      const backupPayload = {
        schemaVersion: '1.0.0', exportedAtIso: new Date().toISOString(),
        exportedAtFa: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }),
        appBrand: 'رادار محله‌های تهران', neighborhoods: p.neighborhoods,
        sponsorRequests: p.sponsorRequests, buyerLeads: p.buyerLeads,
        favoriteHoodIds: p.favoriteHoodIds, featureFlags: p.featureFlags,
      };
      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.setAttribute('download', `tehran-radar-full-backup-${dateStamp}.json`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
      p.setBackupStatusMsg({ type: 'success', text: 'فایل پشتیبان کامل دیتابیس (JSON) با موفقیت تولید و دانلود شد.' });
    } catch {
      p.setBackupStatusMsg({ type: 'error', text: 'خطا در تولید فایل پشتیبان؛ لطفاً دوباره تلاش کنید.' });
    }
  };
  const handleRestoreFullBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!p.isVerifiedAdmin) {
      p.setBackupStatusMsg({ type: 'error', text: 'خطای دسترسی: بازیابی دیتابیس فقط برای مدیر تاییدشده سیستم مجاز است.' });
      e.target.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const content = typeof reader.result === 'string' ? reader.result : '';
          const validated = validateAndBuildRestoredState(content, p.allExpansionSeeds);
          if (!validated.ok || !validated.restoredNeighborhoods) {
            p.setBackupStatusMsg({ type: 'error', text: validated.errorMessage || 'ساختار فایل JSON معتبر نیست یا کلیدهای اصلی دیتابیس در آن یافت نشد.' });
            return;
          }
          p.setNeighborhoods(validated.restoredNeighborhoods);
          if (validated.sponsorRequests !== undefined) p.setSponsorRequests(validated.sponsorRequests);
          if (validated.buyerLeads !== undefined) p.setBuyerLeads(validated.buyerLeads);
          if (validated.favoriteHoodIds !== undefined) p.setFavoriteHoodIds(validated.favoriteHoodIds);
          if (validated.featureFlags !== undefined) p.setFeatureFlags(validated.featureFlags);
          try {
            const overrides = validated.restoredNeighborhoods.map((hood) => ({
              cityId: p.activeCity, hoodId: hood.id, buyPerSqm: hood.buyPerSqm, rahn80m: Math.max(50, hood.rahn80m),
              ...(hood.sponsor ? { sponsor: buildSanitizedSponsorMap(hood.sponsor) } : {}),
            }));
            const syncedOverridesCount = await batchSaveNeighborhoodOverrides(overrides);
            let syncedFlags = false;
            if (validated.featureFlags) {
              await saveFeatureFlags(validated.featureFlags);
              syncedFlags = true;
            }
            p.setBackupStatusMsg({ type: 'success', text: `بازیابی و ذخیرهٔ ${toPersianNum(syncedOverridesCount)} تغییر محله${syncedFlags ? ' و Feature Flagها' : ''} در Cloudflare D1 انجام شد.` });
          } catch (error) {
            p.setBackupStatusMsg({ type: 'error', text: error instanceof Error ? error.message : 'ذخیرهٔ پشتیبان در Cloudflare D1 ناموفق بود؛ دادهٔ محلی و پایگاه مقصد ممکن است همگام نباشند.' });
          }
        } catch {
          p.setBackupStatusMsg({ type: 'error', text: 'خطا در خواندن فایل پشتیبان؛ لطفاً از سلامت فایل JSON اطمینان حاصل کنید.' });
        } finally { e.target.value = ''; }
      })();
    };
    reader.readAsText(file);
  };
  return { handleAdminApproveSponsor, handleExtendSponsor30Days, handleReleaseHoodSponsor, handleAdminDeleteSponsorRequest, handleAdminDeleteBargain, handleAdminApproveBargain, handleDownloadBuyerLeadsCsv, handleAdminQuickPriceSave, handleAdminLogin, handleAdminChangePassword, handleToggleFeatureFlag, handleDownloadFullBackupJson, handleRestoreFullBackupJson };
}
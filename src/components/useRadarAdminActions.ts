import React from 'react'; import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'; import { auth, db, OperationType, handleFirestoreError } from '../firebase'; import { BuyerAlertLeadItem, EvaluatedNeighborhood, INITIAL_NEIGHBORHOODS, Neighborhood, SponsorCrmRequestItem, toPersianNum, validateAndBuildRestoredState, } from '../data/neighborhoods'; import { computeExtendedSponsorExpirationIso, computeSponsorExpirationIso, escapeCsvCell, FeatureFlags, } from '../utils/security'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, getStoredRadarLocale } from '../utils/areaUnit'; export const persistHoodOverrideToCloud = async ( overrideHoodId: number, buyVal: number, rahnVal: number, sponsorVal?: any
): Promise<void> => { await setDoc(doc(db, 'neighborhoodOverrides', String(overrideHoodId)), { hoodId: overrideHoodId, buyPerSqm: buyVal, rahn80m: rahnVal, ...(sponsorVal ? { sponsor: sponsorVal } : {}), updatedAt: serverTimestamp(), }); }; export interface UseRadarAdminActionsParams { isVerifiedAdmin: boolean; neighborhoods: Neighborhood[]; setNeighborhoods: React.Dispatch<React.SetStateAction<Neighborhood[]>>; evaluatedNeighborhoods: EvaluatedNeighborhood[]; allExpansionSeeds: Neighborhood[]; featureFlags: FeatureFlags; setFeatureFlags: React.Dispatch<React.SetStateAction<FeatureFlags>>; favoriteHoodIds: number[]; setFavoriteHoodIds: React.Dispatch<React.SetStateAction<number[]>>; sponsorRequests: SponsorCrmRequestItem[]; setSponsorRequests: React.Dispatch<React.SetStateAction<SponsorCrmRequestItem[]>>; buyerLeads: BuyerAlertLeadItem[]; setBuyerLeads: React.Dispatch<React.SetStateAction<BuyerAlertLeadItem[]>>; setAdminUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  adminPassInput: string; setAdminPassInput: React.Dispatch<React.SetStateAction<string>>; setAdminPassError: React.Dispatch<React.SetStateAction<string>>; savedAdminPassword: string; setSavedAdminPassword: React.Dispatch<React.SetStateAction<string>>; newAdminPassword: string; setNewAdminPassword: React.Dispatch<React.SetStateAction<string>>; setAdminPassChangeMsg: React.Dispatch<React.SetStateAction<string>>; adminEditHoodId: number; adminEditBuySqm: number; adminEditRahn80m: number;
  setAdminPriceSavedMsg: React.Dispatch<React.SetStateAction<string>>; setBackupStatusMsg: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>; }
export function useRadarAdminActions(p: UseRadarAdminActionsParams) { const handleAdminApproveSponsor = async (reqItem: SponsorCrmRequestItem) => { if (!p.isVerifiedAdmin) { p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.');
      return; } const planMonths: 1 | 3 = reqItem.planMonths === 3 ? 3 : 1; const resolvedExpiry = reqItem.expiresAtIso || computeSponsorExpirationIso(planMonths); const planType = p.featureFlags.enableSponsorBilling ? (planMonths === 3 ? 'paid_3m' : 'paid_1m') : 'free'; const approvedSponsor = { name: reqItem.agencyName, phone: reqItem.phone, specialty: reqItem.specialty, experienceYears: reqItem.experienceYears, expiresAtIso: resolvedExpiry, planType: planType as 'free' | 'paid_1m' | 'paid_3m', }; const seedHood = p.evaluatedNeighborhoods.find((n) => n.id === reqItem.hoodId)
      || p.neighborhoods.find((n) => n.id === reqItem.hoodId)
      || p.allExpansionSeeds.find((n) => n.id === reqItem.hoodId); const baseBuy = seedHood ? ((seedHood as EvaluatedNeighborhood).baseBuyPerSqm ?? seedHood.buyPerSqm) : 100; const baseRahn = seedHood ? Math.max(50, seedHood.rahn80m) : 1000; if (String(reqItem.id).startsWith('cloud-')) {
      const docId = String(reqItem.id).replace(/^cloud-/, ''); try { const batch = writeBatch(db); batch.update(doc(db, 'sponsorRequests', docId), { status: 'approved', expiresAtIso: resolvedExpiry }); batch.set(doc(db, 'neighborhoodOverrides', String(reqItem.hoodId)), { hoodId: reqItem.hoodId, buyPerSqm: baseBuy, rahn80m: baseRahn,
          sponsor: approvedSponsor, updatedAt: serverTimestamp(), }); await batch.commit(); } catch (err) { p.setAdminPriceSavedMsg('خطای دسترسی در تایید اسپانسر ابری (نیاز به سطح دسترسی ادمین).');
        try { handleFirestoreError(err, OperationType.UPDATE, `sponsorRequests/${docId}`); } catch { return; }
      } }
    p.setSponsorRequests((prev) => (prev || []).map((r) => (r.id === reqItem.id ? { ...r, status: 'approved', expiresAtIso: resolvedExpiry } : r))); p.setNeighborhoods((prev) => { const exists = prev.some((n) => n.id === reqItem.hoodId); if (!exists && seedHood) {
        return [...prev, { ...seedHood, buyPerSqm: baseBuy, sponsor: approvedSponsor }]; }
      return prev.map((n) => (n.id !== reqItem.hoodId ? n : { ...n, sponsor: approvedSponsor })); });
  };
  const handleExtendSponsor30Days = (hoodId: number) => {
    if (!p.isVerifiedAdmin) return;
    p.setNeighborhoods((prev) =>
      prev.map((n) => {
        if (n.id !== hoodId || !n.sponsor) return n;
        const nextExpiry = computeExtendedSponsorExpirationIso(n.sponsor.expiresAtIso, 30);
        const baseBuy = (n as EvaluatedNeighborhood).baseBuyPerSqm ?? n.buyPerSqm;
        void setDoc(doc(db, 'neighborhoodOverrides', String(hoodId)), {
          hoodId, buyPerSqm: baseBuy, rahn80m: Math.max(50, n.rahn80m),
          sponsor: { ...n.sponsor, expiresAtIso: nextExpiry }, updatedAt: serverTimestamp(),
        }).catch(() => {});
        return { ...n, sponsor: { ...n.sponsor, expiresAtIso: nextExpiry } };
      })
    );
  };
  const handleReleaseHoodSponsor = (hoodId: number) => {
    if (!p.isVerifiedAdmin) return;
    const pastIso = new Date(Date.now() - 86400000).toISOString();
    const target = p.neighborhoods.find((n) => n.id === hoodId) || p.evaluatedNeighborhoods.find((n) => n.id === hoodId);
    if (target) {
      const baseBuy = (target as EvaluatedNeighborhood).baseBuyPerSqm ?? target.buyPerSqm;
      void setDoc(doc(db, 'neighborhoodOverrides', String(hoodId)), {
        hoodId, buyPerSqm: baseBuy, rahn80m: Math.max(50, target.rahn80m),
        sponsor: null, updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    p.setNeighborhoods((prev) =>
      prev.map((n) => (n.id !== hoodId || !n.sponsor ? n : { ...n, sponsor: { ...n.sponsor, expiresAtIso: pastIso } }))
    );
  };
  const handleAdminDeleteSponsorRequest = async (reqId: string) => {
    if (!p.isVerifiedAdmin) {
      p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.');
      return;
    }
    if (String(reqId).startsWith('cloud-')) {
      const docId = String(reqId).replace(/^cloud-/, '');
      try {
        await deleteDoc(doc(db, 'sponsorRequests', docId));
      } catch (err) {
        p.setAdminPriceSavedMsg('خطای دسترسی در حذف اسپانسر ابری (نیاز به سطح دسترسی ادمین).');
        try { handleFirestoreError(err, OperationType.DELETE, `sponsorRequests/${docId}`); } catch { return; }
      }
    }
    p.setSponsorRequests((prev) => (prev || []).filter((r) => r.id !== reqId));
  };
  const handleAdminDeleteBargain = async (hoodId: number, bargainId: string) => {
    if (!p.isVerifiedAdmin) {
      p.setAdminPriceSavedMsg('خطا: این عملیات نیازمند احراز هویت با حساب رسمی ادمین است.');
      return;
    }
    if (String(bargainId).startsWith('cloud-')) {
      const docId = String(bargainId).replace(/^cloud-/, '');
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'bargains', docId));
        batch.delete(doc(db, 'bargainOwners', docId));
        await batch.commit();
        const signedInUser = auth.currentUser;
        if (signedInUser) {
          try {
            const idToken = await signedInUser.getIdToken();
            const response = await fetch(`/api/object-storage/cleanup-bargain/${encodeURIComponent(docId)}`, {
              method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store',
            });
            const result: unknown = await response.json();
            if (!response.ok || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'ok') {
              p.setAdminPriceSavedMsg('آگهی حذف شد، اما پاکسازی همهٔ رسانه‌های آن تأیید نشد. نتیجه باید دوباره بررسی شود.');
            }
          } catch {
            p.setAdminPriceSavedMsg('آگهی حذف شد، اما سرویس پاکسازی رسانه در دسترس نبود. پاکسازی باید مجدداً اجرا شود.');
          }
        } else {
          p.setAdminPriceSavedMsg('آگهی حذف شد، اما برای پاکسازی رسانه‌ها نشست مدیر در دسترس نبود.');
        }
      } catch (err) {
        p.setAdminPriceSavedMsg('خطای دسترسی در حذف آگهی ابری (نیاز به سطح دسترسی ادمین یا مالک).');
        try { handleFirestoreError(err, OperationType.DELETE, `bargains/${docId}`); } catch { return; }
        return;
      }
    }
    p.setNeighborhoods((prev) => {
      const exists = prev.some((n) => n.id === hoodId);
      if (!exists) {
        const seedTarget = p.evaluatedNeighborhoods.find((n) => n.id === hoodId);
        if (!seedTarget) return prev;
        return [...prev, { ...seedTarget, buyPerSqm: seedTarget.baseBuyPerSqm ?? seedTarget.buyPerSqm, bargains: (seedTarget.bargains || []).filter((b) => b.id !== bargainId) }];
      }
      return prev.map((n) => (n.id !== hoodId ? n : { ...n, bargains: (n.bargains || []).filter((b) => b.id !== bargainId) }));
    });
  };
  const handleDownloadBuyerLeadsCsv = () => {
    if (!p.isVerifiedAdmin) {
      p.setAdminPriceSavedMsg('خطا: دانلود لیست خریداران فقط برای حساب رسمی ادمین مجاز است.');
      return;
    }
    const headers = ['ردیف', 'نام و نام خانوادگی', 'شماره موبایل', 'محله هدف', 'نوع معامله', 'حداکثر بودجه', 'زمان ثبت'];
    const rows = (p.buyerLeads || []).map((lead, idx) => [
      escapeCsvCell(idx + 1),
      escapeCsvCell(lead.fullName || ''),
      escapeCsvCell(lead.phone || ''),
      escapeCsvCell(lead.hoodName || ''),
      escapeCsvCell(lead.dealType || 'خرید'),
      escapeCsvCell(lead.maxBudgetText || ''),
      escapeCsvCell(lead.createdAtFa || ''),
    ]);
    const csvContent = '\uFEFF' + [headers.map((h) => escapeCsvCell(h)).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tehran-radar-buyer-leads-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    if (!targetSeed || hoodId < 1 || hoodId > 999) {
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
      await persistHoodOverrideToCloud(hoodId, nextBuy, nextRahn);
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
      p.setAdminPriceSavedMsg(`قیمت محله ${targetSeed.name} با موفقیت به هر ${unitLabel} ${toPersianNum(unitBuy)} میلیون${intlSuffix} و رهن ${toPersianNum(nextRahn)} میلیون در فایراستور ذخیره شد.`);
    } catch (error) {
      p.setAdminPriceSavedMsg('خطا در ذخیرهٔ قیمت در فایراستور؛ تغییر در پایگاه داده ثبت نشد.');
      try { handleFirestoreError(error, OperationType.WRITE, `neighborhoodOverrides/${hoodId}`); } catch {}
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
    if (!p.isVerifiedAdmin || !p.newAdminPassword.trim() || p.newAdminPassword.trim().length < 4) return;
    p.setSavedAdminPassword(p.newAdminPassword.trim());
    p.setNewAdminPassword('');
    p.setAdminPassChangeMsg('رمز قفل جلسه فعلی پنل مدیریت تنظیم شد (فقط در حافظه جلسه فعلی).');
  };
  const handleToggleFeatureFlag = async (key: keyof FeatureFlags) => {
    if (!p.isVerifiedAdmin) return;
    const nextFlags: FeatureFlags = { ...p.featureFlags, [key]: !p.featureFlags[key] };
    p.setFeatureFlags(nextFlags);
    try {
      await setDoc(doc(db, 'appConfig', 'featureFlags'), { ...nextFlags, updatedAt: serverTimestamp() });
    } catch (err) {
      try { handleFirestoreError(err, OperationType.WRITE, 'appConfig/featureFlags'); } catch { /* local */ }
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
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
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
        p.setBackupStatusMsg({ type: 'success', text: `بازیابی کامل دیتابیس (${toPersianNum(validated.restoredNeighborhoods.length)} محله، لیست CRM، خریداران و تنظیمات) با موفقیت انجام شد.` });
      } catch {
        p.setBackupStatusMsg({ type: 'error', text: 'خطا در خواندن فایل پشتیبان؛ لطفاً از سلامت فایل JSON اطمینان حاصل کنید.' });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };
  return {
    handleAdminApproveSponsor,
    handleExtendSponsor30Days,
    handleReleaseHoodSponsor,
    handleAdminDeleteSponsorRequest, handleAdminDeleteBargain, handleDownloadBuyerLeadsCsv, handleAdminQuickPriceSave, handleAdminLogin, handleAdminChangePassword, handleToggleFeatureFlag, handleDownloadFullBackupJson, handleRestoreFullBackupJson, }; }
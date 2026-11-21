import React, { useEffect, useRef, useState } from 'react'; import { CheckCircle2, Database, Film, Image as ImageIcon, Loader2, Sparkles, Trash2, UploadCloud, } from 'lucide-react'; import { app, auth } from '../firebase'; import type { CityId } from '../types/models'; import { toPersianNum } from '../data/neighborhoods'; import { AreaUnit, IntlCurrencyCode, convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { getOptionalClientAppCheckHeaders } from '../utils/clientAppCheck'; import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES, ListingMediaObject, ObjectStorageStatusPayload, compressImageFileInBrowser, fetchObjectStorageStatus, fileNameForUploadMime, generateSamplePropertyPhotoBase64, generateSamplePropertyVideoBase64, uploadMediaChunkedToObjectStorage, uploadMediaToObjectStorage, } from '../utils/objectStorage'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export interface ListingMediaStorageUploaderProps { hoodId: number; hoodName: string; sqm: number; estimatedMillionToman?: number; city?: CityId; uploadedMedia: ListingMediaObject[]; onChangeMedia: React.Dispatch<React.SetStateAction<ListingMediaObject[]>>; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }
export function ListingMediaStorageUploader({ hoodId, hoodName, sqm, estimatedMillionToman, city = 'tehran', uploadedMedia, onChangeMedia, areaUnit: areaUnitProp, intlCurrency: intlCurrencyProp, }: ListingMediaStorageUploaderProps) { const [hookUnit] = useAreaUnit(); const [hookCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const areaUnit = areaUnitProp ?? hookUnit; const intlCurrency = intlCurrencyProp ?? hookCurrency; const effectiveTotalMillions = typeof estimatedMillionToman === 'number' && estimatedMillionToman > 0 ? estimatedMillionToman : Math.max(100, sqm * 115); const unitPrice = convertPricePerSqmToUnit(Math.max(10, Math.round(effectiveTotalMillions / Math.max(1, sqm))), areaUnit); const estMonthlyRentMillions = Math.max(5, Math.round(effectiveTotalMillions * 0.0038)); const [storageStatus, setStorageStatus] = useState<ObjectStorageStatusPayload | null>(null); const [uploading, setUploading] = useState(false); const [uploadProgress, setUploadProgress] = useState<number | null>(null); const [uploadStatusText, setUploadStatusText] = useState<string>(''); const [uploadError, setUploadError] = useState<string | null>(null); const abortRef = useRef<AbortController | null>(null); useEffect(() => { let active = true; fetchObjectStorageStatus().then((st) => { if (active && st) setStorageStatus(st); }); return () => { active = false; abortRef.current?.abort(); }; }, [uploadedMedia.length]); const imageItems = uploadedMedia.filter((m) => m.mediaType === 'image'); const videoItem = uploadedMedia.find((m) => m.mediaType === 'video'); const uploadOneFile = async (
    file: File, mediaType: 'image' | 'video', idToken: string, appCheckHeaders: Record<string, string>, signal: AbortSignal
  ): Promise<ListingMediaObject> => { const allowed = mediaType === 'video' ? ALLOWED_VIDEO_MIMES : ALLOWED_IMAGE_MIMES; if (!allowed.includes(file.type)) { throw new Error(mediaType === 'video' ? 'فرمت ویدیو باید MP4 یا WebM باشد.' : 'فرمت تصویر باید JPG، PNG یا WebP باشد.'); }
    const timestamp = Date.now(); const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).substring(2, 10);
    const standardBaseName = `${hoodId}-${timestamp}-${uuid}`;
    let uploadBlob: Blob = file; let finalMimeType = file.type;
    if (mediaType === 'video') {
      const maxBytes = (storageStatus?.maxVideoMb ?? 50) * 1024 * 1024;
      if (file.size > maxBytes) throw new Error(`حجم ویدیو بیش از سقف مجاز ${toPersianNum(storageStatus?.maxVideoMb ?? 50)} مگابایت است.`);
    } else {
      setUploadProgress(15); setUploadStatusText('در حال فشرده‌سازی خودکار تصویر (WebP)...');
      const compressed = await compressImageFileInBrowser(file); finalMimeType = compressed.mimeType;
      const bin = atob(compressed.dataBase64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
      uploadBlob = new Blob([u8], { type: finalMimeType });
    }
    const standardFileName = fileNameForUploadMime(standardBaseName, finalMimeType);
    return uploadMediaChunkedToObjectStorage({
      blob: uploadBlob, fileName: standardFileName, mimeType: finalMimeType, mediaType, hoodId, city, idToken, appCheckHeaders, signal,
      onProgress: (pct, stage) => { setUploadProgress(pct); setUploadStatusText(stage); },
    });
  };
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'video') => {
    const files = e.target.files; if (!files || files.length === 0) return;
    setUploadError(null); setUploading(true); setUploadProgress(5); setUploadStatusText('آماده‌سازی فایل جهت بارگذاری...');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.emailVerified) throw new Error('برای آپلود عکس یا ویدیو ابتدا وارد حساب کاربری تأییدشده شوید.');
      const [idToken, appCheckHeaders] = await Promise.all([currentUser.getIdToken(), getOptionalClientAppCheckHeaders(app)]);
      for (const file of Array.from(files)) {
        if (mediaType === 'image' && imageItems.length >= 5) throw new Error('حداکثر ۵ تصویر برای هر آگهی در آبجکت استوریج قابل ثبت است.');
        const uploaded = await uploadOneFile(file, mediaType, idToken, appCheckHeaders, controller.signal);
        onChangeMedia((prev) => mediaType === 'video' ? [...prev.filter((item) => item.mediaType !== 'video'), uploaded] : [...prev.slice(0, 4), uploaded]);
      }
    } catch (err: any) {
      setUploadError(err?.name === 'AbortError' ? 'آپلود توسط کاربر لغو شد.' : (err?.message || 'خطا در آپلود فایل روی آبجکت استوریج'));
    } finally {
      abortRef.current = null; setUploading(false); setUploadProgress(null); setUploadStatusText(''); e.target.value = '';
    }
  };
  const handleQuickDemoUpload = async () => {
    setUploadError(null); setUploading(true); setUploadProgress(20); setUploadStatusText('در حال تولید فایل‌های نمونه در استوریج...');
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.emailVerified) throw new Error('برای آپلود نمونه، ابتدا وارد حساب کاربری تأییدشده شوید.');
      const [idToken, appCheckHeaders] = await Promise.all([currentUser.getIdToken(), getOptionalClientAppCheckHeaders(app)]);
      const photoB64 = generateSamplePropertyPhotoBase64(hoodName, sqm); setUploadProgress(45);
      const uploadedPhoto = await uploadMediaToObjectStorage({ fileName: `${hoodId}-${Date.now()}-sample.jpg`, mimeType: 'image/jpeg', mediaType: 'image', dataBase64: photoB64, hoodId, city, idToken, appCheckHeaders });
      setUploadProgress(75);
      const videoB64 = generateSamplePropertyVideoBase64();
      const uploadedVideo = await uploadMediaToObjectStorage({ fileName: `${hoodId}-${Date.now()}-sample.mp4`, mimeType: 'video/mp4', mediaType: 'video', dataBase64: videoB64, hoodId, city, idToken, appCheckHeaders });
      setUploadProgress(100);
      onChangeMedia((prev) => [...prev.filter((m) => m.mediaType === 'image').slice(0, 4), uploadedPhoto, uploadedVideo]);
    } catch (err: any) {
      setUploadError(err?.message || 'خطا در تولید و ذخیره نمونه روی آبجکت استوریج');
    } finally {
      setUploading(false); setUploadProgress(null); setUploadStatusText('');
    }
  };
  const handleRemoveItem = async (id: string) => {
    setUploadError(null);
    const currentUser = auth.currentUser;
    if (!currentUser) { setUploadError('برای حذف فایل از فضای ذخیره‌سازی باید وارد حساب کاربری خود باشید.'); return; }
    try {
      const [idToken, appCheckHeaders] = await Promise.all([currentUser.getIdToken(), getOptionalClientAppCheckHeaders(app)]);
      const response = await fetch(`/api/object-storage/file/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}`, ...appCheckHeaders },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status !== 'ok') throw new Error(result?.message || 'حذف فایل از سرور انجام نشد.');
      onChangeMedia((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setUploadError(err?.message || 'خطا در حذف فایل از فضای ذخیره‌سازی.');
    }
  };
  const maxImageMb = storageStatus?.maxImageMb ?? 5;
  const maxVideoMb = storageStatus?.maxVideoMb ?? 50;
  return (
    <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2.5">
        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-slate-100">
          <Database className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <span>
            ذخیرهٔ عکس و فیلم آگهی ({hoodName} · {formatAreaShort(sqm, areaUnit)} · هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(unitPrice)} م · کل: {toPersianNum(effectiveTotalMillions.toLocaleString('en-US'))} م ({formatMillionTomanAsIntlCurrency(effectiveTotalMillions, intlCurrency, locale)}) · اجاره ماهانه: {toPersianNum(estMonthlyRentMillions)} م ({formatMillionTomanAsIntlCurrency(estMonthlyRentMillions, intlCurrency, locale)})) با بهینه‌سازی خودکار تصویر
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 rounded-xl px-3 py-2">
        <div>
          سرویس ذخیره‌سازی: <strong className="text-slate-900 dark:text-slate-100">{storageStatus?.providerLabelFa || 'فضای ذخیره‌سازی رسانهٔ آگهی'}</strong>
        </div>
        <div className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
          سقف مجاز: عکس تا {toPersianNum(maxImageMb)} مگابایت · ویدیو تا {toPersianNum(maxVideoMb)} مگابایت
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-dashed border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold cursor-pointer transition">
          <ImageIcon className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <span>آپلود عکس ملک (تا {toPersianNum(maxImageMb)}MB · WebP)</span>
          <input type="file" aria-label="آپلود عکس ملک" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(e) => handleFileSelect(e, 'image')} className="hidden" />
        </label>
        <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-sky-950/50 border border-dashed border-sky-400 dark:border-sky-700 text-sky-800 dark:text-sky-300 font-bold cursor-pointer transition">
          <Film className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>آپلود فیلم ملک (تا {toPersianNum(maxVideoMb)}MB)</span>
          <input type="file" aria-label="آپلود فیلم ملک" accept="video/mp4,video/webm,video/quicktime" disabled={uploading} onChange={(e) => handleFileSelect(e, 'video')} className="hidden" />
        </label>
        <button type="button" disabled={uploading} onClick={handleQuickDemoUpload} className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--color-brand-600)]/10 dark:bg-emerald-950/60 hover:bg-[var(--color-brand-600)]/20 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold cursor-pointer transition">
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700 dark:text-emerald-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          )}
          <span>تولید نمونه عکس و فیلم در استوریج</span>
        </button>
      </div>
      {uploading && uploadProgress !== null && (
        <div className="bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950 dark:text-emerald-100">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>{uploadStatusText || 'در حال ارسال رسانه به فضای ذخیره‌سازی...'}</span>
            </span>
            <span className="tabular-nums text-emerald-800 dark:text-emerald-300 font-black">
              {toPersianNum(Math.round(uploadProgress))}٪
            </span>
          </div>
          <div className="w-full bg-emerald-200/60 dark:bg-emerald-900/60 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[var(--color-brand-600)] h-2 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
            />
          </div>
        </div>
      )}
      {uploadError && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-semibold text-[11px]">
          {uploadError} </div>
      )} {uploadedMedia.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {toPersianNum(imageItems.length)} تصویر و {toPersianNum(videoItem ? 1 : 0)} ویدیو روی آبجکت استوریج ذخیره شد
              </span>
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">آماده اتصال به آگهی</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {uploadedMedia.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                <div className="flex items-center gap-2 min-w-0">
                  {item.mediaType === 'image' ? (
                    <img src={item.url} alt="پیش‌نمایش عکس ملک" className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                  )} <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11px]">
                      {item.mediaType === 'video' ? '🎬 ویدیوی تور ملک (MP4)' : '🖼️ تصویر ملک'} · {toPersianNum(Math.max(1, Math.round(item.sizeBytes / 1024)))} KB
                    </div>
                    <div dir="ltr" className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate" title={item.objectKey}>
                      {item.objectKey} </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="حذف فایل از فضای ذخیره‌سازی"
                  onClick={() => { void handleRemoveItem(item.id); }} className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 shrink-0 cursor-pointer"
                  title="حذف فایل از فضای ذخیره‌سازی"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))} </div>
        </div>
      )} </div>
  ); }
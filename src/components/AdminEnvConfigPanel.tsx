import React, { useEffect, useState } from 'react'; import { CheckCircle2, Cloud, Lock, RefreshCw, Save, Send, Server, ShieldCheck, Sparkles, } from 'lucide-react'; import { auth } from '../firebase'; import { toPersianNum } from '../data/neighborhoods'; import { AreaUnit, convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, IntlCurrencyCode } from '../utils/areaUnit'; import type { ObjectStorageProviderId } from '../utils/objectStorage'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export interface AdminEnvConfigPanelProps { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; } interface PublicRuntimeEnvReport { status: 'ok'; lastUpdatedIso: string | null; mutableSafeKeys?: string[]; protectedStartupKeys?: string[]; gemini: { configured: boolean; model: string;
    deploymentManaged?: boolean; }; telegram: { botTokenConfigured: boolean; channelId: string; deploymentManagedToken?: boolean; }; firebase: { projectId: string; firestoreDatabaseId: string; adminEmail: string; adminSecretConfigured: boolean; deploymentManaged?: boolean; };
  objectStorage: { provider: ObjectStorageProviderId; endpoint: string; bucket: string; region: string; accessKeyConfigured: boolean; secretKeyConfigured: boolean; publicBaseUrl: string; maxImageMb: number; maxVideoMb: number; deploymentManagedCredentials?: boolean; }; }
export function AdminEnvConfigPanel({ areaUnit: propAreaUnit, intlCurrency: propIntlCurrency }: AdminEnvConfigPanelProps = {}): React.ReactElement { const [hookAreaUnit] = useAreaUnit(); const [hookIntlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const areaUnit = propAreaUnit ?? hookAreaUnit; const intlCurrency = propIntlCurrency ?? hookIntlCurrency; const sampleUnitPrice = convertPricePerSqmToUnit(120, areaUnit); const sample85mTotalMillions = 120 * 85; const sampleMonthlyRentMillions = 45; const [report, setReport] = useState<PublicRuntimeEnvReport | null>(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null); const [errorMsg, setErrorMsg] = useState<string | null>(null); const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash'); const [telegramChannelId, setTelegramChannelId] = useState('');
  const [storageProvider, setStorageProvider] = useState<ObjectStorageProviderId>('arvancloud'); const [storageRegion, setStorageRegion] = useState('ir-thr-at1'); const [storagePublicUrl, setStoragePublicUrl] = useState(''); const [maxImageMb, setMaxImageMb] = useState(5);
  const [maxVideoMb, setMaxVideoMb] = useState(50); const fetchEnvStatus = async () => {
    setLoading(true); setErrorMsg(null);
    try {
      const currentUser = auth.currentUser; const idToken = currentUser ? await currentUser.getIdToken() : '';
      const res = await fetch('/api/admin/env-config', { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} });
      if (!res.ok) throw new Error('عدم دسترسی به وضعیت متغیرهای محیطی سرور');
      const data = (await res.json()) as PublicRuntimeEnvReport;
      if (data && data.status === 'ok') {
        setReport(data); setGeminiModel(data.gemini.model || 'gemini-2.5-flash'); setTelegramChannelId(data.telegram.channelId || '');
        setStorageProvider(data.objectStorage.provider || 'arvancloud'); setStorageRegion(data.objectStorage.region || 'ir-thr-at1');
        setStoragePublicUrl(data.objectStorage.publicBaseUrl || ''); setMaxImageMb(data.objectStorage.maxImageMb || 5); setMaxVideoMb(data.objectStorage.maxVideoMb || 50);
      }
    } catch (err: any) { setErrorMsg(err?.message || 'خطا در دریافت وضعیت متغیرهای محیطی'); } finally { setLoading(false); }
  };
  useEffect(() => { void fetchEnvStatus(); }, []);
  const handleSaveEnv = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setStatusMsg(null); setErrorMsg(null);
    try {
      const currentUser = auth.currentUser; const idToken = currentUser ? await currentUser.getIdToken() : '';
      const updates: Record<string, string | number> = {
        GEMINI_MODEL: geminiModel.trim(), TELEGRAM_CHANNEL_ID: telegramChannelId.trim(), OBJECT_STORAGE_PROVIDER: storageProvider,
        OBJECT_STORAGE_REGION: storageRegion.trim(), OBJECT_STORAGE_PUBLIC_BASE_URL: storagePublicUrl.trim(),
        OBJECT_STORAGE_MAX_IMAGE_MB: Number(maxImageMb) || 5, OBJECT_STORAGE_MAX_VIDEO_MB: Number(maxVideoMb) || 50,
      };
      const res = await fetch('/api/admin/env-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) }, body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== 'ok') throw new Error(data?.message || 'خطا در ذخیره متغیرهای عملیاتی سرور');
      if (data.report) setReport(data.report);
      setStatusMsg('تنظیمات عملیاتی مجاز با موفقیت در سرور ذخیره شد.');
    } catch (err: any) { setErrorMsg(err?.message || 'خطا در بروزرسانی متغیرهای عملیاتی سرور'); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4 text-xs">
      <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="font-extrabold text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span>مدیریت تنظیمات عملیاتی و مشاهدهٔ ریشه‌های امنیتی مستقر (Deployment-Managed)</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed tabular-nums">
            ریشه‌های هویتی، شناسه پروژه Firebase، ایمیل مدیر اصلی و کلیدهای محرمانه صرفاً از محیط استقرار بارگذاری می‌شوند · واحد فعال ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(sampleUnitPrice)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleUnitPrice, intlCurrency, locale)})` : ''} · معیار {formatAreaShort(85, areaUnit)}: {toPersianNum(sample85mTotalMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sample85mTotalMillions, intlCurrency, locale)})` : ''} · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleMonthlyRentMillions, intlCurrency, locale)})` : ''}
          </p>
        </div>
        <button type="button" onClick={fetchEnvStatus} disabled={loading} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold flex items-center gap-1.5 cursor-pointer transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>بروزرسانی وضعیت</span>
        </button>
      </div>
      {statusMsg && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
          {errorMsg}
        </div>
      )}
      {/* بخش ۱: ریشه‌های امنیتی و هویتی فقط‌خواندنی (Deployment-Managed Trust Roots) */}
      <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-slate-700" />
            <span>ریشه‌های امنیتی و اعتبارنامه‌های مستقر (فقط‌خواندنی · غیرقابل ویرایش در زمان اجرا)</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-white">
            Deployment-Managed Only
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">FIREBASE_PROJECT_ID (فقط‌خواندنی):</div>
            <div dir="ltr" className="font-mono font-bold text-slate-900 select-all">
              {report?.firebase.projectId || 'gen-lang-client-0713157837'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">FIRESTORE_DATABASE_ID (فقط‌خواندنی):</div>
            <div dir="ltr" className="font-mono font-bold text-slate-900 truncate select-all">
              {report?.firebase.firestoreDatabaseId || 'ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">ADMIN_EMAIL (ریشه مدیر اصلی):</div>
            <div dir="ltr" className="font-mono font-bold text-slate-900 select-all">
              {report?.firebase.adminEmail || 'radio837isf@gmail.com'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">OBJECT_STORAGE_ENDPOINT & BUCKET:</div>
            <div dir="ltr" className="font-mono font-bold text-slate-800 truncate">
              {report?.objectStorage.endpoint || '(local_bucket)'} / {report?.objectStorage.bucket || 'tehran-housing-radar-media'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">وضعیت کلیدهای استوریج و تلگرام:</div>
            <div className="font-bold text-slate-800">
              S3 Keys: {report?.objectStorage.accessKeyConfigured && report?.objectStorage.secretKeyConfigured ? 'تنظیم‌شده' : 'خالی'} · Bot Token: {report?.telegram.botTokenConfigured ? 'تنظیم‌شده' : 'خالی'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="text-slate-500 font-semibold">وضعیت کلیدهای Gemini و Admin Secret:</div>
            <div className="font-bold text-slate-800">
              Gemini Key: {report?.gemini.configured ? 'تنظیم‌شده' : 'خالی'} · Admin Secret: {report?.firebase.adminSecretConfigured ? 'تنظیم‌شده' : 'خالی'}
            </div>
          </div>
        </div>
      </div>
      {/* بخش ۲: فرم تنظیمات عملیاتی ایمن (Allowlisted Operational Settings) */}
      <form onSubmit={handleSaveEnv} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>۱. تنظیمات مدل هوش مصنوعی (GEMINI_MODEL)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                عملیاتی مجاز
              </span>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">مدل پیش‌فرض پردازش (GEMINI_MODEL):</label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (پیشنهادی - سریع و دقیق)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (تحلیل پیشرفته حقوقی و بازار)</option>
              </select>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Send className="w-4 h-4 text-sky-600" />
                <span>۲. شناسه کانال عمومی تلگرام (TELEGRAM_CHANNEL_ID)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                عملیاتی مجاز
              </span>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">شناسه کانال یا گروه مقصد (TELEGRAM_CHANNEL_ID):</label>
              <input
                type="text"
                dir="ltr"
                value={telegramChannelId}
                onChange={(e) => setTelegramChannelId(e.target.value)}
                placeholder="@TehranHousingRadar یا -100123456789"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-emerald-600" />
              <span>۳. پارامترهای غیرمحرمانه آبجکت استوریج (سقف حجم و CDN)</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              اعتبارنامه‌های S3 در محیط استقرار قفل شده‌اند
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">سرویس‌دهنده استوریج (PROVIDER):</label>
              <select
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value as ObjectStorageProviderId)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold"
              >
                <option value="arvancloud">ArvanCloud S3 (ابر آروان)</option>
                <option value="liara">Liara Object Storage (لیارا)</option>
                <option value="minio">MinIO Self-Hosted S3</option>
                <option value="s3_compatible">AWS / S3-Compatible</option>
                <option value="firebase_storage">Firebase Cloud Storage</option>
                <option value="local_bucket">Persistent Server Object Bucket</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 mb-1">منطقه دیتاسنتر (REGION):</label>
              <input
                type="text"
                dir="ltr"
                value={storageRegion}
                onChange={(e) => setStorageRegion(e.target.value)}
                placeholder="ir-thr-at1"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">دامنه عمومی CDN (PUBLIC_BASE_URL):</label>
              <input
                type="text"
                dir="ltr"
                value={storagePublicUrl}
                onChange={(e) => setStoragePublicUrl(e.target.value)}
                placeholder="https://cdn.example.ir"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-slate-600 mb-1">سقف عکس (MB):</label>
              <input
                type="number"
                min={1} max={25} value={maxImageMb} onChange={(e) => setMaxImageMb(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">سقف ویدیو (MB):</label>
              <input
                type="number"
                min={5} max={200} value={maxVideoMb} onChange={(e) => setMaxVideoMb(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold tabular-nums"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ذخیره این فرم نیازمند احراز هویت مدیر اصلی (Primary Bootstrap Admin) از طریق توکن Firebase است.</span>
          </div>
          <button
            type="submit"
            disabled={saving} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات عملیاتی مجاز'}</span>
          </button>
        </div>
      </form>
    </div>
  ); }
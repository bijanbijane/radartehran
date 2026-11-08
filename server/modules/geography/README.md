# ماژول جغرافیا و هوش مکانی رادار تهران (Geography & Location Intelligence Module)

این ماژول ارائه‌دهنده کاتالوگ مرجع سلسله‌مراتبی، موتور محاسبات فاصله‌ای ژئودزیک (WGS-84)، آزمون نقطه در چندضلعی (Point-in-Polygon)، نرمال‌سازی نشانی‌های ایرانی، و رابط‌های ارائه‌دهنده ژئوکدینگ و نمایه فضایی H3 است.

---

## ۱. ساختار سلسله‌مراتبی و مدل داده (Data Model & Hierarchy)

```
[Country: ایران (country:ir)]
       │
       ▼
[Province: ۳۱ استان کشور (province:*)]
       │
       ▼
[City: کلان‌شهرها و شهرستان‌ها (city:*)]
       │
       ├──► [Urban District: مناطق شهری (district:*)] (مثال: مناطق ۲۲گانه تهران)
       │            │
       │            ▼
       └──────► [Neighborhood: محلات مصوب (hood:*)]
```

### ۱.۱. شناسه یکتای پایدار (Stable Global Identifier)
شناسه‌ها مستقل از نام‌های نمایشی هستند و هرگز نام محله به تنهایی به عنوان شناسه یکتا استفاده نمی‌شود:
- کشور: `country:ir`
- استان: `province:tehran`, `province:alborz`, `province:fars`, ...
- شهر: `city:tehran`, `city:karaj`, `city:shiraz`, ...
- منطقه شهری: `district:tehran:1` تا `district:tehran:22`
- محله: `hood:tehran:5` (پونک)، `hood:karaj:101` (عظیمیه)

---

## ۲. مشخصات هندسی و اعتبار مرزها (Boundary Provenance)

برای جلوگیری از ادعاهای واهی در مورد مرزها، منبع داده با پرچم‌های صریح مشخص می‌شود:
1. `OFFICIAL_CADASTRAL_VERIFIED`: مرز کاداستر رسمی یا سازمان نقشه‌برداری.
2. `EMPIRICAL_MUNICIPAL_SURVEY`: داده‌های میدانی و نقشه‌های نواحی شهرداری.
3. `APPROXIMATE_RADIUS_SYNTHESIS`: تقریب شعاعی حول مرکز ثقل محله (`approximateRadiusMeters`).
4. `MISSING`: نبود داده هندسی یا مرز نامشخص.

---

## ۳. قوانین نرمال‌سازی آدرس و اصل عدم جعل مختصات (Zero-Fabrication Policy)

- **یکپارچه‌سازی حروف و ارقام**: تبدیل ی/ک عربی، الف همزه‌دار، ارقام فارسی/عربی و حذف نیم‌فاصله و اعراب.
- **تفکیک قطعی آدرس از مختصات**: موتور نرمال‌سازی آدرس، سطح تطابق محله یا شهر را مشخص می‌کند؛ اما **هرگز برای آدرس متنی مختصات ساختگی یا تقریبی تولید نمی‌کند** (`isCoordinateVerified: false`, `verifiedCoordinates: undefined`). مختصات فقط در صورت ژئوکدینگ رسمی یا ورود مستقیم با GPS تایید می‌شوند.

---

## ۴. وضعیت یکپارچه‌سازی H3 و ارائه‌دهنده ژئوکدینگ

### ۴.۱. نمایه فضایی H3
- وضعیت: **غیرفعال (UNCONFIGURED)**.
- پکیج `h3-js` در `package.json` پروژه نصب نشده است.
- طبق اصول جداسازی گیت، هیچ وابستگی به صورت خودسرانه اضافه نشده و رابط انتزاعی `H3SpatialIndexingProvider` به همراه پیاده‌سازی `UnconfiguredH3Provider` پیاده‌سازی شده که خطای صریح `H3_DEPENDENCY_MISSING` را بازمی‌گرداند.

### ۴.۲. ارائه‌دهنده ژئوکدینگ (Geocoding Provider)
- وضعیت: **پیش‌فرض خاموش (`UnavailableGeocodingProvider`)**.
- هیچ کلید API یا پاسخ جعلی هاردکد نشده است و سرویس وضعیت `UNAVAILABLE` بازمی‌گرداند تا زمانی که ارائه‌دهنده رسمی توسط راهبر فنی متصل شود.

---

## ۵. پایپ‌لاین ورود و به‌روزرسانی دیتاست‌ها (Dataset Import Pipeline)

پایپ‌لاین `GeographyImportPipeline` امکان ورود امن داده‌های مکانی جدید را فراهم می‌کند:
- **حالت آزمایشی (Dry-Run)**: بررسی کامل اعتبارسنجی بدون تغییر کاتالوگ زنده.
- **تشخیص شناسه‌های تکراری و تعارضات سلسله‌مراتبی**.
- **کنترل محدوده جغرافیایی ایران**: تشخیص جابجایی احتمالی Lat و Lng و مقادیر خارج از دامنه WGS-84.
- **گزارش خلاصه تغییرات**: تعداد آیتم‌های جدید، به‌روزشده، نامعتبر و خطاها.

---

## ۶. نحوه استفاده سایر ماژول‌ها (Integration Interfaces)

```typescript
import { defaultGeographyService } from './server/modules/geography';

// ۱. استعلام شهر یا محله
const city = defaultGeographyService.getCity('tehran');
const neighborhoods = defaultGeographyService.listNeighborhoods('tehran');

// ۲. محاسبه فاصله ژئودزیک بر حسب متر
const distance = defaultGeographyService.calculateDistanceMeters(
  { lat: 35.75, lng: 51.40 },
  { lat: 35.78, lng: 51.42 }
);

// ۳. تطبیق مختصات به محله با اولویت پلی‌گون و سپس شعاع تقریبی
const match = defaultGeographyService.resolveCoordinates({ lat: 35.77, lng: 51.34 });

// ۴. نرمال‌سازی و تطبیق آدرس بدون جعل مختصات
const addressOutcome = defaultGeographyService.resolveAddress('تهران، پونک، بلوار میرزابابایی');
```

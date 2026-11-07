# ماژول مشاوران املاک، دفاتر و اعتبارسنجی پروانه (Real Estate Professionals & Verification Module)

این ماژول مدیریت هویت حرفه‌ای، سلسله‌مراتب دفاتر املاک و شعب، و اعتبارسنجی پروانه‌های صنفی مشاوران و مدیران معاملات را به صورت کاملاً مستقل از آگهی‌های املاک (Bargains) و بازار خدمات ساختمانی بر عهده دارد.

---

## ۱. ارکان سه‌گانه تفکیک اعتبارسنجی (The Three Distinct Verification Pillars)

بزرگترین خطای سامانه‌های سنتی، یکسان انگاشتن تایید شماره همراه با داشتن پروانه کسب معتبر است. در این ماژول این سه مفهوم با مرزهای شفاف داده‌ای تفکیک شده‌اند:

1. **تایید شماره همراه (`phoneVerified`)**: صرفاً اثبات کنترل خط تلفن همراه در زمان دریافت پیامک OTP است و هیچ حق و نشانی مبنی بر تایید صنفی ایجاد نمی‌کند.
2. **احراز هویت فردی (`identityVerified`)**: تطبیق مشخصات سجلی کاربر با کد ملی.
3. **اعتبارسنجی پروانه صنفی (`licenseVerified`)**: استعلام برخط از مراجع رسمی (درگاه ملی مجوزها / سامانه کاتب / اتحادیه مشاورین املاک) یا ممیزی کارشناس حقوقی با ثبت لاگ رسمی.

---

## ۲. وضعیت‌های متمایز اعتبارسنجی و نشان‌های اعتماد (Verification Trust Badges)

کاربران رادار تهران به جای یک تیک آبی عمومی، با وضعیت‌های شفاف و متمایز زیر روبرو می‌شوند:

- `VERIFIED_BY_REGISTRY`: استعلام برخط و معتبر از درگاه رسمی اصناف/کاتب.
- `MANUALLY_REVIEWED_BY_PLATFORM`: تایید بر مبنای بررسی اسناد ثبتی توسط کارشناسان حقوقی پلتفرم.
- `SUBMITTED_UNVERIFIED` / `UNDER_MANUAL_REVIEW`: مدارک ارسال شده و در صف بررسی قرار دارد.
- `EXPIRED`: مهلت اعتبار پروانه به پایان رسیده است.
- `SUSPENDED` / `REVOKED`: فعالیت مشاور یا دفتر به دلایل انضباطی تعلیق شده است.
- `REGISTRY_UNAVAILABLE`: وضعیت صادقانه هنگام عدم دسترسی به درگاه وب‌سرویس دولتی.

---

## ۳. لینک‌های خارجی استعلام رسمی و جلوگیری از Open Redirect

تنها دامنه‌های حاکمیتی و صنفی زیر در لیست سفید مجاز شناخته می‌شوند:
- `ssaa.ir`: سازمان ثبت اسناد و املاک کشور (سامانه ثبت من)
- `katib.ir`: سامانه رسمی کاتب
- `iranianasnaf.ir` و `mojavez.ir`: درگاه ملی مجوزهای کشور (ایرانیان اصناف)
- `asnaftehran.ir`: اتحادیه صنف مشاورین املاک تهران

هرگونه آدرس نامعتبر، لینک کلاینت دلخواه یا پروتکل ناامن رد شده و از حملات هدایت به سایت‌های فیشینگ جلوگیری می‌شود.

---

## ۴. سلسله‌مراتب دفاتر املاک، شعب و اعضای فعال (Agency & Membership Workflow)

```
[دفتر مرکزی املاک (Agency)]
       │
       ├──► [شعبه ۱ (Branch 1)] ──► [مشاوران تخصصی شعبه]
       │
       └──► [شعبه ۲ (Branch 2)] ──► [مشاوران تخصصی شعبه]
```

### ماشین حالت عضویت (`AgencyMembershipState`):
- `INVITED`: دعوت از سوی مدیر آژانس ارسال شده و منتظر پذیرش مشاور است.
- `APPLICATION_SUBMITTED`: مشاور درخواست پیوستن داده و منتظر تایید صاحب جواز است.
- `ACTIVE`: مشاور عضو رسمی دفتر است.
- `SUSPENDED` / `TERMINATED`: خاتمه یا تعلیق همکاری.

---

## ۵. اتصال نماینده به آگهی‌های ملک (Listing Representation Contract)

ارتباط مشاور با آگهی‌های رادار صرفاً از طریق قرارداد فقط-خواندنی `ListingAgentAssociation` برقرار می‌شود. این ماژول هیچ حق مالکیتی بر آگهی برای مشاور تولید نمی‌کند و نشان رسمی مشاور تنها در صورتی روی آگهی نمایش داده می‌شود که اصالت پروانه وی معتبر باشد.

---

## ۶. درخواست یکپارچه‌سازی برای راهبر سیستم (Integration Lead Request)

جهت مونت کردن این ماژول بدون شکستن ایزولاسیون Git:
1. در `src/utils/serverUtilityRoutes.ts`:
   ```typescript
   import { registerRealEstateProfessionalRoutes } from '../../server/modules/real-estate-professionals';

   registerRealEstateProfessionalRoutes(app, {
     checkRateLimit,
     getClientIp,
   });
   ```
2. در `src/utils/expressRouteCatalog.ts`:
   - `GET /api/v2/real-estate-professionals`
   - `GET /api/v2/real-estate-professionals/verify/:id`
   - `GET /api/v2/real-estate-professionals/agencies`
   - `POST /api/v2/real-estate-professionals/profile`
   - `POST /api/v2/real-estate-professionals/phone/verify`
   - `POST /api/v2/real-estate-professionals/agencies`
   - `POST /api/v2/real-estate-professionals/agencies/:id/branches`
   - `POST /api/v2/real-estate-professionals/credentials`
   - `POST /api/v2/real-estate-professionals/admin/credentials/review`
   - `POST /api/v2/real-estate-professionals/memberships/invite`
   - `PATCH /api/v2/real-estate-professionals/memberships/:id/status`
   - `POST /api/v2/real-estate-professionals/listings/:id/associate`

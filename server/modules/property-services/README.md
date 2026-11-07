# بازار خدمات و متخصصان ساختمان رادار تهران (Property Services Marketplace Module)

این ماژول ارائه‌دهنده بستر تخصصی کشف و اتصال کارفرمایان به سازندگان، معماران، پیمانکاران، تکنسین‌ها، تامین‌کنندگان مصالح و کارشناسان رسمی صنعت ساختمان است. این بازار یک سامانه کاملاً مستقل از آگهی‌های فروش و رهن ملک مسکونی/تجاری رادار تهران است.

---

## ۱. گروه‌های پنج‌گانه دسته‌بندی خدمات (Service Groups)

1. **گروه الف - ساخت‌وساز و مهندسی (Construction & Building)**:
   - پیمانکاری عمومی و مدیریت پیمان (`cat_gen_contractor`)
   - طراحی نقشه و معماری فاز ۱ و ۲ (`cat_architect`)
   - محاسبات سازه و ایستایی (`cat_structural_eng`)
   - نظارت مقیم و نظام مهندسی (`cat_civil_supervisor`)
   - فونداسیون، بتن‌ریزی و آرماتوربندی (`cat_concrete_foundation`)
   - اجرای نما و شاسی‌کشی (`cat_facade`)
2. **گروه ب - بازسازی و دکوراسیون داخلی (Renovation & Interior)**:
   - معماری و دکوراسیون داخلی (`cat_interior_design`)
   - کابینت‌سازی و کمد دیواری (`cat_cabinet_maker`)
   - نقاشی و گچ‌کاری مدرن (`cat_painting_plaster`)
   - کاشی، سرامیک اسلب و پارکت (`cat_tile_flooring`)
   - درب ضدسرقت و پنجره دوجداره UPVC (`cat_door_window`)
3. **گروه ج - تعمیرات و نگهداری ساختمان (Repairs & Maintenance)**:
   - برق‌کاری، تابلو برق و هوشمندسازی (`cat_electrician`)
   - تاسیسات لوله‌کشی و نشت‌یابی (`cat_plumber`)
   - پکیج، چیلر و موتورخانه (`cat_hvac_technician`)
   - سرویس ادواری و استاندارد آسانسور (`cat_elevator_service`)
4. **گروه د - مصالح و تجهیزات ساختمانی (Materials & Equipment)**:
   - مصالح پایه: سیمان، گچ و بلوک هبلکس (`cat_mat_cement_block`)
   - آهن‌آلات، میلگرد و تیرآهن (`cat_mat_steel_beam`)
   - اجاره ابزارآلات و ماشین‌آلات ساختمانی (`cat_equip_rental`)
5. **گروه ه - خدمات کارشناسی و ملکی (Property & Real-Estate Professional)**:
   - کارشناسی سلامت فنی و عیوب پنهان ساختمان (`cat_property_inspection`)
   - کارشناس رسمی دادگستری و ارزیابی املاک (`cat_official_valuation`)
   - نقشه‌برداری کاداستر و تهیه UTM ثبتی (`cat_surveying_geomatics`)
   - اسباب‌کشی و حمل تخصصی اثاثیه (`cat_moving_freight`)

*معماری رجیستری دسته‌بندی‌ها به صورت کاملاً ماژولار و قابل گسترش (`ServiceCategoryRegistry`) پیاده‌سازی شده تا بدون نیاز به بازنویسی هسته، رسته‌های جدید افزوده شوند.*

---

## ۲. تفکیک مشخصات عمومی و محرمانه متخصصان (Privacy & Field Separation)

- **پروفایل عمومی (`ProviderPublicProfile`)**: نام نمایشی، نام تجاری، نوع ارائه‌دهنده، دسته‌های خدمات، توضیحات، مناطق پوشش‌دهی شهری، شناسه نمونه‌کارها، نشان وضعیت تایید، تعداد پروژه‌های موفق، و میانگین امتیاز نظرات.
- **اطلاعات محرمانه (`ProviderPrivateProfile`)**: شماره تماس، کد ملی/شناسه اقتصادی، آدرس دفتر، شماره شبا، و مدارک بارگذاری‌شده هویتی که **هرگز در جستجوهای عمومی افشا نمی‌شوند**.

---

## ۳. ماشین حالت تایید صلاحیت و مدارک (Credential State Machine)

```
[NOT_SUBMITTED]
      │ (ارسال مدرک و فایل به صف)
      ▼
 [SUBMITTED]
      │ (شروع بررسی مدارک)
      ▼
[UNDER_REVIEW]
  ├── (تایید اصالت مدرک) ──────► [VERIFIED] (اعطای نشان تایید)
  ├── (مغایرت یا نقص مدرک) ────► [REJECTED] (همراه با دلیل کارشناسی)
  └── (انقضای تاریخ اعتبار) ──► [EXPIRED]
```
*ارسال فایل مدرک به منزله تایید خودکار تلقی نمی‌شود و تایید نهایی صرفاً توسط مدیر سامانه با ثبت ردپا (Audit Trail) انجام می‌گردد.*

---

## ۴. چرخه حیات درخواست خدمت و پیش‌فاکتور (Request & Quotation Workflow)

1. **ثبت درخواست (`ServiceRequestDocument`)**: کارفرما شرح نیاز، شهر و محله، بودجه پیشنهادی و زمان‌بندی را ثبت می‌کند.
2. **ارسال پیش‌فاکتور (`QuotationDocument`)**: ارائه‌دهندگان قیمت قطعی، شرح خدمات، موارد استثنا و مدت زمان اجرا را ارسال می‌کنند.
3. **حفظ حریم خصوصی قیمت‌ها**: هر ارائه‌دهنده فقط پیش‌فاکتور ارسالی خود را می‌بیند؛ کارفرما لیست تمامی پیش‌فاکتورهای ارائه‌شده برای درخواست خود را مشاهده می‌کند.
4. **پذیرش و ایجاد سفارش (`BookingDocument`)**: با پذیرش پیش‌فاکتور توسط کارفرما، سفارش وارد وضعیت `ACCEPTED` شده و وارد ماشین حالت اجرای پروژه می‌شود.

---

## ۵. ماشین حالت چرخه سفارش کار (Booking Lifecycle)

```
[REQUESTED] ──► [QUOTED] ──► [ACCEPTED] ──► [SCHEDULED] ──► [IN_PROGRESS] ──► [COMPLETED]
     │              │             │              │                │
     └──────────────┴─────────────┴──────────────┴────────────────┴────────► [CANCELLED]
                                                                  │
                                                                  └────────► [DISPUTED]
```
- کارفرما و مجری کار نمی‌توانند میان‌برهای غیرمجاز در وضعیت سفارش ثبت کنند.
- ثبت اتمام کار (`COMPLETED`) فقط توسط مجری یا مدیر امکان‌پذیر است.

---

## ۶. نظرات و بازخوردها مبتنی بر کار واقعی (Verified Reviews)

- **تنها کارفرمایانی که سفارش کار آنها به وضعیت قطعی `COMPLETED` رسیده باشد، مجاز به ثبت نظر و امتیاز هستند.**
- مجریان حق ویرایش یا حذف نظرات مشتریان را ندارند.

---

## ۷. درخواست یکپارچه‌سازی برای راهبر سیستم (Integration Lead Request)

جهت مونت کردن این ماژول بدون شکستن ایزولاسیون Git:
1. در `src/utils/serverUtilityRoutes.ts`:
   ```typescript
   import { registerPropertyServicesRoutes } from '../../server/modules/property-services';

   registerPropertyServicesRoutes(app, {
     checkRateLimit,
     getClientIp,
   });
   ```
2. در `src/utils/expressRouteCatalog.ts`:
   - `GET /api/v2/property-services/categories`
   - `GET /api/v2/property-services/providers`
   - `GET /api/v2/property-services/providers/:id`
   - `POST /api/v2/property-services/provider/profile`
   - `POST /api/v2/property-services/provider/credentials`
   - `POST /api/v2/property-services/requests`
   - `GET /api/v2/property-services/requests/:id/quotations`
   - `POST /api/v2/property-services/requests/:id/quotations`
   - `POST /api/v2/property-services/quotations/:id/accept`
   - `PATCH /api/v2/property-services/bookings/:id/status`
   - `POST /api/v2/property-services/bookings/:id/review`
   - `POST /api/v2/property-services/admin/credentials/review`

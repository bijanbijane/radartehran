# نقشه راه جامع فرانت‌اند رادار تهران — مراحل ۱ تا ۱۳ (`RT-FE-ARCH-001` تا `RT-FE-PERFORMANCE-ARCHITECTURE-013`)

این سند مرجع رسمی معماری، طراحی و پیاده‌سازی **مراحل اول تا سیزدهم نقشه راه جامع فرانت‌اند رادار تهران** و پیوست استقرار Cloudflare را مستند می‌کند.

---

## ۱. مرحله اول: طراحی معماری ماژولار فرانت‌اند (`RT-FE-ARCH-001`)
- **تصمیم معماری اصلی**: معماری **یکپارچه ماژولار (`Modular Monolith`)** روی `React 19 + TypeScript + Vite + Tailwind CSS`.
- **۶ لایه معماری**: `Application`، `Pages & Layouts`، `Features`، `Domain Models`، `Frontend Platform`، و `Shared`.
- **۱۳ ماژول اصلی محصول (`FE-M01` تا `FE-M13`)**: املاک، محله‌ها، نقشه، ارزش‌گذاری، تحلیل بازار، آگهی‌ها، مکان‌ها، خدمات، محتوا، جست‌وجو، حساب کاربری، محیط حرفه‌ای و مدیریت سامانه.
- **ماتریس ۱۱ردیفه مالکیت (`OUT-07`)** و **جدول ۸گانه حاکمیت وضعیت (`OUT-08`)** به همراه قرارداد عمومی `PropertyModuleContract`.

---

## ۲. مرحله دوم: معماری اطلاعات، ساختار صفحات و نظام مسیریابی (`RT-FE-IA-002` + `RT-FE-IA-002-CF-001`)
- **۵ فضای کلان محصول**: `Public Space`، `Analytical Space`، `User Workspace`، `Admin Space`، و `System Space`.
- **دفتر ثبت مرکزی مسیرها (`RT_FE_IA_CENTRAL_ROUTE_REGISTRY`)**: پوشش ۵۵ مسیر رسمی با چرخه حیات `Idle → Validating → Loading → Ready / Empty / Error → Updating`.
- **پیوست الزامی Cloudflare (`RT-FE-IA-002-CF-001`)**:
  - الگوی استقرار `React SPA + Vite + Cloudflare Workers Static Assets`.
  - مسیریابی دوسطحی (`not_found_handling = "single-page-application"` و `run_worker_first = ["/api/*"]`).
  - تضمین پاسخ JSON استاندارد برای `/api/*` (عدم بازگشت `index.html`).
  - تفکیک ۳ محیط `dev`، `staging` و `production` بدون ارث‌بری خودکار Bindings و منع کامل کلید محرمانه در `VITE_*`.

---

## ۳. مرحله سوم: طراحی پوسته اصلی برنامه، چیدمان‌ها و نظام ناوبری (`RT-FE-SHELL-003`)
- **۴ چیدمان اصلی (`Layouts`)**: `PublicLayout`، `WorkspaceLayout`، `AdminLayout` (۱۱ بخش)، و `SystemLayout`.
- **۳ حالت ناحیه محتوا**: `Standard` (`1280px`)، `Wide` (`1600px`)، و `Full-Screen` (`100vw × calc(100vh - header)`).
- **۸ میزبان لایه‌های شناور (`OVL-01` تا `OVL-08`)** و **۴ سطح مهار خطا (`Error Boundary`)**.

---

## ۴. مرحله چهارم: طراحی سامانه طراحی دیداری و استانداردهای یکپارچه رابط کاربری (`RT-FE-DESIGN-SYSTEM-004`)
- **معماری ۵لایه سامانه طراحی**: `Primitive Tokens`، `Semantic Tokens`، `Component Tokens`، `Layout Patterns`، و `Theme System`.
- **پالت رنگ و توکن‌ها**: `CLR-001`..`CLR-010` (`#287C83`)، `N-001`..`N-010`، رنگ‌های وضعیت، و پالت شهری و مکانی `GEO-001`..`GEO-010`.
- **تایپوگرافی فارسی (`Vazirmatn`)**: مقیاس `T-001`..`T-010` و قالب‌بندی استاندارد ارقام مالی و متراژ با `Tabular Numbers`.

---

## ۵. مرحله پنجم: کتابخانه کامپوننت‌های مشترک (`RT-FE-SHARED-COMPONENTS-005`)
- **۶۰ کامپوننت استاندارد (`COMP-001` تا `COMP-060`)** در ۸ گروه و ۳ سطح (`Primitive`، `Composite`، `Domain`).
- **۱۴ حالت رفتاری استاندارد** و قوانین اولویت‌بندی (`Disabled + Loading → Disabled`، `Invalid + Focus → Focus Ring + Error Indicator`).
- **انتخابگر سلسله‌مراتبی مکان (`COMP-040 — LocationSelector`)** و یکسان‌سازی خطاهای بک‌اند/Cloudflare بدون افشای جزئیات فنی.

---

## ۶. مرحله ششم: سیستم چیدمان، پوسته صفحات و معماری فضایی (`RT-FE-LAYOUT-006`)
- **۲۰ واحد معماری چیدمان (`LAY-001` تا `LAY-020`)** و نمایش صریح زمینه شهر فعال در `Global Header`.
- **۸ الگوی چیدمان صفحه (`LAY-008` تا `LAY-015`)**: `Dashboard`، `Listing`، `Detail`، `Analytics`، `Map`، `Form`، `Workspace`، و `Admin`.
- **ایزوله‌سازی خطای ماژول‌های داشبورد و نقشه**: خرابی یکی از ماژول‌های `KPI`، `Chart`، `Table` یا `Map` کل صفحه را متوقف نمی‌کند.

---

## ۷. مرحله هفتم: معماری اطلاعات، گراف موجودیت‌ها، نقشه سایت و مسیرهای کاربر (`RT-FE-IA-NAVIGATION-007` و `RT-FE-INFORMATION-ARCHITECTURE-007`)
- **۱۲ حوزه کلان اطلاعاتی (`IA-001`)**، **۹ پرسش مدل ذهنی کاربر**، و **۲۰ موجودیت اصلی (`ENT-001` تا `ENT-020`)**.
- **تفکیک معنایی دقیق**: `Property` (ملک به‌عنوان موجودیت فیزیکی/تحلیلی)، `Building` (ساختمان)، و `Listing` (آگهی عرضه در بازار).
- **نظام ناوبری ۵سطحی (`NAV-001` تا `NAV-005`)**، **۶ مسیر اصلی حرکت کاربر (`JOURNEY-001` تا `JOURNEY-006`)**، قرارداد `RadarRouteMeta` و بازنشانی خودکار `page=1` هنگام تغییر فیلترها.

---

## ۸. مرحله هشتم: سیستم طراحی بصری (`RT-FE-VISUAL-DESIGN-SYSTEM-008`)
- **۱۹ واحد معماری بصری (`VDS-001` تا `VDS-019`)** و **۲۸ خروجی الزامی (`VDS-OUT-001` تا `VDS-OUT-028`)**.
- **پالت هویت برند**: `Radar Deep Navy (#173B57)`، `Radar Blue (#246B8F)`، `Tehran Analytical Teal (#3C8D91)`، و `Urban Signal Amber (#D5A64A)`.
- **سیستم ۴توکنی رنگ‌های معنایی وضعیت**: `Background`، `Border`، `Text`، و `Icon` برای ۵ وضعیت `Success`، `Warning`، `Danger`، `Info`، و `Neutral`.
- **نظام سایه و ارتفاع (`E0` تا `E5`)**، **سلسله‌مراتب مرکزی `Z-Index`**، **۳ سطح تراکم بصری (`Comfortable`، `Standard`، `Compact`)**، ۹ نوع نمودار تحلیلی و سلسله‌مراتب ۶لایه نقشه.

---

## ۹. مرحله نهم: نظام تعامل و رفتار رابط کاربری (`RT-FE-INTERACTION-DESIGN-SYSTEM-009`)
- **۲۳ واحد معماری رفتاری (`IDS-001` تا `IDS-023`)** و **۲۵ خروجی الزامی (`IDS-OUT-001` تا `IDS-OUT-025`)**.
- **چرخه استاندارد ۸گامی تعامل (`IDS-002`)** و **۵ سطح حفاظت از عملیات** (عادی، قابل بازگشت با `Undo`، مهم، مخرب، غیرقابل بازگشت).
- **مدل ۸حالته عملیات غیرهم‌زمان (`IDS-011`)**: `Idle`, `Pending`, `Running`, `Success`, `Partial Success`, `Failed`, `Cancelled`, `Timed Out` به همراه مهار `Race Condition` در پاسخ‌های خارج از نوبت.
- **۱۰ طبقه خطای تعاملی و قرارداد بازیابی بدون ازدست‌رفتن داده کاربر (`IDS-019`)**، **۸ میان‌بر استاندارد صفحه‌کلید (`IDS-018`)**، **قانون تک‌مالکی وضعیت در ۵ لایه (`IDS-020`)** و **ماتریس ۹ردیفه تطبیق تعامل در دسکتاپ، تبلت و موبایل (`IDS-021`)**.

---

## ۱۰ و ۱۱. مراحل دهم و یازدهم: الگوهای صفحات و معماری اطلاعات و ساختار محتوا (`RT-FE-PAGE-TEMPLATES-010` و `RT-FE-INFORMATION-ARCHITECTURE-011`)
- **۱۰ الگوی استاندارد صفحه (`TPL-01` تا `TPL-10`)** و **۱۶ طبقه کلان اطلاعات (`IA-001`)**.
- **۵۷ موجودیت رسمی (`GEO`, `RE`, `BLD`, `MKT`, `SRV`, `RSC`)**، **۱۰ رجیستری مرکزی (`IA-027`)** و **۳۵ خروجی الزامی (`IA-OUT-001` تا `IA-OUT-035`)**.
- **نرمال‌سازی جست‌وجوی فارسی (`IA-016`)** بدون تغییر متن خام منبع و **داوری تعارض مشاهدات (`IA-025`)** همراه با ۸ وضعیت فقدان داده و ۵ سطح محرمانگی (`IA-030`).

---

## ۱۲. مرحله دوازدهم: نظام مدیریت داده در فرانت‌اند (`RT-FE-DATA-ARCHITECTURE-012`)
- **۶ لایه مسئولیت (`UI Layer` تا `Infrastructure`)** و **۵ طبقه وضعیت (`Server`, `Client`, `URL`, `Form`, `Derived`)** به همراه ۱۰ وضعیت فرم.
- **مسیر مرکزی مصرف داده (`Hook → Query → Repository → API Client`)**، انتخاب `TanStack Query` + `Zod`، نرمال‌ساز `Query Key` بدون نشت توکن، ۹ سیاست کش و ابطال تگ‌محور.
- **کنترل تعارض نسخه (`VersionedEntity 409`)**، تفکیک `Optimistic Update` از عملیات نیازمند تأیید Backend، ۱۱ وضعیت داده/خطا، ۶ سیاست Retry، جریان امن فایل در `R2`، جداسازی سرویس‌های `Cloudflare (Workers/D1/KV/R2/Queues)`، تله‌متری بدون PII، نقشه اجرای ۲۰گامی و **۲۵ خروجی الزامی (`RT-DATA-OUT-001` تا `RT-DATA-OUT-025`)**.

---

## ۱۳. مرحله سیزدهم: معماری عملکرد و بهینه‌سازی فرانت‌اند (`RT-FE-PERFORMANCE-ARCHITECTURE-013`)
- **۸ حوزه عملکرد (`FPA-002`)**، **۴ گروه اولویت صفحات (`A` تا `D`)**، **۳۱ واحد معماری (`FPA-001` تا `FPA-031`)** و **۳۸ خروجی الزامی (`FPA-OUT-001` تا `FPA-OUT-038`)**.
- **بودجه Core Web Vitals**: `LCP ≤ 2500ms`، `INP ≤ 200ms`، `CLS ≤ 0.1` و سقف `Long Task = 50ms`.
- **رندر تطبیقی (`Full` / `Balanced` / `Lite`)** و بهینه‌سازی نقشه `Leaflet` (`individual` / `cluster` / `canvas` / `aggregated`) متناسب با رم دستگاه، سطح Zoom و `prefers-reduced-motion`.

---

## ۱۳ب. مرحله سیزدهم (ماژول‌بندی): نظام ماژول‌بندی و معماری قابلیت‌های فرانت‌اند (`RT-FE-FEATURE-ARCHITECTURE-013`)
- **۵ محدوده کلان معماری**: `Application Shell`، `Feature Modules`، `Shared Capabilities`، `Application Infrastructure` و `Backend Contracts`.
- **۴۲/۵۱ قابلیت محصول (`FEAT-PROP-001`..`FEAT-ADM-006` و `FEAT-001`..`051`)** با تفکیک **۱۱ مالکیت رسمی موجودیت‌ها** (`Property` ← `Properties`، `Neighborhood` ← `Neighborhoods`) و ساختار داخلی استاندارد.
- **کنترل مرز و رجیستری وابستگی (`FeatureDependency`)**: منع دسترسی به فایل داخلی سایر ماژول‌ها، تشخیص چرخه در `CI`، جداسازی مدل‌های `Domain / Application / UI`، ۷ Adapter کتابخانه خارجی (`Leaflet`، `TanStack Query`، `Zod`، `Firebase Auth`) و قراردادهای `Public API`، `Shared Contracts`، `AppEvent<T>` و `Route/URL Contracts`.
- **حاکمیت دسترسی، Flag و عامل‌های هوشمند**: تفکیک کامل `Feature Flag` از `Permission`، ۴ سطح `Error Boundary`، قرارداد `AgentTaskBoundary`، ۱۲ سند رسمی (`RT-FEA-DOC-001..012`)، ۲۷/۳۶ خروجی الزامی (`RT-FEA-OUT-001..027` و `RT-FEAT-OUT-001..036`) و پیوند به **مرحله چهاردهم (`RT-FE-NAVIGATION-WORKSPACE-014`)**.

---

## ۱۴. مرحله چهاردهم: نظام ناوبری، کشف قابلیت‌ها و مدیریت فضای کاری (`RT-FE-NAVIGATION-WORKSPACE-014`)
- **۷ زیرسامانه کلان ناوبری (`NAV-S1` تا `NAV-S7`)**: `Global Navigation` (۱۰ گروه منو)، `Local Navigation`، `Workspace Navigation` (۷ فضای کاری از جمله `Public` تا `Data Operations`)، `Discovery System`، `Command System (Ctrl+K)`، `Navigation Context & History` و `Navigation Infrastructure`.
- **قراردادهای یکپارچه ناوبری**: `NavigationItem` متصل به `featureId`، `WorkspaceContext`، `BreadcrumbItem[]` متکی بر نام واقعی تأییدشده، و `NavigationContextTransfer` بدون نشت فیلترهای موقت.
- **امنیت و بازیابی کنترل‌شده**: اعتبارسنجی `Deep Link` در برابر `Open Redirect` و منع قرارگیری توکن/داده محرمانه در URL، نرمال‌سازی جست‌وجوی فارسی با فیلتر `Permission`، تفکیک `404` از `403` در ۱۰ وضعیت شکست ناوبری، تله‌متری بدون `PII`، برنامه مهاجرت ۷فازی، **۳۳ خروجی الزامی (`RT-NAV-OUT-001` تا `RT-NAV-OUT-033`)** و مرز انتقال به **مرحله پانزدهم (`RT-FE-PAGE-COMPOSITION-015`)**.

---

## ۱۵. مرحله پانزدهم: نظام ترکیب صفحات، ساختار Layoutها و نواحی محتوایی (`RT-FE-PAGE-COMPOSITION-015`)
- **سلسله‌مراتب ۶سطحی ترکیب صفحه**: `Application Shell` ← `Workspace Shell` ← `Page Layout` ← `Content Regions` ← `Feature Content` ← `UI Components` با جداسازی کامل ساختار بصری از منطق تجاری Feature.
- **۱۰ الگوی رسمی Layout Registry (`LYT-001` تا `LYT-010`) و ۷ ناحیه محتوایی (`main` تا `bottom`)**: اعتبارسنجی صریح Regionهای مجاز هر الگو، اختصاص اولین فضای ممکن به نقشه (`map.invalidateSize`)، و ۵ سطح `Error Boundary` (`Application` تا `Widget`).
- **پنل‌ها، Responsive، Z-index و بازیابی تنظیمات**: تغییر اندازه با صفحه‌کلید، تبدیل خودکار ستون جانبی به `Drawer / Bottom Sheet` در تبلت و موبایل، جلوگیری از `Overlay Stacking` (`Modal` روی `Modal`)، بازیابی امن نسخه‌های منقضی `LayoutPersistencePayload`، نقشه اجرای ۱۰فازی، **۳۳ خروجی الزامی (`RT-FE-PAGE-OUT-001` تا `RT-FE-PAGE-OUT-033`)** و پیوند به **مرحله شانزدهم (`RT-FE-INTERACTION-PATTERNS-016`)**.

---

## ۱۶. مرحله شانزدهم: نظام الگوهای تعامل، رفتار کنترل‌ها و ریزتعامل‌ها (`RT-FE-INTERACTION-PATTERNS-016`)
- **مدل ۵مرحله‌ای و ۱۶ گروه تعامل (`INT-001` تا `INT-016`) با ۱۳ وضعیت کنترل**: `Trigger → Interaction Handler → State Transition → User Feedback → Completion / Recovery` با مهار `Double Submission` و منع موفقیت کاذب در `Offline`.
- **تأیید C0 تا C4، نتیجه جزئی عملیات گروهی و Multi-Selection**: الزام ذکر تعداد هدف، تفکیک `partial` از `success` کامل، منع درصد ساختگی پیشرفت، کنترل `Selection Toolbar` و وضعیت سه‌گانه والد سلسله‌مراتبی (`checked / indeterminate / unchecked`).
- **دسترس‌پذیری و ریزتعامل‌ها**: جایگزین صفحه‌کلیدی برای `Drag & Drop`، حذف انیمیشن در `prefers-reduced-motion`، جلوگیری از ثبت میان‌بر تکراری، ۸ الگوی بازیابی خطا بدون اتلاف داده کاربر، برنامه اجرای ۱۰فازی، **۳۰ خروجی الزامی (`RT-FE-INT-OUT-001` تا `RT-FE-INT-OUT-030`)** و مرز انتقال به **مرحله هفدهم (`RT-FE-FORM-WORKFLOW-017`)**.

---

## ۱۷. مرحله هفدهم: نظام فرم‌ها، ورود اطلاعات، اعتبارسنجی و گردش‌کارهای کاربری (`RT-FE-FORM-WORKFLOW-017`)
- **۸ لایه فرم و ۱۱ فیلد معنایی مشترک**: جداسازی کامل `Form Definition` و `Schema & Rules` از `Renderer` و `Backend API` بدون دسترسی مستقیم مرورگر به `Cloudflare D1 / KV / Queues`.
- **بومی‌سازی فارسی و پولی**: تبدیل ارقام فارسی/عربی (`۱۲۳` / `١٢٣`) بدون تخریب ورودی خام، تبدیل تک‌لایه `IRT ↔ IRR`، تفکیک `Error` مسدودکننده از `Warning`، و تمایز کامل موجودیت `Property` از `Listing`.
- **ذخیره موقت، آپلود امن، ورود گروهی و گردش‌کار**: منع ذخیره داده حساس صرفاً در `localStorage`، تشخیص `Version Conflict` در `Autosave`، پشتیبانی `Partial Success` در `CSV/XLSX`، گیت انتشار نیازمند مجوز + واحد/دوره/منبع، نقشه ۱۲فازی، **۳۰ خروجی الزامی (`OUT-001` تا `OUT-030`)** و مرز انتقال به **مرحله هجدهم (`RT-FE-SEARCH-FILTER-018`)**.

---

## ۱۸. مرحله هجدهم: نظام جست‌وجو، فیلترگذاری، ساخت پرس‌وجو و کشف داده (`RT-FE-SEARCH-FILTER-018`)
- **۱۰ زیرسامانه و ۶ حوزه `Search Registry`**: `property.search`، `listing.search`، `neighborhood.search`، `indicator.search`، `research.search` و `service.search` متصل به `Shared Search Query` برای هماهنگی هم‌زمان فهرست، نقشه و نمودار بدون اتصال مستقیم مرورگر به `Cloudflare D1/KV`.
- **درخت `QueryBuilder`، ۱۷ عملگر و نرمال‌سازی فارسی**: جداسازی `original` از `normalized`، اعتبارسنجی عمق و Allowlist فیلدها، تفکیک عملگرهای مکانی (`near`, `within`, `intersects`) و مسدودسازی `SQL Injection`.
- **هوشمندی، URL و امنیت Cache**: استخراج `Query Draft` از زبان طبیعی همراه با علامت‌گذاری عبارات مبهم (بدون عدد ساختگی)، حذف پارامترهای حساس URL و بازنشانی `cursor` در تغییر فیلتر، ایزوله‌سازی کلیدهای Cache عمومی/خصوصی، نقشه ۱۲فازی، **۲۷ خروجی الزامی (`OUT-001` تا `OUT-027`)** و مرز انتقال به **مرحله نوزدهم (`RT-FE-RESULTS-PRESENTATION-019`)**.

---

## ۱۹. مرحله نوزدهم: نظام نمایش نتایج، فهرست‌ها، جدول‌های داده و نماهای مقایسه‌ای (`RT-FE-RESULTS-PRESENTATION-019`)
- **۹ لایه نمایش، `Display Schema` و ۹ نمای `View Registry`**: جداسازی مدل داده از ۴ سطح نمایشی (`Compact` تا `Analytical`)، پوشش نمای کارت، فهرست، جدول تخصصی، مقایسه، خط زمانی و همگام با نقشه بدون تحمیل یک الگوی یکسان به همه موجودیت‌ها.
- **کیفیت داده، `Formatter` و مقایسه ایمن**: تفکیک صریح صفر واقعی (`0`) از داده ناموجود (`null`)، نامعتبر، محرمانه و تأییدنشده، تبدیل یکپارچه واحدها بدون تغییر داده خام، کنترل یکسانی نوع/واحد/دوره در `Comparison View`، و جلوگیری از اختلاط بسته‌های متعلق به `queryId` قبلی.
- **انتخاب، ستون‌ها، هم‌زمانی و امنیت**: تفکیک انتخاب صفحه (`explicit`) از کل نتایج (`all_matching`) با الزام بازبینی مجوز در `Backend`، ۴ Preset آماده ستون با اولویت `User Preference > Workspace Preference > Feature Default`، ۱۰ وضعیت نمایش نتایج، نقشه ۱۲فازی، **۲۳ خروجی الزامی (`RT-FE-RESULTS-OUT-001` تا `RT-FE-RESULTS-OUT-023`)** و مرز انتقال به **مرحله بیستم (`RT-FE-DATA-VISUALIZATION-020`)**.

---

## ۲۰. مرحله بیستم: نظام بصری‌سازی داده، نمودارها، داشبوردهای تحلیلی و تعاملات داده‌محور (`RT-FE-DATA-VISUALIZATION-020`)
- **۱۱ لایه بصری‌سازی و ۳ رجیستری مرکزی**: `Metric Registry` (۱۰ حوزه شاخص بدون محاسبه پنهان شاخص رسمی در فرانت‌اند)، `Dimension Registry` و `Chart Registry` (۱۸ الگوی نمودار با مسدودسازی `Pie` پرتعداد، `Line` غیرزمانی، میله بریده‌شده و محور دوگانه بدون برچسب/سلب‌ادعا).
- **سری زمانی، توزیع، عدم قطعیت و مکان**: تفکیک `null` از `0` با `gapPolicy`، ممنوعیت درون‌یابی جعلی ماهانه به روزانه و تغییر درصدی مخرج صفر، ۵ روش طبقه‌بندی `Choropleth` روی `Leaflet Adapter` مشترک، خلاصه متنی `WCAG 2.2 AA`، و تشخیص چرخه بی‌پایان در `Cross-filtering`.
- **داشبورد، حاکمیت Small-Cell و خروجی**: ۸ نوع داشبورد، ۷ روش نمایش عدم قطعیت، مسدودسازی خروجی زیر حد نصاب نمونه (`n < 5`) و حذف `PII` تله‌متری، **۳۳ خروجی الزامی (`RT-FE-VIS-OUT-001` تا `RT-FE-VIS-OUT-033`)** و مرز انتقال به **مرحله بیست‌ویکم (`RT-FE-ENTITY-DETAIL-021`)**.

---

## ۲۱. مرحله بیست‌ویکم: صفحات جزئیات موجودیت‌ها، پروفایل ملک، محله، ساختمان و آگهی (`RT-FE-ENTITY-DETAIL-021`)
- **۱۰ لایه معماری و هویت پایدار (`Entity Identity` / `Canonical URL`)**: تفکیک موجودیت از نما (`Profile / Summary / Compare / Map View`)، شناسه مستقل از عنوان قابل تغییر، ممنوعیت قرارگیری توکن یا داده خصوصی در Query String، و هدایت کنترل‌شده وضعیت‌های `Deleted`، `Restricted` و `Merged`.
- **پروفایل‌های تخصصی و کیفیت داده**: `Entity Detail Shell` و `Section Registry` با ایزوله‌سازی خطای بخش (در برابر خطای هویت کل صفحه)، تفکیک صریح ۶ نوع قیمت ملک بدون ادغام در «قیمت ملک»، تمایز `Missing` از `۰` تأییدشده و `Not Applicable`، تفکیک مالکیت `Building` از `Property`، و عدم قطعیت تطبیق `Listing` صرفاً بر اساس شباهت آدرس/تصویر.
- **منشأ سطح فیلد (`Provenance`)، روابط، تاریخچه و زمینه**: تشخیص و نمایش تعارض منابع (`conflicting`) بدون جعل حقیقت واحد، روابط ۱۰گانه (`confirmed / probable / unverified`) متکی بر منشأ، حفظ زمینه بازگشت (`Context Preservation`) بدون ذخیره حجم زیاد در URL، حذف `PII` تله‌متری، نقشه ۱۲فازی، **۳۱ خروجی الزامی (`RT-FE-ENTITY-OUT-001` تا `RT-FE-ENTITY-OUT-031`)** و مرز انتقال به **مرحله بیست‌ودوم (`RT-FE-ENTITY-ENGAGEMENT-022`)**.

---

## ۲۲. مرحله بیست‌ودوم: نظام علاقه‌مندی‌ها، دنبال‌کردن موجودیت‌ها، فهرست‌های شخصی و رصد تغییرات (`RT-FE-ENTITY-ENGAGEMENT-022`)
- **مرزبندی ۱۰ مفهوم کلیدی و ۹ لایه Engagement**: جداسازی کامل `Favorite`، `Follow`، `Collection`، `Watch Rule`، `Alert`، `Notification` و `Delivery`؛ حذف `Favorite` یا `Collection` باعث حذف موجودیت اصلی یا تاریخچه آن نمی‌شود؛ استخراج مالکیت رکورد صرفاً از نشست معتبر سرور (`No IDOR` / `Tenant Isolation`) و منع ذخیره Snapshot کامل به‌عنوان منبع حقیقت.
- **سازمان‌دهی شخصی و رصد تغییرات**: نرمال‌سازی فارسی برچسب‌ها (`ي/ی`، `ك/ک`، نیم‌فاصله) برای جلوگیری از تکرار، نسخه‌بندی `Personal Notes` با مدیریت تعارض، ابطال فوری لینک اشتراک منقضی یا لغوشده، مسدودسازی `Watch Rule` مبهم بدون فیلد/عملگر/آستانه/واحد، و حذف نویز تغییر قالب و ارقام فارسی/لاتین در `Change Monitoring`.
- **اعلان‌ها، Activity Center و حریم خصوصی**: Deduplication رویدادها، منع ادغام هشدار `critical` در دسته‌های عادی، حفظ رویدادها در `Quiet Hours`، همگام‌سازی آفلاین و حذف کامل متن یادداشت و توکن اشتراک از تله‌متری، نقشه ۱۲فازی، **۳۵ خروجی الزامی (`RT-FE-ENGAGEMENT-OUT-001` تا `RT-FE-ENGAGEMENT-OUT-035`)** و مرز انتقال به **مرحله بیست‌وسوم (`RT-FE-NOTIFICATION-COMMUNICATION-023`)**.

---

## ۲۳. مرحله بیست‌وسوم: نظام مرکز اعلان‌ها، ارتباطات چندکاناله و مدیریت ترجیحات ارتباطی (`RT-FE-NOTIFICATION-COMMUNICATION-023`)
- **۱۰ لایه معماری اعلان‌ها و جداسازی Inbox از Delivery**: پوشش ۱۰ لایه از `Notification Experience Layer` تا `Persistence & Observability` و ۱۳ موجودیت مفهومی؛ تفکیک ۴ وضعیت کاربرمحور (`unread`, `read`, `archived`, `deleted` منطقی) از ۹ وضعیت تحویل (`queued` تا `unknown`)، ۱۰ نوع اعلان (`system` تا `announcement`)، ۴ اولویت (`critical` تا `low`) و ۴ کانال (`in_app`, `email`, `web_push`, `sms`)؛ تمایز صریح `sent` از `delivered` و `unknown` از `failed` به همراه حفظ Inbox هنگام شکست ایمیل یا Push.
- **مرکز اعلان دوسطحی، گروه‌بندی، Quiet Hours، Consent و Deep Link**: `Quick Notification Panel` و `Full Notification Center` با `Unread Badge`، عدم خوانده‌شدن خودکار اعضای گروه هنگام بازشدن گروه، تفکیک `Consent` از ترجیحات ظاهری و تأیید صریح کاربر پیش از ثبت `Web Push`، پشتیبانی IANA Timezone (`Asia/Tehran`) و عبور از نیمه‌شب، مصونیت الزامات امنیتی از غیرفعال‌سازی و ادغام، مسیریابی از `Route Registry` (مهار `Open Redirect` و نبود `PII` در URL/Telemetry).
- **قراردادها و تحویل**: ۱۳ قرارداد `/api/notifications*` با Pagination مبتنی بر `Cursor` و `notificationKeys` تفکیک‌شده کاربر، بدون اتصال مستقیم مرورگر به `Cloudflare D1 / KV / R2 / Queues`، نقشه ۱۲فازی، **۳۶ خروجی تحویلی (`RT-FE-NOTIFICATION-OUT-001` تا `RT-FE-NOTIFICATION-OUT-036`)** و مرز مرحله بیست‌وچهارم (`RT-FE-MESSAGING-COMMUNICATION-024` / `RT-FE-USER-ACCOUNT-024`).

---

## ۲۴. مرحله بیست‌وچهارم: نظام حساب کاربری، پروفایل، هویت دیجیتال و مدیریت اطلاعات شخصی (`RT-FE-USER-ACCOUNT-024`)
- **۸ لایه معماری حساب و تفکیک ۶ مفهوم کلیدی**: جداسازی صریح `Identity`، `Profile`، `Role`، `Permission`، `Verification` و `Session`؛ شناسه پایدار `userId` مستقل از نام/تلفن و منع افشای `authSubject` در نمای عمومی؛ چرخه عمر ۱۰ وضعیتی (`Pending` تا `Merged` و `Deleted`) با تمایز `Restricted` از حذف حساب.
- **پروفایل سه‌لایه، Avatar امن و چندپروفایلی حرفه‌ای**: جداسازی `Basic / Public / Private Profile` در سطح API (منع ارسال فیلدهای خصوصی در Public Profile)، مسدودسازی آپلود `SVG` تاییدنشده، جلوگیری از بازنویسی هم‌زمان با کنترل `Version`، جداسازی درصد تکمیل پروفایل از اعتبار واقعی، و حفظ حساب پایه هنگام حذف پروفایل حرفه‌ای.
- **نشان‌های اعتبار، مرکز امنیت، چرخه عمر و حریم خصوصی**: استقلال کامل تایید تماس/هویت/حرفه‌ای و باطل‌سازی نشان منقضی یا لغوشده، الزام `Backend` برای ابطال نشست، منع حذف آخرین روش ورود، الزام احراز هویت مجدد برای تغییر تماس/حذف حساب، تفکیک `Account History` از `Audit Log`، جداسازی Cache با `userId` (`accountKeys`)، حذف `PII` و اسرار از Telemetry، ۲۹ قرارداد Endpoint بدون دسترسی مستقیم مرورگر به `D1/KV/R2/Queues`، نقشه ۱۲فازی، **۴۰ خروجی الزامی (`RT-FE-ACCOUNT-OUT-001` تا `RT-FE-ACCOUNT-OUT-040`)** و مرز انتقال به **مرحله بیست‌وپنجم (`RT-FE-USER-ACCESS-CONTROL-025`)**.





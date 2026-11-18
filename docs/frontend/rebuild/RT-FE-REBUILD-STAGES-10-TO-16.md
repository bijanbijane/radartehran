# نقشه بازسازی بنیادی فرانت‌اند رادار تهران — مراحل ۱۰ تا ۲۳ (`RT-FE-REBUILD-010` تا `RT-FE-REBUILD-023`)

- **وضعیت سند**: ثبت رسمی مشخصات معماری و ممیزی تطبیقی با کد موجود مخزن (`[Observed Fact]`) — تفکیک صریح مراحل `designed`، `implemented`، `verified` و `accepted`.
- **اصول حاکم**: حفظ قابلیت‌های سالم موجود، ممنوعیت ساخت سامانه یا کلاینت موازی، عدم تغییر قراردادهای Backend بدون هماهنگی، عدم جعل ظاهر پرداخت عملیاتی پیش از Mount شدن واقعی Routerهای Backend، و اولویت مطلق گیت‌های `P0`.

---

## ۱. خلاصه اجرایی و وضعیت فعلی در مخزن (`[Observed Fact]`)

| مرحله | شناسه رسمی | اولویت | فایل‌های موجود مرتبط در مخزن (`[Observed Fact]`) | شکاف‌های اصلی شناسایی‌شده برای اجرا |
| :--- | :--- | :---: | :--- | :--- |
| **مرحله ۱۰** | `RT-FE-REBUILD-MESSAGING-010` | `P0 / P1` | `src/features/communications/services/commsEngine.ts`، `commsClientService.ts`، `components/AccountInboxPanel.tsx`، `server/modules/communications/commsRoutes.ts` | ذخیره گفتگوها در `localStorage` (`COMMS_STATE_KEY = 'radar_comms_workspace_v1'`) با UID پیش‌فرض `'local-user'`؛ نبود لایه `src/platform/messaging/`، نبود `clientMessageId` برای Idempotency، نبود تفکیک `delivered` از `read`، و نبود Cursor Pagination و Attachment Pipeline امن. |
| **مرحله ۱۱** | `RT-FE-REBUILD-PROFILE-IDENTITY-011` | `P0 / P1` | `src/platform/auth/identity/{identityResolver,profileResolver}.ts`، `src/features/account/`، `server/modules/professional-verification/authoritiesAndStateMachine.ts` | نبود لایه یکپارچه `src/platform/identity/` برای تفکیک ۴گانه `Identity / Role / Permission / Verification / Reputation / Membership`، صفحات عمومی `/u/:username` و `/business/:slug`، و ماشین وضعیت رسمی مدارک اعتبارسنجی. |
| **مرحله ۱۲** | `RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012` | `P0 بحرانی` | `src/data/hedonicPricingEngine.ts`، `src/data/realMarketPriceAggregator.ts`، `src/utils/areaUnit.ts`، `src/platform/geo/core/GeoValidation.ts`، `src/components/AgencyModal.tsx` | نیاز به لایه `src/platform/listing-integrity/` برای تضمین تفکیک صریح واحد پول (`IRR`/`IRT`)، منع قیمت‌سازی از تخفیف، دقت مکانی (`exact` / `approximate` / `neighborhood_only`)، ماشین وضعیت واقعی انتشار (`DRAFT → ... → PUBLISHED` فقط با پاسخ سرور) و ثبت گزارش تخلف در سرور با `Idempotency-Key`. |
| **مرحله ۱۳** | `RT-FE-REBUILD-CLIENT-SECURITY-013` | `P0 بحرانی` | `src/components/stage2/crowdClaimsClientHelper.ts` (اصلاح‌شده با Bearer Token)، `src/utils/security.ts`، `src/platform/api/client/apiClient.ts` | ۱. در Backend هنوز `crowdClaimsRoutes.ts`، `trustSafetyRoutes.ts` و `disputeRoutes.ts` دارای fallback به `body.authorUid` یا `x-test-*` هستند (مانع P0 سمت سرور).<br>۲. در `commsClientService.ts:200,222` هنوز `uid = 'local-user'` به‌عنوان پیش‌فرض کلاینت وجود دارد.<br>۳. نیاز به تمرکز سیاست‌های `src/platform/security/` (URL Policy، File Preview Policy، Storage/PWA Cache Purge در Logout). |
| **مرحله ۱۴** | `RT-FE-REBUILD-FRONTEND-RESILIENCE-014` | `P0 بحرانی` | `src/platform/api/client/apiClient.ts` (دارای Context Guard)، `src/platform/error-handling/`، `src/platform/storage/`، `src/features/market/services/marketQueryService.ts` | نیاز به تکمیل `src/platform/resilience/` شامل `FeatureErrorBoundary` دهگانه، `CircuitBreaker` مستقل به تفکیک سرویس، `RecoverySnapshot<T>` نسخه‌دار، همگام‌سازی چندتب (`BroadcastChannel`)، و تفکیک ۳ لایه `Server / Local Draft / Optimistic State`. |
| **مرحله ۱۵** | `RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015` | `P0 / P1` | `src/utils/apiContractsAndSerializationEngine.ts`، `src/utils/expressRouteCatalog.ts`، `src/platform/api/`، ۵ کلاینت (`communityApiClient`, `knowledgeApiClient`, `commsClientService`, `marketQueryService`, `valuationStorageAndApiClient`) | در `communityApiClient.ts:110-113` و `knowledgeApiClient.ts:114` در صورت ناسازگاری پاسخ، آرایه خالی `[]` جایگزین می‌شود (تبدیل خاموش خطای قرارداد به نتیجه خالی)؛ نبود `src/platform/api-contracts/` برای اعتبارسنجی Runtime پیش از ورود داده به منطق Feature. |
| **مرحله ۱۶** | `RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016` | `P0 بحرانی` | `docs/product-assessment/CAMPAIGN-PROD-01/07-accessibility-and-responsive-specification.md`، `src/features/onboarding/services/accessibilityEngine.ts`، `src/components/NeighborhoodInspectorDrawer.tsx`، `ProductGlobalHeader.tsx` | در `NeighborhoodInspectorDrawer.tsx:32` هنگام حالت `collapsed` در موبایل، بدنه اسکرول فقط کلاس `hidden lg:flex` دارد و نیازمند کنترل دقیق `inert` / عدم فوکوس‌پذیری کنترل‌های خارج از دید، اصلاح کنتراست `text-slate-400` (`2.42:1`)، رعایت کامل اندازه هدف `24×24` / `44×44` و آزمون ۹ Viewport (از `320×568` تا `1440×900`) است. |
| **مرحله ۱۷** | `RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017` | `P0 بحرانی` | `Stage44InvoicesAndPaymentsPanel.tsx`، `Stage44TransactionSubpanel.tsx`، `Stage44ReceiptsAndProviderPanel.tsx`، `serviceTransactionPaymentsEngine.ts`، `paymentFinopsDesignBoundaryPrivacyAudit.ts`، `server/modules/payments/paymentRoutes.ts` | ۱. در `Stage44InvoicesAndPaymentsPanel.tsx:53-59` تابع `handleVerifyGateway` با کلیک کاربر `authoritativeVerified: true` و کد رهگیری `Math.random()` تولید می‌کند.<br>۲. در `serviceTransactionPaymentsEngine.ts:64-158` توابع `confirmPaymentAndIssueReceipt` و `requestRefundSafely` بدون تأیید سرور وضعیت را «موفق»/«انجام‌شده» کرده و رسید محلی صادر می‌کنند.<br>۳. در `Stage44TransactionSubpanel.tsx:12-25` پرونده Fixture (`INITIAL_STAGE44_DOSSIER`) و نقش بیننده با `useState` محلی بدون تفکیک صریح `DEMO` از `REAL` و وضعیت `UNAVAILABLE` درگاه اداره می‌شوند. |
| **مرحله ۱۸** | `RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018` | `P0 بحرانی` | `playwright.config.ts`، `tests/tehran-radar.e2e.spec.ts`، `tests/tehran-radar-header-tools.e2e.spec.ts`، `.github/workflows/ci.yml` | فقط ۵ تست در ۲ فایل Playwright؛ نبود `webServer` در `playwright.config.ts` و نبود بررسی آمادگی سرور (`/api/health/readiness`) در `.github/workflows/ci.yml`؛ نیاز به ساختار `tests/e2e/` برای ۱۲ گردش‌کار حیاتی محصول. |
| **مرحله ۱۹** | `RT-FE-REBUILD-ACCOUNT-DATA-RIGHTS-LIFECYCLE-019` | `P0 بحرانی` | `server/modules/account-lifecycle/types.ts`، `src/utils/serverPublisherBargains.ts`، `src/features/account/services/accountActionService.ts`، `AccountProfileAndSettingsPanel.tsx` | ناهمگرایی ۷ منبع داده خروجی حساب، پاک‌سازی زودهنگام `localStorage` و هویت Firebase در حالت `partial`، و عدم تفکیک تاریخچه معتبر سرور (`GET /api/account/data-requests`) از سابقه محلی مرورگر. |
| **مرحله ۲۰** | `RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020` | `P0 بحرانی` | `src/types/models.ts`، `src/data/multiCityData.ts`، `src/features/market/services/marketDataAdapter.ts`، `src/features/home/services/homeDataAdapter.ts`، `src/features/map/services/mapExperienceEngine.ts` | وجود Fallbackهای پنهان‌کننده خطای جغرافیایی در `marketDataAdapter.ts:168-178` (تبدیل خاموش به `'tehran'` و جایگزینی با `[...allHoods]`)، نبود فیلتر شهر در `homeDataAdapter.ts:46-75`، و نبود اعتبارسنجی `city` در `parseShareableMapUrl`. |
| **مرحله ۲۱** | `RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021` | `P0 بحرانی` | `src/features/onboarding/types/onboardingStageTabs.ts`، `src/features/onboarding/tests/rtFe*.test.ts` (۱۳ فایل)، `tests/rt-fe-rebuild-*.test.ts`، `package.json`، `.github/workflows/ci.yml`، `scripts/check-architecture.ts` | ۱. چندگانگی شناسه‌ها در `onboardingStageTabs.ts:84-159` (`rt_fe_arch_001..rt_fe_account_024` در کنار `stage32..stage84`) و تعارض شماره مرحله با مراحل جدید `RT-FE-REBUILD-*` (مانند `RT-FE-ENTITY-DETAIL-021` در `rtFeStage21EntityDetail.test.ts:21-23`).<br>۲. ۱۳ فایل `src/features/onboarding/tests/rtFe*.test.ts` و فایل‌های `tests/rt-fe-rebuild-*.test.ts` در `package.json` (`test:unit` خط ۳۲ و `test` خط ۵۷) متصل نشده‌اند.<br>۳. نبود `Master Roadmap Registry` و `Test Manifest` برای جلوگیری از تأیید کاذب مراحل بدون اجرای واقعی آزمون در CI. |
| **مرحله ۲۲** | `RT-FE-REBUILD-PAYMENTS-BILLING-PRODUCTION-022` | `P0 (در صورت دریافت وجه) / P1` | `src/features/commerce/services/exchangeRateClient.ts`، `Stage44TransactionSubpanel.tsx`، `Stage44InvoicesAndPaymentsPanel.tsx`، `server/modules/payments/{routes,paymentRoutes}.ts`، `server/modules/marketplace-billing/routes.ts`، `server.ts` | ۱. در `src/features/commerce/services/` فقط `exchangeRateClient.ts` وجود دارد و کلاینت عملیاتی برای پرداخت، صورت‌حساب، کیف پول و اشتراک موجود نیست.<br>۲. در Backend فایل‌های `createPaymentsRouter` (`server/modules/payments/routes.ts:20`)، `createPaymentRouter` (`paymentRoutes.ts:49`) و `createMarketplaceBillingRouter` (`server/modules/marketplace-billing/routes.ts:24`) وجود دارند اما در `server.ts` به Express متصل (`mount`) نشده‌اند.<br>۳. وضعیت این مرحله **`designed` (طراحی و ثبت‌شده، اجرا نشده)** است و تا تأیید و Mount شدن مسیرهای Backend، هیچ ظاهر پرداخت عملیاتی جعلی یا Mock در فرانت‌اند ساخته نمی‌شود. |
| **مرحله ۲۳** | `RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023` | `P0 بحرانی` | `src/components/admin/AdminUnifiedControlPlanePanel.tsx`، `src/features/admin/components/AdminSecurityAndAuditCenter.tsx`، `src/features/admin/services/adminGovernanceService.ts`، `src/features/admin/components/AdminOperationsOverviewCard.tsx`، `src/navigation/registry/admin.routes.ts` | ۱. در `AdminUnifiedControlPlanePanel.tsx:36-50` مقادیر ثابت اولیه (`modulesCount: 28`, `secretsCount: 2`, `recoveryResourcesCount: 3`, `datasetsCount: 3`) وجود دارد؛ در خطوط ۸۳–۹۴ خطاها بدون علامت `STALE` بلعیده می‌شوند و در خط ۱۳۱ در صورت نبود RTO، عدد پیش‌فرض `6` دقیقه در پیام موفقیت قرار می‌گیرد.<br>۲. در `AdminSecurityAndAuditCenter.tsx:25-64` و `adminGovernanceService.ts:23-26,92-107,143-172` لاگ ممیزی، نقش فعال و برخی عملیات حساس روی `localStorage` اجرا و ثبت می‌شوند.<br>۳. در `AdminOperationsOverviewCard.tsx:18-32` شمارش صف‌ها از منابع محلی محاسبه می‌شود (همراه با برچسب قدیمی `Stage 23` در خط ۱ که باید از شناسه جدید تفکیک شود). وضعیت این مرحله **`designed` (طراحی و ثبت شد — اجرا تأیید نشده)** است. |

---

## ۲. مشخصات ثبت‌شده هر مرحله

### ۲.۱ مرحله ۱۰: بازسازی معماری پیام‌رسان داخلی (`RT-FE-REBUILD-MESSAGING-010`)
- **مرز مالکیت**: پیام، خودِ اعلان (مرحله ۹) نیست؛ مرحله ۹ فقط رویداد پیام جدید را اطلاع می‌دهد و تاریخچه/محتوا و شمارنده خوانده‌نشده در مالکیت مرحله ۱۰ است.
- **۱۰ قابلیت یکپارچه**: `Conversation Management`، `Direct Messaging`، `Contextual Messaging` (متصل به ملک/آگهی/خدمت)، `Message Lifecycle` (`pending | sent | delivered | read | failed`)، `Attachments` (`SELECTED → VALIDATING → UPLOADING → QUARANTINED/PROCESSING → AVAILABLE → ATTACHED_TO_MESSAGE`)، `Realtime Messaging`، `Conversation Inbox`، `Search & Filtering`، `Blocking & Reporting Integration`، و `Responsive Messaging UI` (`/messages` و `/messages/:conversationId`).
- **ممنوعیت‌های P0**: ممنوعیت ساخت پیام‌رسان دوم، ممنوعیت ذخیره دائمی پیام‌ها در `localStorage`، ممنوعیت پذیرش `senderId` از ورودی کلاینت، و الزام استفاده از `clientMessageId` برای جلوگیری ۱۰۰٪ از ارسال تکراری.
- **هدف تست**: حداقل ۲۴۰ تست مستقل (هدف اجرایی: **۲۵۰ تست** در ۱۴ گروه و ۴۰ سناریوی بحرانی پذیرش).

### ۲.۲ مرحله ۱۱: بازسازی پروفایل، هویت حرفه‌ای و سازمانی (`RT-FE-REBUILD-PROFILE-IDENTITY-011`)
- **تفکیک ۸ مفهوم پایه**: `Identity`، `Profile` (`PersonalProfile` / `ProfessionalIdentity` / `OrganizationProfile`)، `Role`، `Permission`، `Credential`، `Verification`، `Reputation`، و `Membership` (`OrganizationMembership`).
- **ماشین وضعیت اعتبارسنجی**: `NOT_SUBMITTED → DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → VERIFIED/RESUBMISSION → EXPIRED/SUSPENDED`.
- **قواعد غیرقابل‌مذاکره P0**:
  - هیچ نشان تأییدی نباید از فیلد محلی `isVerified: true` یا تصویر ثابت تولید شود.
  - هیچ فیلد خصوصی (شماره تماس، مدارک هویتی، تاریخچه بررسی) نباید صرفاً با CSS مخفی شود؛ باید در پاسخ API عمومی حذف شده باشد.
  - جداسازی کامل Workspace میان سازمان‌ها و ابطال فوری دسترسی عضو تعلیق/لغوشده.
- **هدف تست**: حداقل ۲۶۰ تست مستقل (هدف اجرایی: **۲۶۵ تست** در ۱۴ گروه و ۳۰ سناریوی بحرانی).

### ۲.۳ مرحله ۱۲: صحت داده، ثبت و انتشار آگهی (`RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012`)
- **۷ اولویت P0**:
  1. `P0-1`: صحت قیمت (`CurrencyUnit = "IRR" | "IRT"`، ممنوعیت قیمت‌سازی از تخفیف یا جایگزینی قیمت خالی با میانگین محله، تفکیک قیمت تخمینی با برچسب صریح «برآورد»).
  2. `P0-2`: صحت مختصات `WGS84` (`latitude`, `longitude`)، رد `0,0`، منع استفاده از `cityId='tehran'` برای شهرهای دیگر، و تفکیک دقت (`exact | approximate | neighborhood_only | unknown`).
  3. `P0-3`: جداسازی کامل `Listing Record` از `Neighborhood Reference`.
  4. `P0-4`: چرخه انتشار واقعی (`draft → validating → ready_to_submit → submitting → submitted → under_review → published`) صرفاً با تأیید Backend و `Idempotency-Key`.
  5. `P0-5`: قرارداد `PropertyFact<T>` با کیفیت فیلد (`provided | verified | estimated | unknown | invalid`) بدون تبدیل `unknown` به صفر یا مقدار پیش‌فرض.
  6. `P0-6`: چرخه گزارش تخلف (`REPORT_DRAFT → VALIDATING → SUBMITTING → REPORTED`) متصل به سرور.
  7. `P0-7`: حذف اتکا به `localStorage` به‌عنوان منبع حقیقت انتشار، مالکیت یا گزارش تخلف.
- **هدف تست**: **۲۴۰ تست مستقل** در ۱۲ گروه و ۳۰ سناریوی بحرانی P0.

### ۲.۴ مرحله ۱۳: بازسازی امنیت سمت کاربر (`RT-FE-REBUILD-CLIENT-SECURITY-013`)
- **۸ محور P0**:
  - `P0-1`: حذف کامل اعتماد به `UID`، `Role`، `isAdmin` یا هدرهای آزمایشی ارسالی از مرورگر (`SecureRequestContext`).
  - `P0-2`: مهار کامل XSS در تمام ورودی‌ها و محتوای کاربر، منع `dangerouslySetInnerHTML` بدون Sanitization مرزی، رد `javascript:` و `data:` در لینک‌ها، و هماهنگی CSP در Production.
  - `P0-3`: حفاظت از Token و اسرار (صفر Secret سروری در Bundle، صفر Token در URL/Console/Analytics).
  - `P0-4`: امنیت فایل و رسانه در کلاینت (منع بازکردن خودکار HTML/SVG، مدیریت `Object URL` و همگامی با Magic Bytes و Quarantine سمت سرور).
  - `P0-5`: مهار Open Redirect با قرارداد `NavigationTarget` (`internal` در برابر `external` مجاز).
  - `P0-6` و `P0-8`: کنترل متمرکز در مرز API (`src/platform/security/`) و Route Guardها.
  - `P0-7`: ایزوله‌سازی Cache، Storage و Service Worker و پاکسازی ۱۰۰٪ داده خصوصی هنگام Logout یا تعویض حساب/Workspace.
- **هدف تست**: **۲۵۰ تست امنیتی** در ۹ گروه و ۳۰ سناریوی بحرانی.

### ۲.۵ مرحله ۱۴: بازسازی تاب‌آوری عملیاتی و بازیابی وضعیت (`RT-FE-REBUILD-FRONTEND-RESILIENCE-014`)
- **مرزبندی ۱۰گانه خرابی (`Failure Isolation`)**: `Application Shell`، `Auth & Session`، `Map & GIS`، `Search & Filters`، `Results & Entity Detail`، `Listings & Publication`، `Profile & Organizations`، `Messaging`، `Notifications`، و `Admin & Trust & Safety`.
- **اجزای کلیدی `src/platform/resilience/`**:
  - ۳ سطح `Error Boundary` (`Application`, `Feature`, `Component`) با حداکثر ۱ تلاش بازیابی خودکار.
  - سیاست Timeout و Retry تفکیک‌شده بر اساس نوع عملیات + `CircuitBreaker` مستقل برای هر سرویس (`CLOSED → OPEN → HALF_OPEN → CLOSED`).
  - مهار Race Condition و پاسخ‌های خارج از نوبت با `RequestVersion` و `AbortController`.
  - بازیابی وضعیت با `RecoverySnapshot<T>` نسخه‌دار و تفکیک `Ephemeral`، `Recoverable UI`، `User Draft` و `Server-Authoritative`.
  - همگام‌سازی چندتب (`BroadcastChannel` با ۶ رخداد مجاز بدون نشت Token) و Reconciliation سه‌لایه (`Server State`, `Local Draft State`, `Optimistic State`).
  - وضعیت استاندارد عملیات (`idle | pending | confirmed | failed | unknown | cancelled`) — منع تبدیل Timeout به موفقیت یا شکست قطعی.
- **هدف تست**: **۲۶۰ تست مستقل** + ۱۰ سناریوی آزمون فشار.

### ۲.۶ مرحله ۱۵: یکپارچگی قراردادهای API و اعتبارسنجی مرز داده (`RT-FE-REBUILD-API-CONTRACT-INTEGRITY-015`)
- **۶ بخش اجرایی (`src/platform/api-contracts/`)**:
  1. `API-REG-015`: رجیستری قراردادهای واقعی فرانت‌اند منطبق با `REGISTERED_API_ROUTES` و `/api/openapi.json`.
  2. `API-VAL-015`: اعتبارسنجی Runtime پاسخ JSON پیش از ورود به Feature و ممنوعیت تبدیل پاسخ نامعتبر به `[]`، `{}` یا `0`.
  3. `API-ENV-015`: یکسان‌سازی پاکت پاسخ (`status: "ok"`) و خطا (`status: "error"`, `correlationId`, `retryable`).
  4. `API-NORM-015`: نرمال‌سازی شناسه‌ها، تاریخ ISO 8601، Decimal، پول (`IRR`/`IRT`)، مساحت، Pagination و Nullability.
  5. `API-COMPAT-015`: کنترل سازگاری نسخه قراردادها و Adapterهای تدریجی.
  6. `API-CLIENT-015`: بازآرایی تدریجی ۵ کلاینت اولویت‌دار (`communityApiClient.ts`، `knowledgeApiClient.ts`، `commsClientService.ts`، `marketQueryService.ts`، `valuationStorageAndApiClient.ts`).
- **هدف تست**: **۲۵۰ تست هدف** (شامل ۴۰ سناریوی Schema Drift و ۲۰ سناریوی Version Mismatch).

### ۲.۷ مرحله ۱۶: دسترس‌پذیری، صفحه‌کلید و نمایشگرهای کوچک (`RT-FE-REBUILD-ACCESSIBILITY-REACHABILITY-016`)
- **۶ بخش اجرایی**:
  1. `A11Y-TARGET-016`: حداقل اندازه `24×24px` (WCAG 2.2 AA) برای تمام کنترل‌ها و `44×44px` برای کنترل‌های اصلی موبایل، کنتراست حداقل `4.5:1` متن عادی و `3:1` اجزای گرافیکی.
  2. `A11Y-REFLOW-016`: انطباق کامل در ۹ Viewport مرجع (`320×568`، `360×800`، `375×812`، `390×844`، `430×932`، `768×1024`، `1024×768`، `1280×800`، `1440×900`) و Zoom تا ۴۰۰٪ بدون اسکرول افقی ناخواسته.
  3. `A11Y-KEYBOARD-016`: هماهنگی کامل `inert` / `hidden` / `aria-hidden` در `NeighborhoodInspectorDrawer.tsx` هنگام حالت `collapsed` تا هیچ عنصر خارج از دید فوکوس نگیرد، به همراه ناوبری کامل صفحه‌کلید (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, `ArrowLeft/Right`, `Home`, `End`).
  4. `A11Y-SEMANTICS-016`: نام، نقش، وضعیت و توضیح قابل‌دسترسی برای تمام کنترل‌ها و عدم اتکای صرف به رنگ در نمایش وضعیت قیمت و بودجه.
  5. `A11Y-GEO-016`: دسترسی به نتایج نقشه از طریق فهرست جایگزین، انتخاب محله بدون Drag، و خلاصه متنی نمودارها.
  6. `A11Y-RTL-016`: جداسازی عبارات لاتین/واحدها با `dir="ltr"` و `unicode-bidi: isolate`، رعایت `prefers-reduced-motion` و حفظ `safe-area-inset-bottom`.
- **هدف تست**: **۲۲۰ تست هدف** روی ۹ Viewport مرجع.

### ۲.۸ مرحله ۱۷: بازسازی مرز اعتماد رابط مالی (`RT-FE-REBUILD-FINANCIAL-TRUST-BOUNDARY-017`)
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `Stage44InvoicesAndPaymentsPanel.tsx:53-59`: تابع `handleVerifyGateway` از روی کلیک دکمه رابط، `authoritativeVerified: verified` و `trackingCode: "SHP-" + Math.floor(100000 + Math.random() * 899999)` را به منطق مالی پاس می‌دهد.
  2. `serviceTransactionPaymentsEngine.ts:64-119`: تابع `confirmPaymentAndIssueReceipt` بدون فراخوانی Backend وضعیت را به `'موفق'` تغییر داده، مانده صورت‌حساب را کم کرده و رسید (`rcp-${Date.now()}`) صادر می‌کند.
  3. `serviceTransactionPaymentsEngine.ts:121-158`: تابع `requestRefundSafely` بلافاصله وضعیت بازپرداخت را `'انجام‌شده'` یا `'بازپرداخت جزئی'` ثبت کرده و رسید بازپرداخت با کد ثابت `RF-۸۴۲۱` تولید می‌کند.
  4. `Stage44TransactionSubpanel.tsx:12-25`: پرونده نمونه `INITIAL_STAGE44_DOSSIER` و تغییر نقش بیننده (`applicant / provider / admin / unauthorized_third_party`) با `useState` محلی بدون برچسب صریح `DEMO` در برابر `REAL` مدیریت می‌شود.
  5. `paymentFinopsDesignBoundaryPrivacyAudit.ts:4-5` عدم وجود درگاه پرداخت فعال را اعلام می‌کند (`paymentGatewayImplemented: false`) و `server/modules/payments/paymentRoutes.ts` نیز با وجود پیاده‌سازی HMAC و `fail-closed` هنوز به Stage 44 متصل نیست.
- **۱۰ وضعیت مجاز مالی در رابط**: `DEMO`، `UNAVAILABLE`، `CREATED`، `PENDING`، `PROCESSING`، `CONFIRMED`، `FAILED`، `REFUND_PENDING`، `REFUNDED`، و `UNKNOWN` (منع مطلق تبدیل `UNKNOWN` به `FAILED` یا `CONFIRMED`).
- **تفکیک ۳ مفهوم مالی**: (۱) پرداخت مشتری، (۲) بازپرداخت مشتری، (۳) تسویه با ارائه‌دهنده خدمت.
- **هدف تست**: حداقل **۲۴۰ تست مستقل** در ۱۲ گروه و ۱۰ سناریوی بحرانی الزامی.

### ۲.۹ مرحله ۱۸: بازسازی آزمون‌های انتها‌به‌انتها و گردش‌کارهای حیاتی (`RT-FE-REBUILD-E2E-CRITICAL-JOURNEYS-018`)
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. در وضعیت اولیه مخزن تنها ۲ فایل آزمون Playwright (`tests/tehran-radar.e2e.spec.ts` با ۳ تست و `tests/tehran-radar-header-tools.e2e.spec.ts` با ۲ تست؛ مجموعاً ۵ تست) وجود داشت.
  2. در `playwright.config.ts` بلوک `webServer` برای راه‌اندازی خودکار سرور روی پورت `3000` تعریف نشده بود و در `.github/workflows/ci.yml` نیز Job مربوط به `e2e-browser` بدون راه‌اندازی `server.ts` و بررسی Health Check مستقیماً `npm run test:e2e` را اجرا می‌کرد.
- **معماری مقصد (`tests/e2e/`)**:
  - `fixtures/`: جداسازی هویت، حساب، ملک، شهر و محیط تست (`auth.fixture.ts`, `account.fixture.ts`, `property.fixture.ts`, `city.fixture.ts`, `test-environment.fixture.ts`).
  - `data/`: بذرهای سناریو، هویت‌های آزمایشی ایزوله و رجیستری پاک‌سازی (`scenario-seeds.ts`, `test-identities.ts`, `cleanup-registry.ts`).
  - `journeys/`: ۱۰ ماژول پوشش‌دهنده ۱۲ گردش‌کار حیاتی محصول در ۴ وضعیت پایه (موفق، ورودی نامعتبر، دسترسی غیرمجاز، شکست/وضعیت نامشخص Backend) به همراه انتقال بین ماژول‌ها، تغییر شهر، جداسازی مالکیت حساب‌ها، اختلال شبکه، مدیریت و Regression.
  - `support/`: ابزارهای Assertion، ممیزی مرورگر و ایزولاسیون (`journey-assertions.ts`, `api-test-adapter.ts`, `browser-diagnostics.ts`, `test-isolation.ts`).
- **هدف کمی پذیرش**: حداقل **۱۲۰ تست Playwright** با داده مستقل، بدون وابستگی به درگاه بانکی زنده، و راه‌اندازی قطعی سرور در `playwright.config.ts` و `.github/workflows/ci.yml`.

### ۲.۱۰ مرحله ۱۹: بازسازی چرخه حقوق داده و مدیریت عمر حساب کاربری (`RT-FE-REBUILD-ACCOUNT-DATA-RIGHTS-LIFECYCLE-019`)
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `server/modules/account-lifecycle/types.ts:16-33`: هفت منبع رسمی داده کاربر (`USER_PROFILE`, `FAVORITES_AND_WORKSPACES`, `BUYER_ALERTS`, `BARGAIN_LISTINGS`, `SPONSOR_RECORDS`, `CROWD_CLAIMS`, `MEDIA_METADATA`) تعریف شده‌اند، اما `GET /api/account/export-data` در `src/utils/serverPublisherBargains.ts:267-287` خروجی را از ۴ گروه خلاصه می‌ساخت.
  2. `src/features/account/services/accountActionService.ts:261-290`: در `executeAccountDeletionFlow` حتی زمانی که `serverPayload.status === 'partial'` بود، پاک‌سازی فضای محلی (`cleanupAccountLocalStorageForUid`) اجرا می‌شد و حذف هویت Firebase صرفاً به `requiresClientAuthDeletion` وابسته بود بدون اینکه تکمیل قطعی تمام مراحل وابسته و رسانه بررسی شود.
  3. `src/features/account/components/AccountProfileAndSettingsPanel.tsx:245-256`: تاریخچه درخواست‌ها بدون تفکیک صریح سابقه معتبر سرور (`GET /api/account/data-requests`) از سابقه محلی مرورگر نمایش داده می‌شد.
- **۸ وضعیت استاندارد چرخه حذف در رابط**: `INITIATED_WRITE_BLOCKED`، `PURGING_DEPENDENT_RECORDS`، `CLEANING_UP_MEDIA`، `APPLYING_RETENTION_POLICIES`، `DELETING_AUTH_IDENTITY`، `PARTIAL_FAILURE_RETRYABLE`، `BLOCKED_MANUAL_REVIEW`، و `COMPLETED`.
- **هدف کمی پذیرش**: حداقل **۲۲۰ تست** در ۱۱ گروه با پوشش ۱۰۰٪ هفت منبع داده، صفر حذف زودهنگام هویت Auth پیش از تکمیل مراحل وابسته، و صفر پاک‌سازی محلی در وضعیت `partial` یا `unknown`.

### ۲.۱۱ مرحله ۲۰: یکپارچگی Context جغرافیایی در معماری چندشهری (`RT-FE-REBUILD-MULTICITY-CONTEXT-INTEGRITY-020`)
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/features/market/services/marketDataAdapter.ts:168-178`: سه Fallback پنهان‌کننده خطای جغرافیایی وجود داشت: (الف) تبدیل خاموش `activeCity` نامعتبر به `'tehran'`، (ب) جایگزینی `effectiveCityHoods` با `[...allHoods]` در صورت خالی بودن محله‌های شهر انتخابی (نمایش داده تهران زیر نام کرج)، و (ج) جایگزینی محله ناسازگار با `effectiveCityHoods[0]`.
  2. `src/features/home/services/homeDataAdapter.ts:46-75`: تابع `buildHomeMarketSnapshotMetrics` بدون بررسی تعلق `neighborhoods` به `cityId`، میانه آرایه ورودی را زیر عنوان شهر انتخابی نمایش می‌داد.
  3. `src/features/map/services/mapExperienceEngine.ts:177-196`: تابع `parseShareableMapUrl` پارامتر `city` در URL را بدون اعتبارسنجی در برابر ۵ شهر پشتیبانی‌شده (`tehran | karaj | mashhad | isfahan | shiraz`) می‌پذیرفت.
- **اجزای کلیدی (`src/platform/geo-context/`)**:
  - `CanonicalCityContext` واحد برای ۵ شهر (`tehran`, `karaj`, `mashhad`, `isfahan`, `shiraz`).
  - `validateCityNeighborhoodPair(cityId, neighborhoodId)` و حذف کامل Fallbackهای خاموش در `marketDataAdapter.ts`، `homeDataAdapter.ts` و `mapExperienceEngine.ts`.
  - مدیریت تغییر شهر (`reconcileCityContextSwitch`) برای پاک‌سازی/بازنشانی `selectedHood`، `selectedZone`، `compareHoodIds`، `mapViewport`، فیلترها و کلیدهای Cache دارای `cityId` اجباری.
- **هدف کمی پذیرش**: حداقل **۲۴۰ تست** در ۱۱ گروه و ۱۰ سناریوی اجباری با صفر اختلاط داده میان ۵ شهر.

### ۲.۱۲ مرحله ۲۱: تثبیت مرجع یگانه نقشه راه فرانت‌اند، یکپارچه‌سازی شناسه مراحل و اتصال آزمون‌های معماری به دروازه کیفیت CI (`RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021`)
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/features/onboarding/types/onboardingStageTabs.ts:84-159`: دو خانواده شناسه قدیمی (`rt_fe_arch_001` تا `rt_fe_account_024` و `stage32` تا `stage84`) در کنار مراحل بازسازی جدید `RT-FE-REBUILD-001` تا `RT-FE-REBUILD-021` بدون رجیستری مرجع واحد نگهداری می‌شوند.
  2. `src/features/onboarding/tests/rtFeStage21EntityDetail.test.ts:21-23`: مرحله قدیمی ۲۱ با شناسه `RT-FE-ENTITY-DETAIL-021` ثبت شده است که نباید با مرحله ۲۱ نقشه بازسازی جدید (`RT-FE-REBUILD-ROADMAP-AND-QUALITY-GOVERNANCE-021`) اشتباه گرفته شود؛ شماره مرحله به‌تنهایی شناسه یکتا نیست.
  3. `package.json:32,57,58`: سیزده فایل آزمون نقشه راه در `src/features/onboarding/tests/rtFe*.test.ts` (`rtFeArch001To004Roadmap.test.ts`, `rtFeStages10To13Roadmap.test.ts`, `rtFeStage14Navigation.test.ts` تا `rtFeStage24Account.test.ts`) و فایل‌های `tests/rt-fe-rebuild-*.test.ts` در زنجیره اصلی `npm run test:unit` و `npm test` قرار نداشتند.
- **اجزای کلیدی (`src/platform/roadmap-governance/`)**:
  - `FrontendMasterRoadmapRegistry`: ثبت یکتای هر مرحله با `stageId`، `stageNumber`، `track` (`REBUILD_2026 | LEGACY_RT_FE | LEGACY_STAGE_32_84`)، `title`، `ownerDomain`، `dependencies`، `status` (`proposed | designed | in_progress | implemented | verified | accepted | blocked | deprecated`)، `testManifest`، `acceptanceEvidence` و `version`.
  - تفکیک کامل `implemented`، `verified` و `accepted` (منع ارتقای مرحله به `accepted` بدون شواهد اجرای واقعی آزمون‌ها و عبور از معیارهای خروج).
  - اتصال تمام آزمون‌های `rtFe*.test.ts` و `rt-fe-rebuild-*.test.ts` به زنجیره رسمی آزمون و دروازه کیفیت CI بدون حذف مسیرها یا تب‌های Legacy (`onboardingStageTabs.ts` و پل مرحله ۲۴ به ۲۵ در `rtFeStage24Account.test.ts`).
- **هدف کمی پذیرش**: حداقل **۲۲۰ تست** در ۸ گروه با ۱۰۰٪ یکتایی شناسه مراحل، صفر آزمون الزامیِ اجرا‌نشده در CI، و صفر مرحله `accepted` بدون شواهد اجرای واقعی.

### ۲.۱۳ مرحله ۲۲: اتصال عملیاتی رابط پرداخت، کیف پول، صورت‌حساب و اشتراک به سرویس‌های مالی معتبر Backend (`RT-FE-REBUILD-PAYMENTS-BILLING-PRODUCTION-022`)
- **وضعیت ثبت**: **`designed` (طراحی و ثبت شد؛ اجرا نشده)** — مشروط به فاز صفر (تأیید و Mount شدن واقعی Routerهای مالی در `server.ts`).
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/features/commerce/`: تنها فایل موجود `services/exchangeRateClient.ts` است و کلاینت عملیاتی برای پرداخت، کیف پول، صورت‌حساب و اشتراک وجود ندارد.
  2. `Stage44TransactionSubpanel.tsx:5,12` و `Stage44InvoicesAndPaymentsPanel.tsx`: پنل مرحله ۴۴ بر پایه پرونده نمونه محلی (`INITIAL_STAGE44_DOSSIER`) است که در مرحله ۱۷ مرز اعتماد آن (`DEMO` و `UNAVAILABLE`) ایزوله شد، اما مسیر عملیاتی خرید، اشتراک و کیف پول متصل به Backend نیست.
  3. `server/modules/payments/routes.ts:20` (`createPaymentsRouter`)، `server/modules/payments/paymentRoutes.ts:49` (`createPaymentRouter`) و `server/modules/marketplace-billing/routes.ts:24` (`createMarketplaceBillingRouter`): این Routerها در کد سرور پیاده‌سازی شده‌اند اما در `server.ts` ثبت (`app.use(...)`) نشده‌اند.
- **قواعد غیرقابل‌مذاکره**:
  - تا زمانی که اتصال واقعی Routerهای مالی در Backend تأیید و Mount نشده است، فرانت‌اند نباید با داده ساختگی، Endpoint فرضی یا تأیید محلی، ظاهر یک سیستم پرداخت عملیاتی ایجاد کند.
  - ماشین وضعیت ۹گانه چرخه پرداخت عملیاتی (`created | pending | redirecting | verifying | unknown | succeeded | failed | cancelled | refunded`)، استفاده از `Idempotency-Key` ثابت، و دقت محاسبات پول (تومان در نمایش، واحد دقیق Provider در ارسال، ضریب ۱۰ در مرز مشخص، بدون خطای ممیز شناور).
- **هدف کمی پذیرش (پس از باز شدن فاز صفر Backend)**: حداقل **۲۶۰ تست** در ۹ گروه با صفر پرداخت موفق کاذب و صفر صدور رسید پیش از تأیید سرور.

### ۲.۱۴ مرحله ۲۳: بازسازی یکپارچگی داده و گردش‌کار عملیات مدیریتی در پنل ادمین (`RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023`)
- **وضعیت ثبت**: **`designed` (طراحی و ثبت شد — اجرا تأیید نشده)** — اولویت `P0` برای عملیات حساس مدیریتی و `P1` برای بخش‌های صرفاً خواندنی.
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/components/admin/AdminUnifiedControlPlanePanel.tsx:36-50,61-97,103-136`: وضعیت اولیه با اعداد ثابت (`modulesCount: 28`, `secretsCount: 2`, `recoveryResourcesCount: 3`, `datasetsCount: 3`) ساخته می‌شود؛ در خطوط ۸۳ تا ۹۴ در صورت شکست ۶ درخواست هم‌زمان (`/api/admin/platform/modules`, `/api/admin/cache/health`, `/api/admin/security/secrets`, `/api/admin/recovery/resources`, `/api/admin/analytics/datasets`, `/api/admin/resilience/readiness`) مقدار قبلی بدون نشان `STALE` حفظ می‌شود؛ و در خط ۱۳۱ در مانور بازیابی در صورت نبود `rtoMeasuredMinutes` مقدار پیش‌فرض `6` دقیقه در پیام موفقیت درج می‌شود.
  2. `src/features/admin/components/AdminSecurityAndAuditCenter.tsx:25-64` و `src/features/admin/services/adminGovernanceService.ts:23-26,92-107,143-172`: بارگذاری و ثبت Audit Log، پیش‌نمایش نقش (`ADMIN_ROLE_PREVIEW_KEY`) و برخی عملیات حساس از طریق `localStorage` انجام می‌شود.
  3. `src/features/admin/components/AdminOperationsOverviewCard.tsx:1,18-32`: شش کارت صف عملیاتی از توابع محلی محاسبه می‌شوند و توضیح خط ۱ دارای عبارت قدیمی `Stage 23` است که در رجیستری نقشه راه از شناسه جدید `RT-FE-REBUILD-ADMIN-OPERATIONS-AUTHORITY-023` تفکیک شده است.
  4. `src/navigation/registry/admin.routes.ts:4-102`: شش مسیر رسمی (`/admin`, `/admin/content`, `/admin/data`, `/admin/users`, `/admin/operations`, `/admin/security`) موجودند و نباید پنل یا Route Registry موازی ساخته شود.
- **قرارداد ۸ وضعیت داده مدیریتی**: `ZERO` (صفر واقعی)، `UNKNOWN` (غیرقابل تشخیص)، `NOT_CONFIGURED`، `STALE`، `DEGRADED`، `UNAUTHORIZED`، `ERROR`، و `FRESH`.
- **هدف کمی پذیرش**: **۲۶۰ تست** در ۸ حوزه با صفر KPI نمایشی/جعلی، صفر نمایش `0` به‌جای `UNKNOWN`، صفر پیام موفقیت بدون تأیید سرور، و ۱۰۰٪ ثبت سروری عملیات حساس با `operationId`.

### ۲.۱۵ مرحله ۲۴: ایجاد تجربه یکپارچه عرضه و مصرف محصولات داده‌ای، کاتالوگ تجاری، دسترسی API و ابزارهای MCP برای مشتریان بیرونی (`RT-FE-REBUILD-DATA-COMMERCE-PORTAL-024`)
- **وضعیت ثبت**: **`designed` (طراحی و ثبت شد — اجرا تأیید نشده)** — اولویت `P1` پیش از عرضه عمومی خدمات داده‌ای؛ منوط به تثبیت قرارداد و اتصال واقعی مراحل ۲۲ و ۲۳.
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/utils/serverAiAndCommerceRoutes.ts:83-91,92-164,166-174,175-197,267-297` و `server.ts:216` (`registerAiAndCommerceRoutes`): مسیرهای `GET /api/v1/commerce/catalog`، `GET /api/v1/commerce/neighborhood-index`، `GET /api/v1/mcp/tools`، `POST /api/v1/mcp/execute` و `GET /api/v1/commerce/neighborhood-dossier/:hoodId` در سرور Express ثبت شده‌اند.
  2. `worker/routes/intelligenceAndCommerceRoutes.ts:184-197,199-289,291-365,367-380,382-418`: همان مسیرهای کاتالوگ تجاری و ابزارهای MCP در Cloudflare Worker پیاده‌سازی شده‌اند؛ بنابراین نباید API موازی ساخته شود.
  3. `src/utils/dataCommerceMcpAndMonetization.ts:7-20`: سه محصول تجاری (`tehran_neighborhood_price_index_v1` با تعرفه `5_000` میکرو دلار، `multicity_housing_summary_v1` با تعرفه `10_000` میکرو دلار، و `mcp_authorized_market_tools_v1` با تعرفه `8_000` میکرو دلار) به‌همراه محدوده جغرافیایی، تناوب به‌روزرسانی، منشأ داده (`provenanceFa`) و محدودیت‌ها (`knownLimitationsFa`) تعریف شده‌اند.
  4. `docs/architecture/DATA-COMMERCE-AND-MONETIZATION.md:22-34`: چهار ابزار مجاز و Read-Only پروتکل MCP (`search_approved_market_data`, `get_neighborhood_statistics`, `compare_market_indicators`, `compute_hedonic_valuation`) با منع مطلق دسترسی به SQL یا اطلاعات تماس کاربران (`Zero PII`) تعریف شده‌اند.
  5. `src/components/AdminCloudAiCommerceCenter.tsx:241-279`، `src/components/AdminMcpAndPortabilitySandboxPanel.tsx:23-159` و `src/features/commerce/services/exchangeRateClient.ts:1-26`: تجربه فعلی در فرانت‌اند به سندباکس مدیریتی محدود است و پرتال عمومی مستقلی برای مشتری بیرونی وجود ندارد (همچنین تفکیک کامل شناسه `RT-FE-REBUILD-DATA-COMMERCE-PORTAL-024` از مرحله قدیمی `RT-FE-USER-ACCOUNT-024` در رجیستری نقشه راه اعمال شده است).
- **قواعد غیرقابل‌مذاکره**:
  - عدم ساخت دکمه صدور/چرخش API Key نمایشی پیش از تأیید Endpoint واقعی Backend.
  - تفکیک صریح پاسخ‌های `402 Payment Required` (`PAYMENT-REQUIRED` header)، `401`، `403`، `429` و `503`، و جداسازی کامل شبیه‌سازی (`SIMULATION — NO REAL PAYMENT OR SETTLEMENT`) از پرداخت مجاز (`AUTHORIZED_PENDING_SETTLEMENT`) و تسویه قطعی.
- **هدف کمی پذیرش**: **۲۴۰ تست** در ۸ حوزه (کاتالوگ ۳۰، جزئیات و Provenance ۳۵، API Explorer ۴۰، MCP Explorer ۴۰، x402 و وضعیت‌های HTTP ۳۵، تفکیک Simulation و پرداخت واقعی ۲۰، Responsive/RTL/Accessibility ۲۰، و Regression/امنیت ۲۰) با صفر افشای PII/Secret و صفر نمایش Simulation به‌عنوان پرداخت واقعی.

### ۲.۱۶ مرحله ۲۵: یکپارچه‌سازی مرجع محاسبه ارزش ملک، اتصال Workspace به سرویس معتبر ارزش‌گذاری و تفکیک خروجی کارشناسی از سناریوی محلی (`RT-FE-REBUILD-VALUATION-AUTHORITY-025`)
- **وضعیت ثبت**: **`designed` (طراحی و ثبت شد — اجرا تأیید نشده)** — اولویت **`P0` (بحرانی)** بر مبنای نسخه واقعی مخزن؛ پیش از عرضه عمومی خروجی کارشناسی و منوط به تأیید Mount شدن Router ارزش‌گذاری در `server.ts`.
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/features/valuation/services/valuationWorkspaceService.ts:5,254-299,349`: تابع `evaluateWorkspaceValuation` مستقیماً `calculateHedonicValuation` را از موتور محلی `src/data/hedonicPricingEngine.ts` فراخوانی می‌کند و وضعیت اعتبارسنجی مدل را صراحتاً `rule_based_uncalibrated_against_deeds` اعلام می‌دارد.
  2. `src/features/valuation/pages/ValuationWorkspacePage.tsx:104-107,175-182`: صفحه اصلی Workspace نتیجه را با `useMemo(() => evaluateWorkspaceValuation(input, activeHood, resolvedCity))` در کلاینت محاسبه می‌کند و هم‌زمان عنوان «موتور هدونیک مرجع» را نمایش می‌دهد.
  3. `server/modules/valuation/service.ts:256-339` و `server/modules/valuation/routes.ts:13-63`: سرویس مستقل ارزش‌گذاری سمت سرور با بررسی Baseline محله، شواهد بازار (`listMarketEvidence`)، انتخاب و امتیازدهی داده‌های مقایسه‌ای (`selectAndScoreComparables`)، حذف پرت/تکراری و `computeHedonicValuationCore` به‌همراه `createValuationRouter` (`POST /estimate`) پیاده‌سازی شده است؛ اما `createValuationRouter` در `server.ts` Mount نشده است.
  4. `src/features/valuation/tests/valuationWorkspace.test.ts:54-78` و `src/features/valuation/services/valuationStorageAndApiClient.ts:169-244`: تست‌های فعلی اتصال به موتور محلی (`verifiedTransactionCount === 0`) را می‌آزمایند و مسیر `/api/account/valuations` صرفاً ذخیره و بازیابی گزارش در حساب کاربری است، نه API محاسبه رسمی ارزش ملک.
  5. **تفکیک شناسه در رجیستری نقشه راه**: شناسه `RT-FE-REBUILD-VALUATION-AUTHORITY-025` در مسیر `REBUILD_2026` از شناسه قدیمی `RT-FE-USER-ACCESS-CONTROL-025` (پل مرحله ۲۴ به ۲۵ در `src/features/onboarding/tests/rtFeStage24Account.test.ts:23` در مسیر `LEGACY_RT_FE`) به‌طور کامل تفکیک شده است.
- **قواعد غیرقابل‌مذاکره**:
  - تا زمان تأیید و Mount شدن واقعی `createValuationRouter` در `server.ts`، فرانت‌اند نباید Endpoint فرضی بسازد یا خروجی موتور محلی کالیبره‌نشده را به‌عنوان «قیمت/ارزش کارشناسی رسمی» نمایش دهد؛ موتور محلی صرفاً با برچسب روشن «سناریوی فرضی (What-If)» مجاز است.
  - در صورت قطع ارتباط با سرویس Backend، Fallback خاموش به موتور محلی ممنوع است و وضعیت باید بین `loading`، `success`، `error`، `unknown` و `stale` تفکیک شود.
- **هدف کمی پذیرش**: **۲۸۰ تست** در ۹ حوزه با صفر خروجی محلی با عنوان ارزش کارشناسی، صفر Fallback خاموش به موتور محلی، صفر گزارش ذخیره‌شده بدون Snapshot قابل ردیابی (`valuationId`, `modelId`, `modelVersion`, `methodologyVersion`, `cityId`, `hoodId`, `dataAsOf`, `inputFingerprint`, `comparableIds`, `sampleSufficiency`, `uncertainty`, `correlationId`) و حفظ ۱۰۰٪ سناریوهای What-If.

### ۲.۱۷ مرحله ۲۶: بازسازی رضایت آگاهانه، کنترل جمع‌آوری داده رفتاری و یکپارچگی زنجیره تحویل Telemetry از فرانت‌اند تا مخزن (`RT-FE-REBUILD-TELEMETRY-CONSENT-DELIVERY-026`)
- **وضعیت ثبت**: **`designed` (طراحی و ثبت شد — اجرا تأیید نشده)** — اولویت **`P0` (بحرانی)** پیش‌نیاز توسعه Telemetry گسترده؛ منوط به یکپارچه‌سازی قرارداد و Mount شدن نهایی مسیر دریافت در `server.ts`.
- **یافته‌های مستقیم در مخزن (`[Observed Fact]`)**:
  1. `src/utils/productAnalyticsEngine.ts:11-20`: کلاس `CentralizedRadarAnalyticsCollector` در خط ۱۲ با `enabled = true` و `userConsentGranted = true` مقداردهی اولیه شده است؛ تابع `setUserConsent` در خط ۱۶ وجود دارد اما پیش‌فرض اولیه Opt-In (رضایت فعال) است.
  2. `src/features/account/services/accountSettingsStorageService.ts:150-166` و `src/features/account/components/AccountProfileAndSettingsPanel.tsx:183-185`: در تابع `loadPrivacyPreferences` مقدار پیش‌فرض `privacySafeTelemetryEnabled: true` است و تغییر آن در `updatePrivacyPreferences` صرفاً در Scoped `localStorage` ذخیره می‌شود، بدون اتصال مستقیم و همگام به `CentralizedRadarAnalyticsCollector.setUserConsent`.
  3. `src/utils/telemetryEdgeAggregationEngine.ts:135-151,262-280`: تابع `flushViaBeaconOrKeepalive` در خط ۱۴۷ خطاهای `fetch(..., { keepalive: true })` را با `.catch(() => undefined)` نادیده می‌گیرد و بدون تفکیک وضعیت‌های `QUEUED`، `SENT`، `ACCEPTED`، `REJECTED`، `DROPPED` و `UNKNOWN` مقدار `true` برمی‌گرداند؛ همچنین در خطوط ۲۶۲ تا ۲۸۰ سیاست ظرفیت (`DEFAULT_TELEMETRY_POLICY`: سطح ۴، نرخ نمونه‌گیری ۱۰۰٪، سقف روزانه ۲۵۰٬۰۰۰ رویداد، Lease حداکثر ۷ روز برای سطوح ۹ و ۱۰) تعریف شده است.
  4. `server/modules/telemetry/telemetryRoutes.ts:44-128` در برابر `server.ts:14`: تابع `registerTelemetryModuleRoutes` مسیرهای نسخه v2 (`POST /api/v2/telemetry/events`, `GET /api/v2/telemetry/aggregates`, `GET /api/v2/telemetry/diagnostics`, `POST /api/v2/telemetry/retention/purge`) را تعریف کرده است، اما در `server.ts` خط ۱۴ فقط `app.use("/api/v1/telemetry/ingest", express.json({ limit: "64kb" }))` دیده می‌شود و `registerTelemetryModuleRoutes` در `server.ts` فراخوانی نشده است.
- **قواعد غیرقابل‌مذاکره**:
  - **Default-Deny برای داده‌های تحلیلی و بازاریابی اختیاری**: وضعیت‌های رضایت (`NOT_ASKED | GRANTED | DENIED | REVOKED | EXPIRED | UNAVAILABLE`) باید تفکیک شوند و در هر وضعیت غیر از `GRANTED`، جمع‌آوری اختیاری متوقف باشد؛ در زمان لغو رضایت (`REVOKED`) نیز Batchهای ارسال‌نشده فوراً پاک شوند و به تب‌های دیگر و تغییر حساب سرایت داده نشوند.
  - **تفکیک وضعیت تحویل**: ارسال (`SENT`) به‌معنای پذیرش سرور (`ACCEPTED`) نیست و ادعای ذخیره موفق Telemetry پیش از اثبات زنجیره کامل (`User Consent → Frontend Collector → Event Sanitization → Ingestion Endpoint → Server Validation → Aggregation → Retention`) ممنوع است.
- **هدف کمی پذیرش**: **۲۸۰ تست** در ۹ حوزه با پیش‌فرض خاموش برای جمع‌آوری اختیاری، صفر ارسال اختیاری پیش از رضایت، حداکثر ۱ ثانیه زمان اعمال لغو رضایت، صفر Payload حاوی PII/Secret/Token، صفر نشت صف داده بین حساب‌ها و نرخ Deduplication حداقل `۹۹.۹٪`.

# ممیزی شکاف و نقشه همگرایی بک‌اند شبکه اجتماعی رادار تهران (`RT-SOCIAL-MASTER-001`)

- **وضعیت سند**: `Audit & Architecture Baseline Only` (بدون تغییر کد اجرایی، قوانین Firestore یا اسکیما در این گام)
- **شناسه پروژه و محیط هدف (`[Observed Fact]`)**:
  - Firebase Project: `gen-lang-client-0713157837` *(تذکر انحراف مستندات: در `docs/DATABASE-AND-DATA-LAYER-AUDIT.md:22` شناسه `gen-lang-client-0713159189` آمده است)*
  - Firestore Database ID: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
  - Cloudflare Worker (`wrangler.jsonc`): `radartehran` (محیط‌های `preview`، `staging`، `production`)
- **اصل صحت‌سنجی (`CASPER Epistemic Discipline`)**: این سند بین `[Observed Fact]` (مشاهده مستقیم کد/خروجی ابزار)، `[Assumption]` (فرض کاری موقت)، و `[Unknown]` (داده ازدست‌رفته پیش از Compaction) تفکیک شفاف قائل می‌شود.

---

## ۱. گام اول: خط مبنای امنیت و تکلیف بخش‌های جامانده در Compaction

### ۱.۱ شفاف‌سازی بخش‌های فاقد متن خام (`[Unknown]`)
متن خام پیوست‌های گفت‌وگوی پیش از Compaction برای **مراحل ۷ تا ۹** (جزئیات قراردادهای API مرحله ۸، رویدادها/جست‌وجو) و **بندهای ۱ تا ۱۰ از مرحله ۱۱** (احراز هویت، نشست، RBAC/ABAC و حاکمیت دسترسی) در این نشست در دسترس نیستند (`[Unknown]`). به‌جای بازسازی تخیلی، مبنای فنی این بخش‌ها مستقیماً از کد زنده مخزن استخراج و هم‌تراز شده است.

### ۱.۲ خط مبنای واقعی امنیت مخزن (پوشش متناظر با مرحله ۱۱ بندهای ۱ تا ۱۴) — `[Observed Fact]`

| محور امنیتی | پیاده‌سازی موجود و تأییدشده در مخزن | شکاف‌ها و خطاهای حیاتی `[P0]` / `[P1]` |
| :--- | :--- | :--- |
| **احراز هویت و Token** | `server/modules/core/authAndAuthz.ts` (`extractSingleBearerToken`, `extractAuthenticatedPrincipal`, وضعیت `503 AUTH_PROVIDER_UNAVAILABLE` در قطع سرویس‌دهنده) + `src/utils/serverAdminAndTelegramSecurity.ts` (`verifyAuthenticatedUserHeader`, `verifyFirebaseAppCheckHeader`, مقایسه ثابت‌زمانی). | **`[P0]`**: `trustSafetyRoutes.ts:32-47` و `disputeRoutes.ts:27-44` در نبود `tokenVerifier` به هدرهای جعل‌پذیر `x-test-uid`، `x-user-id` و `x-test-role` اعتماد می‌کنند.<br>**`[P0]`**: `crowdClaimsRoutes.ts:43-44, 69, 188` در نبود `Authorization` با `statusCode: 200` عبور کرده و به `body.authorUid` / `body.voterUid` تکیه می‌کند (مغایر با `expressRouteCatalog.ts:93-95`). |
| **RBAC / ABAC و قوانین داده** | `firestore.rules` (۶۳۳ خط، ۹ کالکشن): `default deny-all`، الزام `email_verified == true`، تفکیک `/bargains` و `/bargainOwners` با Batch اتمیک، محدودیت زمانی رأی ۲۴ساعته با `request.time`، ۴ ایمیل ادمین بوت‌استرپ + `/admins/{uid}`. | **`[P1]`**: کالکشن‌های شبکه اجتماعی جدید (`posts`، `comments`، `follows`، `reactions`، `moderationCases` و ...) هنوز در `firestore.rules` و `firebase-blueprint.json` وجود ندارند. |
| **Rate Limiting و ضدسوءاستفاده** | `src/utils/serverDeliveryAndAbuseGuard.ts`: سطل‌های چندگانه (`general`, `sync`, `ai`, `lead`, `tile`, `upload`, `download`, `boundary`, `call_track`)، سهمیه حساب (`checkAccountQuota`)، جریمه موقت (`abusePenaltyMap`) و منع توکن در Query. | **`[P1]`**: تمام وضعیت Rate Limit، `IdempotencyLedger` (`serverIdempotencyAndConcurrency.ts`) و مصرف رویداد نوتیفیکیشن در **RAM فرآیند** نگهداری می‌شوند و در اجرای چندنمونه‌ای همگام نیستند. |
| **امنیت API، Mass Assignment و CORS** | `server/modules/core/authAndAuthz.ts` (`stripUntrustedIdentityFields`) + `src/utils/apiContractsAndSerializationEngine.ts` (Allowlist سخت‌گیرانه، دفع `__proto__`، عدم اجازه `*` همراه Credential در CORS، پاکت استاندارد پاسخ و خطا بدون Stack Trace). | **`[P1]`**: `communityRoutes.ts:178` و `commsRoutes.ts` فاقد میدل‌ویر `Idempotency-Key` هستند و خروجی‌های `search`، `dgov` و `analytics` از پاکت استاندارد تبعیت نمی‌کنند. |
| **امنیت فایل و SSRF** | `server/modules/api-governance/ssrfGuard.ts` (مسدودسازی شبکه‌های داخلی/لوکال و پروتکل‌های غیرمجاز) + `server/modules/professional-verification/authoritiesAndStateMachine.ts` (Allowlist دامنه برای ۷ سامانه ایرانی با `hasAuthorizedAutomatedApi: false` و جداسازی وظایف `actor.uid !== ownerUid`). | **`[P1]`**: مسیر یکپارچه بررسی Magic Bytes، قرنطینه فایل و امضای URL کوتاه‌عمر هنوز میان `media` و `serverObjectStorage` یکسان‌سازی و به Storage ابری متصل نشده است. |

---

## ۲. گام دوم: خروجی گیت‌های راستی‌آزمایی و واقعیت معماری مخزن (`[Observed Fact]`)

### ۲.۱ نتایج اجرای دستورات کنترل کیفیت و قراردادها
| دستور بررسی | وضعیت | جزئیات دقیق مشاهده‌شده |
| :--- | :---: | :--- |
| `npm run arch:check && npm run lint` | **PASS** | `arch:check` تعداد **۱۰۰۱** فایل را اسکن کرد (**۰ خطای مسدودکننده**، **۱۶ هشدار** ۳۰۰–۴۹۹ خط، `src/App.tsx`: `64/100` خط) و `tsc --noEmit` بدون خطا گذشت. |
| `npm run test:rules:static` | **PASS** | ممیزی استاتیک قوانین Firestore: **۱۳/۱۳** و رگرسیون یکپارچگی داده: **۹/۹**. |
| `npm run test:contracts` | **FAIL** | شکست در `tests/engineering-quality-foundation.test.ts:123` (`AssertionError: 1076.39 !== 100` روی `convertAreaFromSqm(sqm, 'sqft')`) ناشی از انحراف تست قدیمی نسبت به پیاده‌سازی جدید `src/utils/areaUnit.ts:249-260`. |
| `npm run cf:config:check` | **FAIL (Pre-build)** | `wrangler deploy --dry-run` به‌علت نبود دایرکتوری `/app/applet/dist` (پیش از `npm run build`) و مشخص‌نشدن `--env` با کد `1` خارج شد. |

### ۲.۲ نقطه کور خطرناک Guardrail معماری و رشد کنترل‌نشده ماژول‌ها
1. **نقطه کور `scripts/check-architecture.ts:57-59`**: اسکریپت `arch:check` فقط `server.ts`، `src/`، `server/modules/telemetry/` و `server/modules/casper-hub/` را می‌گردد و **~۷۳ پوشه دیگر در `server/modules/` را نادیده می‌گیرد**. به همین دلیل **۳ فایل از سقف مجاز `<500` خط (`architecture-baseline.json`) عبور کرده‌اند**:
   - `server/modules/notification-orchestration/service.ts`: **۱۵۴۷ خط**
   - `server/modules/backup-recovery/index.ts`: **۶۹۵ خط**
   - `server/modules/platform-resilience/index.ts`: **۵۹۹ خط**
   - *(نزدیک به سقف)* `server/modules/notifications/durableNotificationStore.ts`: **۴۸۷ خط**
2. **تکثیر شدید و مسیرهای دوگانه در `server/modules/`**: مجموعاً **۷۵ دایرکتوری** و **۴۴ فایل Route** شناسایی شد، اما در `server.ts:216` فقط `communityRoutes`، `commsRoutes`، `globalSearchAndGovernanceGateway` (همراه `dgovRoutes` و `analyticsRoutes`) و `accountAdminRoutes` به علاوه `src/utils/server*Routes.ts` سوار (Mount) شده‌اند. پنج پوشه نیز **دو فایل Route رقیب** در یک دایرکتوری دارند: `data-governance` (`dgovRoutes.ts` / `routes.ts`)، `notifications` (`notificationRoutes.ts` / `routes.ts`)، `payments` (`paymentRoutes.ts` / `routes.ts`)، `search` (`searchRoutes.ts` / `routes.ts`) و `trust-safety` (`trustSafetyRoutes.ts` / `routes.ts`).

### ۲.۳ واقعیت پایگاه‌داده و اجرای چندنمونه‌ای (Runtime Truth)
- **دیتابیس ابری فعال فقط Firestore است**: نه SQL/PostgreSQL و نه Cloudflare D1 در runtime فعال نیستند (`docs/DATABASE-AND-DATA-LAYER-AUDIT.md` + `server.ts`). فایل `wrangler.jsonc` صرفاً شناسه‌های Placeholder (`0000...0001`/`0002`) برای `DB`، `MEDIA_BUCKET`، `RADAR_KV` و `RADAR_QUEUE` دارد و `worker/migrationRegister.ts` تنها مسیرهای Stateless گروه `1A/1B` را روی Worker در وضعیت `VERIFIED` ثبت کرده است.
- **ذخیره‌سازی محلی در ماژول‌های جدید**: `communityStore`، `commsStore`، `durableNotificationStore` و `atomicJsonRepository` روی فایل JSON محلی (`0o600`) یا حافظه موقت (`MemoryTrustSafetyStore`) کار می‌کنند. `src/utils/serverConfigValidator.ts:195` صراحتاً اجرای `INSTANCE_COUNT > 1` را بدون `SHARED_SECURITY_STATE_BACKEND === 'firestore'` مسدود می‌کند.

---

## ۳. گام سوم (بخش الف): ماتریس همگرایی و شکاف (`Gap & Convergence Matrix`)

| خوشه دامنه (متناظر با مراحل ۱–۲۰) | موجودی فعلی مخزن (`[Observed Fact]`) | مالک قطعی پیشنهادی (`Canonical Owner`) | حکم و اقدام لازم (`Disposition`) |
| :--- | :--- | :--- | :--- |
| **۱. هسته Auth، قرارداد API و امنیت لبه**<br>*(مراحل ۱، ۸، ۱۱، ۱۲، ۱۴)* | `server/modules/core/authAndAuthz.ts`، `src/utils/serverAdminAndTelegramSecurity.ts`، `src/utils/serverDeliveryAndAbuseGuard.ts`، `src/utils/apiContractsAndSerializationEngine.ts`، `src/utils/expressRouteCatalog.ts` | `server/modules/core` + `src/utils/serverDeliveryAndAbuseGuard.ts` | **`KEEP & EXTEND`**: یکسان‌سازی تمام پاسخ‌ها روی `StandardApiSuccessEnvelope` / `CoreApiError`، ثبت ۱۰۰٪ مسیرها در `expressRouteCatalog.ts`، انتقال Rate-Limit به State مشترک در چندنمونه‌ای. |
| **۲. شبکه اجتماعی، فید، کامنت، دنبال‌کردن و داده جمعی**<br>*(مراحل ۱–۶، ۹، ۱۰)* | `community` (`communityRoutes.ts` سوار در `server.ts` با فایل محلی، بدون Idempotency)، `crowd-data` (اسکلت آماده با Handoff)، `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` | `server/modules/community` (ادغام قراردادهای `crowd-data` و بازبینی `crowdClaimsRoutes`) | **`FIX_SECURITY [P0] + CONSOLIDATE`**: حذف `body.authorUid`/`voterUid` در `crowdClaimsRoutes.ts`، افزودن `Idempotency-Key` و اتصال کالکشن‌های Wave 1 به Firestore. |
| **۳. اعتماد، تعدیل محتوا، اختلاف، تقلب و احراز هویت حرفه‌ای**<br>*(مراحل ۵، ۱۵، ۱۶، ۱۷، ۱۸)* | `trust-safety` (۲ فایل Route، هدرهای تستی `x-test-*`)، `dispute-resolution` (هدرهای تستی `x-test-*`)، `fraud-risk-intelligence`، `professional-verification` (`authoritiesAndStateMachine.ts`)، `real-estate-professionals` | `trust-safety` (Moderation/Report) + `dispute-resolution` + `professional-verification` | **`FIX_SECURITY [P0] + CONSOLIDATE`**: حذف فوری fallback به `x-test-uid`/`x-user-id`/`x-test-role`؛ ادغام `real-estate-professionals` با `professional-verification`؛ حفظ تفکیک بین امتیاز ریسک `fraud-risk` و تعلیق خودکار (عدم محرومیت دائم خودکار مطابق بند ۱۰.۳). |
| **۴. اعلان‌ها و ارتباطات کاربری**<br>*(مراحل ۷، ۱۰، ۱۹)* | `notifications` (`notificationRoutes.ts` + `routes.ts`، `durableNotificationStore.ts` ۴۸۷ خط)، `notification-orchestration` (`service.ts` **۱۵۴۷ خط**)، `comms` (`commsRoutes.ts` سوارشده) | `server/modules/notifications` + `communications` | **`SPLIT (<500 LOC) + CONSOLIDATE`**: شکستن `notification-orchestration/service.ts` زیر ۵۰۰ خط، حذف فایل Route تکراری `notifications/routes.ts`، یکسان‌سازی `notificationEventConsumer` روی Idempotency پایدار. |
| **۵. جست‌وجو، کشف و حاکمیت داده**<br>*(مراحل ۴، ۷، ۸، ۱۹، ۲۰)* | `search/globalSearchAndGovernanceGateway.ts` (سوارشده) + `search/searchRoutes.ts` + `search/routes.ts`، `search-intelligence`، `property-search`، `data-governance` (`dgovRoutes.ts` + `routes.ts`) | `server/modules/search` + `data-governance` | **`CONSOLIDATE + EXTEND`**: جمع‌کردن Routeهای موازی (`search-intelligence`, `property-search`, `routes.ts`های تکراری) زیر `globalSearchAndGovernanceGateway` و تبعیت کامل از پاکت استاندارد خطا/پاسخ. |
| **۶. حساب کاربری، چرخه حیات، سازمان و پرداخت**<br>*(مراحل ۳، ۱۰، ۱۵، ۱۶، ۱۸)* | `account-admin` (سوارشده)، `account-lifecycle`، `enterprise-tenancy`، `payments` (۲ فایل Route)، و ماژول‌های `UNMOUNTED_ENTERPRISE_DOMAIN_MODULES` | `account-admin` + `account-lifecycle` (در Wave 2: `enterprise-tenancy`) | **`DEFER / BOUNDED MVP`**: تنها `account-admin` و تغییر وضعیت امن `account-lifecycle` در Wave 1/2؛ تعویق `enterprise-tenancy` و ماژول‌های کارگذاری/ERP به پس از اثبات حلقه اصلی محصول. |
| **۷. رسانه، فایل، تحلیل، تله‌متری و تاب‌آوری**<br>*(مراحل ۱۲، ۱۳، ۱۹، ۲۰)* | `media` + `src/utils/serverObjectStorage.ts`، `api-governance/ssrfGuard.ts`، `analytics-research`، `market-analytics`، `analytical-platform`، `telemetry` (۲ نسل)، `backup-recovery` (**۶۹۵ خط**)، `platform-resilience` (**۵۹۹ خط**) | `media` + `analytics-research` + `telemetry` + `platform-resilience` | **`SPLIT (<500 LOC) + CONSOLIDATE`**: شکستن فایل‌های ۶۹۵ و ۵۹۹ خطی، ادغام سه ماژول پراکنده تحلیلی روی یک مالک (`analytics-research`) بدون PII، اتصال بررسی Magic Bytes + SSRF به لایه فایل. |
| **۸. قابلیت انتقال به لبه Cloudflare (`Worker / D1 / R2`)**<br>*(پیوست معماری Cloudflare و مراحل ۱۱–۱۴)* | `wrangler.jsonc` (Placeholder IDs)، `worker/migrationRegister.ts` (فقط گروه 1A/1B تاییدشده، مسیرهای کاربر/ادمین/داده `BLOCKED`) | `worker/migrationRegister.ts` + `src/utils/serverRuntimeEnvStore.ts` | **`DEFER BINDINGS`**: نگهداشتن استقرار فعلی روی Node/Express + Firestore تا زمانی که Bindings واقعی Cloudflare (`D1/R2/KV/Queues`) و Store مشترک جایگزین Placeholderها شوند. |

---

## ۴. گام سوم (بخش ب): ۵ تصمیم قفل‌شده (`Decision Freeze`) پیش از شروع Wave 1

پیش از نوشتن حتی یک خط کد اجرایی جدید در مخزن، اجرای Wave 1 منوط به قفل‌ماندن این ۵ تصمیم است:

1. **قفل امنیتی `[P0]` پیش از هر Mount جدید (`Zero Spoofed Identity`)**:
   - حذف کامل fallback به هدرهای `x-test-uid`، `x-user-id`، `x-test-role` در `trustSafetyRoutes.ts` و `disputeRoutes.ts` و حذف اعتماد به `body.authorUid` / `body.voterUid` در `crowdClaimsRoutes.ts`.
   - هر مسیر غیردولتی باید `fail-closed` از `authAndAuthz.ts` یا `verifyAuthenticatedUserHeader` عبور کند؛ در محیط تست فقط تزریق Mock Verifier صریح در تست مجاز است و نه fallback در کد تولید.
2. **تک‌منبع حقیقت ذخیره‌سازی (`Firestore First` در Wave 1)**:
   - پایگاه‌داده رسمی برای موجودیت‌های اجتماعی Wave 1 در تولید **فقط Google Cloud Firestore** است و تمام کالکشن‌ها و قوانین امنیتی آن‌ها هم‌زمان در `firebase-blueprint.json`، `firestore.rules` و تست‌های `test:rules:static` ثبت می‌شوند.
   - فایل‌های محلی `0o600` صرفاً برای کش/توسعه تک‌نمونه‌ای (`INSTANCE_COUNT=1`) مجازند و تا جایگزینی شناسه‌های `0000...` در `wrangler.jsonc`، هیچ کدی فرض وجود `D1` یا `Queues` نمی‌کند.
3. **قرارداد واحد API و بستن نقطه کور `arch:check`**:
   - همه Routeهای جدید و فعلی باید خروجی یکپارچه `{ status: 'ok', correlationId, timestampIso, data }` / `{ status: 'error', code, message, correlationId, retryable }` برگردانند و در `src/utils/expressRouteCatalog.ts` ثبت شوند.
   - در گام نخست Wave 1، `scripts/check-architecture.ts` باید کل `server/modules/**` را اسکن کند تا فایل‌های >۵۰۰ خط (`1547`، `695`، `599`) در CI پنهان نمانند؛ هم‌زمان تکلیف انحراف تست `tests/engineering-quality-foundation.test.ts:123` (`areaUnit.ts`) تعیین شود.
4. **انجماد تکثیر ماژول‌ها (`1 Canonical Owner per Cluster`)**:
   - ایجاد دایرکتوری جدید خارج از ۸ خوشه بالا ممنوع است. پنج پوشه دارای Route دوگانه (`data-governance`، `notifications`، `payments`، `search`، `trust-safety`) پیش از توسعه قابلیت تازه روی یک فایل Route واحد ادغام می‌شوند.
5. **برش عمودی MVP (`Wave 1` در برابر `Wave 2` و `Deferred`)**:
   - **Wave 1 (موج اول — اجباری و کم‌ریسک)**: رفع ۳ باگ امنیتی `[P0]` + اصلاح `arch:check` و تست قرارداد + حلقه هسته اجتماعی (`پست/کامنت/واکنش/دنبال‌کردن/گزارش تخلف` در `community` و `trust-safety` روی Firestore با Idempotency و Rate Limit لایه‌بندی‌شده).
   - **Wave 2 (موج دوم — توسعه کارکردی)**: احراز هویت حرفه‌ای (`professional-verification`) با تایید دستی/SoD، اعلان‌های یکپارچه (`notifications` پس از شکستن `1547` خط)، و امنیت رسانه (`Magic Bytes + SSRF + Signed URLs`).
   - **Deferred (تعویق آگاهانه تا اثبات ترافیک)**: چندسازمانی (`enterprise-tenancy`)، موتور تقلب پیچیده چندلایه، پرداخت‌های کامل، و مهاجرت داده‌محور به `Cloudflare D1/Queues`.

# ممیزی شکاف و نقشه همگرایی بک‌اند شبکه اجتماعی رادار تهران (`RT-SOCIAL-MASTER-001` / بازنگری `RT-SOCIAL-IMPL-001`)

- **وضعیت سند**: `Audit & Architecture Baseline — Reconciled with Codebase Reality (RT-SOCIAL-IMPL-001)`
- **تاریخ همگام‌سازی کد و ممیزی**: `2026-11-18` (مبتنی بر بازرسی مستقیم کد و اجرای آزمون‌های زنده در مرحله `RT-SOCIAL-IMPL-001`)
- **سند خط مبنای اجرایی متناظر**: [`docs/architecture/RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md`](./RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md)
- **شناسه پروژه و محیط هدف (`[Observed Fact]`)**:
  - Firebase Project: `gen-lang-client-0713157837` *(تذکر انحراف مستندات تاریخی: در `docs/DATABASE-AND-DATA-LAYER-AUDIT.md:22` شناسه `gen-lang-client-0713159189` آمده است)*
  - Firestore Database ID: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
  - Cloudflare Worker (`wrangler.jsonc`): `radartehran` (محیط‌های `preview`، `staging`، `production`)
- **اصل صحت‌سنجی (`CASPER Epistemic Discipline`)**: این سند بین `[Observed Fact]` (مشاهده مستقیم کد/خروجی ابزار)، `[Assumption]` (فرض کاری موقت)، و `[Unknown]` (داده ازدست‌رفته پیش از Compaction) تفکیک شفاف قائل می‌شود. در بازنگری `RT-SOCIAL-IMPL-001`، یافته‌های تاریخی حفظ شده و هر مورد با یکی از برچسب‌های استاندارد زیر تعیین تکلیف شده است:
  - `VERIFIED_EXISTING`: قابلیت در کد وجود دارد و با آزمون اثبات شد.
  - `VERIFIED_FIXED`: ایراد گزارش‌شده در ممیزی قبلی در کد فعلی برطرف شده و با آزمون اثبات شد.
  - `OPEN`: شکاف واقعی است و هنوز باز است.
  - `PARTIALLY_IMPLEMENTED`: بخشی از قابلیت وجود دارد اما کامل نیست.
  - `NOT_APPLICABLE`: یافته ممیزی با معماری فعلی موضوعیت ندارد.
  - `UNKNOWN`: بدون اطلاعات خارج از مخزن قابل اثبات نیست.

---

## ۰. جدول رفع مغایرت‌های ۵گانه ممیزی اولیه با کد واقعی مخزن (`RT-SOCIAL-IMPL-001 Reconciliation Ledger`)

در بازرسی خط‌به‌خط کد در مرحله `RT-SOCIAL-IMPL-001` مشخص شد ۵ ادعای ثبت‌شده در نسخه اولیه این سند مربوط به وضعیت پیش از اصلاحات Wave 1–3 بوده و در کد فعلی مخزن برطرف شده‌اند:

| ردیف | ادعای تاریخی در نسخه اولیه ممیزی | واقعیت فعلی کد در مخزن (`[Observed Fact]`) | برچسب وضعیت نهایی | شواهد کد و آزمون |
| :---: | :--- | :--- | :---: | :--- |
| **۱** | کالکشن‌های شبکه اجتماعی (`posts`، `comments`، `follows`، `reactions`، `moderationCases` و ...) در `firestore.rules` وجود ندارند. | هر **۱۰ کالکشن اجتماعی** (`socialPosts`، `socialComments`، `socialReactions`، `socialFollows`، `socialReports`، `socialModerationCases`، `socialModerationEvents`، `socialOutbox`، `socialProfiles`، `socialIdempotency`) با قوانین دسترسی صریح در `firestore.rules` تعریف شده‌اند. | **`VERIFIED_FIXED`** | `firestore.rules:644-741` + `npm run test:rules:static` (`13/13` و `9/9` PASS) |
| **۲** | اسکیما و مسیرهای شبکه اجتماعی در `firebase-blueprint.json` تعریف نشده‌اند. | هر **۱۰ موجودیت** (`SocialPost`، `SocialComment`، `SocialReaction`، `SocialFollow`، `SocialReport`، `SocialModerationCase`، `SocialModerationEvent`، `SocialOutboxEvent`، `SocialProfile`، `SocialIdempotency`) و هر ۱۰ مسیر کالکشن در `firebase-blueprint.json` ثبت شده‌اند. | **`VERIFIED_FIXED`** | `firebase-blueprint.json:222-368, 407-446` + `tests/community-firestore-stage3.test.ts` |
| **۳** | اسکریپت `scripts/check-architecture.ts` فقط ۲ پوشه در `server/modules` را اسکن می‌کند و ~۷۳ پوشه دیگر را نادیده می‌گیرد. | در `scripts/check-architecture.ts:63-64` دستور `walk('src'); walk('server/modules');` کل زیرشاخه‌های `server/modules` (۶۸۴ فایل با احتساب ۱۱۱ فایل میراثی قفل‌شده در `architecture-baseline.json`) را اسکن می‌کند. فایل‌های `notification-orchestration/service.ts` (`438` خط) و `platform-resilience/index.ts` (`428` خط) نیز به زیر سقف ۵۰۰ خط شکسته شده‌اند. | **`VERIFIED_FIXED`** | `scripts/check-architecture.ts:63-64` + `npm run arch:check` (`0 errors`) |
| **۴** | `trustSafetyRoutes.ts` و `disputeRoutes.ts` در نبود `tokenVerifier` به هدرهای جعل‌پذیر `x-test-uid`، `x-user-id` و `x-test-role` اعتماد می‌کنند. | در هر دو فایل، تابع `resolvePrincipal` در نبود `tokenVerifier` به‌صورت **Fail-Closed** با کد `503 AUTH_PROVIDER_UNAVAILABLE` درخواست را رد می‌کند و هویت و نقش کاربر صرفاً از توکن تاییدشده (`extractAuthenticatedPrincipal` + `authorizePrincipal`) استخراج می‌شود. | **`VERIFIED_FIXED`** | `server/modules/trust-safety/trustSafetyRoutes.ts:40-80`، `server/modules/dispute-resolution/disputeRoutes.ts:37-84`، آزمون‌های `TS-A01..TS-A06` و `DR-A01..DR-A06` |
| **۵** | `crowdClaimsRoutes.ts` بدون هدر `Authorization` عبور کرده و به `body.authorUid` و `body.voterUid` اعتماد می‌کند. | تابع `verifyRequiredAuth` توکن Bearer معتبر با ایمیل تاییدشده را الزام می‌کند (`401`/`403`/`503`) و در صورت مغایرت `body.authorUid` یا `body.voterUid` با `auth.uid`، پاسخ `403 UID_SPOOFING_FORBIDDEN` برمی‌گرداند. | **`VERIFIED_FIXED`** | `src/cells/knowledge-crowd/crowdClaimsRoutes.ts:76-146, 295-330`، آزمون‌های `CC-A01..CC-A12` در `tests/stage2-crowd-claims.test.ts` |

---

## ۱. گام اول: خط مبنای امنیت و تکلیف بخش‌های جامانده در Compaction

### ۱.۱ شفاف‌سازی بخش‌های فاقد متن خام (`UNKNOWN`)
- **وضعیت**: `UNKNOWN`
- متن خام پیوست‌های گفت‌وگوی پیش از Compaction برای **مراحل ۷ تا ۹** (جزئیات قراردادهای API مرحله ۸، رویدادها/جست‌وجو) و **بندهای ۱ تا ۱۰ از مرحله ۱۱** (احراز هویت، نشست، RBAC/ABAC و حاکمیت دسترسی) در نشست اولیه در دسترس نبودند (`UNKNOWN`). به‌جای بازسازی تخیلی، مبنای فنی این بخش‌ها مستقیماً از کد زنده مخزن استخراج و هم‌تراز شده است.

### ۱.۲ خط مبنای واقعی امنیت مخزن (پوشش متناظر با مرحله ۱۱ بندهای ۱ تا ۱۴) — `[Observed Fact]`

| محور امنیتی | پیاده‌سازی موجود و تأییدشده در مخزن | یافته تاریخی ممیزی اولیه | وضعیت بازنگری `RT-SOCIAL-IMPL-001` |
| :--- | :--- | :--- | :--- |
| **احراز هویت و Token** | `server/modules/core/authAndAuthz.ts` (`extractSingleBearerToken`, `extractAuthenticatedPrincipal`, وضعیت `503 AUTH_PROVIDER_UNAVAILABLE` در قطع سرویس‌دهنده) + `src/utils/serverAdminAndTelegramSecurity.ts` (`verifyAuthenticatedUserHeader`, `verifyFirebaseAppCheckHeader`, مقایسه ثابت‌زمانی). | *[یافته تاریخی]*: `trustSafetyRoutes.ts` و `disputeRoutes.ts` در نبود `tokenVerifier` به هدرهای `x-test-*` اعتماد می‌کنند و `crowdClaimsRoutes.ts` به `body.authorUid` / `body.voterUid` تکیه می‌کند. | **`VERIFIED_FIXED`**: هر سه مسیر به‌طور کامل Fail-Closed شده‌اند (`503` در نبود Verifier، `401` بدون Bearer، `403` برای ایمیل تاییدنشده یا جعل `authorUid`/`voterUid`) و با تست‌های `TS-A01..TS-A06`، `DR-A01..DR-A06` و `CC-A01..CC-A12` اثبات شده‌اند. |
| **RBAC / ABAC و قوانین داده** | `firestore.rules` (۷۴۴ خط، ۱۹ کالکشن شامل ۱۰ کالکشن اجتماعی `social*`): `default deny-all`، الزام `email_verified == true`، تفکیک `/bargains` و `/bargainOwners` با Batch اتمیک، محدودیت زمانی رأی ۲۴ساعته با `request.time`، ۴ ایمیل ادمین بوت‌استرپ + `/admins/{uid}`. | *[یافته تاریخی]*: کالکشن‌های شبکه اجتماعی جدید در `firestore.rules` و `firebase-blueprint.json` وجود ندارند. | **`VERIFIED_FIXED`**: هر ۱۰ کالکشن `social*` در `firestore.rules:644-741` و `firebase-blueprint.json:222-368, 407-446` تعریف و در `npm run test:rules:static` تایید شده‌اند. |
| **Rate Limiting و ضدسوءاستفاده** | `src/utils/serverDeliveryAndAbuseGuard.ts` (سطل‌های چندگانه، `checkAccountQuota`، `abusePenaltyMap`) + `server/modules/community/communityRateLimiter.ts` (محدودیت نرخ عملیات پست، کامنت، واکنش، دنبال‌کردن و گزارش). | *[یافته تاریخی]*: تمام وضعیت Rate Limit، `IdempotencyLedger` و مصرف رویداد نوتیفیکیشن در **RAM فرآیند** نگهداری می‌شوند و در اجرای چندنمونه‌ای همگام نیستند. | **`OPEN`** *(با تفکیک دقیق)*: محدودیت نرخ در `CommunityRateLimiter` (`Map` داخل حافظه) و `serverDeliveryAndAbuseGuard.ts` و نیز `crowdIdempotencyLedger` همچنان Process-Local هستند (`OPEN`). در مقابل، Idempotency نوشتن پست و کامنت در `CommunityUnifiedRepository` به کالکشن پایدار Firestore (`socialIdempotency`) منتقل شده است (`VERIFIED_EXISTING`). |
| **امنیت API، Mass Assignment و CORS** | `server/modules/core/authAndAuthz.ts` (`stripUntrustedIdentityFields`) + `src/utils/apiContractsAndSerializationEngine.ts` (Allowlist سخت‌گیرانه، دفع `__proto__`، عدم اجازه `*` همراه Credential در CORS، پاکت استاندارد پاسخ و خطا بدون Stack Trace). | *[یافته تاریخی]*: `communityRoutes.ts` و `commsRoutes.ts` فاقد میدل‌ویر `Idempotency-Key` هستند و خروجی‌های `search`، `dgov` و `analytics` از پاکت استاندارد تبعیت نمی‌کنند. | **`PARTIALLY_IMPLEMENTED`**: در `communityRoutes.ts` و `communityUnifiedRepository.ts` پشتیبانی کامل از هدر `Idempotency-Key` و کالکشن `socialIdempotency` (همراه پاسخ `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`) پیاده‌سازی شده است (`VERIFIED_FIXED`). یکسان‌سازی پاکت پاسخ در برخی مسیرهای جانبی (`commsRoutes` / `dgov`) همچنان `PARTIALLY_IMPLEMENTED` است. |
| **امنیت فایل و SSRF** | `server/modules/api-governance/ssrfGuard.ts` (مسدودسازی شبکه‌های داخلی/لوکال و پروتکل‌های غیرمجاز) + `server/modules/professional-verification/authoritiesAndStateMachine.ts` (Allowlist دامنه برای ۷ سامانه ایرانی با `hasAuthorizedAutomatedApi: false` و جداسازی وظایف `actor.uid !== ownerUid`). | *[یافته تاریخی]*: مسیر یکپارچه بررسی Magic Bytes، قرنطینه فایل و امضای URL کوتاه‌عمر هنوز میان `media` و `serverObjectStorage` یکسان‌سازی و به Storage ابری متصل نشده است. | **`PARTIALLY_IMPLEMENTED`**: بررسی Magic Bytes، محدودیت Range و احراز هویت آپلود در `src/utils/serverObjectStorage.ts` فعال و دارای تست است (`tests/object-storage-security.test.ts`، `tests/object-storage-upload-auth.test.ts`)، اما همگرایی کامل با ماژول `server/modules/media` در موج‌های بعدی قرار دارد. |

---

## ۲. گام دوم: خروجی گیت‌های راستی‌آزمایی و واقعیت معماری مخزن (`[Observed Fact]`)

### ۲.۱ نتایج اجرای دستورات کنترل کیفیت و قراردادها (همگام‌سازی‌شده در `RT-SOCIAL-IMPL-001`)
| دستور بررسی | وضعیت تاریخی (ممیزی اولیه) | وضعیت فعلی (`RT-SOCIAL-IMPL-001`) | برچسب وضعیت | جزئیات دقیق مشاهده‌شده در اجرای زنده |
| :--- | :---: | :---: | :---: | :--- |
| `npm run arch:check && npm run typecheck` | **PASS** | **PASS** | **`VERIFIED_EXISTING`** | `arch:check` تعداد **۶۸۴** فایل در `src/` و `server/modules/` را اسکن کرد (**۰ خطای مسدودکننده**، ۲۰۷ هشدار ۳۰۰–۴۹۹ خط، ۱۱۱ فایل میراثی قفل‌شده، `src/App.tsx`: `64/100` خط) و `tsc --noEmit` بدون خطا گذشت. |
| `npm run test:rules:static` | **PASS** | **PASS** | **`VERIFIED_EXISTING`** | ممیزی استاتیک قوانین Firestore: **۱۳/۱۳** و رگرسیون یکپارچگی داده: **۹/۹**. |
| `npm run test:contracts` | **FAIL** | **PASS** | **`VERIFIED_FIXED`** | انحراف تست `convertAreaFromSqm(sqm, 'sqft')` در `tests/engineering-quality-foundation.test.ts` برطرف شده و تمام قراردادهای پایه با موفقیت (`PASS`) اجرا می‌شوند. |
| `npm run cf:config:check` | **FAIL (Pre-build)** | **NOT_APPLICABLE (در این گام)** | **`NOT_APPLICABLE`** | مطابق محدودیت صریح `RT-SOCIAL-IMPL-001`، مهاجرت به Cloudflare D1/KV/Queues خارج از دامنه این مرحله است. |

### ۲.۲ وضعیت Guardrail معماری و ساختار ماژول‌ها
1. **پوشش کامل `scripts/check-architecture.ts:63-64` (`VERIFIED_FIXED`)**:
   - *[یافته تاریخی]*: در نسخه اولیه ممیزی گزارش شده بود که `scripts/check-architecture.ts` فقط ۲ پوشه در `server/modules/` را اسکن می‌کند و ۳ فایل از سقف ۵۰۰ خط عبور کرده‌اند (`notification-orchestration/service.ts` با ۱۵۴۷ خط، `backup-recovery/index.ts` با ۶۹۵ خط، و `platform-resilience/index.ts` با ۵۹۹ خط).
   - *[واقعیت فعلی کد]*: `scripts/check-architecture.ts` اکنون تمام `src/` و `server/modules/` را اسکن می‌کند. فایل `notification-orchestration/service.ts` به **۴۳۸ خط** و `platform-resilience/index.ts` به **۴۲۸ خط** کاهش یافته‌اند و `backup-recovery/index.ts` (**۶۹۵ خط**) در فهرست `trackedLegacyFiles` در `architecture-baseline.json` با سقف قفل‌شده (Ratchet) تحت نظارت خودکار است.
2. **مسیرهای سوارشده (Mounted) در برابر ماژول‌های کتابخانه‌ای در `server/modules/` (`PARTIALLY_IMPLEMENTED`)**:
   - در `server.ts:216` مسیرهای فعال اجتماعی و حاکمیتی زیر سوار (Mount) شده‌اند:
     - `registerCommunityRoutes` (`server/modules/community/communityRoutes.ts`)
     - `registerTrustSafetyV1Routes` (`server/modules/trust-safety/mountTrustSafetyRoutes.ts`)
     - `registerUnifiedPlatformWave1Routes` (`server/modules/platform-foundation/unifiedPlatformRoutes.ts`)
     - `registerKnowledgeRoutes` (`server/modules/knowledge/knowledgeRoutes.ts`)
     - `registerCommunicationsRoutes` (`server/modules/comms/commsRoutes.ts`)
     - `registerGlobalSearchGovernanceAndAnalyticsRoutes` (`server/modules/search/globalSearchAndGovernanceGateway.ts`)
     - `registerAccountAdminRoutes` (`server/modules/account-admin/accountAdminRoutes.ts`)
   - همچنین `registerCrowdClaimsRoutes` (`src/cells/knowledge-crowd/crowdClaimsRoutes.ts`) در `src/utils/serverUtilityRoutes.ts:13` سوار شده است.
   - روترهای کارخانه‌ای `createTrustSafetyRouter` (`server/modules/trust-safety/trustSafetyRoutes.ts`) و `createDisputeRouter` (`server/modules/dispute-resolution/disputeRoutes.ts`) به‌صورت ماژول‌های مستقل با تست‌های یکپارچه Express (`tests/trust-safety-module.test.ts` و `tests/dispute-resolution-module.test.ts`) نگهداری می‌شوند، در حالی که مسیر عملیاتی `/api/v1/trust-safety/*` در `server.ts` از طریق `mountTrustSafetyRoutes.ts` و `SocialModerationLifecycleService` متصل به Firestore سرویس‌دهی می‌شود.

### ۲.۳ واقعیت پایگاه‌داده و اجرای چندنمونه‌ای (Runtime Truth)
- **دیتابیس ابری فعال برای هسته اجتماعی فقط Firestore است (`VERIFIED_EXISTING`)**:
  - `server/modules/community/communityRoutes.ts` به `communityUnifiedRepository` (`server/modules/community/communityUnifiedRepository.ts`) و آداپتور `communityFirestoreAdapter.ts` متصل است.
  - در محیط تولید (`NODE_ENV === 'production'` یا `COMMUNITY_REQUIRE_FIRESTORE === 'true'` یا تنظیم `FIRESTORE_EMULATOR_HOST` / `GOOGLE_APPLICATION_CREDENTIALS`)، کلاس `FirestoreAdminCommunityStore` انتخاب می‌شود که در صورت عدم دسترسی به Firestore به‌صورت **Fail-Closed** خطای `503 COMMUNITY_DATABASE_UNAVAILABLE` برمی‌گرداند و هرگز به حافظه محلی یا فایل JSON عقب‌نشینی نمی‌کند.
- **مسیرهای ذخیره‌سازی قدیمی در `server/modules/community/` (`VERIFIED_FIXED` / `DEPRECATE`)**:
  - فایل `server/modules/community/communityRepository.ts` (شامل `FileBackedCommunityStorageAdapter` و `.cache/community-store-v2.json`) در هیچ نقطه‌ای از `src/`، `server/`، `tests/` یا `scripts/` ایمپورت نشده است (`0` مرجع فعال) و در وضعیت **`DEPRECATE`** قرار دارد.
  - فایل `server/modules/community/communityStore.ts` صرفاً یک پوسته ۱۶ خطی برای ریست تست (`resetCommunityServerStoreForTests`) روی `communityUnifiedRepository` است.
- **محدودیت‌های باقی‌مانده برای اجرای چندنمونه‌ای (`OPEN`)**:
  - محدودکننده نرخ `CommunityRateLimiter` (`server/modules/community/communityRateLimiter.ts`)، نگهبان عمومی `serverDeliveryAndAbuseGuard.ts`، دفتر کل `crowdIdempotencyLedger` در `crowdClaimsRoutes.ts`، و رشد اسناد تودرتو (`replies[]` و `reactionsByUser{}`) درون سند `socialPosts/{postId}` همچنان به عنوان شکاف‌های فنی باز (`OPEN`) برای مراحل بعدی توسعه ثبت شده‌اند (شرح کامل در `docs/architecture/RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md`).

---

## ۳. گام سوم (بخش الف): ماتریس همگرایی و شکاف (`Gap & Convergence Matrix` — به‌روزرسانی‌شده)

| خوشه دامنه (متناظر با مراحل ۱–۲۰) | موجودی فعلی مخزن (`[Observed Fact]`) | مالک قطعی (`Canonical Owner`) | وضعیت بازنگری `RT-SOCIAL-IMPL-001` | حکم و اقدام لازم (`Disposition`) |
| :--- | :--- | :--- | :---: | :--- |
| **۱. هسته Auth، قرارداد API و امنیت لبه**<br>*(مراحل ۱، ۸، ۱۱، ۱۲، ۱۴)* | `server/modules/core/authAndAuthz.ts`، `src/utils/serverAdminAndTelegramSecurity.ts`، `src/utils/serverDeliveryAndAbuseGuard.ts`، `src/utils/apiContractsAndSerializationEngine.ts`، `src/utils/expressRouteCatalog.ts` | `server/modules/core` + `src/utils/serverDeliveryAndAbuseGuard.ts` | **`PARTIALLY_IMPLEMENTED`** | **`KEEP & EXTEND`**: احراز هویت Fail-Closed برقرار است (`VERIFIED_EXISTING`)؛ انتقال شمارنده‌های Rate-Limit از حافظه فرآیند به Backend مشترک در حالت چندنمونه‌ای همچنان **`OPEN`** است. |
| **۲. شبکه اجتماعی، فید، کامنت، دنبال‌کردن و داده جمعی**<br>*(مراحل ۱–۶، ۹، ۱۰)* | `communityRoutes.ts` + `communityUnifiedRepository.ts` + `communityFirestoreAdapter.ts` (متصل به ۱۰ کالکشن Firestore با Idempotency تراکنشی)، `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` (با تایید توکن Bearer و دفع جعل UID) | `server/modules/community/communityUnifiedRepository.ts` + `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` | **`VERIFIED_FIXED`** *(ایرادات امنیتی و Firestore)* / **`OPEN`** *(رشد سند تودرتو و Rate Limit محلی)* | **`KEEP & VERIFY`**: حفظ `CommunityUnifiedRepository` و `communityFirestoreAdapter`؛ منسوخ‌سازی (`DEPRECATE`) فایل بدون استفاده `communityRepository.ts`؛ طراحی جداسازی آرایه‌های تودرتوی `socialPosts` در مراحل آتی. |
| **۳. اعتماد، تعدیل محتوا، اختلاف، تقلب و احراز هویت حرفه‌ای**<br>*(مراحل ۵، ۱۵، ۱۶، ۱۷، ۱۸)* | `trust-safety` (`mountTrustSafetyRoutes.ts` سوار در `server.ts` روی Firestore + `trustSafetyRoutes.ts` بدون اعتماد به `x-test-*`)، `dispute-resolution` (`disputeRoutes.ts` بدون اعتماد به `x-test-*`)، `professional-verification` | `server/modules/trust-safety` + `server/modules/dispute-resolution` + `server/modules/professional-verification` | **`VERIFIED_FIXED`** | **`KEEP & VERIFY`**: آسیب‌پذیری اعتماد به هدرهای `x-test-*` در هر دو ماژول رفع و با تست‌های `TS-A01..TS-A06` و `DR-A01..DR-A06` قفل شده است. |
| **۴. اعلان‌ها و ارتباطات کاربری**<br>*(مراحل ۷، ۱۰، ۱۹)* | `notifications` (`notificationRoutes.ts`، `durableNotificationStore.ts`)، `notification-orchestration` (`service.ts` شکسته شده به ۴۳۸ خط)، `comms` (`commsRoutes.ts` سوارشده) | `server/modules/notifications` + `server/modules/notification-orchestration` + `server/modules/comms` | **`VERIFIED_FIXED`** *(سقف خطوط و تست‌ها)* / **`PARTIALLY_IMPLEMENTED`** *(همگرایی Routeها)* | **`KEEP & CONSOLIDATE`**: تست‌های `notifications-module.test.ts` (۸/۸) و `notification-orchestration-module.test.ts` با موفقیت اجرا می‌شوند. |
| **۵. جست‌وجو، کشف و حاکمیت داده**<br>*(مراحل ۴، ۷، ۸، ۱۹، ۲۰)* | `search/globalSearchAndGovernanceGateway.ts` (سوارشده) + `platform-foundation/unifiedPlatformRoutes.ts` (`/api/v1/social/search*`, `/api/v1/social/feed/*`, `/api/v1/governance/*`) | `server/modules/search` + `server/modules/platform-foundation` | **`PARTIALLY_IMPLEMENTED`** | **`CONSOLIDATE + EXTEND`**: مسیرهای پایه جست‌وجوی اجتماعی و حاکمیت در `server.ts` سوار شده‌اند؛ حذف فایل‌های Route موازی غیرسوارشده در مراحل پاک‌سازی آتی. |
| **۶. حساب کاربری، چرخه حیات، سازمان و پرداخت**<br>*(مراحل ۳، ۱۰، ۱۵، ۱۶، ۱۸)* | `account-admin` (سوارشده)، `account-lifecycle`، `enterprise-tenancy`، `payments` | `account-admin` + `account-lifecycle` | **`VERIFIED_EXISTING`** | **`DEFER / BOUNDED MVP`**: حفظ دامنه فعلی و پرهیز از افزودن پیچیدگی سازمانی پیش از تکمیل هسته اجتماعی. |
| **۷. رسانه، فایل، تحلیل، تله‌متری و تاب‌آوری**<br>*(مراحل ۱۲، ۱۳، ۱۹، ۲۰)* | `media` + `src/utils/serverObjectStorage.ts`، `api-governance/ssrfGuard.ts`، `analytics-research`، `telemetry`، `backup-recovery` (۶۹۵ خط قفل‌شده در Ratchet)، `platform-resilience` (۴۲۸ خط) | `src/utils/serverObjectStorage.ts` + `analytics-research` + `telemetry` + `platform-resilience` | **`VERIFIED_EXISTING`** | **`KEEP & EXTEND`**: رعایت کامل سقف خطوط معماری (`arch:check` بدون خطا) و حفظ امنیت Object Storage. |
| **۸. قابلیت انتقال به لبه Cloudflare (`Worker / D1 / R2`)**<br>*(پیوست معماری Cloudflare و مراحل ۱۱–۱۴)* | `wrangler.jsonc` (Placeholder IDs)، `worker/migrationRegister.ts` | `worker/migrationRegister.ts` + `src/utils/serverRuntimeEnvStore.ts` | **`NOT_APPLICABLE`** *(در `RT-SOCIAL-IMPL-001`)* | **`DEFER BINDINGS`**: نگهداشتن استقرار فعلی روی Node/Express + Firestore مطابق محدودیت صریح دامنه. |

---

## ۴. گام سوم (بخش ب): وضعیت ۵ تصمیم قفل‌شده (`Decision Freeze Status`) در پایان `RT-SOCIAL-IMPL-001`

1. **قفل امنیتی `[P0]` (`Zero Spoofed Identity`) — وضعیت: `VERIFIED_FIXED`**:
   - عدم اعتماد به هدرهای `x-test-uid`، `x-user-id`، `x-test-role` در `trustSafetyRoutes.ts` و `disputeRoutes.ts` و عدم اعتماد به `body.authorUid` / `body.voterUid` در `crowdClaimsRoutes.ts` در کد فعلی برقرار است و با آزمون‌های خودکار تایید شد.
2. **تک‌منبع حقیقت ذخیره‌سازی (`Firestore First`) — وضعیت: `VERIFIED_FIXED`**:
   - هسته اجتماعی در `communityUnifiedRepository.ts` و `communityFirestoreAdapter.ts` روی ۱۰ کالکشن Firestore کار می‌کند، در تولید به‌صورت Fail-Closed (`503 COMMUNITY_DATABASE_UNAVAILABLE`) عمل می‌کند، و تمامی ۱۰ کالکشن در `firestore.rules` و `firebase-blueprint.json` ثبت و با `npm run test:rules:static` تایید شده‌اند.
3. **قرارداد واحد API و بستن نقطه کور `arch:check` — وضعیت: `VERIFIED_FIXED`**:
   - اسکریپت `scripts/check-architecture.ts` کل `src/` و `server/modules/` را اسکن می‌کند (`0 errors`) و تست قرارداد `npm run test:contracts` نیز با موفقیت (`PASS`) اجرا می‌شود.
4. **انجماد تکثیر ماژول‌ها (`1 Canonical Owner per Cluster`) — وضعیت: `VERIFIED_EXISTING`**:
   - مالک رسمی منطق جامعه `CommunityUnifiedRepository` است و فایل قدیمی `communityRepository.ts` بدون هیچ ایمپورتی در وضعیت `DEPRECATE` قرار گرفته است.
5. **شکاف‌های باز برای مراحل بعدی (`Next-Stage Open Gaps`) — وضعیت: `OPEN`**:
   - انتقال محدودکننده نرخ (`CommunityRateLimiter` و `serverDeliveryAndAbuseGuard`) از حافظه فرآیند به ذخیره‌ساز مشترک، یکسان‌سازی دفتر کل Idempotency در `crowdClaimsRoutes.ts` با مدل پایدار Firestore، و بازطراحی ذخیره‌سازی تودرتوی `replies[]` و `reactionsByUser{}` درون اسناد `socialPosts` سه محور فنی باز برای مراحل بعدی توسعه هستند.

---

## ۵. نقشه مشخصات تدوین‌شده مراحل ۱۲ تا ۲۱ (`RT-SOCIAL-IMPL-012` تا `RT-SOCIAL-IMPL-021`)

برای بستن شکاف‌های یکپارچگی داده، حذف ذخیره‌سازهای حافظه‌ای/فایلی، تفکیک مرز معرفتی داده‌های جمعی و اتصال تراکنشی رویدادها به مرکز اعلان، مشخصات ۱۰ مرحله بعدی در [`docs/architecture/RT-SOCIAL-STAGES-12-TO-17.md`](./RT-SOCIAL-STAGES-12-TO-17.md) تدوین و با وضعیت واقعی **`designed` («تدوین و ثبت شد — اجرا و تأیید: انجام نشده»)** ثبت گردید:

1. **مرحله ۱۲ (`RT-SOCIAL-IMPL-012-QA-ANSWER-CANONICAL-INTEGRITY`)**: تثبیت `socialComments/{answerId}` به عنوان رکورد مرجع پاسخ، همگام‌سازی اتمیک Projection در `socialPosts/{questionId}.answers`، عملیات صریح و Idempotent انتخاب/لغو پاسخ برتر (`selected: boolean`) و ترمیم Seedها (`QAINT-001..028`).
2. **مرحله ۱۳ (`RT-SOCIAL-IMPL-013-CROWD-DATA-FIRESTORE-TRANSACTIONAL-STORE`)**: حذف کش `Map` حافظه و فایل محلی از مسیر تولید `server/modules/crowd-data/persistenceAdapter.ts` و پیاده‌سازی `FirestoreTransactionalCrowdDataStore` با تراکنش واقعی و رفتار Fail-Closed `503` (`CDP-001..022`).
3. **مرحله ۱۴ (`RT-SOCIAL-IMPL-014-CROWD-CLAIMS-LEGACY-MIGRATION-PREFLIGHT`)**: جداسازی منطق خالص در `crowdSignalHeuristics.ts` و ساخت موتور نگاشت و اسکریپت ممیزی فقط-خواندنی (`preflight-crowd-claims-migration.ts`) بدون تبدیل خودکار `VERIFIED_REFERENCE` به `ACCEPTED` (`CCMP-001..022`).
4. **مرحله ۱۵ (`RT-SOCIAL-IMPL-015-CROWD-CONSENSUS-CONTRIBUTOR-DOMAIN`)**: پیاده‌سازی رأی‌گیری وزن‌دار تراکنشی در زیرمجموعه `crowd_claims_v2/{claimId}/votes/{voterUid}`، تفکیک `communityFeedback` از `state`، و مدیریت پروفایل مشارکت‌کنندگان در `crowd_contributor_profiles_v2/{uid}` (`CCV-001..030`؛ وابسته به مراحل ۱۳ و ۱۴).
5. **مرحله ۱۶ (`RT-SOCIAL-IMPL-016-CROWD-CLAIMS-CUTOVER-AND-MIGRATION`)**: انتقال کنترل‌شده ۴ مسیر فعال `/api/v1/claims*` و `/api/v1/contributors/:uid` به Crowd Data v2، انتقال Idempotency به `/crowd_idempotency_v2`، حذف اختلاط `'VERIFIED_CLAIM'` از `socioeconomicRollupEngine.ts` و حذف `SEED_CLAIMS` از Production UI (`CCUT-001..032`؛ **مشروط به تکمیل مراحل ۱۳ تا ۱۵**).
6. **مرحله ۱۷ (`RT-SOCIAL-IMPL-017-SCOPED-MESSAGING-DURABLE-CORE`)**: انتقال پیام‌رسانی از `comms-state.json` (با سقف حذفی ۵۰۰ گفت‌وگو) و `localStorage` (`radar_comms_workspace_v1`) به کالکشن‌های Firestore (`scoped_conversations_v2` و زیرمجموعه `messages`) همراه با `ConversationContextResolver` سمت سرور برای احراز مالکیت واقعی طرفین (`MSGCORE-001..030`؛ مستقل از مراحل ۱۳ تا ۱۶).
7. **مرحله ۱۸ (`RT-SOCIAL-IMPL-018-NOTIFICATION-ORCHESTRATION-DURABLE-CORE`)**: تثبیت `server/modules/notification-orchestration/` به عنوان مالک واحد دامنه اعلان‌ها روی ۸ کالکشن Firestore (`no_*`)، پیاده‌سازی `createFirestoreNotificationTxRunner` با بافر Writeهای Staged برای تضمین Read-before-Write، حذف سقف ۵۰۰ اعلان با `NotificationReadRepository`، غیرفعال‌سازی پیش‌فرض رضایت تبلیغاتی (`promotionalOptInGranted: false`) و کانال‌های بیرونی، انتقال محدودیت نرخ اعلان اضطراری به `no_rate_limits/urgent_{uid}`، مکانیزم Lease برای تلاش‌های تحویل و منع Sandbox Provider در Production (`NOTIFCORE-001..030`).
8. **مرحله ۱۹ (`RT-SOCIAL-IMPL-019-NOTIFICATION-LEGACY-MIGRATION-API-UI-CUTOVER`)**: مهاجرت سروری تاریخچه اعلان‌ها از `comms-state.json` (با Preflight، نگاشت صریح ۱۸ کد رویداد، حفظ وضعیت‌های `DISMISSED` و `EXPIRED` و منع مهاجرت خودکار `radar_comms_workspace_v1`)، جایگزینی ۹ مسیر `/api/v1/notifications*` با سرویس مرجع و اتصال `HeaderNotificationBell`، `AccountNotificationsPanel`، `AccountCommsPreferencesPanel` و `AdminCommunicationsPanel` به `notificationApiClient.ts` (`NOTIFCUT-001..036`؛ **مشروط به تکمیل مرحله ۱۸**).
9. **مرحله ۲۰ (`RT-SOCIAL-IMPL-020-DOMAIN-EVENT-OUTBOX-PRODUCERS`)**: ایجاد زیرساخت مشترک `Transactional Domain Event Outbox` (`no_domain_event_outbox` + `domainEventCatalog.ts`) و اتصال ۴ تولیدکننده موج اول (`Property Management`، `Customer Support`، `Marketplace Billing` و `Customer Experience`) به Outbox تراکنشی (**وابسته به مرحله ۱۸**).
10. **مرحله ۲۱ (`RT-SOCIAL-IMPL-021-PROPERTY-VIEWINGS-TRANSACTIONAL-OUTBOX`)**: بازسازی `PropertyViewingsStore` بر پایه `PropertyViewingsUnitOfWork` و تراکنش واقعی Firestore، ایجاد قفل رزرو روز/منبع (`property_viewings_booking_locks/{lockId}`)، حذف `ViewingsNotificationsAdapter` ساختگی و اتصال اتمیک ۵ رویداد چرخه بازدید ملک به `NotificationOutboxEnqueuer` (`VIEWOUT-001..026` + ۳۲ تست رگرسیون؛ **مشروط به تکمیل مراحل ۱۸ و ۲۰**).



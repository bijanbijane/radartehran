# خط مبنای اجرایی شبکه اجتماعی رادار تهران (`RT-SOCIAL-IMPLEMENTATION-BASELINE-001`)

- **شناسه مرحله**: `RT-SOCIAL-IMPL-001`
- **عنوان**: تثبیت خط مبنای واقعی، رفع مغایرت ممیزی با کد و بستن شکاف‌های امنیتی و معماری پیش از توسعه هسته اجتماعی
- **نوع مرحله**: `Repository Audit + Targeted Verification + Documentation Reconciliation`
- **اولویت**: `P0 / P1`
- **تاریخ ثبت و راستی‌آزمایی**: `2026-11-18`
- **وضعیت مخزن و Sandbox (`[Observed Fact]`)**:
  - محیط اجرا: `UNINITIALIZED_GIT_SANDBOX_FILESYSTEM_VERIFIED` (`git rev-parse HEAD` فاقد پوشه `.git` در کانتینر؛ وضعیت فایل‌سیستم قفل‌شده در `docs/engineering/RMEP-001/EXECUTION-STATE.json` با کامیت‌های مرجع تأییدشده `f8b066f76c9053ce9b3c53fb136b9ec34fc57f7a` و `5e577f861de711ffcd77cd455ea79d41d553e0b`).
  - پروژه Firebase: `gen-lang-client-0713157837`
  - پایگاه‌داده Firestore: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`

---

## ۱. معماری واقعی و مسیر اجرای Runtime (`[Observed Fact]`)

### ۱.۱ زنجیره اجرایی اصلی هسته اجتماعی (Canonical Runtime Path)
در کد فعلی مخزن، مسیر اجرای درخواست‌های شبکه اجتماعی از نقطه ورود سرور تا لایه ذخیره‌سازی به‌صورت زیر است:

1. **نقطه ورود سرور (`server.ts:216`)**:
   - سرور Express در `server.ts` روترهای اجتماعی، اعتماد و ایمنی، پلتفرم یکپارچه، دانش محله و مدیریت حساب را سوار (Mount) می‌کند:
     - `registerCommunityRoutes(app, { checkRateLimit, getClientIp })`
     - `registerTrustSafetyV1Routes(app, { checkRateLimit, getClientIp })`
     - `registerUnifiedPlatformWave1Routes(app, { checkRateLimit, getClientIp })`
     - `registerKnowledgeRoutes(app, { checkRateLimit, getClientIp })`
     - `registerCommunicationsRoutes(app, { checkRateLimit, getClientIp })`
     - `registerGlobalSearchGovernanceAndAnalyticsRoutes(app, { checkRateLimit, getClientIp })`
     - `registerAccountAdminRoutes(app, { getIp: getClientIp })`
   - علاوه بر این، `registerUtilityRoutes(app, { checkRateLimit, getClientIp })` در `src/utils/serverUtilityRoutes.ts:13` مسیرهای ادعاهای جمعی محله (`registerCrowdClaimsRoutes`) را سوار می‌کند.

2. **لایه HTTP شبکه اجتماعی (`server/modules/community/communityRoutes.ts`)**:
   - در خط ۲۳، نمونه پیش‌فرض `communityUnifiedRepository` را به عنوان **تنها مالک منطق دامنه جامعه (Single Canonical Owner)** دریافت می‌کند.
   - احراز هویت کاربران از طریق `requireUser(req, res)` (مبتنی بر `verifyAuthenticatedUserHeader` در `src/utils/serverAdminAndTelegramSecurity.ts` و بررسی توکن Firebase ID Token) و احراز هویت مدیران از طریق `requireAdmin(req, res)` (`verifyAdminApiAuthorization`) انجام می‌شود.
   - خطاهای دامنه از طریق `handleCommunityRouteError` مدیریت می‌شوند:
     - `CommunityDatabaseUnavailableError` -> پاسخ `503 COMMUNITY_DATABASE_UNAVAILABLE` با `retryable: true`.
     - `CommunityHttpError` -> کد وضعیت متناظر (`400`، `401`، `403`، `404`، `409`، `429`) همراه هدر `Retry-After` در صورت نیاز.

3. **لایه مخزن یکپارچه (`server/modules/community/communityUnifiedRepository.ts`)**:
   - تمام عملیات ایجاد و ویرایش بحث (`discussion`)، پرسش و پاسخ (`question` / `answer`)، گزارش اصلاح داده (`correction`)، نظر (`comment`)، واکنش اتمیک (`toggleReactionTransactional`)، دنبال‌کردن اتمیک (`toggleFollowTransactional`)، گزارش تخلف (`submitReport`)، پروفایل اجتماعی (`getOrCreateSocialProfile` / `updateProfilePrivacy`) و خروجی/حذف داده کاربر (`exportUserCommunityBundle` / `deleteOrAnonymizeUserCommunityData`) در این کلاس متمرکز هستند.
   - عملیات نوشتن پست و کامنت از کلید یکتای `Idempotency-Key` پشتیبانی می‌کنند (`hashCommunityIdempotencyKey`) و رکوردهای آن در کالکشن `socialIdempotency` درون تراکنش (`store.runTransaction`) ذخیره و بررسی می‌شوند.

4. **لایه آداپتور Firestore (`server/modules/community/communityFirestoreAdapter.ts`)**:
   - تابع `shouldUseRealFirestoreByDefault(env)` (خطوط ۳۸۴–۳۹۰) در هر یک از شرایط زیر، کلاس `FirestoreAdminCommunityStore` (`backendKind = 'firestore'`) را فعال می‌کند:
     - `NODE_ENV === 'production'`
     - `COMMUNITY_REQUIRE_FIRESTORE === 'true'`
     - وجود `FIRESTORE_EMULATOR_HOST`
     - وجود `GOOGLE_APPLICATION_CREDENTIALS`
   - رفتار `FirestoreAdminCommunityStore` کاملاً **Fail-Closed** است: در صورت نبود اتصال معتبر یا بروز خطا در Firestore، خطای `CommunityDatabaseUnavailableError` (`503 COMMUNITY_DATABASE_UNAVAILABLE`) پرتاب می‌شود و **هیچ عقب‌نشینی پنهانی (Silent Fallback) به حافظه موقت یا فایل JSON محلی رخ نمی‌دهد**.
   - کلاس `MockFirestoreCommunityStore` (`backendKind = 'mock_firestore'`) صرفاً برای محیط توسعه/تست محلی بدون Emulator طراحی شده و از تراکنش، صفحه‌بندی Cursor-based (با سقف `clampCommunityLimit` روی حداکثر `50` رکورد) و شبیه‌سازی قطعی پایگاه‌داده (`setSimulatedUnavailable(true)`) پشتیبانی می‌کند.

---

## ۲. مالکیت ماژول‌ها و فهرست مسیرهای API سوارشده در برابر غیرسوارشده (`[Observed Fact]`)

### ۲.۱ مسیرهای سوارشده و فعال در Runtime (`Mounted Routes`)

| خانواده مسیر (Route Prefix) | فایل ثبت‌کننده در Runtime | ماژول / سرویس مالک | وضعیت احراز هویت و امنیت | وضعیت در مخزن |
| :--- | :--- | :--- | :--- | :---: |
| `/api/community/*` و `/api/v1/community/*`<br>`/api/account/community*`<br>`/api/admin/community/*` | `server.ts:216` -> `server/modules/community/communityRoutes.ts` | `CommunityUnifiedRepository` + `communityFirestoreAdapter.ts` | خواندن عمومی با حذف PII (`stripPublicAuthorPii`)؛ نوشتن نیازمند Bearer Token معتبر؛ مدیریت نیازمند Admin Auth؛ Fail-Closed `503` در قطعی DB | **`VERIFIED_EXISTING`** |
| `/api/v1/trust-safety/reports*`<br>`/api/v1/trust-safety/moderation/*` | `server.ts:216` -> `server/modules/trust-safety/mountTrustSafetyRoutes.ts` | `SocialModerationLifecycleService` روی کالکشن‌های `socialReports`، `socialModerationCases` و `socialModerationEvents` | ثبت و مشاهده گزارش شخصی با Bearer Token؛ صف بررسی و اعمال تصمیم (`Moderation`) نیازمند Admin Auth | **`VERIFIED_EXISTING`** |
| `/api/v1/social/outbox/*`<br>`/api/v1/social/search*`<br>`/api/v1/social/feed/*`<br>`/api/v1/governance/*` | `server.ts:216` -> `server/modules/platform-foundation/unifiedPlatformRoutes.ts` | `SocialOutboxPublisher`، `SocialSearchIndexingService`، `SocialFeedDiscoveryEngine`، `SocialGovernanceComplianceService` | مسیرهای ادمین (`outbox/dispatch`، `search/backfill`، `governance/retention`) نیازمند Admin Auth؛ خروجی و حذف داده شخصی نیازمند User Bearer Token | **`VERIFIED_EXISTING`** |
| `/api/v1/claims`<br>`/api/v1/claims/:claimId/vote`<br>`/api/v1/claims/hood/:hoodId`<br>`/api/v1/contributors/:uid` | `src/utils/serverUtilityRoutes.ts:13` -> `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` | `crowdClaimsEngine.ts` | خواندن محله و پروفایل مشارکت‌کننده عمومی؛ ثبت ادعا و رأی نیازمند Bearer Token با ایمیل تاییدشده، Fail-Closed `503` در نبود Verifier و رد جعل شناسه با `403 UID_SPOOFING_FORBIDDEN` | **`VERIFIED_FIXED`** |
| `/api/knowledge/*`<br>`/api/account/knowledge/*`<br>`/api/admin/knowledge/*` | `server.ts:216` -> `server/modules/knowledge/knowledgeRoutes.ts` | `knowledgeRepository` | خواندن عمومی؛ ثبت یادداشت/تجربه با User Auth و سقف سهمیه روزانه؛ تعدیل با Admin Auth | **`VERIFIED_EXISTING`** |
| `/api/comms/*` و `/api/admin/comms/*` | `server.ts:216` -> `server/modules/comms/commsRoutes.ts` | `commsRepository` | صندوق پیام کاربر با User Auth؛ مدیریت قالب و پخش اعلان با Admin Auth | **`VERIFIED_EXISTING`** |
| `/api/search*`، `/api/dgov/*`، `/api/analytics/*` | `server.ts:216` -> `server/modules/search/globalSearchAndGovernanceGateway.ts` | `globalSearchAndGovernanceGateway` | جست‌وجوی عمومی؛ مسیرهای حاکمیت داده و تحلیل تحت کنترل دسترسی متناظر | **`VERIFIED_EXISTING`** |
| `/api/account/*` و `/api/admin/accounts/*` | `server.ts:216` -> `server/modules/account-admin/accountAdminRoutes.ts` | `accountAdminRoutes` | مدیریت پروفایل و نشست با User/Admin Auth | **`VERIFIED_EXISTING`** |

### ۲.۲ روترهای ماژولار مستقل (تست‌شده به‌صورت مستقیم، غیرسوارشده در `server.ts`)

| فایل روتر | کارخانه روتر (Router Factory) | نحوه استفاده و تست فعلی | وضعیت احراز هویت |
| :--- | :--- | :--- | :--- |
| `server/modules/trust-safety/trustSafetyRoutes.ts` | `createTrustSafetyRouter(engine, tokenVerifier, options)` | تست مستقیم در `tests/trust-safety-module.test.ts` (`TS-A01..TS-A06`) روی `TrustSafetyEngine` | **Fail-Closed (`VERIFIED_FIXED`)**: در نبود `tokenVerifier` کد `503 AUTH_PROVIDER_UNAVAILABLE` برمی‌گرداند؛ هدرهای `x-test-*` را نادیده می‌گیرد؛ نقش ناظر را با `authorizePrincipal` (`minimumRole: 'delegated_admin'`) بررسی می‌کند. |
| `server/modules/dispute-resolution/disputeRoutes.ts` | `createDisputeRouter(engine, store, tokenVerifier, options)` | تست مستقیم در `tests/dispute-resolution-module.test.ts` (`DR-A01..DR-A06`) روی `DisputeResolutionEngine` | **Fail-Closed (`VERIFIED_FIXED`)**: در نبود `tokenVerifier` کد `503 AUTH_PROVIDER_UNAVAILABLE` برمی‌گرداند؛ هدرهای `x-test-*` را نادیده می‌گیرد؛ دسترسی به پرونده و Timeline را به طرفین پرونده یا ناظر مجاز محدود می‌کند (`403` در برابر IDOR). |

### ۲.۳ بررسی مسیرهای ذخیره‌سازی قدیمی در `server/modules/community/`

1. **`server/modules/community/communityRepository.ts` (`251` خط)**:
   - شامل `FileBackedCommunityStorageAdapter` (ذخیره‌سازی در `.cache/community-store-v2.json`) و `InMemoryCommunityStorageAdapter`.
   - **نتیجه جست‌وجوی وابستگی در کل مخزن (`grep -rn "communityRepository" src server tests scripts`)**: **صفر ایمپورت (`0 references`)**. هیچ فایلی در Runtime یا تست‌ها از این ماژول استفاده نمی‌کند.
   - **تصمیم**: **`DEPRECATE`** (مطابق محدودیت صریح `RT-SOCIAL-IMPL-001` حذف فیزیکی انجام نشد، اما در این خط مبنا رسماً منسوخ اعلام می‌شود و هرگونه ایمپورت مجدد آن ممنوع است).
2. **`server/modules/community/communityStore.ts` (`16` خط)**:
   - هیچ ذخیره‌ساز مستقلی ندارد؛ صرفاً `communityUnifiedRepository` را بازصادر (Re-export) می‌کند و تابع کمکی `resetCommunityServerStoreForTests()` را برای ریست کردن Store در تست `src/features/community/tests/communityTrust.test.ts:127` فراهم می‌سازد.

---

## ۳. ماتریس قرارداد داده ۱۰ کالکشن اجتماعی (`Adapter` ↔ `firestore.rules` ↔ `firebase-blueprint.json`)

تمامی ۱۰ کالکشن تعریف‌شده در `SOCIAL_COLLECTIONS` (`server/modules/community/communityFirestoreAdapter.ts:4-15`) به‌طور کامل با `firestore.rules:644-741` و `firebase-blueprint.json:222-368, 407-446` هم‌تراز هستند (`VERIFIED_FIXED`):

| # | کلید در `SOCIAL_COLLECTIONS` | نام کالکشن Firestore | موجودیت در `firebase-blueprint.json` | سیاست خواندن عمومی (`Public Read`) در `firestore.rules` | سیاست خواندن خصوصی (`Private / Owner / Admin Read`) | سیاست نوشتن (`Write Policy`) در `firestore.rules` | محافظت از PII و حریم خصوصی |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **۱** | `posts` | `/socialPosts/{postId}` | `SocialPost` (`خطوط ۲۲۲–۲۵۱`) | مجاز فقط وقتی `visibility == 'public'` و `moderationStatus in ['visible', 'approved', 'resolved']` (`خط ۶۴۷`) | نویسنده (`ownerUserId == request.auth.uid`) یا ادمین (`isAdmin()`) (`خط ۶۴۹`) | ایجاد توسط کاربر احرازهویت‌شده مالک (`ownerUserId == request.auth.uid`) بدون فیلدهای حساس یا توسط ادمین؛ ویرایش توسط مالک بدون تغییر `ownerUserId`/`createdAtIso`؛ حذف فقط ادمین (`خطوط ۶۵۱–۶۶۶`) | تابع `stripPublicAuthorPii` در سرور و منع فیلدهای `'ownerEmail'`, `'authorEmail'`, `'phone'`, `'mobile'` در `firestore.rules:655` |
| **۲** | `comments` | `/socialComments/{commentId}` | `SocialComment` (`خطوط ۲۵۳–۲۷۰`) | مجاز فقط وقتی `moderationStatus == 'visible'` (`خط ۶۷۱`) | نویسنده (`authorUserId == request.auth.uid`) یا ادمین (`خط ۶۷۲`) | ایجاد توسط کاربر احرازهویت‌شده (`authorUserId == request.auth.uid`) بدون ایمیل/تلفن؛ ویرایش توسط نویسنده بدون تغییر `authorUserId`/`postId`؛ حذف فقط ادمین (`خطوط ۶۷۴–۶۸۷`) | حذف PII در سرور + منع `'authorEmail'`, `'phone'`, `'mobile'` در `firestore.rules:678` |
| **۳** | `reactions` | `/socialReactions/{reactionId}` | `SocialReaction` (`خطوط ۲۷۲–۲۸۵`) | مجاز (`allow read: if true;`) برای شمارش و نمایش واکنش‌ها (`خط ۶۹۲`) | همگانی (شامل شناسه کاربر، نوع هدف و نوع واکنش بدون PII) | ایجاد/به‌روزرسانی فقط توسط همان کاربر (`userId == request.auth.uid`) برای انواع مجاز (`helpful`, `agree`, `insightful`, `accurate`)؛ حذف توسط مالک یا ادمین (`خطوط ۶۹۳–۶۹۹`) | فاقد ایمیل یا شماره تماس |
| **۴** | `follows` | `/socialFollows/{followId}` | `SocialFollow` (`خطوط ۲۸۷–۳۰۰`) | غیرمجاز برای عموم (`deny`) | فقط دنبال‌کننده (`followerUserId == request.auth.uid`)، کاربر هدف (`targetType == 'user' && targetId == request.auth.uid`) یا ادمین (`خط ۷۰۴`) | ایجاد/حذف فقط توسط خود دنبال‌کننده (`followerUserId == request.auth.uid`)؛ ویرایش (`update`) کاملاً مسدود (`خطوط ۷۰۶–۷۱۲`) | گراف دنبال‌کردن برای کاربران ثالث خصوصی است |
| **۵** | `reports` | `/socialReports/{reportId}` | `SocialReport` (`خطوط ۳۰۲–۳۱۹`) | غیرمجاز برای عموم (`deny`) | فقط گزارش‌دهنده (`reporterUserId == request.auth.uid`) یا ادمین (`خط ۷۱۷`) | ایجاد توسط گزارش‌دهنده احرازهویت‌شده با `status == 'open'`؛ ویرایش و حذف فقط توسط ادمین (`خطوط ۷۱۸–۷۲۳`) | هویت گزارش‌دهنده از دید کاربر گزارش‌شده و عموم پنهان است |
| **۶** | `moderationCases` | `/socialModerationCases/{caseId}` | `SocialModerationCase` (`خطوط ۳۲۱–۳۳۱`) | غیرمجاز (`deny`) | فقط ادمین (`allow read, write: if isAdmin();`) (`خط ۷۲۷`) | فقط ادمین یا Firebase Admin SDK در سرور | یادداشت‌ها و پرونده‌های تعدیل کاملاً محرمانه و مخصوص ناظران است |
| **۷** | `moderationEvents` | `/socialModerationEvents/{eventId}` | `SocialModerationEvent` (`خطوط ۳۳۳–۳۴۲`) | غیرمجاز (`deny`) | فقط ادمین (`allow read, write: if isAdmin();`) (`خط ۷۳۰`) | فقط ادمین یا Firebase Admin SDK در سرور | لاگ ممیزی تصمیمات تعدیل فقط برای ناظران قابل مشاهده است |
| **۸** | `outbox` | `/socialOutbox/{eventId}` | `SocialOutboxEvent` (`خطوط ۳۴۴–۳۵۲`) | غیرمجاز (`deny`) | فقط ادمین (`allow read, write: if isAdmin();`) (`خط ۷۳۳`) | فقط سرور (Admin SDK) و ادمین | رویدادهای داخلی انتشار به کلاینت‌ها نشت نمی‌کنند |
| **۹** | `profiles` | `/socialProfiles/{userId}` | `SocialProfile` (`خطوط ۳۵۴–۳۶۳`) | مجاز فقط وقتی `visibility == 'public'` (`خط ۷۳۶`) | صاحب پروفایل (`userId == request.auth.uid`) یا ادمین (`خط ۷۳۶`) | ایجاد/ویرایش توسط صاحب پروفایل بدون فیلدهای `'email'`, `'phone'`, `'mobile'`؛ حذف فقط ادمین (`خطوط ۷۳۷–۷۳۸`) | در حالت `private`، متد `getPublicProfileByUsername` مقدار `null` برمی‌گرداند (`CF-19`) |
| **۱۰** | `idempotency` | `/socialIdempotency/{keyHash}` | `SocialIdempotency` (`خطوط ۳۶۵–۳۶۸`) | غیرمجاز (`deny`) | فقط ادمین (`allow read, write: if isAdmin();`) (`خط ۷۴۱`) | فقط سرور (Admin SDK درون تراکنش `runTransaction`) | کلیدها با SHA-256 هش می‌شوند (`hashCommunityIdempotencyKey`) |

---

## ۴. پوشش ۱۲ سناریوی آزمون امنیتی الزامی (`Section 6 Security Matrix`)

تمامی ۱۲ سناریوی امنیتی تعریف‌شده در دستورالعمل `RT-SOCIAL-IMPL-001` در کد و مجموعه آزمون‌های خودکار مخزن پیاده‌سازی و اثبات شده‌اند:

| # | سناریوی امنیتی | رفتار مورد انتظار | فایل و شناسه تست اثبات‌کننده | نتیجه اجرا |
| :---: | :--- | :--- | :--- | :---: |
| **۱** | درخواست بدون هدر `Authorization: Bearer` به مسیرهای نوشتن | رد درخواست با کد `401` بدون اجرای منطق دامنه | `tests/stage2-crowd-claims.test.ts` (`CC-A01`, `CC-A08`)، `tests/trust-safety-module.test.ts` (`TS-A02`)، `tests/dispute-resolution-module.test.ts` (`DR-A02`) | **PASS** |
| **۲** | درخواست با توکن نامعتبر یا منقضی‌شده | رد درخواست با کد `401` | `tests/stage2-crowd-claims.test.ts` (`CC-A02`) | **PASS** |
| **۳** | درخواست با توکن دارای ایمیل تأییدنشده (`email_verified: false`) | رد درخواست با کد `403` | `tests/trust-safety-module.test.ts` (`TS-A03`)، `tests/stage2-crowd-claims.test.ts` (`CC-A03`) | **PASS** |
| **۴** | ارسال `x-test-uid` یا `x-user-id` برای جعل هویت کاربر دیگر | نادیده‌گرفتن کامل هدرهای تستی و رد درخواست با `401` (بدون توکن) یا `503` (در نبود Verifier) | `tests/trust-safety-module.test.ts` (`TS-A01`, `TS-A02`)، `tests/dispute-resolution-module.test.ts` (`DR-A01`, `DR-A02`) | **PASS** |
| **۵** | ارسال `authorUid` یا `voterUid` متفاوت با کاربر احراز هویت‌شده در بدنه درخواست | رد صریح با کد `403 UID_SPOOFING_FORBIDDEN` در `crowdClaimsRoutes` و نادیده‌گرفتن `body.reporterUid` در `trustSafetyRoutes` | `tests/stage2-crowd-claims.test.ts` (`CC-A06`, `CC-A09`)، `tests/trust-safety-module.test.ts` (`TS-A04`) | **PASS** |
| **۶** | ارسال `x-test-role: admin` توسط کاربر عادی | نادیده‌گرفتن هدر نقش تستی و رد دسترسی با کد `403`؛ همچنین نادیده‌گرفتن جعل `authorRoleBadge: 'OFFICIAL_EXPERT'` در بدنه درخواست | `tests/trust-safety-module.test.ts` (`TS-A05`)، `tests/dispute-resolution-module.test.ts` (`DR-A04`, `DR-A05`)، `tests/stage2-crowd-claims.test.ts` (`CC-A07`) | **PASS** |
| **۷** | تلاش کاربر عادی برای دسترسی به عملیات مدیریتی یا ناظر (`Moderation` / `Resolve`) | رد درخواست با کد `403` | `tests/trust-safety-module.test.ts` (`TS-A05`)، `tests/dispute-resolution-module.test.ts` (`DR-A05`) | **PASS** |
| **۸** | تلاش کاربر غیرمرتبط برای مشاهده داده خصوصی کاربر دیگر (`IDOR`) | رد درخواست با کد `403` در پرونده‌ها، Timeline، ویرایش پست و انصراف از گزارش اصلاحی؛ بازگشت `null` برای پروفایل خصوصی | `tests/dispute-resolution-module.test.ts` (`DR-A04`)، `tests/community-firestore-stage3.test.ts` (`CF-03`, `CF-17`, `CF-19`) | **PASS** |
| **۹** | قطع یا عدم پیکربندی اتصال Firestore در عملیات اجتماعی | رفتار **Fail-Closed** با پاسخ `503 COMMUNITY_DATABASE_UNAVAILABLE` و عدم ذخیره در حافظه موقت؛ همچنین `503 AUTH_PROVIDER_UNAVAILABLE` در قطع سرویس تایید هویت | `tests/community-firestore-stage3.test.ts` (`CF-11`, `CF-12`)، `tests/stage2-crowd-claims.test.ts` (`CC-A04`) | **PASS** |
| **۱۰** | ارسال درخواست تکراری با همان `Idempotency-Key` و همان بدنه | بازگرداندن پاسخ قبلی (`idempotentReplay: true`) بدون ایجاد رکورد تکراری | `tests/community-firestore-stage3.test.ts` (`CF-05`)، `tests/trust-safety-module.test.ts` (تست ۳)، `tests/dispute-resolution-module.test.ts` (تست ۱) | **PASS** |
| **۱۱** | استفاده مجدد از همان `Idempotency-Key` با بدنه متفاوت | رد درخواست با کد `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | `tests/community-firestore-stage3.test.ts` (`CF-06`) | **PASS** |
| **۱۲** | صحت ساختار `firestore.rules` و هم‌ترازی با `firebase-blueprint.json` | عبور کامل از ممیزی استاتیک قوانین (`13/13`) و تست یکپارچگی داده (`9/9`) | `npm run test:rules:static` (`scripts/run-firestore-rules-tests.ts`) | **PASS** |

---

## ۵. شکاف‌های فنی واقعی و باز برای مراحل بعدی توسعه (`Real Open Technical Gaps`)

در حالی که ایرادات احراز هویت و اتصال Firestore در کد فعلی برطرف شده‌اند (`VERIFIED_FIXED`)، چهار شکاف معماری زیر در بازرسی کد اثبات شدند و وضعیت آن‌ها **`OPEN`** است:

### الف) محدودیت نرخ وابسته به حافظه فرآیند در ماژول جامعه (`Process-Local CommunityRateLimiter`) — وضعیت: `OPEN`
- **مختصات کد**: `server/modules/community/communityRateLimiter.ts:48-93`
- **شواهد فنی**: کلاس `CommunityRateLimiter` شمارنده‌های پنجره زمانی هر کاربر/عملیات (`create_post`، `create_comment`، `toggle_reaction`، `toggle_follow`، `submit_report`) را در متغیر `private readonly slots = new Map<string, CounterSlot>()` در RAM فرآیند Node نگهداری می‌کند.
- **ریسک معماری**: در استقرار تک‌نمونه‌ای (`INSTANCE_COUNT = 1`) کاملاً کارآمد است، اما در استقرار چندنمونه‌ای (Horizontal Scaling)، هر نمونه شمارنده مستقل خود را خواهد داشت و سقف واقعی به `N × limit` افزایش می‌یابد.

### ب) محدودیت نرخ و جریمه سوءاستفاده سراسری در حافظه فرآیند (`serverDeliveryAndAbuseGuard.ts`) — وضعیت: `OPEN`
- **مختصات کد**: `src/utils/serverDeliveryAndAbuseGuard.ts:34-156`
- **شواهد فنی**: ساختارهای `bucketMaps`، `accountQuotaMaps` و `abusePenaltyMap` همگی `Map`های درون‌حافظه‌ای هستند. (البته `src/utils/serverConfigValidator.ts` اجرای چندنمونه‌ای بدون پیکربندی Backend مشترک را هشدار/مسدود می‌کند، اما پیاده‌سازی Store مشترک برای شمارنده‌های Rate Limit هنوز انجام نشده است).

### ج) دوگانگی مکانیزم `Idempotency` میان ماژول جامعه و ادعاهای جمعی — وضعیت: `PARTIALLY_IMPLEMENTED` / `OPEN`
- **مختصات کد**:
  1. **پایدار در Firestore (`VERIFIED_EXISTING`)**: در `server/modules/community/communityUnifiedRepository.ts:90-130, 188-235`، عملیات `create_post` و `create_comment` کلید یکتای `Idempotency-Key` را با SHA-256 هش کرده و درون تراکنش Firestore در کالکشن `socialIdempotency` ذخیره و با هش بدنه (`payloadHash`) مقایسه می‌کنند (پاسخ `409` در صورت تغییر بدنه).
  2. **حافظه موقت فرآیند (`OPEN`)**: در `src/cells/knowledge-crowd/crowdClaimsRoutes.ts:30, 179-190`، از نمونه `crowdIdempotencyLedger = new IdempotencyLedger(15 * 60_000)` (`src/utils/serverIdempotencyAndConcurrency.ts`) استفاده می‌شود که در RAM فرآیند نگهداری می‌شود و پس از ری‌استارت سرور یا بین نمونه‌های مختلف به اشتراک گذاشته نمی‌شود. همچنین عملیات `submitReport` در `communityUnifiedRepository.ts` هنوز از جدول `socialIdempotency` استفاده نمی‌کند.

### د) مدل رشد سند تودرتو در `socialPosts` (`Embedded Document Growth Model`) — وضعیت: `OPEN`
- **مختصات کد**: `server/modules/community/communityUnifiedRepository.ts:194-225, 250-303, 369-374` و `server/modules/community/communityUnifiedExtraOps.ts`
- **شواهد فنی**: هنگام ثبت نظر (`addDiscussionComment`)، پاسخ پرسش (`addQuestionAnswerOp`)، واکنش (`toggleReactionTransactional`) یا دنبال‌کردن (`toggleFollowTransactional`)، علاوه بر ایجاد سند مستقل در کالکشن‌های `socialComments`، `socialReactions` و `socialFollows`، آرایه‌ها و نقشه‌های تودرتوی زیر مستقیماً داخل سند مادر `socialPosts/{postId}` نیز ذخیره و بازنویسی می‌شوند:
  - `replies: CommunityReply[]` (متن کامل نظرات داخل سند پست)
  - `answers: CommunityAnswer[]` (متن کامل پاسخ‌ها داخل سند پرسش)
  - `reactionsByUser: Record<string, CommunityReactionType>` (نقشه تمام کاربران واکنش‌دهنده)
  - `helpfulVoterIds: string[]`
  - `followerIds: string[]`
  - `revisionHistory: Array<{ editedAtIso, previousTitleFa, previousBodyFa }>`
- **ریسک معماری**: در Firestore سقف حجم هر سند **۱ مگابایت (1 MiB)** و سقف نرخ نوشتن روی یک سند واحد محدود است. برای پست‌های پرمخاطب با هزاران نظر، واکنش یا دنبال‌کننده، رشد بی‌حد `replies[]`، `reactionsByUser{}` و `followerIds[]` داخل سند `socialPosts/{postId}` منجر به برخورد به سقف ۱ مگابایت و Contention تراکنش روی سند پست خواهد شد.

---

## ۶. جدول تصمیم نهایی (`Deliverable 3 — Canonical Decision Matrix`)

این ماتریس تکلیف قطعی هر بخش از زیرساخت اجتماعی را برای شروع مراحل بعدی توسعه مشخص می‌کند:

| بخش | وضعیت فعلی در کد (`[Observed Fact]`) | تصمیم قطعی (`Disposition`) | دلیل فنی و معماری |
| :--- | :--- | :---: | :--- |
| **`Community Unified Repository`**<br>(`server/modules/community/communityUnifiedRepository.ts`) | پیاده‌سازی‌شده و فعال در Runtime (`440` خط)؛ مالک واحد منطق پست، نظر، واکنش، دنبال‌کردن، گزارش و پروفایل | **`KEEP`** | منطق اصلی جامعه، تراکنش‌ها، حذف PII و صفحه‌بندی در آن متمرکز و آزموده است (`CF-01..CF-20`). |
| **`Firestore Adapter`**<br>(`server/modules/community/communityFirestoreAdapter.ts`) | پیاده‌سازی‌شده (`397` خط)؛ پشتیبانی از `FirestoreAdminCommunityStore` (Fail-Closed `503`) و `MockFirestoreCommunityStore` | **`KEEP`** | مسیر استاندارد، امن و Fail-Closed ذخیره‌سازی ابری روی ۱۰ کالکشن Firestore است. |
| **`Social Rules`**<br>(`firestore.rules:644-741`) | پیاده‌سازی‌شده برای هر ۱۰ کالکشن `social*` با کنترل مالکیت، نقش ادمین و منع فیلدهای PII | **`KEEP & VERIFY`** | قوانین امنیتی ۱۰ کالکشن اجتماعی وجود دارند و با `npm run test:rules:static` (`13/13` و `9/9`) تایید شدند. |
| **`Social Blueprint`**<br>(`firebase-blueprint.json:222-368, 407-446`) | پیاده‌سازی‌شده شامل اسکیمای کامل ۱۰ موجودیت و ۱۰ مسیر کالکشن اجتماعی | **`KEEP & VERIFY`** | قرارداد اسکیما با آداپتور و `firestore.rules` کاملاً هم‌تراز است. |
| **`Trust Safety` & `Dispute Resolution`**<br>(`trustSafetyRoutes.ts`، `mountTrustSafetyRoutes.ts`، `disputeRoutes.ts`) | پیاده‌سازی‌شده؛ رفتار Fail-Closed (`503`) در نبود Verifier، عدم اعتماد به `x-test-*` و بررسی نقش ناظر در سرور | **`KEEP & VERIFY`** | آسیب‌پذیری‌های گزارش‌شده در ممیزی قدیمی برطرف شده و با آزمون‌های `TS-A01..TS-A06` و `DR-A01..DR-A06` اثبات شده‌اند. |
| **`Crowd Claims`**<br>(`src/cells/knowledge-crowd/crowdClaimsRoutes.ts`) | پیاده‌سازی‌شده (`408` خط)؛ الزام Bearer Token با ایمیل تاییدشده و رد جعل شناسه با `403 UID_SPOOFING_FORBIDDEN` | **`KEEP & VERIFY`** | احراز هویت سرورمحور برقرار و با آزمون‌های `CC-A01..CC-A12` اثبات شده است (فقط دفتر کل Idempotency آن در حافظه فرآیند است). |
| **`Legacy File Repository`**<br>(`server/modules/community/communityRepository.ts`) | موجود در مخزن (`251` خط)، اما دارای **صفر ایمپورت** در کل کد اجرایی و تست‌ها | **`DEPRECATE`** | نباید در Runtime یا فیچرهای جدید استفاده شود؛ مطابق محدودیت مرحله بدون حذف فیزیکی، رسماً منسوخ اعلام می‌شود. |
| **`Process-local Rate Limiter`**<br>(`communityRateLimiter.ts` و `serverDeliveryAndAbuseGuard.ts`) | فعال روی `Map` درون حافظه RAM فرآیند | **`OPEN / FUTURE REMEDIATION`** | در اجرای تک‌نمونه‌ای کار می‌کند اما برای مقیاس‌پذیری چندنمونه‌ای نیازمند انتقال به Store مشترک است. |
| **`Embedded Reaction / Reply Data`**<br>(`replies[]`، `reactionsByUser{}`، `followerIds[]` در `socialPosts`) | فعال به‌صورت دوگانه (هم در کالکشن‌های مستقل و هم تودرتو داخل سند `socialPosts`) | **`OPEN / FUTURE DESIGN`** | در حجم بالا ریسک برخورد با سقف ۱ مگابایت سند Firestore و Contention تراکنش دارد و باید در مرحله طراحی مقیاس‌پذیری به خواندن از کالکشن‌های فرزند و شمارنده‌های اتمیک محدود شود. |

---

## ۷. گزارش قابل تکرار اجرای آزمون‌ها (`Deliverable 4 — Executed Verification Report`)

تمامی دستورات زیر در نشست اجرای `RT-SOCIAL-IMPL-001` روی مخزن اجرا شده و خروجی واقعی آن‌ها ثبت گردیده است:

- **وضعیت درخت کاری و کامیت مرجع**:
  - `working_tree_status`: `UNINITIALIZED_GIT_SANDBOX_FILESYSTEM_VERIFIED` (`git rev-parse HEAD` -> `NO_GIT_HEAD` در محیط کانتینر؛ فایل‌سیستم منطبق بر کامیت‌های تأییدشده `f8b066f76c9053ce9b3c53fb136b9ec34fc57f7a` و `5e577f861de711ffcd77cd455ea79d41d553e0b` در `docs/engineering/RMEP-001/EXECUTION-STATE.json`).

| # | نام دستور اجراشده | زمان اجرا (`durationMs`) | نتیجه (`PASS / FAIL`) | تعداد تست‌های اجراشده و جزئیات خروجی | تست‌های ناموفق | مسیر فایل شواهد در مخزن |
| :---: | :--- | :---: | :---: | :--- | :---: | :--- |
| **۱** | `npm run typecheck` (`tsc --noEmit`) | `71,741 ms` (`71.74 s`) | **PASS** | بررسی کامل تایپ‌های TypeScript در کل مخزن با `0` خطای کامپایل | `0` | `tsconfig.json`، `package.json` |
| **۲** | `npm run arch:check` (`tsx scripts/check-architecture.ts`) | `1,258 ms` (`1.26 s`) | **PASS** | اسکن **۶۸۴ فایل** در `src/` و `server/modules/`؛ **۰ خطای مسدودکننده** (`0 errors`)، سقف `src/App.tsx`: `64/100` خط، ۱۱۱ فایل میراثی در سقف Ratchet | `0` | `scripts/check-architecture.ts`، `architecture-baseline.json` |
| **۳** | `npm run test:rules:static` (`tsx scripts/run-firestore-rules-tests.ts static`) | `1,602 ms` (`1.60 s`) | **PASS** | **۲۲ آزمون** شامل: `Static Firestore Rules Audit: 13/13` و `Data Integrity Regression Suite: 9/9` | `0` | `scripts/run-firestore-rules-tests.ts`، `firestore.rules.test.ts`، `firestore.rules` |
| **۴** | `npx tsx tests/trust-safety-module.test.ts` | `1,827 ms` (`1.83 s`) | **PASS** | **۱۳ مجموعه آزمون** (شامل چرخه گزارش، پرونده، ارزیابی ریسک، اعمال تصمیم، اعتراض، تفکیک وظایف SoD، ناشناس‌سازی GDPR و آزمون‌های امنیتی `TS-A01..TS-A06`) | `0` | `tests/trust-safety-module.test.ts`، `server/modules/trust-safety/trustSafetyRoutes.ts` |
| **۵** | `npx tsx tests/dispute-resolution-module.test.ts` | `1,786 ms` (`1.79 s`) | **PASS** | **۱۲ مجموعه آزمون** (شامل ایجاد پرونده با Idempotency، منع اختلاف با خود، ثبت ادعا و پاسخ، محرمانگی مدارک و یادداشت میانجی‌گر، توافق دوجانبه و آزمون‌های امنیتی `DR-A01..DR-A06`) | `0` | `tests/dispute-resolution-module.test.ts`، `server/modules/dispute-resolution/disputeRoutes.ts` |
| **۶** | `npx tsx tests/stage2-crowd-claims.test.ts` | `2,800 ms` (`2.80 s`) | **PASS** | **۴ مجموعه آزمون** شامل ماتریس کامل امنیتی ۱۲گانه `CC-A01..CC-A12` (الزام توکن، دفع جعل `authorUid`/`voterUid` با کد `403 UID_SPOOFING_FORBIDDEN`، خنثی‌سازی رأی کاربر Shadow-Banned، ارتقا به `VERIFIED_REFERENCE` و Fail-Closed `503`) | `0` | `tests/stage2-crowd-claims.test.ts`، `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` |
| **۷** | `npx tsx --test tests/community-firestore-stage3.test.ts` | `2,959 ms` (`2.96 s`) | **PASS** | **۴ مجموعه آزمون** پوشش‌دهنده ۲۰ سناریوی `CF-01..CF-20` (CRUD پایدار روی Firestore، مالکیت، تراکنش واکنش و دنبال‌کردن، Idempotency و تداخل `409`، صفحه‌بندی تا سقف ۵۰، محدودیت نرخ `429`، Fail-Closed `503` در قطعی DB، ورود غیرمخرب Seed و حذف PII) | `0` | `tests/community-firestore-stage3.test.ts`، `server/modules/community/communityUnifiedRepository.ts`، `server/modules/community/communityFirestoreAdapter.ts` |
| **۸** | `npx tsx tests/notifications-module.test.ts` | `2,606 ms` (`2.61 s`) | **PASS** | **۸ مجموعه آزمون** (پاک‌سازی XSS و حذف کلیدهای محرمانه در قالب‌ها، جداسازی مالکیت گیرنده، تغییر وضعیت خوانده‌شده، صفحه‌بندی، ترجیحات کانال، Idempotency مصرف رویداد، تلاش مجدد و احراز هویت مسیرهای Express) | `0` | `tests/notifications-module.test.ts`، `server/modules/notifications/` |
| **۹** | `npx tsx tests/notification-orchestration-module.test.ts` | `1,543 ms` (`1.54 s`) | **PASS** | مجموعه کامل آزمون‌های ارکستراسیون اعلان‌ها و هشدارها (Employee 68) شامل Deduplication، Escaping، ترجیحات کاربر و کنترل دسترسی | `0` | `tests/notification-orchestration-module.test.ts`، `server/modules/notification-orchestration/` |
| **۱۰** | `npm run test:contracts` (`tsx tests/engineering-quality-foundation.test.ts`) | `3,032 ms` (`3.03 s`) | **PASS** | راستی‌آزمایی قراردادهای مهندسی و واحدهای مساحت (`areaUnit.ts`) که در ممیزی قدیمی ناموفق گزارش شده بود و اکنون کاملاً برطرف شده است (`VERIFIED_FIXED`) | `0` | `tests/engineering-quality-foundation.test.ts`، `src/utils/areaUnit.ts` |

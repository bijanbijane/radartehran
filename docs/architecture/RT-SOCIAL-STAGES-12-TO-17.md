# مشخصات معماری و قراردادهای مراحل ۱۲ تا ۲۱ هسته اجتماعی، پیام‌رسانی، اعلان‌ها و Outbox رویدادهای رادار تهران (`RT-SOCIAL-IMPL-012` تا `RT-SOCIAL-IMPL-021`)

- **سند مرجع**: مکمل [`RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md`](./RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md) و [`RT-SOCIAL-GAP-AND-CONVERGENCE-AUDIT.md`](./RT-SOCIAL-GAP-AND-CONVERGENCE-AUDIT.md)
- **اثر انگشت مخزن مرجع (`[Observed Fact]`)**:
  - `SHA-256`: `29f478df9dfd272300fcd7db499ed848573fcd0a0780fcdd782cf26edd2e2079` (`ZIP entries: 3044`، `libfile_685ab25df3948191b9dda4ad5dcc32c9`)
  - پروژه Firebase: `gen-lang-client-0713157837`
  - پایگاه‌داده Firestore: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
- **وضعیت صداقت اجرایی (`CASPER Epistemic Discipline`)**:
  - تمامی مراحل ۱۲ تا ۲۱ در وضعیت **`designed` («تدوین و ثبت شد — اجرا و تأیید: انجام نشده»)** ثبت شده‌اند و تا زمان پیاده‌سازی کد و اجرای آزمون‌های پذیرش متناظر روی Firestore Emulator و گیت‌های معماری، هیچ‌یک `implemented`، `verified` یا `accepted` اعلام نمی‌شوند.

---

## ۱. جدول خلاصه وضعیت و وابستگی مراحل ۱۲ تا ۲۱ (`Master Stage Ledger`)

| مرحله | شناسه رسمی (`Stage ID`) | عنوان انگلیسی | اولویت | پیش‌نیاز و گیت وابستگی | مجموعه آزمون پذیرش | وضعیت واقعی در مخزن (`[Observed Fact]`) |
| :---: | :--- | :--- | :---: | :--- | :--- | :---: |
| **۱۲** | `RT-SOCIAL-IMPL-012-QA-ANSWER-CANONICAL-INTEGRITY` | Canonical Q&A Answer Lifecycle & Projection Integrity | `P1` | مستقل از مراحل ۱۳–۲۱ | `QAINT-001` تا `QAINT-028` (`28` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۳** | `RT-SOCIAL-IMPL-013-CROWD-DATA-FIRESTORE-TRANSACTIONAL-STORE` | Firestore-First Transactional Crowd Data Store | `P1` | پایه زنجیره Crowd Data v2 | `CDP-001` تا `CDP-022` (`22` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۴** | `RT-SOCIAL-IMPL-014-CROWD-CLAIMS-LEGACY-MIGRATION-PREFLIGHT` | Legacy Crowd Claims Migration Preflight & Semantic Reconciliation | `P1` | فقط-خواندنی؛ پیش‌نیاز مراحل ۱۵ و ۱۶ | `CCMP-001` تا `CCMP-022` (`22` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۵** | `RT-SOCIAL-IMPL-015-CROWD-CONSENSUS-CONTRIBUTOR-DOMAIN` | Weighted Community Feedback & Contributor Trust Domain | `P1` | وابسته به تکمیل مراحل ۱۳ و ۱۴ | `CCV-001` تا `CCV-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۶** | `RT-SOCIAL-IMPL-016-CROWD-CLAIMS-CUTOVER-AND-MIGRATION` | Controlled API Cutover, Legacy Migration & Epistemic Boundary Enforcement | `P1` | **مشروط به تکمیل و تأیید مراحل ۱۳، ۱۴ و ۱۵** | `CCUT-001` تا `CCUT-032` (`32` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۷** | `RT-SOCIAL-IMPL-017-SCOPED-MESSAGING-DURABLE-CORE` | Durable Context-Authorized Messaging Core | `P1` | مستقل از مراحل ۱۳–۱۶ | `MSGCORE-001` تا `MSGCORE-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۸** | `RT-SOCIAL-IMPL-018-NOTIFICATION-ORCHESTRATION-DURABLE-CORE` | Canonical Notification Orchestration & Durable Core | `P1` | پایه زیرساخت اعلان‌ها؛ پیش‌نیاز مراحل ۱۹ تا ۲۱ | `NOTIFCORE-001` تا `NOTIFCORE-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۹** | `RT-SOCIAL-IMPL-019-NOTIFICATION-LEGACY-MIGRATION-API-UI-CUTOVER` | Legacy Notification Migration & Canonical API/UI Cutover | `P1` | **مشروط به تکمیل واقعی مرحله ۱۸** (و عدم تخریب Conversationهای مرحله ۱۷) | `NOTIFCUT-001` تا `NOTIFCUT-036` (`36` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۰** | `RT-SOCIAL-IMPL-020-DOMAIN-EVENT-OUTBOX-PRODUCERS` | Transactional Domain Event Outbox & Wave-1 Producers | `P1` | وابسته به مرحله ۱۸؛ پیش‌نیاز مرحله ۲۱ | Outbox + ۴ تولیدکننده موج اول (`Property Mgmt`, `Support`, `Billing`, `CX`) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۱** | `RT-SOCIAL-IMPL-021-PROPERTY-VIEWINGS-TRANSACTIONAL-OUTBOX` | Property Viewing Lifecycle Atomic Outbox Integration | `P1` | **وابسته به تکمیل مراحل ۱۸ و ۲۰** | `VIEWOUT-001` تا `VIEWOUT-026` (`26` آزمون جدید + `32` تست رگرسیون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |

---

## ۲. مرحله ۱۲: تثبیت چرخه پاسخ‌های پرسش تخصصی و یکپارچگی داده‌ها (`RT-SOCIAL-IMPL-012-QA-ANSWER-CANONICAL-INTEGRITY`)

### ۲.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **دوگانگی منبع حقیقت پاسخ (`socialComments` در برابر `socialPosts.answers`)**:
   - در `server/modules/community/communityUnifiedExtraOps.ts:26-100`، تابع `addQuestionAnswerOp` پاسخ را هم در `SOCIAL_COLLECTIONS.comments` (`socialComments/{answerId}` با `commentKind: 'answer'` در خط ۶۸) و هم در آرایه `answers` داخل `socialPosts/{questionId}` (خط ۷۲) می‌نویسد، اما در خط ۷۲ و ۷۳ هم‌زمان روی همان سند `tx.update` و `tx.incrementNumeric` صدا زده می‌شود.
   - در `server/modules/community/communityUnifiedExtraOps.ts:102-115`، تابع `selectBestQuestionAnswerOp` فقط آرایه `answers` داخل سند پرسش را تغییر می‌دهد و سند مرجع `socialComments/{answerId}` را به‌روز نمی‌کند (`isAskerSelected: false` باقی می‌ماند).
2. **ناسازگاری داده Seed با کالکشن مرجع**:
   - در `server/modules/community/communitySeedImporter.ts:73-82`، پرسش‌های نمونه (`COMMUNITY_SEED_QUESTIONS` مانند `q-seed-1`) با پاسخ تودرتوی `ans-seed-1` وارد `socialPosts` می‌شوند، اما سند متناظر در `socialComments` ساخته نمی‌شود.
3. **ابهام رفتار Toggle در انتخاب پاسخ برتر**:
   - در `communityUnifiedExtraOps.ts:109` عبارت `const nextSelected = !target.markers.isAskerSelected` بدون پارامتر صریح `selected: boolean` عمل می‌کند و در Retry شبکه یا کلیک هم‌زمان نتیجه غیرقطعی تولید می‌کند.
4. **قرارداد فرانت‌اند**:
   - در `src/features/community/types/community.types.ts:102-122`، `src/features/community/services/communityApiClient.ts:227-237` و `src/features/community/components/CommunityQuestionsTab.tsx:31,148-159`، فیلد `bestAnswerId?: string | null` و ارسال صریح `{ selected: boolean }` به همراه `Idempotency-Key` هنوز پیاده‌سازی نشده است.

### ۲.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۲
- **منبع حقیقت (`Canonical Answer Record`)**: سند `socialComments/{answerId}` با `commentKind: 'answer'` و `postId = questionId` منبع حقیقت پاسخ است؛ آرایه `socialPosts/{questionId}.answers` صرفاً Projection همگام‌شده درون همان تراکنش است.
- **مشتق‌سازی شناسه پاسخ**: در صورت وجود `idempotencyKey`، شناسه پاسخ به‌صورت قطعی از `ans_${sha256("question_answer:" + actorUid + ":" + questionId + ":" + idempotencyKey).slice(0, 24)}` ساخته می‌شود.
- **تک‌عملیاتی بودن به‌روزرسانی سند پرسش**: ادغام افزایش `commentCount` و به‌روزرسانی `answers` در یک `tx.update` واحد روی `socialPosts/{questionId}`.
- **عملیات صریح و Idempotent انتخاب پاسخ برتر**: پذیرش `selected?: boolean` (پیش‌فرض `true`)، به‌روزرسانی هم‌زمان سند پرسش (`bestAnswerId`, `status`, `answers`) و سندهای پاسخ قدیم و جدید در `socialComments`، و ثبت رویدادهای `question.best_answer.selected.v1` و `question.best_answer.cleared.v1` در `socialActivities`.
- **ترمیم Seed**: ساخت اسناد متناظر `socialComments/{answer.id}` در `communitySeedImporter.ts` به‌صورت غیرمخرب (`createIfAbsent`).
- **ماتریس آزمون پذیرش**: ۲۸ آزمون `QAINT-001` تا `QAINT-028` در `tests/community-qa-canonical-stage12.test.ts`.

---

## ۳. مرحله ۱۳: بازسازی لایه ذخیره‌سازی Crowd Data v2 بر پایه Firestore و تراکنش واقعی (`RT-SOCIAL-IMPL-013-CROWD-DATA-FIRESTORE-TRANSACTIONAL-STORE`)

### ۳.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
- در `server/modules/crowd-data/persistenceAdapter.ts:183-385`، تابع `createDurableCrowdDataStore` برخلاف نامش، داده‌ها را از `claimsMap` و `observationsMap` در حافظه فرآیند می‌خواند (خطوط ۲۸۴، ۳۲۳، ۳۴۲، ۳۸۱)، قفل هم‌زمانی را در `lockTails` حافظه محلی نگه می‌دارد (خطوط ۱۸۷–۲۰۶)، از فایل محلی اختیاری `durableFilePath` استفاده می‌کند (خطوط ۲۱۱–۲۵۴) و نوشتن در Firestore را به‌صورت غیرتراکنشی با `set(..., { merge: false })` انجام می‌دهد.
- متدهای `listClaimsByNeighborhood` (خطوط ۳۲۲–۳۲۵) و `listObservationsByNeighborhood` (خطوط ۳۸۰–۳۸۳) در `CrowdDataFirestoreClient` کوئری Firestore ندارند و فقط روی `Map` حافظه فیلتر می‌کنند.

### ۳.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۳
- **جداسازی صریح Backendها**:
  1. `FirestoreTransactionalCrowdDataStore` (`backendKind = 'firestore'`): ذخیره‌ساز تولید بدون هیچ `Map` کش یا فایل JSON محلی؛ اجرای `mutateClaim` و `mutateObservation` درون `runTransaction` واقعی Firestore؛ رفتار **Fail-Closed** با خطای `CrowdDataDatabaseUnavailableError` (`503 CROWD_DATA_DATABASE_UNAVAILABLE`).
  2. `InMemoryTransactionalCrowdDataStore` (`backendKind = 'in_memory'`): صرفاً برای تست واحد؛ مسدود در `NODE_ENV === 'production'` یا `CROWD_DATA_REQUIRE_FIRESTORE === 'true'`.
- **مجموعه‌های Firestore، قوانین و ایندکس‌ها**:
  - ثبت کالکشن‌های `/crowd_claims_v2/{claimId}` و `/price_observations_v2/{observationId}` با قوانین `allow read, write: if false;` در `firestore.rules`، ثبت موجودیت‌های `CrowdClaimV2` و `PriceObservationV2` در `firebase-blueprint.json`، و ثبت ایندکس‌های ترکیبی `(neighborhoodId ASC, createdAtMs DESC)` در `firestore.indexes.json`.
- **ماتریس آزمون پذیرش**: ۲۲ آزمون `CDP-001` تا `CDP-022` در `tests/crowd-data-firestore-store-stage13.test.ts`.

---

## ۴. مرحله ۱۴: تهیه نقشه مهاجرت داده‌های Crowd Claims قدیمی به Crowd Data v2 (`RT-SOCIAL-IMPL-014-CROWD-CLAIMS-LEGACY-MIGRATION-PREFLIGHT`)

### ۴.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
- **تفاوت دسته‌بندی‌ها و وضعیت‌ها**:
  - سامانه قدیمی (`src/cells/knowledge-crowd/crowdClaimsTypes.ts:7-17`) دارای ۵ دسته (`ALLEY_LIVABILITY`, `PRICE_OBSERVATION`, `CONSTRUCTION_QUALITY`, `INFRASTRUCTURE_POI`, `DATA_CORRECTION`) و ۴ وضعیت (`STAGE_COMMUNITY`, `VERIFIED_REFERENCE`, `DISPUTED`, `REJECTED_SPAM`) است.
  - سامانه جدید (`server/modules/crowd-data/types.ts:13-29`) دارای ۶ دسته (`INFRASTRUCTURE_UTILITIES`, `NOISE_ENVIRONMENT`, `TRAFFIC_ACCESS`, `CONSTRUCTION_DENSITY`, `AMENITY_AVAILABILITY`, `SAFETY_PERCEPTION`) و ۶ وضعیت (`SUBMITTED`, `UNDER_REVIEW`, `ACCEPTED`, `REJECTED`, `DISPUTED`, `WITHDRAWN`) است.
- **وابستگی معکوس ماژول جدید به Engine قدیمی**:
  - `server/modules/crowd-data/crowdClaimsDomain.ts:5-9` توابع خالص `DEFAULT_INITIAL_TRUST_WEIGHT`، `evaluateClaimPlausibility` و `normalizeStreetName` را مستقیماً از `src/cells/knowledge-crowd/crowdClaimsEngine.ts` وارد می‌کند.

### ۴.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۴
- **استخراج منطق مشترک خالص (`server/modules/crowd-data/crowdSignalHeuristics.ts`)**: قطع وابستگی `server/modules/crowd-data/*` به `src/cells/knowledge-crowd/crowdClaimsEngine.ts`.
- **جدول قطعی نگاشت دسته‌بندی‌ها (`Legacy Claim Category Mapping`)**:
  - `INFRASTRUCTURE_POI` -> `CrowdClaimV2` (`INFRASTRUCTURE_UTILITIES`, `DIRECT_MAPPING`)
  - `CONSTRUCTION_QUALITY` -> `CrowdClaimV2` (`CONSTRUCTION_DENSITY`, `SEMANTIC_NARROWING_WITH_LEGACY_TAG`)
  - `ALLEY_LIVABILITY` -> تفکیک بر اساس متن نرمال‌شده به `TRAFFIC_ACCESS`، `NOISE_ENVIRONMENT`، `SAFETY_PERCEPTION` یا `AMENITY_AVAILABILITY`
  - `DATA_CORRECTION` -> تفکیک به `AMENITY_AVAILABILITY` یا `INFRASTRUCTURE_UTILITIES` با حفظ `legacyCategory: 'DATA_CORRECTION'`
  - `PRICE_OBSERVATION` -> در صورت داشتن قیمت معتبر متری، تبدیل به `PriceObservationV2` با `observationId = "migrated_obs_" + legacyClaim.claimId`؛ در غیر این صورت گزارش در `unmigratableRecords` با کد `PRICE_OBSERVATION_MISSING_UNIT_PRICE` (عدم حذف بی‌سر‌و‌صدا).
- **قانون طلایی نگاشت وضعیت (`State Mapping Invariant`)**:
  - وضعیت `VERIFIED_REFERENCE` در سیستم قدیمی حاصل رأی کاربران است و **هرگز نباید خودکار به `ACCEPTED` تبدیل شود**؛ بلکه به `state: 'UNDER_REVIEW'` با `legacyCommunityConsensus: 'LEGACY_VERIFIED_REFERENCE'`، `epistemicClass: 'CROWD_CLAIM_UNVERIFIED'` و `authoritativeDataEligible: false` نگاشت می‌شود.
- **ماهیت فقط-خواندنی اسکریپت Preflight**: اسکریپت `scripts/preflight-crowd-claims-migration.ts` هیچ پرچم `--apply` یا دستور نوشتن (`set/add/update/delete`) روی Firestore ندارد.
- **ماتریس آزمون پذیرش**: ۲۲ آزمون `CCMP-001` تا `CCMP-022` در `tests/crowd-claims-migration-preflight-stage14.test.ts`.

---

## ۵. مرحله ۱۵: تکمیل موتور رأی‌گیری وزن‌دار و دامنه اعتماد مشارکت‌کنندگان (`RT-SOCIAL-IMPL-015-CROWD-CONSENSUS-CONTRIBUTOR-DOMAIN`)

### ۵.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
- در `src/cells/knowledge-crowd/crowdClaimsEngine.ts:26-44, 152-330`، سیستم قدیمی دارای اعتبارسنجی Plausibility، نرمال‌سازی نام خیابان، ضریب اعتماد مشارکت‌کننده (`trustWeight` در بازه `[0.1, 2.5]`، مقدار اولیه `1.0`، کاربر Shadow-Banned برابر `0`)، رأی وزن‌دار (`CONFIRM` / `REFUTE`، منع رأی به خود، سقف ۱۰ رأی در ساعت) و پروفایل مشارکت‌کننده (`crowd_contributors`) است.
- در `server/modules/crowd-data/crowdClaimsDomain.ts` و `server/modules/crowd-data/types.ts` هنوز رأی‌گیری وزن‌دار، زیرمجموعه رأی‌ها، شاخص `communityFeedback` و سرویس `CrowdContributorDomainService` وجود ندارد.

### ۵.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۵ (وابسته به مراحل ۱۳ و ۱۴)
- **تفکیک اجماع اجتماعی از وضعیت بررسی مدیریتی (`Epistemic Separation`)**:
  - فیلد `state` (`SUBMITTED | UNDER_REVIEW | ACCEPTED | REJECTED | DISPUTED | WITHDRAWN`) صرفاً چرخه بررسی مدیریتی است.
  - فیلد جدید `communityFeedback` (`NEUTRAL | COMMUNITY_SUPPORTED | COMMUNITY_CONTESTED`) صرفاً بازخورد وزن‌دار کاربران را نشان می‌دهد:
    - `confirmScore - refuteScore >= 3.0` و `confirmCount >= 3` -> `COMMUNITY_SUPPORTED`
    - `refuteScore - confirmScore >= 2.5` و `refuteCount >= 2` -> `COMMUNITY_CONTESTED`
    - سایر حالات -> `NEUTRAL`
  - **قانون تغییرناپذیری مرز معرفتی**: رأی کاربران هرگز `state` را به `ACCEPTED` تغییر نمی‌دهد، `epistemicClass` همیشه `'CROWD_CLAIM_UNVERIFIED'` و `authoritativeDataEligible` همیشه `false` باقی می‌ماند.
- **تراکنش اتمیک رأی‌گیری (`setClaimVote`) و زیرمجموعه رأی‌ها**:
  - ذخیره رأی هر کاربر در `/crowd_claims_v2/{claimId}/votes/{voterUid}` و پروفایل مشارکت‌کننده در `/crowd_contributor_profiles_v2/{uid}`.
  - پشتیبانی کامل از رأی اول، تکرار همان رأی (`Idempotent No-Op`) و تغییر رأی (`CONFIRM <-> REFUTE`) با اصلاح دقیق امتیازها در یک تراکنش واحد بدون دو بار شمردن وزن رأی‌دهنده.
  - محاسبه سهمیه رأی ساعتی (`10` رأی در یک ساعت گذشته) از روی اسناد واقعی Firestore، نه حافظه فرآیند.
- **قوانین اعتبار و نشان نقش (`Contributor Trust & Badge`)**:
  - نادیده‌گرفتن کامل `roleBadge` ارسالی کلاینت؛ استخراج نشان نقش صرفاً از پروفایل سرور.
  - جریمه یا پاداش اعتبار نویسنده بر اساس تصمیم ناظر (`MODERATOR_ACCEPTED` -> `+0.10`، `MODERATOR_REJECTED` -> `-0.25`) تنها یک بار به ازای هر تصمیم نهایی اعمال می‌شود.
- **ماتریس آزمون پذیرش**: ۳۰ آزمون `CCV-001` تا `CCV-030` در `tests/crowd-consensus-contributor-stage15.test.ts`.

---

## ۶. مرحله ۱۶: انتقال کنترل‌شده Crowd Claims به معماری جدید و مهاجرت داده‌های قدیمی (`RT-SOCIAL-IMPL-016-CROWD-CLAIMS-CUTOVER-AND-MIGRATION`)

> **شرط بازدارنده (`Gate Condition`)**: اجرای کد مرحله ۱۶ تا زمان تکمیل و قبولی کامل آزمون‌های مراحل ۱۳، ۱۴ و ۱۵ مجاز نیست.

### ۶.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **مسیر فعال Runtime**: `server.ts:212` -> `src/utils/serverUtilityRoutes.ts:13` -> `src/cells/knowledge-crowd/crowdClaimsRoutes.ts` که چهار مسیر `POST /api/v1/claims`، `GET /api/v1/claims/hood/:hoodId`، `POST /api/v1/claims/:claimId/vote` و `GET /api/v1/contributors/:uid` را به Engine قدیمی متصل می‌کند.
2. **نشت ادعاهای کاربران به شاخص اجتماعی-اقتصادی محله**:
   - در `src/cells/socioeconomic-intelligence/socioeconomicRollupEngine.ts:12,175,204`، تابع `queryNeighborhoodCrowdClaims(hood.id, { onlyVerified: true })` فراخوانی شده و در صورت وجود ادعای دارای `VERIFIED_REFERENCE`، منبع داده محله به `'VERIFIED_CLAIM'` تغییر یافته و خلاصه ادعاها به `summaryFa` تزریق می‌شود.
3. **بذرهای نمایشی تاییدشده در فرانت‌اند**:
   - در `src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx:22-97`، آرایه `SEED_CLAIMS` هنگام خالی بودن پاسخ سرور در محیط Production دو ادعای ساختگی با وضعیت `VERIFIED_REFERENCE` و عنوان «ادعای تاییدشده (مرجع محلی)» نمایش می‌دهد.
4. **دفتر کل Idempotency در حافظه فرآیند**:
   - در `src/cells/knowledge-crowd/crowdClaimsRoutes.ts:30`، `crowdIdempotencyLedger` فقط در RAM فرآیند نگهداری می‌شود.

### ۶.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۶
- **پشتیبانی هر ۵ دسته UI در Crowd Data v2**: گسترش `CrowdClaimCategory` به ۹ دسته شامل ۵ دسته فعال UI (`ALLEY_LIVABILITY`, `PRICE_OBSERVATION`, `CONSTRUCTION_QUALITY`, `INFRASTRUCTURE_POI`, `DATA_CORRECTION`) به‌علاوه ۴ دسته تحلیلی v2 بدون نیاز به تغییر Payload فرانت‌اند.
- **پروژکتور سازگار با فرانت‌اند (`crowdLegacyApiAdapter.ts`)**: بازگرداندن فیلدهای جدید (`moderationState`, `communityFeedback`, `epistemicClass`, `authoritativeDataEligible: false`) به همراه فیلدهای سازگار با کلاینت فعلی (`status`, `confirmWeight`, `refuteWeight`) با قانون صریح: حتی در حالت `COMMUNITY_SUPPORTED`، فیلد `authoritativeDataEligible` همیشه `false` است.
- **Idempotency پایدار در Firestore**: ذخیره کلیدهای `Idempotency-Key` در کالکشن `/crowd_idempotency_v2/{operationKeyHash}` درون تراکنش Firestore و بازگرداندن `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` در صورت تغییر بدنه.
- **حذف اختلاط ادعاهای جمعی با شاخص رسمی محله**: حذف کامل فراخوانی `queryNeighborhoodCrowdClaims` و برچسب `'VERIFIED_CLAIM'` از `socioeconomicRollupEngine.ts` و `socioeconomicTypes.ts`.
- **اصلاح صداقت بصری در UI**: حذف کامل `SEED_CLAIMS` از مسیر اجرای Production در `NeighborhoodCrowdClaimsPanel.tsx` و تغییر برچسب‌ها از «ادعای تاییدشده (مرجع محلی)» به «هم‌سو با بازخورد مشارکت‌کنندگان (تأیید رسمی رادار نیست)».
- **ماتریس آزمون پذیرش**: ۳۲ آزمون `CCUT-001` تا `CCUT-032` در `tests/crowd-claims-cutover-stage16.test.ts`.

---

## ۷. مرحله ۱۷: بازسازی زیرساخت پیام‌رسانی زمینه‌محور و انتقال آن به Firestore (`RT-SOCIAL-IMPL-017-SCOPED-MESSAGING-DURABLE-CORE`)

### ۷.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **ذخیره‌سازی فایل JSON محلی با سقف ۵۰۰ گفت‌وگو در سرور**:
   - در `server/modules/communications/commsRepository.ts:25,43-72`، داده‌ها در `AtomicJsonRepository<CommsPersistedState>('comms-state.json', ...)` ذخیره می‌شوند، پیام‌ها به‌صورت آرایه تودرتو داخل رکورد گفت‌وگو قرار دارند و در خط ۶۸ گفت‌وگوها با `.slice(0, 500)` بریده می‌شوند (حذف خاموش گفت‌وگوهای قدیمی‌تر از ۵۰۰).
2. **اعتماد سرور به `counterpartyUid` ارسالی کلاینت**:
   - در `server/modules/communications/commsRoutes.ts:147-176`، مسیر `POST /api/v1/conversations` فیلدهای `contextEntityId`، `contextEntityType` و `counterpartyUid` را مستقیماً از `req.body` می‌پذیرد و مالک واقعی موجودیت هدف (آگهی، پست اجتماعی یا پرونده اختلاف) را از دیتابیس استعلام نمی‌کند.
3. **جدا بودن کلاینت پیام‌رسانی از API سرور**:
   - در `src/features/communications/services/commsClientService.ts:9-20,199-247`، سرویس فرانت‌اند از `localStorage` (`radar_comms_workspace_v1`) و نمونه محلی `CommsCoreStateEngine` استفاده می‌کند و به `/api/v1/conversations*` متصل نیست.
4. **مسیرهای موازی ارتباطات در سرور**:
   - در `server.ts:216` تابع `registerCommunicationsRoutes` از `server/modules/comms/commsRoutes.ts` سوار شده، در حالی که `server/modules/communications/commsRoutes.ts` (`createCommsV1Router`) مسیرهای `/api/v1/conversations*` را تعریف کرده است.

### ۷.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۷ (مستقل از مراحل ۱۳ تا ۱۶)
- **کالکشن‌های پایدار Firestore**:
  - `/scoped_conversations_v2/{conversationId}` (سند گفت‌وگو با شناسه قطعی `conv_${sha256(contextEntityType + ":" + contextEntityId + ":" + sortedParticipantPair).slice(0, 24)}`)
  - `/scoped_conversations_v2/{conversationId}/messages/{messageId}` (زیرمجموعه مستقل پیام‌ها برای جلوگیری از رشد بی‌حد سند گفت‌وگو و برخورد با سقف `1 MiB`)
  - `/scoped_comms_blocks_v2/{blockId}` (`blk_${blockerUid}_${blockedUid}`)
  - `/scoped_comms_reports_v2/{reportId}`
  - `/scoped_comms_idempotency_v2/{keyHash}`
- **تأیید سمت سرور موجودیت و طرف مقابل (`ConversationContextResolver`)**:
  - سرور مالک یا طرف مجاز موجودیت را مستقیماً از منبع حقیقت استعلام می‌کند (`LISTING_INQUIRY` از `/bargains/{id}` و `/bargainOwners/{id}`، `EXPERT_QUESTION_FOLLOWUP` / `RESEARCH_COLLABORATION` از `/socialPosts/{id}`، `DISPUTE_THREAD` از پرونده اختلاف، `MODERATION_APPEAL` برای ادمین/ناظر).
  - در صورت مغایرت `counterpartyUid` ارسالی با مالک واقعی، درخواست با کد `403 COUNTERPARTY_CONTEXT_MISMATCH` رد می‌شود.
- **محدودیت نرخ در Firestore و بدون حذف ۵۰۰تایی**:
  - محاسبه سهمیه ارسال پیام (`8` پیام در دقیقه برای هر کاربر در یک گفت‌وگو، `40` پیام در ساعت برای هر کاربر در کل گفت‌وگوها) از روی اسناد واقعی Firestore بدون اتکا به RAM فرآیند و بدون هیچ سقف حذفی ۵۰۰ گفت‌وگو.
- **اتصال کامل فرانت‌اند به API واقعی**:
  - بازنویسی `commsClientService.ts` برای فراخوانی `/api/v1/conversations*` با توکن Bearer و `Idempotency-Key`، حذف کامل ذخیره‌سازی پیام‌ها در `localStorage` (`radar_comms_workspace_v1`) و حذف دکمه نمایشی `seedDemoData` از مسیر Production.
- **ماتریس آزمون پذیرش**: ۳۰ آزمون `MSGCORE-001` تا `MSGCORE-030` در `tests/scoped-messaging-firestore-stage17.test.ts`.

---

## ۸. مرحله ۱۸: تثبیت معماری واحد اعلان‌ها و ایجاد زیرساخت پایدار Firestore (`RT-SOCIAL-IMPL-018-NOTIFICATION-ORCHESTRATION-DURABLE-CORE`)

### ۸.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **وجود سه پیاده‌سازی موازی برای اعلان‌ها**:
   - **سیستم قدیمی Communications (`server/modules/communications/commsRoutes.ts:56-138` و `commsStore.ts`)**: سوارشده در `server.ts:216` و متکی به `serverCommsEngine.notifications` در حافظه و فایل JSON محلی (`comms-state.json`).
   - **ماژول Notifications نسخه ۲ (`server/modules/notifications/`)**: در `notificationRoutes.ts:53-59` از `defaultNotificationStore` استفاده می‌کند که در `notificationStore.ts:35-40` بر پایه `Map`های درون‌حافظه‌ای است، در `notifications/index.ts:86-94` همگام‌سازی Firestore را به‌طور پیش‌فرض غیرفعال می‌کند، و در `server.ts` سوار نشده است.
   - **ماژول Notification Orchestration (`server/modules/notification-orchestration/`)**: دارای مدل ۱۴گانه دسته‌بندی، Template نسخه‌بندی‌شده، ترجیحات و رضایت، Digest و چرخه Delivery است، اما Router آن (`routes.ts:24-29`) فقط در تست‌ها ساخته شده و در `server.ts` ثبت تولیدی ندارد.
   - **زنگوله سربرگ (`src/features/communications/components/HeaderNotificationBell.tsx:7-12, 59`)**: مستقیماً از `loadCommsWorkspaceState(uid)` در `commsClientService` (`localStorage`) تغذیه می‌شود.
2. **نقص‌های لایه ذخیره‌سازی، رضایت و امنیت در `server/modules/notification-orchestration/service.ts`**:
   - **نبود Transaction Runner واقعی Firestore**: تابع `createInMemoryNotificationOrchestrationTxRunner` (خطوط ۶۷–۱۰۳) فقط روی `Map` کار می‌کند.
   - **نقض قانون Read-before-Write در تراکنش‌ها**: در `service.ts:208-213` تابع `appendIndex` عملیات `await tx.get(indexPath)` انجام می‌دهد، اما در خطوط `332-334`، `595-597`، `903-904`، `947-953` و `978-980` پیش از `appendIndex`، تابع `this.writeDoc(tx, ...)` فراخوانی شده است که در تراکنش واقعی Firestore رد می‌شود.
   - **سقف ۵۰۰ اعلان و خواندن تک‌به‌تک (`appendIndex` و `listIndexed`)**: در خطوط ۲۰۸–۲۲۸، آرایه شناسه‌ها با `.slice(0, 500)` بریده می‌شود و `listIndexed` اسناد را تک‌به‌تک درون تراکنش می‌خواند؛ همچنین `markAllNotificationsAsRead` (خطوط ۱۱۸۸–۱۲۰۹) همه اعلان‌ها را در یک تراکنش واحد به‌روز می‌کند.
   - **تزریق مستقیم کلید Dedup در مسیر سند**: در خطوط ۷۵۷–۷۶۵، `no_dedup/${deduplicationKey}` بدون هش‌کردن کلید استفاده شده است.
   - **رضایت تبلیغاتی و کانال‌های بیرونی پیش‌فرض فعال (`Opt-In Violation`)**: در `buildDefaultPreferences` (خطوط ۲۵۲–۲۸۵)، `promotionalOptInGranted: true` (خط ۲۷۵) و کانال‌های `EMAIL`، `SMS` و `PUSH` همگی `true` هستند.
   - **آداپتور کنترل دسترسی موجودیت نمایشی**: در `createDefaultEntityAccessAuthAdapter` (خطوط ۱۵۷–۱۷۲)، فقط دو شناسه تستی `'prop_restricted_secret'` و `'doc_restricted_secret'` مسدود شده و بقیه موجودیت‌ها بدون بررسی مالکیت `allowed: true` می‌گیرند.
   - **محدودکننده نرخ اضطراری در RAM فرآیند**: در خط ۱۸۳ و خطوط ۷۲۲–۷۳۸، `urgentRateCounter` یک `Map` محلی در حافظه فرآیند است.
   - **نبود مکانیزم Lease در تلاش‌های تحویل و شبیه‌سازی تحویل موفق با Sandbox Provider**: در خطوط ۱۲۶–۱۵۵ و ۱۸۸–۱۹۳، به‌طور پیش‌فرض `createSandboxChannelDeliveryAdapter` برای همه کانال‌ها ساخته می‌شود که تحویل موفق ساختگی گزارش می‌کند و در خطوط ۱۰۱۰–۱۱۱۸ هیچ مکانیزم Lease/Revision برای جلوگیری از ارسال تکراری توسط دو Worker هم‌زمان وجود ندارد.

### ۸.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۸
- **واگذاری مالکیت رسمی دامنه اعلان‌ها (`Canonical Domain Owner`)**:
  - انتخاب `server/modules/notification-orchestration/` (`NotificationOrchestrationService`) به عنوان مالک واحد دامنه اعلان‌ها روی ۸ کالکشن مرجع Firestore: `no_notifications`، `no_dedup` (`no_dedup/${sha256(deduplicationKey)}`)، `no_preferences`، `no_templates`، `no_delivery_attempts`، `no_digest_batches`، `no_announcements` و `no_rate_limits` (`no_rate_limits/urgent_${recipientUid}`).
- **پیاده‌سازی `firestoreTransactionRunner.ts` و `notificationReadRepository.ts`**:
  - پیاده‌سازی `createFirestoreNotificationTxRunner()` متصل به `getFirebaseAdminFirestoreForServer` با رفتار **Fail-Closed** (`503 PERSISTENCE_FAILED`)، بافر کردن تمام Writeها در حافظه تراکنش (`staged`) و اجرای آن‌ها پس از پایان تمام Readها برای رعایت کامل Read-before-Write در Firestore، همراه با خواندن وضعیت Staged در صورت Read مجدد همان سند.
  - حذف سقف ۵۰۰تایی `appendIndex`/`listIndexed` برای صندوق کاربر و جایگزینی با کوئری مستقیم Firestore در `NotificationReadRepository` با صفحه‌بندی Cursor-based (`limit` پیش‌فرض ۲۵ و حداکثر ۵۰، ترتیب `createdAtIso DESC, notificationId DESC`، مقید به `uid` و فیلترها) و اجرای `markAllNotificationsAsRead` در صفحات و Batchهای حداکثر ۴۰۰تایی.
- **اصلاح سیاست رضایت پیش‌فرض (`Privacy & Consent by Default`)**:
  - تغییر `promotionalOptInGranted` پیش‌فرض به `false`؛ فعال بودن فقط `IN_APP: true` به‌طور پیش‌فرض و غیرفعال بودن `EMAIL: false`، `SMS: false` و `PUSH: false` تا زمان فعال‌سازی صریح، ثبت رضایت، وجود مقصد معتبر و آماده بودن Provider واقعی.
- **کنترل دسترسی Fail-Closed به موجودیت‌ها و درگاه مجاز رویداد (`authorizedNotificationPublisher.ts`)**:
  - اجباری بودن `entityAuthAdapter` واقعی در `productionFactory.ts` (رد ارسال اعلان دارای Deep Link در نبود Resolver معتبر یا عدم دسترسی گیرنده با کد `403`) و مسدودسازی ساخت اعلان دلخواه توسط کلاینت از طریق `authorizedNotificationPublisher.ts`.
- **چرخه تحویل مبتنی بر Lease و منع Sandbox در Production**:
  - افزودن `leaseOwnerId`، `leaseExpiresAtIso`، `revision` و `lastProviderRequestKey` به `ChannelDeliveryAttemptRecord`؛ ممنوعیت استفاده از Sandbox Provider در Production (فعال بودن فقط کانال `IN_APP` در این مرحله و عدم گزارش `DELIVERED` ساختگی برای کانال‌های بدون Provider واقعی).
- **جداسازی از مرحله ۱۹ (`Non-Destructive Feature Flag Staging`)**:
  - سوار شدن آزمایشی تحت Feature Flag `NOTIFICATION_ORCHESTRATION_ENABLED=false` روی مسیر `/api/v1/notifications-orchestration` بدون دستکاری `/api/v1/notifications`، `HeaderNotificationBell.tsx` یا فایل‌های Legacy تا اجرای مهاجرت کنترل‌شده در مرحله ۱۹ (`RT-SOCIAL-IMPL-019`).
- **ماتریس آزمون پذیرش**: ۳۰ آزمون `NOTIFCORE-001` تا `NOTIFCORE-030` در `tests/notification-orchestration-production-core.test.ts` و `tests/notification-orchestration-firestore.emulator.test.ts`.

---

## ۹. مرحله ۱۹: مهاجرت تاریخچه اعلان‌ها و انتقال API و رابط کاربری به Notification Orchestration (`RT-SOCIAL-IMPL-019-NOTIFICATION-LEGACY-MIGRATION-API-UI-CUTOVER`)

> **شرط بازدارنده (`Gate Condition`)**: اجرای مرحله ۱۹ وابسته به تکمیل واقعی و تأیید مرحله ۱۸ است و نباید داده‌های Conversation مرحله ۱۷ را در `comms-state.json` یا `radar_comms_workspace_v1` حذف کند.

### ۹.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **مسیرهای فعال `/api/v1/notifications*` روی Engine قدیمی**:
   - در `server/modules/communications/commsRoutes.ts:56-138`، ۹ مسیر (`GET /api/v1/notifications`، `GET /unread-count`، `GET /preferences`، `PATCH /preferences`، `POST /read-all`، `GET /:id`، `POST /:id/read`، `POST /:id/archive`، `POST /:id/dismiss`) مستقیماً از `serverCommsEngine` می‌خوانند و می‌نویسند.
2. **محدودیت Snapshot فایل محلی**:
   - در `server/modules/communications/commsRepository.ts:11-22, 56-71`، Snapshot در `comms-state.json` با سقف‌های ثابت (`notifications: 1500`، `devices: 500`، `deliveries: 2000`، `deadLetters: 500`، `conversations: 500`، `reports: 500`، `audits: 1000`) ذخیره می‌شود. فایل `/.cache/repositories/comms-state.json` در مخزن دارای ۰ رکورد است (اما محیط Production باید در زمان مهاجرت با Preflight بررسی شود).
3. **عدم جداسازی مالکیت UID در `radar_comms_workspace_v1`**:
   - در `src/features/communications/services/commsClientService.ts:9, 132-137`، کلید `radar_comms_workspace_v1` با `readAccountJson` (`src/features/account/services/accountSettingsStorageService.ts:39-54`) بدون دامنه UID خوانده می‌شود و حاوی داده‌های `local-user` و Seed است؛ بنابراین **هرگونه مهاجرت خودکار از LocalStorage به سرور ممنوع است**.
4. **وابستگی کامپوننت‌های UI به ذخیره‌ساز محلی و UID ساختگی**:
   - `src/components/navigation/ProductGlobalHeader.tsx:207-211` مقدار `currentUser?.uid || 'local-user'` را به `HeaderNotificationBell` می‌دهد.
   - `src/features/communications/components/HeaderNotificationBell.tsx:7-12, 59-72, 115-120, 187-205`، `src/features/account/components/AccountNotificationsPanel.tsx:8-17, 60-85`، `src/features/communications/components/AccountCommsPreferencesPanel.tsx:6-10, 50-186` و `src/features/admin/components/AdminCommunicationsPanel.tsx:10-35` (`replayDeadLetterClient`) به توابع محلی `commsClientService` متصل هستند.

### ۹.۲ تصمیم‌های معماری قفل‌شده مرحله ۱۹
- **ابزار مهاجرت دوگانه (`plan-legacy-comms-notifications.ts` و `apply-legacy-comms-notifications.ts`)**:
  - تولید گزارش بدون PII در `reports/migrations/notifications-v1-preflight.json`؛ توقف مهاجرت در صورت تغییر SHA-256 منبع یا برخورد Payload Hash؛ شناسه قطعی `ntf_legacy_${sha256("comms-state:" + legacyNotification.id).slice(0, 32)}`؛ عدم ارسال مجدد کانال‌های بیرونی (`deliveredChannels: ['IN_APP']` بدون ساخت Delivery Attempt جدید)؛ مسدودسازی رکوردهای `local-user` و Seed.
- **نگاشت صریح ۱۸ کد رویداد و حفظ وضعیت‌های `DISMISSED` و `EXPIRED` (`legacyNotificationMapper.ts`)**:
  - افزودن `'DISMISSED'` به `InAppReadStatus` و افزودن `LegacyNotificationProvenance`، `dismissedAtIso` و `requiresUserAction` به `UnifiedNotificationRecord`.
  - انتقال Preferences بدون Overwrite کردن رکورد موجود در `no_preferences/{uid}` و الزام اثبات سروری `MARKETING_UPDATES` (`granted === true`, `updatedAtIso`, `sourceFa`) برای `promotionalOptInGranted`.
- **روتر سازگاری V1 (`legacyNotificationCompatibilityRouter.ts`) و اتصال کامل UI (`notificationApiClient.ts`)**:
  - جایگزینی ۹ مسیر `/api/v1/notifications*` در `server.ts` با سرویس مرجع `NotificationOrchestrationService` (و حذف آن‌ها از `commsRoutes.ts:56-138` با حفظ مسیرهای Conversation برای مرحله ۱۷).
  - اتصال `HeaderNotificationBell` (بدون `'local-user'`)، `AccountNotificationsPanel`، `AccountCommsPreferencesPanel` و `AdminCommunicationsPanel` (حذف `replayDeadLetterClient` محلی) به `notificationApiClient.ts`.
- **ماتریس آزمون پذیرش**: ۳۶ آزمون `NOTIFCUT-001` تا `NOTIFCUT-036` در `tests/legacy-notification-migration.test.ts`، `tests/notification-api-cutover.test.ts`، `tests/notification-ui-api-integration.test.ts` و `tests/legacy-notification-migration.emulator.test.ts`.

---

## ۱۰. مرحله ۲۰: زیرساخت Transactional Domain Event Outbox و اتصال تولیدکنندگان موج اول (`RT-SOCIAL-IMPL-020-DOMAIN-EVENT-OUTBOX-PRODUCERS`)

### ۱۰.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
- در نسخه فعلی، چهار دامنه موج اول دارای نقاط تولید رویداد هستند اما هیچ‌کدام از Outbox تراکنشی مشترک استفاده نمی‌کنند:
  1. **Property Management (`server/modules/property-management/durableStoreHelpers.ts:279-305` و ۱۳ نقطه فراخوانی)**: فراخوانی مستقیم Adapter اعلان در داخل تراکنش منبع.
  2. **Customer Support (`server/modules/customer-support/service.ts:482, 805, 1359, 1858`)**: پیش‌فرض ساختگی `delivered: true` و ارسال خارج از تراکنش.
  3. **Marketplace Billing (`server/modules/marketplace-billing/service.ts:1266, 1482, 2506`)**: ارسال اعلان پس از Commit و استفاده از Adapter پیش‌فرض ساختگی.
  4. **Customer Experience (`server/modules/customer-experience/service.ts:2032-2040`)**: فراخوانی اعلان پیش از ثبت نهایی اجرای Saved Search همراه با شناسه ساختگی.
- همچنین `NotificationOrchestrationService.orchestrateDomainEvent` (`server/modules/notification-orchestration/service.ts:694`) فاقد کاتالوگ سخت‌گیرانه برای اعتبارسنجی ترکیب `sourceDomain + eventType + category + templateId` است.

### ۱۰.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۰ (وابسته به مرحله ۱۸)
- ایجاد قرارداد `NotificationOutboxEnqueuer` در `server/modules/core/notificationOutboxContracts.ts`، پیاده‌سازی Outbox تراکنشی در `server/modules/notification-orchestration/domainNotificationOutbox.ts` روی کالکشن `no_domain_event_outbox` و تعریف کاتالوگ صریح رویدادها در `server/modules/notification-orchestration/domainEventCatalog.ts`.
- ثبت اتمیک رویداد دامنه در همان تراکنش تغییر موجودیت مبدأ و تحویل ناهمگام توسط Worker به `NotificationOrchestrationService` بدون هیچ تماس شبکه‌ای یا شبیه‌سازی تحویل درون تراکنش دامنه.

---

## ۱۱. مرحله ۲۱: اتصال تراکنشی چرخه بازدید ملک به Notification Outbox مرجع (`RT-SOCIAL-IMPL-021-PROPERTY-VIEWINGS-TRANSACTIONAL-OUTBOX`)

> **شرط بازدارنده (`Gate Condition`)**: اجرای مرحله ۲۱ وابسته به تکمیل و تأیید مراحل ۱۸ و ۲۰ است و صرفاً ماژول `server/modules/property-viewings/` را پوشش می‌دهد (بدون ساخت Route عمومی جدید در `server.ts` و بدون ورود به `Property Tax`، `Dispute Resolution`، `Property Permits`، `Brokerage` یا `Leads`).

### ۱۱.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **Adapter شبیه‌ساز اعلان با پاسخ ساختگی `ACCEPTED_BY_PROVIDER`**:
   - در `server/modules/property-viewings/adapters.ts:27-35, 79-86`، قرارداد `ViewingsNotificationsAdapter` و پیاده‌سازی پیش‌فرض آن بدون ارتباط با هیچ سرویسی، `stage: 'ACCEPTED_BY_PROVIDER'` و `providerReferenceId: "notif_req_" + params.appointmentId + "_" + Date.now()` برمی‌گرداند.
2. **پنج نقطه تولید اعلان واقعی در `server/modules/property-viewings/appointmentAndBookingService.ts`**:
   - تابع `emitNotificationEvent` (خطوط ۲۰–۳۴) در ۵ نقطه فراخوانی می‌شود:
     - خط ۱۲۹: `VIEWING_REQUESTED` -> گیرنده `hostUserId`
     - خط ۲۲۹: `VIEWING_CONFIRMED` -> گیرنده `requestingUserId`
     - خط ۲۹۶: `PARTICIPANT_INVITATION_RECEIVED` -> گیرنده `participantId`
     - خط ۳۷۷: `VIEWING_RESCHEDULED` -> گیرنده `requestingUserId`
     - خط ۴۱۵: `VIEWING_CANCELLED` -> گیرنده `hostUserId`
3. **غیرتراکنشی بودن عملیات Firestore در `firestoreStore.ts` و `appointmentAndBookingService.ts`**:
   - در `server/modules/property-viewings/store.ts:13-15` و `server/modules/property-viewings/firestoreStore.ts:35-37`، متد `runExclusiveBookingTransaction(fn)` هیچ `TransactionContext` به `fn` پاس نمی‌دهد و متدهای `saveSlotHold` (`خطوط ۵۵–۵۶`)، `saveAppointment` (`خطوط ۷۳–۷۵`)، `appendNotificationEvent` (`خطوط ۱۵۳–۱۵۵`) و `saveIdempotencyAppointmentId` (`خطوط ۱۶۹–۱۷۴`) مستقیماً `this.db.collection(...).doc(...).set(...)` را خارج از تراکنش فراخوانی می‌کنند.
   - عملیات `createViewingRequest` (`خطوط ۵۵–۱۳۱`)، `inviteParticipant` (`خطوط ۲۵۸–۲۹۸`) و `cancelAppointment` (`خطوط ۳۸۱–۴۱۷`) نیز خارج از تراکنش واحد اجرا می‌شوند.

### ۱۱.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۱
- **قرارداد تراکنشی واقعی (`PropertyViewingsUnitOfWork`)**:
  - جایگزینی `runExclusiveBookingTransaction` با `runTransaction(work: (tx: PropertyViewingsUnitOfWork) => Promise<T>)` که در `FirestorePropertyViewingsStore` تمام Readها و Writeها را از طریق `nativeTx` انجام می‌دهد و `notificationTransaction: TransactionContextLike` را در اختیار `NotificationOutboxEnqueuer.enqueue` قرار می‌دهد (با رعایت کامل Read-before-Write).
- **قفل تراکنشی رزرو روز/منبع (`property_viewings_booking_locks/{lockId}`)**:
  - ایجاد قفل رقابت با شناسه `sha256("${resourceType}|${resourceId}|${utcDateKey}")` برای دو منبع `HOST` و `PROPERTY` جهت جلوگیری از Overbooking و Race Condition میان Instanceهای مستقل در عملیات تأیید، تغییر زمان و لغو.
- **ثبت ۵ رویداد مجاز در `domainEventCatalog.ts` با کمینه‌سازی داده (`PII Minimization`)**:
  - ثبت رویدادهای `property.viewing.requested`، `property.viewing.confirmed`، `property.viewing.participant_invited`، `property.viewing.rescheduled` و `property.viewing.cancelled` با `sourceDomain: 'EMP_57_BROKERAGE_AGENT'`، `category: 'PROPERTY_AVAILABILITY_CHANGES'` و قالب `tpl_property_viewing_event`.
  - منع ارسال `locationOrMeetingSummary`، `specialRequirements`، دستورالعمل‌های دسترسی، فهرست شرکت‌کنندگان و اطلاعات تماس در متغیرهای اعلان.
- **شناسه قطعی قرار بازدید و رویدادها**:
  - ساخت شناسه قرار از `vappt_${sha256(actor.userId + ":" + idempotencyKey).slice(0, 32)}` (پاسخ `409` در صورت تغییر Payload با همان کلید) و کلید Idempotency رویداد از `appointment.id|appointment.version|eventType|recipientUid`.
  - حذف کامل `ViewingsNotificationsAdapter` و بازخوانی تاریخچه اعلان‌های جدید از Outbox مرجع (نگهداری `property_viewings_notification_events` قدیمی به‌صورت فقط-خواندنی).
- **ماتریس آزمون پذیرش**: ۲۶ آزمون `VIEWOUT-001` تا `VIEWOUT-026` در `tests/property-viewings-notification-outbox.test.ts` و `tests/property-viewings-transactional-booking.emulator.test.ts` به‌همراه ۳۲ آزمون رگرسیون موجود در `server/modules/property-viewings/__tests__/propertyViewings.test.ts`.



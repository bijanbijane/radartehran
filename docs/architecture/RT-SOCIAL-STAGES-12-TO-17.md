# مشخصات معماری و قراردادهای مراحل ۱۲ تا ۲۹ هسته اجتماعی، پیام‌رسانی، اعلان‌ها، Outbox رویدادها و مخازن پایدار رادار تهران (`RT-SOCIAL-IMPL-012` تا `RT-SOCIAL-IMPL-029`)

- **سند مرجع**: مکمل [`RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md`](./RT-SOCIAL-IMPLEMENTATION-BASELINE-001.md) و [`RT-SOCIAL-GAP-AND-CONVERGENCE-AUDIT.md`](./RT-SOCIAL-GAP-AND-CONVERGENCE-AUDIT.md)
- **اثر انگشت مخزن مرجع (`[Observed Fact]`)**:
  - `SHA-256`: `29f478df9dfd272300fcd7db499ed848573fcd0a0780fcdd782cf26edd2e2079` (`ZIP entries: 3044`، `libfile_685ab25df3948191b9dda4ad5dcc32c9`)
  - پروژه Firebase: `gen-lang-client-0713157837`
  - پایگاه‌داده Firestore: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
- **وضعیت صداقت اجرایی (`CASPER Epistemic Discipline`)**:
  - تمامی مراحل ۱۲ تا ۲۹ در وضعیت **`designed` («تدوین و ثبت شد — اجرا و تأیید: انجام نشده»)** ثبت شده‌اند و تا زمان پیاده‌سازی کد و اجرای آزمون‌های پذیرش متناظر روی Firestore Emulator و گیت‌های معماری، هیچ‌یک `implemented`، `verified` یا `accepted` اعلام نمی‌شوند.

---

## ۱. جدول خلاصه وضعیت و وابستگی مراحل ۱۲ تا ۲۹ (`Master Stage Ledger`)

| مرحله | شناسه رسمی (`Stage ID`) | عنوان انگلیسی | اولویت | پیش‌نیاز و گیت وابستگی | مجموعه آزمون پذیرش | وضعیت واقعی در مخزن (`[Observed Fact]`) |
| :---: | :--- | :--- | :---: | :--- | :--- | :---: |
| **۱۲** | `RT-SOCIAL-IMPL-012-QA-ANSWER-CANONICAL-INTEGRITY` | Canonical Q&A Answer Lifecycle & Projection Integrity | `P1` | مستقل از مراحل ۱۳–۲۹ | `QAINT-001` تا `QAINT-028` (`28` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۳** | `RT-SOCIAL-IMPL-013-CROWD-DATA-FIRESTORE-TRANSACTIONAL-STORE` | Firestore-First Transactional Crowd Data Store | `P1` | پایه زنجیره Crowd Data v2 | `CDP-001` تا `CDP-022` (`22` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۴** | `RT-SOCIAL-IMPL-014-CROWD-CLAIMS-LEGACY-MIGRATION-PREFLIGHT` | Legacy Crowd Claims Migration Preflight & Semantic Reconciliation | `P1` | فقط-خواندنی؛ پیش‌نیاز مراحل ۱۵ و ۱۶ | `CCMP-001` تا `CCMP-022` (`22` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۵** | `RT-SOCIAL-IMPL-015-CROWD-CONSENSUS-CONTRIBUTOR-DOMAIN` | Weighted Community Feedback & Contributor Trust Domain | `P1` | وابسته به تکمیل مراحل ۱۳ و ۱۴ | `CCV-001` تا `CCV-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۶** | `RT-SOCIAL-IMPL-016-CROWD-CLAIMS-CUTOVER-AND-MIGRATION` | Controlled API Cutover, Legacy Migration & Epistemic Boundary Enforcement | `P1` | **مشروط به تکمیل و تأیید مراحل ۱۳، ۱۴ و ۱۵** | `CCUT-001` تا `CCUT-032` (`32` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۷** | `RT-SOCIAL-IMPL-017-SCOPED-MESSAGING-DURABLE-CORE` | Durable Context-Authorized Messaging Core | `P1` | مستقل از مراحل ۱۳–۱۶ | `MSGCORE-001` تا `MSGCORE-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۸** | `RT-SOCIAL-IMPL-018-NOTIFICATION-ORCHESTRATION-DURABLE-CORE` | Canonical Notification Orchestration & Durable Core | `P1` | پایه زیرساخت اعلان‌ها؛ پیش‌نیاز مراحل ۱۹ تا ۲۲ و ۲۴ | `NOTIFCORE-001` تا `NOTIFCORE-030` (`30` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۱۹** | `RT-SOCIAL-IMPL-019-NOTIFICATION-LEGACY-MIGRATION-API-UI-CUTOVER` | Legacy Notification Migration & Canonical API/UI Cutover | `P1` | **مشروط به تکمیل واقعی مرحله ۱۸** (و عدم تخریب Conversationهای مرحله ۱۷) | `NOTIFCUT-001` تا `NOTIFCUT-036` (`36` آزمون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۰** | `RT-SOCIAL-IMPL-020-DOMAIN-EVENT-OUTBOX-PRODUCERS` | Transactional Domain Event Outbox & Wave-1 Producers | `P1` | وابسته به مرحله ۱۸؛ پیش‌نیاز مراحل ۲۱، ۲۲ و ۲۴ | Outbox + ۴ تولیدکننده موج اول (`Property Mgmt`, `Support`, `Billing`, `CX`) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۱** | `RT-SOCIAL-IMPL-021-PROPERTY-VIEWINGS-TRANSACTIONAL-OUTBOX` | Property Viewing Lifecycle Atomic Outbox Integration | `P1` | **وابسته به تکمیل مراحل ۱۸ و ۲۰** | `VIEWOUT-001` تا `VIEWOUT-026` (`26` آزمون جدید + `32` تست رگرسیون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۲** | `RT-SOCIAL-IMPL-022-PROPERTY-PERMITS-STANDING-TRANSACTIONAL-DEADLINE-OUTBOX` | Permit Applicant Standing, Atomic Application Submission & Deadline Outbox | `P1` | **وابسته به تکمیل مراحل ۱۸ و ۲۰** (و احراز سمت از `property-rights`) | `PERMITINT-001` تا `PERMITINT-034` (`34` آزمون جدید + `30` تست رگرسیون) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۳** | `RT-SOCIAL-IMPL-023-PROPERTY-TAX-FIRESTORE-DURABLE-CORE` | Property Tax Firestore Durable Core & Production Adapter Hardening | `P1` | پایه پایدار ماژول `property-tax`؛ پیش‌نیاز سخت مراحل ۲۴ و ۲۵ | `PTSTORE-001` تا `PTSTORE-030` (`30` آزمون جدید + تست‌های رگرسیون موجود) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۴** | `RT-SOCIAL-IMPL-024-PROPERTY-TAX-PAYMENT-INTEGRITY-AND-DEADLINE-OUTBOX` | Property Tax Payment Reconciliation & Deadline Reminder Outbox | `P1` | **وابستگی سخت به تکمیل و تأیید مرحله ۲۳**؛ پیش‌نیاز سخت مرحله ۲۵ | `PTPAY-001..014` و `PTDL-001..014` (`28` آزمون پذیرش) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۵** | `RT-SOCIAL-IMPL-025-PROPERTY-TAX-PRODUCTION-API-INTEGRATION` | Property Tax Production API Integration, Actor Resolver & Route Catalog | `P1` | **وابستگی سخت به تکمیل و تأیید واقعی مراحل ۲۳ و ۲۴** (در حال حاضر **BLOCKED**) | `PTAPI-001..036` (`36` آزمون پذیرش در ۶ گروه) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۶-الف** | `RT-SOCIAL-IMPL-026-PROPERTY-RIGHTS-ATOMIC-LEDGER-AND-IDEMPOTENCY` | Property Rights Atomic Ledger & Durable Idempotency | `P0 / P1` | مستقل از اتصال تولیدی `property-tax`؛ پایه یکپارچگی دفتر مالکیت (`property-rights`) | `PRTX-001` تا `PRTX-032` (`32` آزمون پذیرش + تست‌های رگرسیون دامنه) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۶-ب** | `RT-SOCIAL-IMPL-026-LEADS-CRM-ZERO-TRUST-AUTHORIZATION` | Leads CRM Zero-Trust Authorization, Server-Side Role Resolution & IDOR Closure | `P0` *(امنیتی)* | مستقل از مراحل ۲۳–۲۵؛ پیش‌نیاز غیرقابل‌حذف پیش از هرگونه Mount در `server.ts` | `LEAD-AUTH-001..030` (`30` آزمون امنیتی مستقل + رگرسیون CRM) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۷-الف** | `RT-SOCIAL-IMPL-027-PROPERTY-FINANCING-FIRESTORE-DURABLE-CORE` | Property Financing Firestore Durable Core & Transactional Idempotency | `P1` | پایه پایدار ماژول `property-financing`؛ پیش‌نیاز سخت مراحل Integration و API این ماژول | `PFSTORE-001..012`, `PFIDEM-001..008`, `PFATOMIC-001..012`, `PFSEC-001..008` (`40` آزمون جدید + تست‌های رگرسیون دامنه) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۷-ب** | `RT-SOCIAL-IMPL-027-NOTIFICATION-ORCHESTRATION-PRODUCTION-DURABILITY-FAIL-CLOSED` | Notification Orchestration Firestore Durability, Fail-Closed Runtime & Real Delivery Integrity | `P0` *(پایداری و امنیت)* | مستقل از مراحل ۲۳–۲۶؛ تکمیل‌کننده عملیاتی و سخت‌گیرانه هسته `notification-orchestration` پیش از هرگونه Mount در `server.ts` | `NO-PROD-001..032` (`32` آزمون جدید در ۷ گروه + تست‌های رگرسیون موجود) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۸-الف** | `RT-SOCIAL-IMPL-028-PROPERTY-DUE-DILIGENCE-CANONICAL-RUNTIME-AND-SECURE-API` | Property Due Diligence Canonical Runtime, Bounded Indexing & Secure API | `P0 / P1` | مستقل از مرحله ۲۷؛ یکپارچه‌سازی ۳ مسیر موازی `property-due-diligence` روی `createPropertyDueDiligenceService` | `PDDRT-001..010`, `PDDAPI-001..014`, `PDDAUTH-001..008`, `PDDTX-001..008` (`40` آزمون جدید + تست‌های معتبر موجود) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۸-ب** | `RT-SOCIAL-IMPL-028-NOTIFICATION-ORCHESTRATION-SERVICE-DECOMPOSITION` | Notification Orchestration Facade & Cohesive Service Decomposition | `P1` *(بدهی معماری)* | **وابستگی سخت به تکمیل و تأیید واقعی مرحله ۲۷-ب** (فعلاً **BLOCKED** تا تثبیت Persistence و Runtime) | `NO-DECOMP-001..040` (`40` آزمون جدید در ۹ گروه + تست‌های موجود ماژول) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |
| **۲۹** | `RT-SOCIAL-IMPL-029-LEGAL-REGULATORY-DURABLE-TRANSACTIONAL-CORE` | Legal & Regulatory Durable Transactional Core, Fail-Closed & Cursor Pagination | `P0 / P1` | مستقل از مراحل ۲۷ و ۲۸؛ پایه پایدار ماژول `legal-regulatory` و پیش‌نیاز سخت اتصال API این ماژول | `LRSTORE-001..010`, `LRIDEM-001..008`, `LRATOM-001..010`, `LRPAGE-001..008` (`36` آزمون جدید + تست‌های رگرسیون دامنه) | **`designed`** (`تدوین و ثبت شد / اجرا نشده`) |

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

---

## ۱۲. مرحله ۲۲: احراز سمت واقعی متقاضی مجوز، ثبت تراکنشی پرونده و اتصال ضرب‌الاجل‌ها به Notification Outbox (`RT-SOCIAL-IMPL-022-PROPERTY-PERMITS-STANDING-TRANSACTIONAL-DEADLINE-OUTBOX`)

> **شرط بازدارنده (`Gate Condition`)**: اجرای مرحله ۲۲ وابسته به تکمیل و تأیید مراحل ۱۸ و ۲۰ است و صرفاً ماژول `server/modules/property-permits/` را پوشش می‌دهد (بدون سوار کردن Routeهای `property-permits` در `server.ts` و بدون ورود به درگاه پرداخت بیرونی یا استعلام سامانه شهرداری/دولتی بیرونی).

### ۱۲.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **تأیید خودکار و Fail-Open سمت متقاضی در Adapter پیش‌فرض (`server/modules/property-permits/adapters.ts:16-27, 99-131`)**:
   - در `createDefaultPropertyPermitsAdapters` (`خطوط ۹۹–۱۳۱`)، متد `propertyAndOwnership.verifyApplicantStanding` (`خطوط ۱۰۴–۱۱۱`) بدون استعلام از ماژول `server/modules/property-rights/` همیشه `{ propertyExists: true, hasVerifiedOrDocumentedStanding: true, standingSummary: 'Default adapter standing check passed.' }` برمی‌گرداند.
2. **نقص بررسی صلاحیت جغرافیایی مرجع صدور (`server/modules/property-permits/validationAndAuthz.ts:49-83`)**:
   - تابع `assertAuthorityEmpoweredForCategoryAndJurisdiction` تنها در صورتی که `subjectRef.districtCode` ارسال شده باشد محدودیت منطقه را چک می‌کند (`خطوط ۷۱–۸۲`) و فیلد `neighborhoodIdsOrSlugs` تعریف‌شده در `IssuingAuthorityProfile.jurisdiction` را اصلاً بررسی نمی‌کند؛ بنابراین با حذف `districtCode` یا `neighborhoodIdOrSlug` در درخواست می‌توان محدودیت جغرافیایی مرجع صدور را دور زد.
3. **غیرتراکنشی بودن ساخت و ارسال پرونده، Idempotency ناقص و سقف ۵۰ سند در بررسی پرونده تکراری (`server/modules/property-permits/authorityAndApplicationService.ts:133-179, 228-282` و `firestoreStore.ts:91-106`)**:
   - در `createPermitApplication` (`خطوط ۱۳۳–۱۷۹`)، ذخیره پرونده (خط ۱۷۱) و رویداد Audit (خط ۱۷۲) در دو فراخوانی جداگانه بدون تراکنش انجام می‌شوند.
   - در `recordApplicationSubmission` (`خطوط ۲۲۸–۲۸۲`)، کلید `idempotencyKey` اختیاری است و خارج از تراکنش خوانده می‌شود (`خطوط ۲۳۱–۲۳۷`) و هش بدنه (`payloadHash`) بررسی نمی‌شود.
   - متد `findActiveSubmittedApplications` در `firestoreStore.ts:91-106` حداکثر ۵۰ سند پرونده ملک را می‌خواند و در حافظه فیلتر می‌کند و قفل تراکنشی یکتایی ندارد؛ سپس ذخیره پرونده (خط ۲۶۳)، ذخیره کلید Idempotency (خط ۲۶۶) و ثبت Audit (خط ۲۶۹) بدون تراکنش واحد اجرا می‌شوند.
4. **ارسال غیرتراکنشی یادآور ضرب‌الاجل و Adapter پیش‌فرض No-Op (`server/modules/property-permits/inspectionsFeesAndDeadlinesService.ts:300-342` و `adapters.ts:126-130`)**:
   - در `registerDeadline` (`خطوط ۳۰۰–۳۴۲`)، پس از ذخیره ضرب‌الاجل در خط ۳۲۵، تابع `this.adapters.notifications.emitPermitDeadlineReminder` (`خطوط ۳۲۷–۳۴۰`) خارج از تراکنش فراخوانی می‌شود که پیاده‌سازی پیش‌فرض آن در `adapters.ts:126-130` یک تابع خالی (`No-Op`) است.
5. **پیش‌فرض حافظه‌ای در Factory ماژول (`server/modules/property-permits/index.ts:60-72`)**:
   - تابع `createPropertyPermitsModuleFacade` در صورت عدم ارسال `options.useFirestore` به‌طور پیش‌فرض از `new InMemoryPropertyPermitsStore()` و `createDefaultPropertyPermitsAdapters()` استفاده می‌کند.

### ۱۲.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۲
- **اتصال واقعی و Fail-Closed به ماژول `property-rights` (`propertyRightsStandingAdapter.ts`)**:
  - احراز وجود ملک و تطابق دقیق وضعیت حقوقی متقاضی (`OWNER` یا `CO_OWNER` از طریق رکوردهای مالکیت فعال، بدون مناقصه/اختلاف باز `activeDisputeIds.length === 0`، سهم بزرگ‌تر از صفر و وضعیت `VERIFIED | DOCUMENTED`؛ و برای نقش‌های نمایندگی `AUTHORIZED_REPRESENTATIVE | DEVELOPER_WITH_MANDATE | CONTRACTOR_WITH_AUTHORIZATION` از طریق `PermitMandateResolver` متصل به مالک تأییدشده).
  - ذخیره Snapshot بدون PII از احراز سمت (`applicantStandingSnapshot`) در `PermitApplicationRecord` و بازتأیید سمت پیش از انتقال پرونده به وضعیت `SUBMITTED`.
- **تکمیل بررسی صلاحیت جغرافیایی و منع داده آزمایشی در Production**:
  - الزام وجود و تطابق `districtCode` و `neighborhoodIdOrSlug` هرگاه مرجع صدور دارای محدودیت منطقه یا محله باشد؛ رد مراجع صدور دارای `isSyntheticTestFixture === true` در مسیر Production.
- **واحد کار تراکنشی (`PropertyPermitsUnitOfWork`) و قفل یکتایی پرونده فعال (`permit_active_application_keys/{lockId}`)**:
  - افزودن `runTransaction` به `PropertyPermitsStore`، اجباری کردن `idempotencyKey` با بررسی `payloadHash` (`409` در صورت مغایرت بدنه) در کالکشن `permit_idempotency/{keyHash}`.
  - ایجاد سند قفل تراکنشی با شناسه قطعی `sha256("${propertyId}|${permitCategory}|${issuingAuthorityId}")` در کالکشن `permit_active_application_keys` هنگام ارسال پرونده (`SUBMITTED`) و آزادسازی اتمیک آن هنگام انتقال به وضعیت‌های پایانی (`APPROVED`, `REJECTED`, `WITHDRAWN`, `CLOSED`).
- **اتصال اتمیک یادآور ضرب‌الاجل به `NotificationOutboxEnqueuer`**:
  - حل شناسه کاربری گیرنده از طریق `PermitsNotificationRecipientResolver` (با بررسی تعلق طرف گیرنده به پرونده مجوز) و ثبت اتمیک رویدادهای `permit.deadline.due_soon` (`IMPORTANT`) و `permit.deadline.overdue` (`URGENT`) با `sourceDomain: 'EMP_69_PROPERTY_PERMITS'`، `category: 'DOCUMENT_STATUS_UPDATES'` و قالب `tpl_permit_deadline_reminder` درون همان تراکنش ذخیره ضرب‌الاجل (همراه با حذف کامل `notifications.emitPermitDeadlineReminder` از `PropertyPermitsAdapters`).
- **ماتریس آزمون پذیرش**: ۳۴ آزمون جدید `PERMITINT-001` تا `PERMITINT-034` در `tests/property-permits-standing-and-outbox.test.ts` و `tests/property-permits-transactional.emulator.test.ts` به‌همراه ۳۰ آزمون رگرسیون موجود در `server/modules/property-permits/__tests__/propertyPermits.test.ts`.

---

## ۱۳. مرحله ۲۳: تبدیل ماژول مالیات ملک به مخزن پایدار Firestore و حذف Adapterهای ساختگی (`RT-SOCIAL-IMPL-023-PROPERTY-TAX-FIRESTORE-DURABLE-CORE`)

> **محدوده و مرزبندی با مرحله ۲۴**: مرحله ۲۳ صرفاً زیرساخت ذخیره‌سازی Firestore، قرارداد `PropertyTaxStore` / `PropertyTaxUnitOfWork`، کنترل هم‌زمانی (`CAS`)، پایداری Idempotency و حذف Adapterهای موفقیت‌ساز پیش‌فرض در `server/modules/property-tax/` را پوشش می‌دهد (بدون سوار کردن Routeهای `property-tax` در `server.ts`). اصلاح چرخه تأیید پرداخت مالیاتی و اتصال یادآور ضرب‌الاجل‌های مالیاتی به `no_domain_event_outbox` به مرحله ۲۴ (`RT-SOCIAL-IMPL-024`) موکول شده است.

### ۱۳.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **نگهداری تمام ۱۳ موجودیت مالیاتی و Idempotency در `Map` حافظه و نبود `firestoreStore.ts`**:
   - در پوشه `server/modules/property-tax/` هیچ فایلی به نام `firestoreStore.ts` وجود ندارد و در `server/modules/property-tax/HANDOFF.md:24-30` ساخت کالکشن‌ها، قوانین و ایندکس‌های Firestore و اتصال Adapterها به عنوان کار باقی‌مانده اعلام شده است.
   - در `server/modules/property-tax/store.ts:115-130`، کلاس `TransactionalPropertyTaxStore` هر ۱۳ مجموعه (`authorities`, `taxRecords`, `assessments`, `obligations`, `bills`, `municipalCharges`, `payments`, `deadlines`, `exemptions`, `disputes`, `partyRelationships`, `documents`, `history`) و همچنین `idempotencyRegistry` را صرفاً در حافظه فرآیند نگه می‌دارد.
2. **شبیه‌سازی سطحی Transaction بدون `db.runTransaction` (`server/modules/property-tax/store.ts:146-184`)**:
   - متد `runTransaction` فقط یک کپی سطحی (`new Map(...)`) از نقشه‌های داخل RAM می‌گیرد و در صورت خطا آن‌ها را بازمی‌گرداند؛ هیچ تراکنش واقعی Firestore یا قفل هم‌زمانی میان پروسه‌ها وجود ندارد.
3. **پنج Adapter پیش‌فرض موفقیت‌ساز ساختگی (`server/modules/property-tax/store.ts:50-80`)**:
   - تابع `createDefaultPropertyTaxAdapters` در مسیر پیش‌فرض بدون استعلام واقعی:
     - `propertyRegistry` (خطوط ۵۲–۵۵): هر شناسه ملک غیرخالی که با `'invalid-'` شروع نشود را معتبر می‌داند.
     - `legalRegulatory` (خطوط ۵۷–۶۰): هر مرجع قانونی که با `'invalid-'` شروع نشود را معتبر می‌داند.
     - `payments` (خطوط ۶۲–۶۸): صرفاً هر رشته‌ای که با پیشوند `'confirmed-'` شروع شود را پرداخت تأییدشده (`confirmed: true, authorityReceiptRef: "AUTH-RCPT-..."`) اعلام می‌کند (مانند `'confirmed-pay-101'` در `propertyTax.test.ts:316-328`).
     - `media` (خطوط ۷۰–۷۳): هر شناسه رسانه که با `'missing-'` شروع نشود را موجود فرض می‌کند.
     - `notifications` (خطوط ۷۵–۷۸): هر ضرب‌الاجلی که با `'undelivered-'` شروع نشود را تحویل‌شده (`delivered: true`) گزارش می‌کند.
4. **انتخاب خودکار Store حافظه‌ای و Adapterهای ساختگی در Factory (`server/modules/property-tax/index.ts:24-36`)**:
   - تابع `createPropertyTaxModuleFacade` در صورت عدم ارسال `options?.store` یا هر یک از ۵ Adapter، به‌طور خودکار `new TransactionalPropertyTaxStore()` و `createDefaultPropertyTaxAdapters()` را جایگزین می‌کند.
5. **فراخوانی‌های Sync در کنترل دسترسی و گزارش‌گیری**:
   - تابع `assertPropertyTaxAccess` در `authorityTaxRecordAndAssessmentService.ts:25-51` و متدهای گزارش‌گیری مانند `retrieveTaxReportingSummary` در `exemptionDisputeAndReportingService.ts:414-445` به‌صورت Sync از حافظه می‌خوانند.

### ۱۳.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۳
- **قرارداد Async مخزن (`PropertyTaxStore` و `PropertyTaxUnitOfWork`) و `FirestorePropertyTaxStore`**:
  - پیاده‌سازی `FirestorePropertyTaxStore` در `server/modules/property-tax/firestoreStore.ts` متصل به `getFirebaseAdminFirestoreForServer` با اجرای تمام Readها و Writeهای تراکنشی درون `this.db.runTransaction`، رعایت سخت‌گیرانه Read-before-Write، کنترل نسخه و هم‌زمانی (`CAS` با کد `409 CONCURRENCY_CONFLICT`) و ثبت اتمیک رکورد، تاریخچه (`property_tax_history`) و کلید Idempotency.
  - بازطراحی کامل متدهای `AuthorityTaxRecordAndAssessmentService`، `ObligationBillPaymentAndDeadlineService`، `ExemptionDisputeAndReportingService` و `assertPropertyTaxAccess` به قرارداد Async و صفحه‌بندی کامل کوئری‌های ملک بدون حذف خاموش رکوردها در سقف ۵۰ یا ۵۰۰ سند (با حفظ اصل دامنه: نبود رکورد مالیاتی به معنای بدهی صفر نیست).
- **پشتیبانی از ۱۴ کالکشن Firestore، قوانین امنیتی و ایندکس‌ها**:
  - ثبت ۱۳ کالکشن دامنه (`property_tax_authorities`, `property_tax_records`, `property_tax_assessments`, `property_tax_obligations`, `property_tax_bills`, `property_municipal_charges`, `property_tax_payments`, `property_tax_deadlines`, `property_tax_exemptions`, `property_tax_disputes`, `property_tax_parties`, `property_tax_documents`, `property_tax_history`) به همراه کالکشن چهاردهم `property_tax_idempotency_keys/{hashedKey}` (با ساختار `PropertyTaxIdempotencyRecord` شامل `payloadHash` و پاسخ `409` در صورت تغییر بدنه) با قوانین صریح Backend-only (`allow read, write: if false;`) در `firestore.rules`، `firebase-blueprint.json` و `firestore.indexes.json`.
- **جداسازی کامل Factory تولیدی از تستی و Fail-Closed شدن Adapterها**:
  - ایجاد `createPropertyTaxProductionModule` در `server/modules/property-tax/index.ts` که وجود `store: PropertyTaxStore` و هر ۵ Adapter واقعی را اجباری می‌کند؛ در صورت عدم پیکربندی هر Adapter در محیط Production، خطای Fail-Closed با کد `503 PROPERTY_TAX_ADAPTER_NOT_CONFIGURED` صادر می‌شود.
  - انتقال Store حافظه‌ای (با Deep Clone و تشخیص Read-after-Write) و Adapterهای تستی به `createInMemoryPropertyTaxStoreForTests()`، `createTestPropertyTaxAdapters()` و `createInMemoryPropertyTaxModuleForTests()` صرفاً برای محیط تست.
- **ماتریس آزمون پذیرش**: ۳۰ آزمون جدید `PTSTORE-001` تا `PTSTORE-030` در `tests/property-tax-firestore-store.test.ts` و `tests/property-tax-firestore-store.emulator.test.ts` به‌همراه حفظ قبولی کامل تست‌های دامنه در `server/modules/property-tax/__tests__/propertyTax.test.ts`.

---

## ۱۴. مرحله ۲۴: یکپارچگی پرداخت مالیاتی و اتصال مهلت‌ها به Outbox اعلان‌ها (`RT-SOCIAL-IMPL-024-PROPERTY-TAX-PAYMENT-INTEGRITY-AND-DEADLINE-OUTBOX`)

> **شرط بازدارنده (`Hard Dependency Gate`)**: اجرای مرحله ۲۴ وابستگی سخت به تکمیل و تأیید مرحله ۲۳ (`RT-SOCIAL-IMPL-023-PROPERTY-TAX-FIRESTORE-DURABLE-CORE`) با گزارش تست و شواهد Firestore Emulator دارد و بدون بازطراحی مجدد Persistence مرحله ۲۳ اجرا می‌شود.

### ۱۴.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **خطر ثبت اشتباه مبلغ پرداخت و Lost Update در پرداخت‌های هم‌زمان (`server/modules/property-tax/obligationBillPaymentAndDeadlineService.ts:354-402, 427-445`)**:
   - در `recordPaymentStatusReference`، خواندن `obligation` (خط ۳۵۴)، بررسی `idempotencyKey` (خطوط ۳۶۰–۳۶۴) و استعلام تأیید پرداخت از `this.adapters.payments.verifyAuthoritativePaymentConfirmation` (خطوط ۳۹۱–۳۹۳) همگی **پیش از شروع تراکنش** (`this.store.runTransaction` در خط ۴۰۴) انجام می‌شوند.
   - در داخل تراکنش (خطوط ۴۲۷–۴۴۵)، مبلغ پرداخت از `input.amountRials` (خط ۴۳۲: `const newPaidTotal = obligation.confirmedPaidAmountRials + input.amountRials;`) محاسبه می‌شود نه از `verification.confirmedAmountRials`، و از شیء قدیمی `obligation` خوانده‌شده پیش از تراکنش استفاده می‌شود که در پرداخت‌های هم‌زمان موجب Lost Update و ثبت مبلغ مغایر با تأییدیه مرجع پرداخت می‌گردد.
2. **ارسال یادآور پیش از ثبت تراکنشی مهلت مالیاتی (`server/modules/property-tax/obligationBillPaymentAndDeadlineService.ts:497-531`)**:
   - در `recordTaxDeadline`، ابتدا در خطوط ۴۹۷–۵۰۵ متد `this.adapters.notifications.dispatchTaxDeadlineReminder(deadlineId, input.dispatchReminderForPartyId)` فراخوانی می‌شود و تازه در خط ۵۰۷ تراکنش ذخیره `deadline` آغاز می‌گردد؛ بنابراین در صورت شکست تراکنش، یادآور برای مهلتی که ثبت نشده ارسال شده است و فیلد `reminderConfirmedByNotificationsModule` نیز پیش از تحویل واقعی مقداردهی می‌شود.
3. **اتکای `durableNotificationStore.ts` به Journal محلی (`server/modules/notifications/durableNotificationStore.ts:99-117`)**:
   - کلاس `FirestoreAndJournalNotificationStore` از فایل محلی `.cache/notifications-outbox-journal.v1.json` و همگام‌سازی اختیاری Firestore استفاده می‌کند و نمی‌تواند جایگزین ثبت اتمیک رویداد یادآور در همان تراکنش دیتابیس مالیاتی شود.

### ۱۴.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۴
- **تطبیق مبلغ پرداخت با مرجع تأیید و ثبت اتمیک درون تراکنش**:
  - انتقال خواندن `Obligation` و بررسی کلید Idempotency (همراه با `payloadHash`) به داخل تراکنش `PropertyTaxUnitOfWork`، کنترل `version` (`CAS`) برای جلوگیری از Lost Update در پرداخت‌های هم‌زمان، تطبیق اجباری مبلغ ثبت‌شده با `verification.confirmedAmountRials`، جلوگیری از ثبت مجدد یک `externalPaymentsModuleRef`، و Commit اتمیک `Payment + Obligation + History + Idempotency`.
- **ایجاد Outbox تراکنشی مهلت‌های مالیاتی (`property_tax_deadline_outbox`) و Worker مستقل**:
  - ثبت اتمیک سند یادآور در کالکشن اختصاصی `property_tax_deadline_outbox` (بدون استفاده از `socialOutbox`) در همان تراکنش ثبت یا اصلاح `TaxDeadlineRecord` در `deadlineReminderOutbox.ts` با وضعیت‌های `QUEUED | PUBLISHED_TO_NOTIFICATION_OUTBOX | SUPPRESSED | RETRY_SCHEDULED | DEAD_LETTER` و لغو خودکار یادآورهای قبلی هنگام اصلاح مهلت.
  - پیاده‌سازی `deadlineReminderWorker.ts` با مکانیزم Lease، Retry، Backoff و انتقال به `DEAD_LETTER`، متصل به رویداد `source: 'PROPERTY_TAX'` و `eventType: 'TAX_DEADLINE_REMINDER_DUE'` با رعایت Consent/Preference گیرنده، حذف کامل اطلاعات حساس مالی/ملکی از متغیرهای اعلان (فقط `deadlineTypeFa` و `dueDateFa`) و تفکیک وضعیت پذیرش ارسال (`PUBLISHED_TO_NOTIFICATION_OUTBOX`) از تأیید واقعی تحویل Provider.
- **ماتریس آزمون پذیرش**: ۲۸ آزمون جدید شامل ۱۴ آزمون یکپارچگی پرداخت (`PTPAY-001` تا `PTPAY-014`) و ۱۴ آزمون Outbox و Reminder (`PTDL-001` تا `PTDL-014`) به‌همراه حفظ قبولی تمام آزمون‌های رگرسیون مرحله ۲۳.

---

## ۱۵. مرحله ۲۵: اتصال کنترل‌شده ماژول مالیات ملک به Backend اصلی، APIهای رسمی، احراز هویت و ثبت در کاتالوگ مسیرها (`RT-SOCIAL-IMPL-025-PROPERTY-TAX-PRODUCTION-API-INTEGRATION`)

> **شرط بازدارنده (`Hard Dependency Gate — BLOCKED`)**: اجرای تولیدی مرحله ۲۵ وابستگی سخت به اجرای واقعی و تأییدشده مراحل ۲۳ (`RT-SOCIAL-IMPL-023-PROPERTY-TAX-FIRESTORE-DURABLE-CORE`) و ۲۴ (`RT-SOCIAL-IMPL-024-PROPERTY-TAX-PAYMENT-INTEGRITY-AND-DEADLINE-OUTBOX`) در کد دارد. تا پیش از عبور واقعی از هر دو پیش‌نیاز، سوار کردن API مالیاتی برای کاربران واقعی ممنوع است.

### ۱۵.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **عدم وجود پیاده‌سازی مراحل ۲۳، ۲۴ و ۲۵ در `server/modules/property-tax/`**:
   - در پوشه `server/modules/property-tax/` همچنان تنها فایل‌های پایه (`types.ts`، `store.ts`، `index.ts`، سه فایل سرویس، `README.md`، `HANDOFF.md` و `__tests__/propertyTax.test.ts`) وجود دارند و هیچ‌یک از فایل‌های `firestoreStore.ts`، `deadlineReminderOutbox.ts`، `deadlineReminderWorker.ts`، `propertyTaxModuleRuntime.ts`، `propertyTaxActorResolver.ts`، `propertyTaxRouteHandlers.ts` و `propertyTaxRoutes.ts` ایجاد نشده‌اند.
   - در `server/modules/property-tax/types.ts:484-498`، نقش `AUTHORITY_VERIFIER_OR_ADMIN` در `PropertyTaxActorRole` به‌صورت ادغام‌شده تعریف شده که در مرحله ۲۵ باید مرز میان مدیر سامانه (`ADMIN`) و مرجع تأیید رسمی مالیاتی تفکیک شود.
2. **سوار نشدن ماژول در `server.ts`**:
   - در `server.ts:212-216`، مسیرهای `Utility`، `SponsorAndBargain`، `BackupAndChunkUpload`، `PublisherAndPlatform`، `AiAndCommerce`، `Community`، `Knowledge`، `Communications`، `GlobalSearchGovernanceAndAnalytics`، `AccountAdmin`، `TrustSafetyV1` و `UnifiedPlatformWave1` ثبت شده‌اند، اما هیچ Import یا ثبتی برای `property-tax` وجود ندارد.
3. **ثبت نشدن قرارداد مسیرها در `src/utils/expressRouteCatalog.ts`**:
   - در `src/utils/expressRouteCatalog.ts` هیچ ثابت منبع `PT` یا مسیری زیر `/api/v1/property-tax/*` ثبت نشده است (مطابق `server/modules/property-tax/HANDOFF.md:24-30`).

### ۱۵.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۵
- **تجزیه ماژولار لایه تولیدی و API (با رعایت سقف ۵۰۰ خط)**:
  - `propertyTaxModuleRuntime.ts`: ساخت تک‌نمونه Production Facade صرفاً از Store مرحله ۲۳ و Adapterهای واقعی (منع مطلق `createDefaultPropertyTaxAdapters()` و Fallback حافظه‌ای؛ در نبود وابستگی ضروری خطای صریح یا پاسخ `503 PROPERTY_TAX_DEPENDENCY_UNAVAILABLE`).
  - `propertyTaxActorResolver.ts`: استخراج `uid` صرفاً از `verifyAuthenticatedUserHeader` (هماهنگ با `mountTrustSafetyRoutes.ts` و `accountAdminRoutes.ts`)، استخراج `partyId` و `authorizedPropertyIds` از منابع معتبر سمت سرور، نادیده‌گرفتن کامل `role` و `partyId` ارسالی کلاینت، و تفکیک کامل نقش مدیر سامانه از مرجع تأیید رسمی مالیاتی با تطبیق بر `PropertyTaxActorContext` (`types.ts:493-498`).
  - `propertyTaxRoutes.ts` و `propertyTaxRouteHandlers.ts`: پیاده‌سازی ۱۹ مسیر رسمی زیر پیشوند `/api/v1/property-tax` (شامل ۶ مسیر پرونده و ارزیابی، ۶ مسیر بدهی/قبض/پرداخت، ۷ مسیر مهلت/معافیت/اعتراض/خلاصه ملک) به‌همراه خواندن فهرست‌ها با Cursor Pagination پایدار، هدر `Cache-Control: private, no-store`، ساختار یکنواخت پاسخ (`status`, `data`, `meta.requestId`) و ۸ کد خطای استاندارد (`PROPERTY_TAX_INVALID_INPUT` 400 تا `PROPERTY_TAX_DEPENDENCY_UNAVAILABLE` 503).
- **اتصال تک‌باره در `server.ts` و ثبت در `src/utils/expressRouteCatalog.ts`**:
  - ثبت `registerPropertyTaxRoutes` در محدوده `server.ts:212-216` (با جلوگیری از ثبت تکراری روی یک Express App).
  - تعریف `PT = 'server/modules/property-tax/propertyTaxRoutes.ts'` و ثبت کامل مسیرها با سطوح دسترسی `VERIFIED_USER` / `RESOURCE_OWNER_OR_ADMIN` / `ADMIN` و استفاده از Rate Limit Bucket موجود `general` (سقف‌های اولیه ۶۰/۲۰/۱۰/۱۰ درخواست در دقیقه) همراه با همگام‌سازی `firestore.rules`، `firestore.indexes.json` و `firebase-blueprint.json`.
- **ماتریس آزمون پذیرش**: حداقل ۳۶ آزمون جدید `PTAPI-001` تا `PTAPI-036` در `propertyTaxRoutes.test.ts`، `propertyTaxActorResolver.test.ts` و `propertyTaxProductionRuntime.test.ts` (شامل `001..008` احراز هویت و Actor، `009..016` مالکیت و مجوزها، `017..022` قرارداد Endpoint و Validation، `023..026` Idempotency و تعارض تراکنش، `027..031` Runtime و Adapterهای Production، و `032..036` Route Catalog و ثبت سرور) به‌همراه تست‌های قبلی ماژول.

---

## ۱۶. مرحله ۲۶: تضمین یکپارچگی تراکنشی دفتر مالکیت و حقوق ملک، انتقال سهم و Idempotency پایدار (`RT-SOCIAL-IMPL-026-PROPERTY-RIGHTS-ATOMIC-LEDGER-AND-IDEMPOTENCY`)

> **محدوده اجرایی**: مرحله ۲۶ روی یکپارچگی تراکنشی هسته `server/modules/property-rights/` متمرکز است (بدون سوار کردن Routeهای `property-rights` در `server.ts` یا `expressRouteCatalog.ts`).

### ۱۶.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **بازگشت خودکار به حافظه در صورت نبود Firestore (`server/modules/property-rights/firestoreStore.ts:18-26, 34-36, 63, 71, 84`) — شدت `P0`**:
   - کلاس `FirestorePropertyRightsStore` یک نمونه `private readonly fallback = new DeterministicPropertyRightsStore();` نگه می‌دارد و هرگاه `!db` باشد، عملیات خواندن و نوشتن را بدون خطا به حافظه فرآیند منتقل می‌کند.
2. **Idempotency خارج از تراکنش و فاقد Payload Hash (`server/modules/property-rights/firestoreStore.ts:61-80`)**:
   - متدهای `getIdempotentResult` و `saveIdempotentResult` دو عملیات مستقل خارج از تراکنش دامنه هستند و هش بدنه درخواست (`payloadHash`) را ذخیره یا مقایسه نمی‌کنند.
3. **انتقال سهم مالکیت در ۷ عملیات مستقل غیرتراکنشی (`server/modules/property-rights/shareTransferEngine.ts:75-82, 84, 156-159, 183, 220, 222-241, 248-250`)**:
   - تابع `executeTransferOwnershipShare` بررسی Idempotency، خواندن سهم مبدأ، `saveOwnershipInterest` برای سهم `SUPERSEDED`، ذخیره سهم باقی‌مانده مالک قبلی، ذخیره سهم مالک جدید، `appendHistoryEvent` و `saveIdempotentResult` را در فراخوانی‌های جداگانه اجرا می‌کند؛ شکست در میانه مسیر دفتر مالکیت را در وضعیت ناقص رها می‌کند.
4. **تجمیع سهم‌ها بدون تراکنش واحد (`server/modules/property-rights/shareTransferEngine.ts:254-378`)**:
   - تابع `executeConsolidateOwnershipShares` رکوردهای مبدأ را جداگانه می‌خواند، در حلقه تک‌به‌تک `SUPERSEDED` می‌کند و سپس رکورد تجمیع‌شده، History و Idempotency را جداگانه می‌نویسد.
5. **احتمال عبور مجموع سهم مالکیت فعال از ۱۰۰٪ در درخواست‌های هم‌زمان (`server/modules/property-rights/ownershipAndSharesService.ts:127-157, 192-221`)**:
   - در `registerOwnershipInterest`، مجموع سهم‌های فعال ملک با `listOwnershipInterestsByProperty` (خط ۱۲۷) و مقایسه با `1/1` (خطوط ۱۳۸–۱۵۷) خارج از تراکنش انجام شده و سپس در خط ۱۹۲ ذخیره می‌شود؛ در نتیجه دو درخواست هم‌زمان (مثلاً هر کدام ۲۰٪ روی ملکی با ۷۰٪ سهم قبلی) هر دو از کنترل عبور کرده و مجموع مالکیت را به ۱۱۰٪ می‌رسانند.
6. **ثبت غیراتمیک اختلاف مالکیت و تغییر وضعیت رکوردهای متأثر (`server/modules/property-rights/evidenceAndDisputesEngine.ts:161-215`)**:
   - در `openOwnershipDispute`، ابتدا رکوردهای مالکیت متأثر در حلقه (`خطوط ۱۶۱–۱۷۸`) یک‌به‌یک به وضعیت `DISPUTED` تغییر می‌کنند و سپس سند اختلاف (خط ۲۰۳) و رویداد History (خط ۲۰۴) ذخیره می‌شوند.

### ۱۶.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۶
- **حذف کامل Fallback حافظه‌ای در Production و ایجاد `PropertyRightsUnitOfWork`**:
  - حذف `fallback` از `FirestorePropertyRightsStore` و بازگرداندن خطای Fail-Closed با کد `503 PERSISTENCE_UNAVAILABLE` در صورت عدم دسترسی به Firestore؛ محدودسازی `DeterministicPropertyRightsStore` صرفاً به تست‌های صریح.
  - تعریف `PropertyRightsUnitOfWork` و `runTransaction<T>(operation: (tx: PropertyRightsUnitOfWork) => Promise<T>): Promise<T>` در `server/modules/property-rights/store.ts` با اجرای تمام Readها پیش از اولین Write در `db.runTransaction`، تولید شناسه‌ها و Timestampها در بیرون Callback یا به‌صورت قطعی، و تبدیل خطاهای تداخل نسخه (`expectedVersion`) به `409 CONCURRENT_MODIFICATION_CONFLICT`.
- **سند قفل هم‌زمانی و محافظ سقف ۱۰۰٪ مالکیت ملک (`property_rights_property_guards_v1/{propertyId}`)**:
  - ایجاد کالکشن `property_rights_property_guards_v1/{propertyId}` (`{ propertyId, ownershipShareVersion, updatedAtIso }`) و الزام تمام مسیرهای تغییر سهم (ثبت اولیه، انتقال سهم، تجمیع سهم‌ها و اصلاح وضعیت) به خواندن و افزایش نسخه Guard و بررسی مجموع دقیق کسرها درون یک تراکنش واحد (رد عبور از ۱۰۰٪ با کد `409 SHARE_OVERFLOW_CONFLICT`).
- **اتمیک‌سازی کامل انتقال سهم، تجمیع سهم‌ها، ثبت اختلاف و Idempotency دارای Payload Hash**:
  - اجرای کامل `executeTransferOwnershipShare`، `executeConsolidateOwnershipShares`، `registerOwnershipInterest` و `openOwnershipDispute` به همراه ثبت `PropertyRightsHistoryEventRecord` و سند Idempotency (`K = actorId + operation + idempotencyKey` با `H = SHA256(CanonicalJSON(payload))` و پاسخ `409` در صورت مغایرت Payload) در یک تراکنش واحد Firestore.
- **ماتریس آزمون پذیرش**: ۳۲ آزمون جدید `PRTX-001` تا `PRTX-032` در `server/modules/property-rights/__tests__/propertyRightsTransactions.test.ts` (شامل `PRTX-001..006` تراکنش و Fail-Closed، `PRTX-007..013` انتقال سهم و Rollback، `PRTX-014..018` تجمیع سهم و کنترل نسخه، `PRTX-019..024` Idempotency و Payload Hash، `PRTX-025..028` کنترل سقف ۱۰۰٪ مالکیت و `PRTX-029..032` ثبت اتمیک اختلاف چندرکوردی) روی هر دو محیط `DeterministicPropertyRightsStore` و Firestore Emulator.

---

## ۱۷. مرحله ۲۷: تبدیل ماژول تأمین مالی و تسهیلات ملک به هسته پایدار Firestore، تراکنشی و دارای Idempotency پایدار (`RT-SOCIAL-IMPL-027-PROPERTY-FINANCING-FIRESTORE-DURABLE-CORE`)

> **محدوده اجرایی**: مرحله ۲۷ صرفاً روی پایداری Firestore، قرارداد `PropertyFinancingUnitOfWork`، اتمیک‌سازی جریان‌های چندرکوردی، کنترل نسخه و Idempotency پایدار ماژول `server/modules/property-financing/` متمرکز است (بدون سوار کردن Routeهای `/api/property-financing/*` در `server.ts` یا `src/utils/expressRouteCatalog.ts` و بدون اتصال ۷ Adapter بین‌ماژولی که در مرحله مستقل Integration انجام خواهد شد).

### ۱۷.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **مخزن کاملاً حافظه‌ای (`server/modules/property-financing/store.ts:144-160, 177-219, 221-229, 231-352`)**:
   - در خطوط ۱۴۴–۱۶۰، کلاس `TransactionalPropertyFinancingStore` پانزده ساختار حافظه‌ای (`Map` و آرایه `history`) و یک `idempotencyRegistry` حافظه‌ای تعریف کرده است.
   - در خطوط ۱۷۷–۲۱۹، متد `runTransaction` صرفاً از Snapshot گرفتن در حافظه (`new Map(...)`) و بازگردانی آن‌ها در `catch` استفاده می‌کند که تراکنش واقعی پایگاه‌داده نیست.
   - در خطوط ۲۲۱–۲۲۹، کلیدهای Idempotency در `idempotencyRegistry` حافظه‌ای و بدون `payloadHash` یا جداسازی `actorId` نگهداری می‌شوند؛ و در خطوط ۲۳۱–۳۵۲ تمام عملیات CRUD مستقیماً روی `Map` انجام می‌گیرند.
2. **انتخاب پیش‌فرض Store حافظه‌ای و ۷ Adapter ساختگی در Factory (`server/modules/property-financing/index.ts:24-46` و `store.ts:66-110`)**:
   - تابع `createPropertyFinancingModuleFacade()` در `index.ts:24-28` بدون ورودی، یک `new TransactionalPropertyFinancingStore()` می‌سازد و در خطوط ۲۹–۳۸ هفت Adapter پیش‌فرض از `createDefaultPropertyFinancingAdapters()` (`store.ts:66-110`) را تزریق می‌کند که بر اساس پیشوند رشته (`!propertyId.startsWith('invalid-')`, `externalPaymentRef.startsWith('confirmed-')` و ارزش‌گذاری ثابت `50_000_000_000`) پاسخ موفق ساختگی برمیگردانند.
3. **خواندن‌های تصمیم‌ساز بیرون از تراکنش در جریان‌های چندرکوردی حساس**:
   - **ثبت درخواست و تسهیلات (`server/modules/property-financing/providerApplicationAndFinancingService.ts:170-212, 273-295, 324-380, 399-408, 486-506, 537-560`)**: ثبت Application/Financing، Idempotency و History در تراکنش حافظه‌ای انجام می‌شوند و در متدهای تغییر وضعیت (`recordApplicationStatus`)، تغییر مانده اصل وام (`updateFinancingPrincipalBalance`)، ثبت شرایط (`recordLoanTerms`) و ثبت نرخ سود (`recordInterestRate`) خواندن اولیه رکورد بیرون از `runTransaction` انجام شده است.
   - **اقساط و وثایق (`server/modules/property-financing/repaymentCollateralLtvAndComparisonService.ts:120-160, 202-236, 256-268`)**: در `recordInstallmentStatusReference`، استعلام پرداخت از `this.adapters.payments.verifyInstallmentOrPayoffPayment` در خطوط ۱۳۱–۱۳۳ به درستی بیرون از تراکنش است، اما در خط ۱۴۳ داخل تراکنش از شیء قدیمی `schedule` خوانده‌شده در خط ۱۱۴ استفاده می‌شود (بدون خواندن مجدد درون تراکنش و کنترل نسخه).
   - **بازتأمین مالی و تسویه (`server/modules/property-financing/refinancingPayoffRiskAndHistoryService.ts:98-137, 225-294`)**: در `recordRefinancingOutcome` (خطوط ۹۹–۱۱۰) و `recordLoanClosure` (خطوط ۲۲۵–۲۳۲)، خواندن `refi`، `payoff` و `fin` پیش از شروع تراکنش انجام می‌شود و سپس در خطوط ۲۵۳–۲۹۴ تغییر `Payoff`، بستن `Financing` و ثبت `History` روی نسخه‌های خوانده‌شده قبلی اعمال می‌گردد.
4. **عدم اتصال ماژول به سرور و کاتالوگ مسیرها (`server/modules/property-financing/HANDOFF.md:24-30`)**:
   - طبق `HANDOFF.md:24-30`، ثبت مسیرها در `server.ts` و `src/utils/expressRouteCatalog.ts`، قواعد و ایندکس‌های Firestore برای ۱۵ کالکشن `property_financing_*` و اتصال ۷ Adapter هنوز انجام نشده است.

### ۱۷.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۷
- **جداسازی قرارداد `PropertyFinancingStore` و `PropertyFinancingUnitOfWork` از پیاده‌سازی حافظه‌ای**:
  - تعریف `PropertyFinancingUnitOfWork` و `PropertyFinancingStore` در `server/modules/property-financing/store.ts` با پوشش کامل تمام متدهای خواندن، نوشتن، فهرست‌کردن، تاریخچه و Idempotency (`getIdempotencyResult` / `saveIdempotencyResult`) به‌صورت Async.
  - حذف انتخاب ضمنی Store حافظه‌ای و Adapterهای ساختگی از Factory تولیدی در `server/modules/property-financing/index.ts` و محدودسازی آن‌ها به Factory صریح تست.
- **پیاده‌سازی `FirestorePropertyFinancingStore` (`server/modules/property-financing/firestoreStore.ts`) روی ۱۶ کالکشن Firestore**:
  - پوشش کامل ۱۵ کالکشن دامنه (`property_financing_providers`, `property_financing_applications`, `property_financing_records`, `property_financing_parties`, `property_financing_terms`, `property_financing_rates`, `property_financing_schedules`, `property_financing_collaterals`, `property_financing_ltv_calculations`, `property_financing_offers`, `property_financing_refinancings`, `property_financing_payoffs`, `property_financing_risk_indicators`, `property_financing_documents`, `property_financing_history`) به‌همراه کالکشن شانزدهم `property_financing_idempotency_keys` در کد، `firestore.rules`، `firestore.indexes.json` و `firebase-blueprint.json`.
  - اجرای تراکنش واقعی Firestore با رعایت کامل Read-before-Write، خواندن مجدد تمام رکوردهای تصمیم‌ساز درون تراکنش، کنترل `expectedVersion` (`409 CONCURRENT_MODIFICATION_CONFLICT`)، رفتار Fail-Closed در نبود یا خطای Firestore (`503 PERSISTENCE_UNAVAILABLE` بدون Fallback به `Map`)، تولید شناسه‌ها و زمان‌ها بیرون از Callback تراکنش، و عدم فراخوانی هیچ Adapter خارجی (`Payments`, `Notifications` و غیره) در داخل Callback تراکنش.
- **Idempotency پایدار و اتمیک‌سازی ۴ جریان حساس**:
  - کلید Idempotency بر پایه `actorId + operation + idempotencyKey` و `payloadHash = SHA256(CanonicalJSON(payload))` با ثبت اتمیک در همان تراکنش دامنه و بازگرداندن خطای `409` در صورت تغییر Payload با همان کلید.
  - تضمین اتمیک‌بودن کامل ۴ جریان حساس (ثبت درخواست تسهیلات، ایجاد Financing، ثبت پرداخت قسط با خواندن مجدد Schedule درون تراکنش پس از تأیید بیرونی پرداخت، و بستن وام با به‌روزرسانی اتمیک Payoff + Financing + History) و عدم ذخیره اطلاعات حساس حساب/کارت در History یا Idempotency.
- **ماتریس آزمون پذیرش**: حداقل ۴۰ آزمون جدید در `server/modules/property-financing/__tests__/propertyFinancingFirestoreStore.test.ts` شامل `PFSTORE-001..012` (۱۲ آزمون)، `PFIDEM-001..008` (۸ آزمون)، `PFATOMIC-001..012` (۱۲ آزمون) و `PFSEC-001..008` (۸ آزمون) به‌همراه حفظ قبولی کامل تست‌های موجود در `server/modules/property-financing/__tests__/propertyFinancing.test.ts`.

---

## ۱۸. مرحله ۲۸: یکپارچه‌سازی هسته اجرایی ارزیابی حقوقی و فنی ملک، حذف مسیرهای موازی و اتصال امن API تولیدی (`RT-SOCIAL-IMPL-028-PROPERTY-DUE-DILIGENCE-CANONICAL-RUNTIME-AND-SECURE-API`)

> **استقلال اجرایی**: مرحله ۲۸ به مرحله ۲۷ (`property-financing`) وابستگی اجرایی ندارد و روی ماژول مستقل `server/modules/property-due-diligence/` تمرکز دارد.

### ۱۸.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **وجود سه مسیر اجرایی موازی در `server/modules/property-due-diligence/`**:
   - **مسیر اول (Store و Facade حافظه‌ای قدیمی)**: در `server/modules/property-due-diligence/store.ts:38-114, 137-153, 164-171, 173-191`، کلاس `DurableDueDiligenceStore` از ۱۵ ساختار حافظه‌ای (`Map` و آرایه) استفاده می‌کند؛ و در `facadeAndRoutes.ts:30-39, 41-76` کلاس `PropertyDueDiligenceFacade` در خط ۵۰ به‌صورت پیش‌فرض `new DurableDueDiligenceStore()` و در خطوط ۵۱–۵۷ آداپتورهای پیش‌فرض و Event Sink حافظه‌ای را انتخاب می‌کند.
   - **مسیر دوم (Verification Case Store حافظه‌ای بلااستفاده)**: در `server/modules/property-due-diligence/verificationCaseStore.ts:20-69, 71-87, 93-102`، کلاس `InMemoryDueDiligenceVerificationCaseStore` با ۱۵ `Map` حافظه‌ای پیاده‌سازی شده و در مسیر اجرایی اصلی وارد نشده است.
   - **مسیر سوم (سرویس Canonical مبتنی بر `TransactionRunnerAdapter`)**: در `server/modules/property-due-diligence/services/propertyDueDiligenceService.ts:133-153, 155-172, 190-220, 269+, 497+, 1050-1159`، تابع `createPropertyDueDiligenceService` با `TransactionRunnerAdapter`، Retry تراکنشی ۴باره (`runDurableTransaction`)، `createFirestoreIdempotencyStoreAdapter`، کنترل نقش `verified_user` و دسترسی سطح پرونده/بازبین پیاده‌سازی شده است.
2. **ناسازگاری قرارداد Route و آسیب‌پذیری هدر هویتی (`index.ts:19-34`، `HANDOFF.md:91`، `facadeAndRoutes.ts:155-161`)**:
   - در `server/modules/property-due-diligence/index.ts:19-34`، ثابت `PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC` چهارده مسیر را با پیشوند `/api/v1/property-due-diligence/*` تعریف کرده، در حالی که `HANDOFF.md:91` پیشوند `/api/v1/due-diligence/*` را پیشنهاد داده است، و هیچ‌کدام در `server.ts:216` یا `src/utils/expressRouteCatalog.ts` ثبت نشده‌اند.
   - در `facadeAndRoutes.ts:155-161`، تابع `resolveActorUid` در خطوط ۱۵۹–۱۶۰ در صورت نبود `req.user.uid`، مستقیماً به هدر ارسالی کلاینت `req.headers['x-verified-principal-uid']` اعتماد می‌کند.
3. **گلوگاه مقیاس‌پذیری در Indexهای بدون سقف و Pagination پس از بارگیری کامل (`services/propertyDueDiligenceService.ts:60-131`)**:
   - تابع `appendToIndex` (خطوط ۶۰–۷۰) تمام شناسه‌ها را در آرایه `ids: string[]` داخل یک سند واحد نگهداری می‌کند؛ تابع `loadIndexedDocs` (خطوط ۷۲–۸۵) تمام شناسه‌ها را خوانده و تک‌تک اسناد را در تراکنش بارگیری می‌کند؛ و `paginateItems` (خطوط ۸۷–۱۳۱) تازه پس از بارگیری کل رکوردها صفحه‌بندی را انجام می‌دهد.

### ۱۸.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۸
- **تثبیت `createPropertyDueDiligenceService` به عنوان تنها Runtime تولیدی و ساخت `productionModule.ts`**:
  - پیاده‌سازی `createProductionPropertyDueDiligenceModule(dependencies: PropertyDueDiligenceModuleDependencies)` در `server/modules/property-due-diligence/productionModule.ts` بر پایه قرارداد `server/modules/property-due-diligence/contracts/externalAdapters.ts:121-134` با اعتبارسنجی Fail-Closed وابستگی‌های تولیدی (`txRunner`, `propertyRegistry`, `media`, `tokenVerifier`, `adminStore`, `auditSink`, `inspectionsAndManagement`, `trustAndSafety`) و منع ساخت Firestore Store چهارم یا بازگشت به Storeهای `Map`-backed.
  - خارج کردن `store.ts`، `facadeAndRoutes.ts` و `verificationCaseStore.ts` از مسیر Production (انتقال به Test-only یا حذف کنترل‌شده پس از بررسی تمام ارجاعات).
- **اصلاح Indexهای بدون سقف و اجرای Cursor Pagination واقعی در `propertyDueDiligenceService.ts`**:
  - حذف الگوی آرایه نامحدود `ids: string[]` در یک سند Index و بارگیری کل رکوردها در `loadIndexedDocs`؛ جایگزینی با ساختار Index صفحه‌بندی‌شده و با سقف مشخص در همان کالکشن‌های موجود، خواندن مبتنی بر Cursor واقعی که فقط اسناد همان صفحه را می‌خواند، و حذف محاسبه `totalCount` از طریق بارگیری کل اسناد.
- **ساخت Router امن (`propertyDueDiligenceRoutes.ts`) و اتصال در `server.ts` و `expressRouteCatalog.ts`**:
  - پیاده‌سازی هر ۱۴ مسیر تعریف‌شده در `PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC` زیر پیشوند قطعی `/api/v1/property-due-diligence/*` متصل به متدهای سرویس Canonical (`createDueDiligenceCase` تا `cancelOrCloseCase`).
  - استخراج هویت صرفاً از Firebase Token تأییدشده سمت سرور (رد مطلق هدر `x-verified-principal-uid`)، اعمال کنترل دسترسی مالک پرونده/شرکت‌کننده مجاز/Reviewer/Admin، الزام Idempotency و Payload Hash (`409` در مغایرت)، هدر `Cache-Control: no-store`، استفاده از Rate Limiter موجود سرور، اتصال در `server.ts` و ثبت هر ۱۴ مسیر در `src/utils/expressRouteCatalog.ts` همراه با همگام‌سازی `firestore.rules`، `firestore.indexes.json` و `firebase-blueprint.json`.
- **ماتریس آزمون پذیرش**: ۴۰ آزمون جدید در `server/modules/property-due-diligence/tests/propertyDueDiligenceProductionIntegration.test.ts` شامل `PDDRT-001..010` (۱۰ آزمون Runtime و Composition)، `PDDAPI-001..014` (۱۴ آزمون قراردادهای ۱۴ مسیر API)، `PDDAUTH-001..008` (۸ آزمون امنیت، رد هدر جعلی و مجوزهای Reviewer) و `PDDTX-001..008` (۸ آزمون تراکنش اتمیک و Pagination با Read محدود) به‌همراه حفظ تست‌های معتبر موجود.

---

## ۱۹. مرحله ۲۹: تثبیت هسته پایدار و تراکنشی هوش حقوقی و مقرراتی ملک، حذف Fallback حافظه‌ای و تضمین یکپارچگی تغییرات قوانین (`RT-SOCIAL-IMPL-029-LEGAL-REGULATORY-DURABLE-TRANSACTIONAL-CORE`)

> **محدوده و استقلال اجرایی**: مرحله ۲۹ مستقل از مراحل ۲۷ و ۲۸ است و صرفاً روی هسته پایدار و تراکنشی `server/modules/legal-regulatory/` تمرکز دارد (بدون تغییر `server.ts` یا `src/utils/expressRouteCatalog.ts` که در مرحله Integration بعدی و پس از اثبات اجرای مرحله ۲۹ انجام خواهد شد).

### ۱۹.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **بازگشت خطرناک به حافظه در صورت نبود Firestore (`server/modules/legal-regulatory/firestoreStore.ts:20-21, 23-28, 30-39, 65-105, 107-294`) — شدت `P0`**:
   - کلاس `FirestoreLegalRegulatoryStore` یک نمونه `private readonly fallbackStore = new DeterministicLegalRegulatoryStore();` نگه می‌دارد (خط ۲۱) و در تمام متدهای خواندن، نوشتن، `upsertWithVersion`، تاریخچه تغییرات، تعارض‌ها، قواعد انطباق، Audit و Idempotency در صورت `!db` به حافظه فرآیند Fallback می‌کند.
2. **Idempotency غیرتراکنشی، برخورد شناسه و نبود Payload Hash (`firestoreStore.ts:65-85` و `store.ts:28-34`)**:
   - متدهای `getIdempotentResult` و `saveIdempotentResult` خارج از تراکنش دامنه اجرا می‌شوند؛ شناسه سند با عبارت `${operation}_${actorId}_${key}.replace(/[^a-zA-Z0-9_-]/g, '_')` ساخته می‌شود که امکان Collision بین کلیدهای متفاوت را دارد؛ و `IdempotencyRecord` در `store.ts:28-34` فاقد `payloadHash` است.
3. **غیراتمیک بودن تغییر نسخه ماده قانونی و ثبت تاریخچه تغییر (`server/modules/legal-regulatory/changeAndConflictEngine.ts:52-64, 66-73, 78-80, 98-134, 151-164`)**:
   - در `executeRecordRegulatoryChange`، بررسی Idempotency (خطوط ۵۸–۶۴) و خواندن `target` و `enactingSource` (خطوط ۶۶–۷۳) بیرون از تراکنش انجام می‌شوند، سپس در خط ۱۵۱ `store.saveProvision` و در خط ۱۵۵ `store.saveChangeRecord` و در خط ۱۵۸ `store.saveIdempotentResult` در سه درخواست مستقل ذخیره می‌گردند؛ شکست در مرحله دوم ماده قانونی را بدون ثبت تاریخچه تغییر (`RegulatoryChangeRecord`) تغییر می‌دهد.
4. **چندمرحله‌ای بودن ثبت Source، Document، Provision و Audit (`server/modules/legal-regulatory/sourceAndProvisionService.ts:129-141, 195-216, 271-317, 319-399`)**:
   - در `createRegulatorySource`، ذخیره Source (خط ۲۰۲)، ثبت Audit (خط ۲۰۳) و ذخیره Idempotency (خط ۲۱۴) سه عملیات جداگانه هستند؛ الگوی مشابهی در `createRegulatoryDocument` (خطوط ۲۷۷–۳۱۶) و `createRegulatoryProvision` (خطوط ۳۲۵–۳۹۸) وجود دارد.
5. **انتخاب پیش‌فرض Adapter حافظه‌ای در Factory و سقف‌های ثابت Query (`index.ts:35-48`، `adapters.ts:222-236`، `firestoreStore.ts:100-105, 123-131, 164-174, 193-199, 221-227, 249-255, 265-279`، `store.ts:89-111`)**:
   - در `index.ts:48`، در نبود `propertyContextAdapter`، کلاس `ReadOnlyInMemoryPropertyContextAdapter` انتخاب می‌شود.
   - کوئری‌های `firestoreStore.ts` دارای سقف‌های ثابت (`limit(500)`, `limit(200)`, `limit(250)`, `limit(100)`) و مرتب‌سازی در حافظه هستند و `paginateSortedItems` در `store.ts:89-111` پس از بارگیری کل آرایه صفحه‌بندی می‌کند.

### ۱۹.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۹
- **تعریف `LegalRegulatoryUnitOfWork` و `TransactionalLegalRegulatoryStore` روی ۱۰ کالکشن موجود**:
  - حفظ کامل ۱۰ کالکشن تعریف‌شده در `LEGAL_REGULATORY_COLLECTIONS` (`store.ts:15-26`) بدون ایجاد کالکشن موازی، و افزودن `LegalRegulatoryUnitOfWork` و `runTransaction<T>(operation: (tx: LegalRegulatoryUnitOfWork) => Promise<T>): Promise<T>` با رعایت کامل Read-before-Write و عدم فراخوانی Adapter خارجی درون Callback تراکنش.
- **حذف کامل Fallback حافظه‌ای و تفکیک Factory تولیدی از تستی**:
  - حذف `fallbackStore` و تمام شاخه‌های `if (!db) return this.fallbackStore...` از `FirestoreLegalRegulatoryStore` و صدور خطای Fail-Closed با کد `503 PERSISTENCE_UNAVAILABLE`.
  - تفکیک `createProductionLegalRegulatoryModule` (الزام Firestore واقعی و `propertyContextAdapter` فقط-خواندنی معتبر، بدون `ReadOnlyInMemoryPropertyContextAdapter`) از `createTestLegalRegulatoryModule` در `server/modules/legal-regulatory/index.ts`.
- **Idempotency تراکنشی با SHA-256 Document ID و Payload Hash و اتمیک‌سازی ۷ جریان اصلی**:
  - محاسبه شناسه سند Idempotency با `SHA256(actorId + "\n" + operation + "\n" + idempotencyKey)` و ذخیره `payloadHash = SHA256(CanonicalJSON(payload))` (`409` در صورت مغایرت Payload با همان کلید).
  - انتقال هر ۷ جریان نوشتنی (ساخت Source، ساخت Document، ساخت Provision، تغییر و اصلاح Provision به همراه `RegulatoryChangeRecord` و کنترل `expectedPreviousVersion` درون تراکنش، ثبت Conflict، ساخت Applicability Rule و ساخت Compliance Requirement به همراه Audit و Idempotency و نیز ذخیره اتمیک AI Suggestion غیرمرجع) به تراکنش واقعی Firestore.
- **Cursor Pagination واقعی سمت Firestore**:
  - جایگزینی سقف‌های ثابت و `paginateSortedItems` حافظه‌ای با Query واقعی Firestore مبتنی بر `orderBy` پایدار (فیلد مرتب‌سازی + Document ID)، `limit` و `startAfter`، بدون معرفی تعداد اسناد بارگیری‌شده به عنوان `totalMatched`، و همگام‌سازی کامل `firestore.rules`، `firestore.indexes.json` و `firebase-blueprint.json`.
- **ماتریس آزمون پذیرش**: حداقل ۳۶ آزمون جدید در `server/modules/legal-regulatory/__tests__/legalRegulatoryFirestore.test.ts` شامل `LRSTORE-001..010` (۱۰ آزمون Firestore و Fail-Closed)، `LRIDEM-001..008` (۸ آزمون Idempotency و هم‌زمانی)، `LRATOM-001..010` (۱۰ آزمون اتمیک بودن تغییرات قوانین و Rollback) و `LRPAGE-001..008` (۸ آزمون Cursor Pagination و امنیت) به‌همراه حفظ قبولی تمام تست‌های موجود در `server/modules/legal-regulatory/__tests__/legalRegulatory.test.ts`.

---

## ۲۰. مرحله ۲۶-ب (تخصیص موازی شماره ۲۶): حذف جعل هویت و نقش در ماژول مدیریت سرنخ‌های ملکی (`RT-SOCIAL-IMPL-026-LEADS-CRM-ZERO-TRUST-AUTHORIZATION`)

> **یادداشت شماره‌گذاری و محدوده اجرایی**: در نقشه راه پیشین، شماره ۲۶ به `RT-SOCIAL-IMPL-026-PROPERTY-RIGHTS-ATOMIC-LEDGER-AND-IDEMPOTENCY` (`۲۶-الف`) اختصاص یافته بود و در بازبینی امنیتی جدید، شماره ۲۶ به `RT-SOCIAL-IMPL-026-LEADS-CRM-ZERO-TRUST-AUTHORIZATION` (`۲۶-ب`) تخصیص داده شده است؛ هر دو شناسه رسمی بدون حذف یکدیگر ثبت شده‌اند. در این مرحله ماژول Leads همچنان در `server.ts` و `src/utils/expressRouteCatalog.ts` نصب **نمی‌شود** و مهاجرت Store به Firestore نیز خارج از محدوده است.

### ۲۰.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **جعل هویت در نبود `tokenVerifier` (`server/modules/leads/leadRoutes.ts:25-58`) — شدت `P0`**:
   - در خطوط ۳۲–۴۸، اگر `tokenVerifier` ارسال نشده باشد، `resolvePrincipal` هدرهای `x-test-uid`، `x-user-id` و `x-test-role` را پذیرفته و یک Principal با ایمیل ساختگی `${uid}@example.com` و `emailVerified: true` می‌سازد.
2. **اعتماد به هدر کلاینت `x-role` با پیش‌فرض `'PROFESSIONAL'` (`leadRoutes.ts:268-273, 333-338, 358-363`) — شدت `P0`**:
   - در سه مسیر `POST /:leadId/activities`، `POST /:leadId/state-transition` و `POST /:leadId/contact-access`، نقش کاربر از `req.headers['x-role'] || 'PROFESSIONAL'` خوانده شده و به `LeadEngine` پاس داده می‌شود.
3. **کنترل دسترسی ناقص در متدهای حساس `LeadEngine` (`server/modules/leads/leadEngine.ts:267-293, 432-461, 538-584, 586-611`)**:
   - در `recordActivity` (خطوط ۵۳۸–۵۸۴)، تنها برای `actorRole === 'CUSTOMER'` مالکیت سرنخ کنترل می‌شود و برای `PROFESSIONAL` و `AGENCY_MANAGER` هیچ بررسی انتساب یا عضویت دفتری انجام نمی‌شود.
   - در `assignLead`، `transitionLeadState` و `accessCustomerContactDetails`، نقش `ADMIN` از بررسی مالکیت/انتساب/دفتر عبور می‌کند و بنابراین اعتماد به رشته `actorRole` بدون احراز سمت سرور خطرناک است.
4. **سه شکاف IDOR تکمیلی کشف‌شده در ممیزی مستقیم `leadRoutes.ts` (`[Observed Fact]`) — شدت `P0`**:
   - `GET /:leadId/activities` (`leadRoutes.ts:245-259`): بدون بررسی دسترسی کاربر به سرنخ، برای هر کاربر غیرمالک (`isCustomer === false`) مقدار `visibility = undefined` ارسال شده و تمام یادداشت‌های داخلی `INTERNAL_CRM` افشا می‌شوند.
   - `GET /crm/agency` (`leadRoutes.ts:427-456`): بدون بررسی عضویت مدیریتی کاربر در `req.query.agencyId` یا مجوز Admin، فهرست سرنخ‌های هر دفتر را بازمی‌گرداند.
   - `GET /crm/metrics` (`leadRoutes.ts:458-471`): بدون بررسی مجوز کاربر روی `agencyId` یا `professionalId`، شاخص‌های عملیاتی هر دفتر/مشاور را افشا می‌کند.
5. **عدم Mount در سرور اصلی و وابستگی تست به هدر جعلی**:
   - در `server.ts:212-216` و `src/utils/expressRouteCatalog.ts` هیچ Routeی برای `/api/leads` نصب یا ثبت نشده است، و در `tests/lead-management-crm-module.test.ts:414-477` روتر بدون `tokenVerifier` و با هدرهای `x-test-uid` و `x-role` تست شده است.

### ۲۰.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۶-ب
- **الزامی‌کردن `tokenVerifier` و `LeadRouterOptions` در `createLeadRouter` (Fail-Closed)**:
  - تغییر امضای `createLeadRouter(engine, tokenVerifier, options: { adminStore, primaryAdminEmails? })` با حذف کامل Fallback هدرهای `x-test-uid`، `x-user-id`، `x-test-role` و `x-role`؛ پاسخ `503` در عدم دسترسی به احراز هویت، `401` در Token نامعتبر و `403` در فقدان مجوز.
- **استخراج سمت‌سرور نقش و مجوز (`server/modules/leads/leadAuthorization.ts` و `leadTypes.ts`)**:
  - تعریف `LeadActorContext` (`CUSTOMER | PROFESSIONAL | AGENCY_MANAGER | ADMIN`) بدون نقش پیش‌فرض: `CUSTOMER` صرفاً با تطابق `lead.customerAccountUid`، `PROFESSIONAL` صرفاً با تأیید حرفه‌ای و انتساب واقعی به سرنخ، `AGENCY_MANAGER` صرفاً با مالکیت/مدیریت همان دفتر از طریق `leadAdapters.ts`، و `ADMIN` صرفاً از مسیر `authorizePrincipal` + `DelegatedAdminStoreAdapter` در `server/modules/core`.
- **ایمن‌سازی چهار متد حساس `LeadEngine` و بستن IDOR مسیرهای خواندنی**:
  - اعمال کنترل مجوز پیش از هرگونه نوشتن یا افشای داده در `assignLead`، `transitionLeadState`، `recordActivity` و `accessCustomerContactDetails`، و اعمال کنترل دسترسی سروری روی `GET /:leadId`، `GET /:leadId/activities`، `GET /crm/agency` و `GET /crm/metrics`.
- **به‌روزرسانی تست‌های موجود و ماتریس آزمون امنیتی ۳۰گانه**:
  - مهاجرت `tests/lead-management-crm-module.test.ts:414-477` به Mock `FirebaseTokenVerifierAdapter` صریح با `Authorization: Bearer ...` و پیاده‌سازی ۳۰ آزمون امنیتی مستقل `LEAD-AUTH-001` تا `LEAD-AUTH-030` در `tests/lead-management-crm-security.test.ts` (شامل ۶ آزمون احراز هویت، ۶ آزمون جعل نقش، ۶ آزمون مالکیت/انتساب، ۴ آزمون دسترسی تماس/رضایت، ۴ آزمون مدیریت دفتر و ۴ آزمون عدم رگرسیون).

---

## ۲۱. مرحله ۲۷-ب (تخصیص موازی شماره ۲۷): پایدارسازی Production ماژول Notification Orchestration و حذف تحویل شبیه‌سازی‌شده (`RT-SOCIAL-IMPL-027-NOTIFICATION-ORCHESTRATION-PRODUCTION-DURABILITY-FAIL-CLOSED`)

> **یادداشت شماره‌گذاری و محدوده اجرایی**: در نقشه راه پیشین، شماره ۲۷ به `RT-SOCIAL-IMPL-027-PROPERTY-FINANCING-FIRESTORE-DURABLE-CORE` (`۲۷-الف`) اختصاص یافته بود و اکنون شماره ۲۷ به `RT-SOCIAL-IMPL-027-NOTIFICATION-ORCHESTRATION-PRODUCTION-DURABILITY-FAIL-CLOSED` (`۲۷-ب`) تخصیص داده شده است؛ هر دو شناسه رسمی بدون حذف یکدیگر ثبت شده‌اند. در این مرحله هیچ Route جدیدی در `server.ts` Mount **نمی‌شود**، `src/utils/expressRouteCatalog.ts` تغییر **نمی‌کند**، ماژول `notifications` با `notification-orchestration` ادغام **نمی‌شود**، و بازنویسی یکباره فایل میراثی `service.ts` مجاز نیست.

### ۲۱.۱ شواهد مستقیم از کد مخزن (`[Observed Fact]`)
1. **وابستگی‌های پیش‌فرض موفقیت‌ساز و حافظه‌ای (`server/modules/notification-orchestration/service.ts`, `types.ts`, `routes.ts`) — شدت `P0`**:
   - `service.ts:67-103`: `createInMemoryNotificationOrchestrationTxRunner` صرفاً روی `Map` حافظه فرآیند کار می‌کند.
   - `service.ts:126-155`: `createSandboxChannelDeliveryAdapter` به صورت پیش‌فرض (`failureMode = 'NONE'`) پاسخ `{ ok: true, providerRequestId: 'preq_...' }` تولید می‌کند.
   - `service.ts:157-172`: `createDefaultEntityAccessAuthAdapter` فقط دو شناسه ثابت (`prop_restricted_secret`, `doc_restricted_secret`) را رد می‌کند و سایر ارجاعات را `{ allowed: true }` برمی‌گرداند.
   - `service.ts:179-195`: `NotificationOrchestrationService` در Constructor در نبود `deps.channelAdapters` به‌صورت خودکار Adapterهای Sandbox و در نبود `deps.entityAuthAdapter` مجوزدهنده پیش‌فرض را فعال می‌کند، و در خط `183` شمارنده `urgentRateCounter` را در `Map` محلی فرآیند نگه می‌دارد (استفاده‌شده در خطوط `722-738` با سقف ۵ اعلان `URGENT` در ۶۰ ثانیه).
   - `service.ts:1069-1076`: هر پاسخ `{ ok: true, providerRequestId }` مستقیماً وضعیت Attempt و Notification را به `DELIVERED` تغییر می‌دهد؛ بنابراین با Sandbox پیش‌فرض، تحویل واقعی بدون ارسال رخ می‌دهد.
   - `types.ts:313-322` و `routes.ts:24-29`: فیلدهای `channelAdapters` و `entityAuthAdapter` اختیاری هستند و Router می‌تواند مستقیماً Service را با Fallback بسازد.
   - `src/utils/serverAdminAndTelegramSecurity.ts:12`: تابع مرجع `getFirebaseAdminFirestoreForServer(env)` موجود است و باید تنها منبع دریافت Firestore Admin باشد (بدون ساخت Firebase Admin App موازی).
2. **سه نکته حیاتی کشف‌شده در ممیزی مستقیم کد (`[Observed Fact]`) برای اجرای موفق مرحله `۲۷-ب`**:
   - **نقض ترتیب Read-before-Write در تراکنش‌های فعلی `service.ts`**: در `orchestrateDomainEvent` (خطوط `903-904`، `947-953` و `978-980`) و نیز در `seedDefaultTemplates` (`332-334`)، `createTemplate` (`595-597`) و `createAdministrativeAnnouncement` (`1453-1454`)، تابع `this.writeDoc` (`tx.set`) **پیش از** `await this.appendIndex` (که `tx.get` اجرا می‌کند) صدا زده می‌شود. تراکنش واقعی Firestore (`db.runTransaction`) هر `tx.get` پس از `tx.set` را رد می‌کند؛ بنابراین پیش از فعال‌سازی `firestoreTransactionRunner.ts` باید خواندن اسناد Index در این متدها به پیش از اولین `writeDoc` منتقل شود.
   - **تعداد واقعی کالکشن‌های `no_*` در `service.ts` (`۱۱` کالکشن موجود + `no_rate_limits` = `۱۲` کالکشن)**: علاوه بر ۸ کالکشن ذکرشده (`no_notifications`, `no_delivery_attempts`, `no_dedup`, `no_digest_batches`, `no_preferences`, `no_templates`, `no_announcements`, `no_indexes`)، کد `service.ts` از ۳ کالکشن Index دیگر یعنی `no_notifs_by_user` (`952, 1141, 1195`)، `no_attempts_by_notif` (`773, 979, 1020, 1053`) و `no_templates_by_id` (`334, 564, 597, 819`) نیز استفاده می‌کند؛ هر ۱۲ کالکشن (همراه با `no_rate_limits`) باید در `firestore.rules` (فعلاً `0` قانون) مسدود و در `firebase-blueprint.json` ثبت شوند.
   - **سقف Ratchet معماری روی `service.ts` (`architecture-baseline.json:384-386`)**: فایل `server/modules/notification-orchestration/service.ts` در سقف `maxLines: 1547` قفل شده است؛ بنابراین هنگام پیاده‌سازی مرحله `۲۷-ب` نباید تعداد خطوط `service.ts` افزایش یابد و منطق جدید باید در فایل‌های جدید (`firestoreTransactionRunner.ts`, `productionRuntime.ts`, `urgentNotificationRateLimit.ts`) قرار گیرد.
3. **راستی‌آزمایی دو مورد ردشده به‌عنوان غیرباگ (`[Observed Fact]`)**:
   - `scripts/check-architecture.ts:63-64` هر دو پوشه `src` و `server/modules` را به صورت بازگشتی پیمایش می‌کند (`76` پوشه مستقیم در `server/modules`، اسکن `1883` فایل).
   - `tests/engineering-quality-foundation.test.ts:123` مقدار `1076.39` را برای تبدیل `100` مترمربع به فوت‌مربع انتظار دارد و `src/utils/areaUnit.ts:255-263` دقیقاً همین مقدار را برمی‌گرداند.

### ۲۱.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۷-ب
- **تراکنش واقعی Firestore (`server/modules/notification-orchestration/firestoreTransactionRunner.ts`)**: پیاده‌سازی `TransactionRunnerAdapter` روی `getFirebaseAdminFirestoreForServer()` با `db.runTransaction`، اعتبارسنجی دقیق مسیرهای `collection/document`، رعایت Read-before-Write، تبدیل خطاها به `CoreApiError` و بازگشت Fail-Closed با کد `503` در نبود Firestore (نگهداری `createInMemoryNotificationOrchestrationTxRunner` صرفاً برای تست).
- **Runtime تولیدی Fail-Closed (`server/modules/notification-orchestration/productionRuntime.ts`)**: الزام کامل وابستگی‌های تولید (`txRunner` واقعی، Adapterهای واقعی کانال‌ها بدون جایگزینی Sandbox، `entityAuthAdapter` واقعی Fail-Closed، `auditSink`، `tokenVerifier`، `adminStore`)؛ در نبود هر وابستگی تولیدی، صدور خطای `503` بدون هیچ مسیر موفقیت پیش‌فرض.
- **حذف Fallbackها و تثبیت صحت تحویل (`service.ts`, `types.ts`, `index.ts`)**: محدودکردن `createSandboxChannelDeliveryAdapter` به تست با تزریق صریح، حذف `createDefaultEntityAccessAuthAdapter` از مسیر Production (بررسی واقعی دسترسی ملک/پرونده/سند/Deep Link با رد پیش‌فرض در ابهام)، و تفکیک پذیرش درخواست توسط Provider از تأیید واقعی تحویل (`DELIVERED` صرفاً با تأیید معتبر Provider).
- **پایدارسازی Urgent Rate Limit (`server/modules/notification-orchestration/urgentNotificationRateLimit.ts`)**: حفظ محدودیت ۵ اعلان `URGENT` در ۶۰ ثانیه برای هر گیرنده به صورت اتمیک و مشترک میان چند Instance سرور روی کالکشن محدود `no_rate_limits` با تراکنش Firestore (بدون Redis یا Queue جدید).
- **قواعد امنیتی Firestore و Blueprint (`firestore.rules`, `firebase-blueprint.json`)**: مسدودسازی کامل دسترسی مستقیم کلاینت (`allow read, write: if false;`) برای تمام کالکشن‌های داخلی `no_*` (هر ۱۲ کالکشن موجود و `no_rate_limits`) و ثبت ساختار دامنه در `firebase-blueprint.json`.
- **ماتریس آزمون پذیرش ۳۲گانه (`NO-PROD-001..032`)**: در `tests/notification-orchestration-production-runtime.test.ts` و تکمیل `tests/notification-orchestration-module.test.ts` شامل ۷ آزمون Firestore Transaction، ۶ آزمون Production Runtime، ۵ آزمون Entity Authorization، ۵ آزمون Delivery Integrity، ۴ آزمون Urgent Rate Limit، ۳ آزمون Firestore Security و ۲ آزمون Regression.

---

## ۲۲. مرحله ۲۸-ب (تخصیص موازی شماره ۲۸): تفکیک مسئولیت‌های ماژول Notification Orchestration و تبدیل `service.ts` به Facade (`RT-SOCIAL-IMPL-028-NOTIFICATION-ORCHESTRATION-SERVICE-DECOMPOSITION`)

> **یادداشت شماره‌گذاری و گیت وابستگی سخت (`BLOCKED`)**: در نقشه راه پیشین، شماره ۲۸ به `RT-SOCIAL-IMPL-028-PROPERTY-DUE-DILIGENCE-CANONICAL-RUNTIME-AND-SECURE-API` (`۲۸-الف`) اختصاص یافته بود و اکنون شماره ۲۸ به `RT-SOCIAL-IMPL-028-NOTIFICATION-ORCHESTRATION-SERVICE-DECOMPOSITION` (`۲۸-ب`) تخصیص داده شده است؛ هر دو شناسه رسمی بدون حذف یکدیگر ثبت شده‌اند. اجرای مرحله `۲۸-ب` **اکیداً منوط به تکمیل و تأیید واقعی مرحله `۲۷-ب`** (`RT-SOCIAL-IMPL-027-NOTIFICATION-ORCHESTRATION-PRODUCTION-DURABILITY-FAIL-CLOSED`) است تا تغییرات زیرساختی (Firestore Persistence و Fail-Closed Runtime) با بازآرایی ساختاری مخلوط نشود.

### ۲۲.۱ شواهد مستقیم از کد مخزن و گراف وابستگی داخلی (`[Observed Fact]`)
1. **بدهی معماری ثبت‌شده (`architecture-baseline.json:384-390` و `server/modules/notification-orchestration/service.ts`)**:
   - فایل `service.ts` با `1547` خط (`baselineLines: 1547`, `maxLines: 1547`, `targetLines: 300`, `owner: module:notification-orchestration`) تمام ۱۱ متد عمومی و ۸ مسئولیت مستقل دامنه را در یک کلاس متمرکز کرده است.
2. **تطبیق خط‌به‌خط نواحی کد و گراف وابستگی بدون چرخه (`Acyclic 5-Level DAG`) استخراج‌شده از کل `service.ts`**:
   - **سطح ۰ (توابع خالص بدون وابستگی به سرویس):** `notificationTemplateRenderer.ts` ← `escapeTemplateVariableValue` (`105-115`)، `sanitizeInternalDeepLink` (`117-124`)، `renderTemplateRecord` (`616-664`) و `isLocalHourWithinQuietHours` (`670-692`).
   - **سطح ۱ (بافت مشترک):** `notificationOrchestrationContext.ts` (`179-250`) ← مالک واحد `deps`، `channelAdapters`، `entityAuthAdapter`، `runTx`، `writeDoc`، `appendIndex`، `listIndexed`، `assertAdmin`، `assertOwnership` و وضعیت `defaultsSeeded` / Rate Limiter پایدار مرحله `۲۷-ب`.
   - **سطح ۲ (سرویس‌های برگ، صرفاً وابسته به Context):**
     - `notificationPreferencesService.ts` (`252-285` و `417-521`): `buildDefaultPreferences`، `getUserPreferences`، `updateUserPreferences`.
     - `notificationTemplateService.ts` (`287-411` و `527-614`): `ensureDefaultTemplatesSeeded`، `upsertTemplateVersion`.
     - `notificationDeliveryService.ts` (`1010-1118`): `dispatchNotificationChannels`.
     - `notificationInboxService.ts` (`1124-1225`): `listUserNotifications`، `markNotificationReadStatus`، `markAllNotificationsAsRead`، `deleteNotification`.
     - `notificationAnalyticsService.ts` (`1472-1546`): `getOperationalAnalytics`.
   - **سطح ۳ (ارکستراسیون رویداد):** `notificationEventService.ts` (`694-1008`؛ حدود ۳۱۵ خط که با استخراج Helperهای خالص زیر سقف ترجیحی ۳۰۰ خط قرار می‌گیرد): `orchestrateDomainEvent` ← وابسته به `Context`، `TemplateService.ensureDefaultTemplatesSeeded` (`702`)، `PreferencesService.buildDefaultPreferences` (`791`)، `Renderer` (`754, 834, 863`) و `DeliveryService.dispatchNotificationChannels` (`1002`).
   - **سطح ۴ (جریان‌های ترکیبی):**
     - `notificationSchedulingService.ts` (`1231-1373`): `dispatchSavedSearchPropertyAlert` (فراخوانی `EventService.orchestrateDomainEvent` در `1253`) و `executeScheduledAndDigestDeliveryJob` (فراخوانی `TemplateService.ensureDefaultTemplatesSeeded` در `1290` و `DeliveryService.dispatchNotificationChannels` در `1338, 1356, 1364`).
     - `notificationAnnouncementService.ts` (`1379-1470`): `createAdministrativeAnnouncement` (فراخوانی `Context.assertAdmin`، `TemplateService.ensureDefaultTemplatesSeeded` در `1388`، `EventService.orchestrateDomainEvent` در `1412` و `auditSink`).
   - **سطح ۵ (لایه سازگاری عمومی):** `service.ts` (`NotificationOrchestrationService` به عنوان Facade زیر ۳۰۰ خط) با حفظ کامل تمام ۱۱ متد عمومی و Re-export ثابت‌ها و Helperهای عمومی (`ALL_UNIFIED_NOTIFICATION_CATEGORIES`, `ALL_ORCHESTRATION_CHANNELS`, `escapeTemplateVariableValue`, `sanitizeInternalDeepLink` و Factoryهای محدودشده به تست از مرحله `۲۷-ب`) بدون تغییر در `routes.ts`.

### ۲۲.۲ تصمیم‌های معماری قفل‌شده مرحله ۲۸-ب
- **تفکیک ساختاری بدون تغییر رفتار تجاری**: حفظ دقیق رفتار Consent، Deduplication، Quiet Hours، Digest، Retry و Delivery Integrity تثبیت‌شده در مرحله `۲۷-ب`؛ ممنوعیت ایجاد `TransactionRunner` یا `Repository` جدید درون سرویس‌های داخلی و ممنوعیت تکرار منطق `assertAdmin`/`assertOwnership`.
- **سقف اندازه و پاک‌سازی Baseline**: هیچ فایل اجرایی جدیدی نباید از `500` خط عبور کند (هدف ترجیحی زیر `300` خط برای Facade و تمام سرویس‌های تفکیک‌شده)؛ و رکورد `server/modules/notification-orchestration/service.ts` در `architecture-baseline.json` **تنها پس از تکمیل واقعی تفکیک و تأیید گیت‌ها** اصلاح یا حذف می‌شود.
- **موارد اکیداً خارج از محدوده**: عدم تغییر APIها یا `routes.ts`، عدم Mount در `server.ts`، عدم تغییر `expressRouteCatalog.ts`، عدم ایجاد Microservice و عدم افزودن Redis/Queue/D1/KV.
- **ماتریس آزمون پذیرش ۴۰گانه (`NO-DECOMP-001..040`)**: شامل ۵ آزمون سازگاری Facade و API عمومی، ۴ آزمون Preferences، ۵ آزمون Template و Renderer، ۶ آزمون Event Orchestration، ۵ آزمون Delivery و Retry، ۴ آزمون Inbox، ۴ آزمون Scheduling و Digest، ۳ آزمون Announcement و Analytics و ۴ آزمون Authorization و Transaction Boundary به‌همراه اجرای کامل تست‌های موجود در `tests/notification-orchestration-module.test.ts` و تست‌های مرحله `۲۷-ب`.



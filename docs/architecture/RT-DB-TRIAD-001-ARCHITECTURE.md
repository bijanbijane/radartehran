# معماری سه دامنه داده‌ای رادار تهران (`RT-DB-TRIAD-001` / اصلاح‌شده در ممیزی `RT-DB-TRIAD-002`)

این سند مرجع رسمی مالکیت داده، مرزهای ایزوله‌سازی، ماتریس حداقل دسترسی، طبقه‌بندی حریم خصوصی (`PSEUDONYMIZED RESEARCH DATA`)، سیاست k-anonymity و حفاظت در برابر Query Differencing در Backend رادار تهران است.

---

## ۱. تفکیک سه دامنه مستقل داده

| دامنه | Binding در Worker | دیتابیس فیزیکی Cloudflare D1 | مالکیت پروژه | مسیر Migration | دسترسی مجاز در رادار تهران |
|---|---|---|---|---|---|
| **۱. USER_DB** (+ alias موقت `DB`) | `env.USER_DB` (اولویت اول) و `env.DB` (سازگاری legacy؛ الزامی به یکسان‌بودن فیزیکی) | `radar-user-db` (`fbb98e6b-5200-4047-b4bc-15a51c06aa84`) | رادار تهران | `migrations/user-d1/` (`0001..0006`, `d1_migrations`) | خواندن و نوشتن برای سرویس‌های کاربری، احراز هویت و چرخه عمر |
| **۲. RESEARCH_DB** | `env.RESEARCH_DB` (کاملاً ایزوله، بدون fallback به `USER_DB`/`DB`) | `radar-researcher-db` (`a04f9716-fb95-44da-841c-b54be252db70`) | رادار تهران | `migrations/research-d1/` (`0001..0002`, `d1_migrations`) | فقط نوشتن `PSEUDONYMIZED RESEARCH DATA`، پاک‌سازی موضوعی و تجمیع k-anonymous با کف `k >= 10` |
| **۳. IRNI Neighborhood Reference** | **فاقد هرگونه D1 Binding** (فقط کلاینت HTTP خواندنی `IrniNeighborhoodReferenceClient`) | `radar-neighborhood-db` (`f335efe8-37ac-4c7d-a057-bc9f4480f6c6`) | پروژه مستقل IRNI | **صفر Migration در رادار تهران** | **فقط خواندن (`GET`) از طریق API رسمی سرور-به-سرور IRNI** — اتصال مستقیم D1 مطلقاً ممنوع |

> **منع مطلق معماری:** هیچ Worker، اسکریپت، Migration، یا کوئری در مخزن رادار تهران حق اتصال مستقیم به `radar-neighborhood-db` (`f335efe8-37ac-4c7d-a057-bc9f4480f6c6`) یا نوشتن در آن را ندارد.

---

## ۲. ماتریس مالکیت جدول-به-جدول (Complete Data Ownership Matrix)

### ۲.۱ جداول `USER_DB` (`radar-user-db`, `migrations/user-d1/0001..0006`)

| جدول | Migration | سرویس مسئول / نویسنده واقعی | مصرف‌کننده واقعی | وضعیت runtime | نگهداری (Retention) | پاک‌سازی در حذف حساب |
|---|---|---|---|---|---|---|
| `neighborhood_projections` | `0001` | **فعلاً نویسنده فعال ندارد؛ Adapter ذخیره‌سازی `upsertNeighborhoodProjectionD1` فقط برای منبع معتبر آینده نگه داشته شده است** | خواندن/کش پروجکشن بازار | **BLOCKED: Worker فاقد آداپتر احراز‌شده Firestore REST است؛ Job قدیمی `firestore_d1_projection_sync` تا اتصال منبع واقعی Fail-Closed و از Cron حذف شده است** | پروجکشن کش‌شده بازار | غیرشخصی |
| `bargain_projections` | `0001` | **فاقد نویسنده runtime در `worker/`** | **فاقد مصرف‌کننده runtime در `worker/`** | **موجود در Schema بدون مصرف‌کننده فعال (ثبت‌شده جهت تصمیم‌گیری آینده؛ حذف نشده)** | تعریف‌شده در Schema | غیرشخصی |
| `sync_watermarks` | `0001` | `firebaseEdgeAuth.ts`, `jobDispatcher.ts` | ابطال توکن و هماهنگی صف | فعال (اتمی با `batch()`) | کلیدهای `revoked_uid:{uid}` دائمی جهت امنیت | تبدیل به `DISABLED` هنگام حذف حساب |
| `upload_sessions`, `upload_session_chunks` | `0002` | `objectStorageUploadHandlers.ts`, `jobDispatcher.ts` | بارگذاری تکه‌تکه رسانه | فعال | ۱۵ دقیقه TTL + پاک‌سازی Cron | حذف هر دو جدول (`upload_session_chunks` و `upload_sessions`) بر اساس `owner_uid` |
| `legal_holds` | `0002` | `r2StorageAdapter.ts`, `workerLifecycleRuntime.ts` | حذف رسانه و حساب | فعال | تا رفع حکم حقوقی | مانع حذف با کد `423 LEGAL_HOLD_ACTIVE` |
| `strong_rate_limits` | `0002` | `kvAndEdgeRateLimiter.ts` | آپلود و ثبت پژوهش | فعال | پنجره ۶۰ ثانیه‌ای | منقضی‌شونده |
| `queue_idempotency_keys`, `queue_job_executions` | `0002`, `0003` | `queueAndCronProcessor.ts` | مصرف‌کننده صف | فعال | عملیاتی | فاقد PII خام |
| `media_objects` | `0003` | `objectStorageRoutes.ts`, `objectStorageUploadHandlers.ts`, `r2StorageAdapter.ts` | رسانه R2 | فعال | منطبق با Legal Hold | تغییر وضعیت به `DELETED` و حذف R2 (با مسدودسازی `423` در حین Drain) |
| `auth_revocation_events` | `0003` | `firebaseEdgeAuth.ts` | ابطال توکن اتمی + Idempotency هم‌زمان | فعال | حسابرسی امنیتی | حفظ شواهد ابطال امنیتی |
| `user_profiles` | `0004` | `d1AccountRepository.ts` | `/api/account/profile` | فعال | تا حذف حساب | حذف کامل بر اساس `uid` |
| `user_privacy_consents` | `0004`, `0006` | `d1AccountRepository.ts`, `researchService.ts` | `/api/account/privacy` و گیت پژوهشی (`consent_revision` یکنوا) | فعال | تا حذف حساب | حذف کامل بر اساس `uid` |
| `user_privacy_consent_audit` | `0004`, `0006` | `d1AccountRepository.ts` | حسابرسی رضایت (`consent_revision`) | فعال (Append-only) | شواهد انطباق | حفظ حداقلی جهت شواهد انطباق |
| `user_notification_channels` | `0004` | `jsonToD1Migrator.ts` | آماده‌شده برای انتقال اعلان‌ها | **مهاجرت‌داده‌شده در Schema (فاقد مسیر HTTP مستقیم در Worker فعلی)** | تا حذف حساب | حذف کامل بر اساس `uid` |
| `user_favorites` | `0004` | `d1AccountRepository.ts` | `/api/account/favorites` | فعال | تا حذف حساب | حذف کامل بر اساس `uid` |
| `user_saved_searches` | `0004` | `jsonToD1Migrator.ts` | آماده‌شده برای جستجوهای ذخیره‌شده | **مهاجرت‌داده‌شده در Schema (فاقد مسیر HTTP مستقیم در Worker فعلی)** | تا حذف حساب | حذف کامل بر اساس `uid` |
| `user_sessions` | `0004` | `d1AccountRepository.ts` | `/api/account/sessions` | فعال | تا حذف حساب | ابطال و حذف کامل بر اساس `uid` |
| `user_data_requests` | `0004` | `d1AccountRepository.ts` | `/api/account/data-requests` | فعال | تا حذف حساب | حذف کامل بر اساس `uid` (نگهداری رسید فقط در `account_lifecycle_receipts`) |
| `admin_role_bindings`, `admin_audit_logs` | `0004` | `jsonToD1Migrator.ts` | مدیریت و RBAC | **مهاجرت‌داده‌شده در Schema (مسیرهای Admin فعلی هنوز روی Express JSON هستند)** | حسابرسی امنیتی | غیرقابل حذف توسط کاربر |
| `user_research_subject_registry` | `0004` | `researchService.ts`, `workerLifecycleRuntime.ts` | نگاشت `(uid, subject_key, version)` **صرفاً در `USER_DB`** + گیت رضایت صف | فعال | تا تایید رسید پاک‌سازی پژوهش | **حذف فقط پس از دریافت رسید معتبر از `RESEARCH_DB`** |
| `account_deletion_jobs` | `0005` | `workerLifecycleRuntime.ts` | `/api/account/deletion-requests` (قابل ادامه از `PENDING_PERMIT_DRAIN`) | فعال | شواهد حذف | تکمیل (`COMPLETED`) فقط پس از رسید `RESEARCH_DB` |
| `account_write_blocks`, `account_mutation_permits` | `0005` | `d1MutationPermit.ts` | مسدودسازی اتمی نوشتن هنگام حذف | فعال | طول چرخه حذف | مسدودسازی بلافاصله هنگام شروع حذف |
| `account_lifecycle_receipts` | `0005` | `workerLifecycleRuntime.ts` | حسابرسی انطباق | فعال (Append-only) | نگهداری انطباق | ذخیره با `uid_hash` مبتنی بر `HMAC-SHA256` کلیددار (شبه-ناشناس حساس انطباق، نه ناشناس‌سازی کامل) |
| `research_erasure_outbox` | `0005` | `workerLifecycleRuntime.ts`, `jobDispatcher.ts`, `researchService.ts` | پاک‌سازی بین‌دامنه‌ای + گیت جلوگیری از ثبت صف پس از درخواست حذف | فعال | تا تایید رسید و حسابرسی | **فاقد ستون UID خام** — فقط `(subject_key, subject_key_version)` |
| `lifecycle_internal_rpc_nonces` | `0005` | `d1InternalRpcNonceStore.ts` | محافظت Replay اتمی (`INSERT OR IGNORE`) | فعال | ۱۰ دقیقه TTL | پاک‌سازی خودکار منقضی‌ها |

### ۲.۲ جداول `RESEARCH_DB` (`radar-researcher-db`, `migrations/research-d1/0001..0002`)

> **طبقه‌بندی حریم خصوصی:** داده‌های این دیتابیس **`PSEUDONYMIZED RESEARCH DATA`** هستند (نه ناشناس‌سازی مطلق). هیچ ستون `uid`، ایمیل، موبایل، IP، توکن یا PII خام در `RESEARCH_DB` وجود ندارد.

| جدول | Migration | سرویس مسئول / نویسنده واقعی | وضعیت runtime | نگهداری (Retention) | مسیر پاک‌سازی |
|---|---|---|---|---|---|
| `research_events` | `0001` | `researchService.ts` (`writePseudonymizedEventsToResearchDb`) | **فعال** | ۶۰ تا ۹۰ روز (`expires_at_iso`) | حذف با `(subject_key, subject_key_version)` از طریق Inbox یا انقضای Retention |
| `research_idempotency_keys` | `0001` | `researchService.ts` | **فعال** | مطابق TTL رویداد (`expires_at_iso`) | پاک‌سازی با `purgeExpiredResearchData` |
| `research_ingestion_receipts` | `0001` | `researchService.ts` | **فعال** (Append-only، فاقد PII) | عملیاتی | غیرشخصی |
| `research_aggregation_windows` | `0002` | `researchService.ts` (`computeKAnonymousResearchAggregation`) | **فعال** | ۱۸۰ تا ۳۶۵ روز (`expires_at_iso`) | **ابطال اتمی هم‌زمان با پاک‌سازی سوژه در `executeResearchSubjectErasure`** + پاک‌سازی انقضا |
| `research_erasure_inbox` | `0002` | `researchService.ts` (`executeResearchSubjectErasure`) | **فعال** (Idempotent) | شواهد پاک‌سازی | فاقد UID خام؛ ثبت `outbox_id`، `receipt_id` و تعداد حذف‌شده |
| `research_event_registry` | `0001` | `migrations/research-d1/0001` (Seed اولیه) | **تعریف‌شده در Schema (کد runtime از `RESEARCH_EVENT_POLICIES` در `researchEventContract.ts` می‌خواند)** | نسخه‌دار | غیرشخصی |
| `research_processing_jobs` | `0002` | **فاقد نویسنده/خواننده runtime فعلی** | **موجود در Schema بدون مصرف‌کننده فعال (ثبت‌شده جهت توسعه‌های بعدی)** | عملیاتی | غیرشخصی |
| `research_retention_policies` | `0002` | `migrations/research-d1/0002` (Seed اولیه) | **تعریف‌شده در Schema (کد runtime از `RESEARCH_EVENT_POLICIES` استفاده می‌کند)** | پیکربندی | غیرشخصی |

---

## ۳. ماتریس حداقل دسترسی (Least-Privilege Access Matrix)

| ماژول / مسیر | `USER_DB` | `RESEARCH_DB` | `IRNI API Client` | توضیح حفاظتی |
|---|---|---|---|---|
| `worker/auth/firebaseEdgeAuth.ts` | R/W (`sync_watermarks`, `auth_revocation_events`) | **ممنوع** | **ممنوع** | اتمی با `batch()`، آشتی هم‌زمان در برخورد `UNIQUE(idempotency_key)` (`200` یا `409`) |
| `worker/account/d1AccountRepository.ts` | R/W (جداول کاربری) | **ممنوع** | **ممنوع** | مسدودسازی `account_write_blocks` (`423`) و افزایش یکنوای `consent_revision` |
| `worker/routes/objectStorageRoutes.ts` | R/W (`media_objects`, `upload_sessions`, بررسی `account_write_blocks`) | **ممنوع** | **ممنوع** | مسدودسازی `423` در طول Mutation Drain برای کاربران غیرمدیر |
| `worker/account-lifecycle/workerLifecycleRuntime.ts` | R/W + Outbox (بدون تضمین تراکنش اتمی بین دو D1؛ سازگاری نهایی با Outbox → Inbox) | فقط فراخوانی `executeResearchSubjectErasure` با `subject_key` | **ممنوع** | عدم ارسال UID خام به `RESEARCH_DB`، قابلیت ادامه از `PENDING_PERMIT_DRAIN` |
| `worker/research/researchService.ts` | خواندن رضایت + `consent_revision` + `user_research_subject_registry` + rate limit | R/W رویداد، تجمیع و پاک‌سازی | **ممنوع** | بازبینی مجدد `consent_revision` دقیقاً پیش از commit و در گیت صف (`verifyQueuedResearchSubjectConsent`) |
| `worker/irni/irniNeighborhoodClient.ts` | **ممنوع** | **ممنوع** | **فقط `GET` HTTPS** + کش KV با پیشوند `v1:irni_ref:` | Fail-closed با `BLOCKED_EXTERNAL_IRNI_CONTRACT` تا تحویل قرارداد زنده |

---

## ۴. سیاست K-Anonymity و حفاظت در برابر Query Differencing

- **آستانه پیش‌فرض (`DEFAULT_K_ANONYMITY_MIN_COHORT`) و کف سخت‌گیرانه (`HARD_MIN_K_ANONYMITY`):** هر دو برابر **`k = 10`** سوژه مستقل (`COUNT(DISTINCT subject_key)`). هیچ متغیر محیطی یا پارامتر کوئری نمی‌تواند آستانه را زیر `10` بیاورد.
- **مقابله با Query Differencing:**
  1. پنجره‌های تجمیع باید دقیقاً هم‌تراز با نیمه‌شب UTC (`T00:00:00.000Z`) و دارای طول حداقل ۲۴ ساعت باشند (پنجره‌های لغزان زیرروزانه با خطای `400 AGGREGATION_WINDOW_NOT_DAY_ALIGNED` رد می‌شوند).
  2. شمارش‌های خروجی (`distinctSubjectsCount` و `eventCount`) با گام ۵ واحدی درشت‌نمایی (`Math.floor(n / 5) * 5`, `coarseningBucketWidth: 5`, `exactCountsWithheld: true`) می‌شوند تا تفاضل دو کوئری متوالی نتواند یک سوژه منفرد را تفکیک کند.
  3. هنگام پاک‌سازی سوژه (`executeResearchSubjectErasure`)، ردیف‌های متناظر در `research_aggregation_windows` به‌صورت اتمی در همان `batch()` حذف و باطل می‌شوند تا داده مشتق کهنه باقی نماند.
- **طبقه‌بندی صادقانه داده:** کلیه خروجی‌ها و مستندات داده پژوهشی را به‌عنوان **`PSEUDONYMIZED RESEARCH DATA`** طبقه‌بندی می‌کنند؛ شناسه HMAC پایدار به معنای ناشناس‌سازی مطلق نیست و کاهش خطر بازشناسایی تنها در کنار `k >= 10`، حذف متن آزاد، کوتاه‌بودن TTL و ابطال پنجره‌های مشتق حاصل می‌شود.

---

## ۵. وضعیت هم‌زیستی موقت Express و Cloudflare Worker

- سرویس‌های `worker/routes/accountRoutes.ts` به‌صورت کامل به `USER_DB` متصل هستند، اما مسیرهای Legacy در `server/modules/account-admin/accountAdminRoutes.ts` همچنان از `AtomicJsonRepository` (`account-admin-state.json`) استفاده می‌کنند.
- فایل واقعی `account-admin-state.json` در فضای کاری فعلی موجود نیست؛ لذا ابزار `jsonToD1Migrator.ts` صرفاً با داده آزمایشی در تست‌ها اجرا شده و مهاجرت داده واقعی Production انجام **نشده** است.
- کالکشن‌های `listingModerations`، `disputes` و `sensitiveOpExecutions` در `jsonToD1Migrator.ts` صریحاً به‌عنوان مهاجرت‌نیافته (`unconvertedCollections`) ثبت شده‌اند.

---

## ۶. پیش‌نیازهای خارجی و موارد مسدود (`BLOCKED`)

1. **احراز هویت Cloudflare در محیط اجرا (`BLOCKED`):** `wrangler whoami` احراز هویت نشده و هیچ `CLOUDFLARE_API_TOKEN` در محیط موجود نیست؛ بنابراین بررسی زنده Remote D1، اجرای Migration Remote و استقرار Staging/Production در این محیط امکان‌پذیر نیست.
2. **تامین دیتابیس‌های Staging (`BLOCKED_STAGING_DATABASES_NOT_PROVISIONED`):** Staging به هیچ دیتابیس Production متصل نیست و نیازمند ایجاد `radar-user-db-staging` و `radar-researcher-db-staging` است.
3. **قرارداد زنده خارجی IRNI (`BLOCKED_EXTERNAL_IRNI_CONTRACT`):** کلاینت IRNI از نظر Unit و Contract تست شده، اما تا زمان تامین `IRNI_API_BASE_URL`، سکرت `IRNI_API_TOKEN` و قرارداد رسمی سرویس زنده IRNI، تست یکپارچگی زنده (`Live External API Integration Tested`) مسدود است.


### Firestore projection source integrity guard — 2026-11-23

The former `firestore_d1_projection_sync` handler did not read Firestore. It read static `MULTI_CITY_CONFIGS`, synthesized deal prices with a fixed multiplier, wrote a constant AQI value and a fallback investment score, and stamped the current execution time into `firestore_version_iso`. Those values cannot be represented as Firestore-authoritative projections.

The Worker tree contains no authenticated Firestore REST source adapter; `worker/db/reconciliation.ts` only compares source and destination arrays supplied by its caller. Therefore the projection job is now disabled, removed from the morning Cron envelope, and legacy queued envelopes are permanently dead-lettered without writing `neighborhood_projections`. Re-enable it only after a real authenticated source adapter, source document versioning, and field-level provenance are implemented and tested.

# معماری دفتر رویدادهای اجتماعی (`RT-SOCIAL-ACTIVITY-LEDGER-001`)

**شناسه مراحل:** `RT-SOCIAL-IMPL-004` و `RT-SOCIAL-IMPL-005`
**مجموعه Firestore:** `/socialActivities/{activityId}` (دسترسی کلاینت: `allow read, write: if false`)

## ۱. قرارداد داده (`SocialActivityRecord`)

هر رخداد انتشار محتوا، پاسخ، دنبال‌کردن یا واکنش، یک رکورد تغییرناپذیر (`schemaVersion: 1`) در مجموعه `socialActivities` ایجاد می‌کند:
- **انواع رویداد (`SocialActivityEventType`):**
  - `content.created` (`discussion`, `question`, `correction`, `research_proposal`)
  - `comment.created` (`comment`)
  - `question.answered` (`answer`)
  - `social.follow.created.v1` و `social.follow.removed.v1` (`follow`)
  - `social.reaction.created.v1` و `social.reaction.removed.v1` (`reaction`)
- **حریم خصوصی و کمینه‌سازی داده:**
  - متن کامل محتوا (`bodyFa`، `questionFa`، `evidenceSummaryFa`) و هرگونه داده شخصی (`email`، `phone`، `ip`) هرگز در `socialActivities` ذخیره نمی‌شود.
  - برای پیشنهادهای اصلاح داده (`correction`) که هنوز در وضعیت `submitted` یا `under_review` هستند، فیلد `visibility` برابر با `'restricted'` ثبت می‌شود تا پیش از تأیید وارد فید عمومی نشوند.

## ۲. تضمین اتمیک بودن و Idempotency

- تابع `appendSocialActivity(tx, activity)` صرفاً در بستر تراکنش فعال Firestore (`CommunityTransaction`) اجرا می‌شود؛ در صورت شکست نوشتن Activity، کل تراکنش محتوا یا تغییر وضعیت Follow/Reaction به حالت قبل بازمی‌گردد (`Rollback`).
- شناسه رکوردهای انتشار محتوا به‌صورت قطعی از `sha256("${eventType}:${objectId}")` و شناسه رکوردهای تعاملی از `sha256("${eventType}:${actorUid}:${targetType}:${targetId}:${operationId}")` ساخته می‌شود تا تکرار درخواست با همان `Idempotency-Key` هرگز رویداد تکراری نسازد.

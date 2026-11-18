# معماری مدل یکپارچه و چندموجودیتی زمینه محتوا (`RT-SOCIAL-CONTENT-CONTEXT-001`)

**شناسه مرحله:** `RT-SOCIAL-IMPL-003`
**وضعیت:** پیاده‌سازی و راستی‌آزمایی شده

## ۱. دامنه و انواع موجودیت (`SocialEntityType`)

در مدل یکپارچه `SocialContentContext` (`schemaVersion: 1`)، هشت نوع موجودیت در سطح تایپ تعریف شده‌اند:
- **موجودیت‌های فعال و متصل به منبع داده واقعی (Stage 3 Supported):**
  1. `neighborhood` — متصل به کاتالوگ رسمی محلات (`NEIGHBORHOODS` و `MULTI_CITY_NEIGHBORHOODS`)
  2. `market` — متصل به کاتالوگ شاخص‌ها و بازارهای رسمی (`tehran-housing-market`، `market-hood-*` و شاخص‌های کلان)
  3. `property` — متصل به مجموعه Firestore واقعی `/bargains/{bargainId}` (صرفاً آگهی‌های غیرحذف‌شده و غیرردشده)
  4. `research` — متصل به پیشنهادهای پژوهشی `/socialPosts` (`recordKind == 'research_proposal'`) و برگه‌های دانش رسمی (`reports`, `methodology`)
- **موجودیت‌های رزرو نقشه راه (Reserved — Fail-Closed `422 UNSUPPORTED_ENTITY_TYPE`):**
  5. `company`
  6. `project`
  7. `tool`
  8. `service`

تا زمانی که مخزن داده و سرویس اعتبارسنجی مستقل برای موجودیت‌های رزرو ایجاد نشود، `SocialEntityResolver` آن‌ها را با کد خطای صریح `422 UNSUPPORTED_ENTITY_TYPE` رد می‌کند و هیچ شناسه جعلی یا بررسی‌نشده‌ای در Firestore ذخیره نمی‌شود.

## ۲. ساختار داده (`SocialContentContext`)

```ts
export interface SocialEntityReference {
  type: SocialEntityType;
  id: string;
  slug?: string;
  titleFa: string;
  subtitleFa?: string;
}

export interface SocialContentContext {
  primary: SocialEntityReference;
  related?: SocialEntityReference[]; // حداکثر ۴ مورد یکتا و غیرتکراری نسبت به primary
  schemaVersion: 1;
}
```

- عنوان (`titleFa`)، زیرعنوان (`subtitleFa`) و نامک (`slug`) ارسال‌شده از سمت کلاینت هرگز منبع حقیقت محسوب نمی‌شوند؛ سرور آن‌ها را از مخزن رسمی بازخوانی و جایگزین می‌کند (`CTX-016`).
- برای رکوردهای قدیمی یا درخواست‌هایی که فقط `neighborhoodId` دارند، تابع `resolveOrBuildSocialContentContext` به‌طور خودکار `primary` از نوع `neighborhood` و برای گفت‌وگوهای دارای `linkedEntity` قدیمی، ارجاع متناظر در `related` را می‌سازد (`CTX-013`, `CTX-015`).

# رادار محله‌های تهران و کلان‌شهرها (Tehran & Multi-City Housing Radar)

ابزار تحلیلی مقایسهٔ محله‌های تهران، کرج، مشهد، اصفهان و شیراز؛ محاسبهٔ مقدماتی بودجهٔ رهن، اجاره و خرید مسکن، موتور قیمت‌گذاری هدونیک (Hedonic Pricing Engine)، شبیه‌سازهای مالیاتی و حقوقی، و نقشهٔ تعاملی بدون نیاز به کلید API.

## راه‌اندازی محلی (Run Locally)

1. نصب وابستگی‌ها:
   ```bash
   npm install
   ```
2. کپی فایل تنظیمات محیطی (اختیاری برای هوش مصنوعی و تلگرام):
   ```bash
   cp .env.example .env
   ```
3. اجرای سرور توسعه (Express + Vite روی پورت 3000):
   ```bash
   npm run dev
   ```

## دستورات بررسی کیفیت، امنیت و تست‌ها

```bash
npm run lint                                     # بررسی تایپ‌های TypeScript
npm run arch:check                               # بررسی مرزهای معماری و سقف ۵۰۰ خط
npm test                                         # اجرای مجموعه تست‌های واحد، امنیتی و قواعد فایراستور
npx tsx tests/stress-50-cycles.test.ts           # اجرای ۵۰ چرخه استرس‌تست و فازینگ
npx tsx tests/object-storage-upload-auth.test.ts # تست احراز هویت و امنیت آبجکت استوریج
npx tsx tests/object-storage-security.test.ts    # تست امنیت S3، مالکیت فایل و نوشتن اتمیک
npx tsx tests/object-storage-range.test.ts       # تست استریم ویدیو (Byte-Range)
npm run build                                    # ساخت باندل نهایی تولید (dist/)
```

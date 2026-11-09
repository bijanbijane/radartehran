# Document Repository Inventory — Tehran Radar
## Archived Statistical Yearbooks, Bulletins, Master Plans & Regulations

- **Inventory ID**: `RMEP-BLACKBOX-DOC-001`
- **Scope**: Historical & Recurring Institutional Publications (1385–1404)
- **Status**: Production Engineering Asset

---

## 1. Official Serial Publications & Bulletins

### Document Series 1: Central Bank of Iran — Monthly Housing Market Bulletins (1392–1404)
- **Title**: گزارش ماهانه تحولات معاملات مسکن شهر تهران
- **Publishing Body**: اداره بررسی‌ها و سیاست‌های اقتصادی بانک مرکزی
- **Format**: PDF Document + Supplementary Excel Tables
- **Historical Depth**: Continuous time-series from Farvardin 1392 to Mehr 1403 (138+ issues)
- **Core Tables Extracted**:
  1. *جدول ۱*: تعداد معاملات و متوسط قیمت یک متر مربع زیربنای مسکونی به تفکیک مناطق ۲۲گانه تهران
  2. *جدول ۲*: توزیع تعداد معاملات مسکونی بر حسب عمربنای ساختمان
  3. *جدول ۳*: توزیع تعداد معاملات مسکونی بر حسب متراژ و سطح زیربنای هر واحد
  4. *جدول ۴*: توزیع ارزش هر واحد مسکونی معامله‌شده و شاخص کرایه مسکن استیجاری
- **Preservation Status**: Archival snapshot stored in normalized JSON format within Tehran Radar's pricing engine.

---

### Document Series 2: Tehran Municipality Statistical Yearbooks (سالنامه آماری شهر تهران)
- **Title**: سالنامه آماری شهر تهران — مرکز آمار و رصد شهری
- **Publishing Body**: سازمان فناوری اطلاعات و ارتباطات شهرداری تهران (فاوا)
- **Format**: PDF Book (24 Chapters) + Open Data XLS Archive
- **Historical Editions**:
  - سالنامه آماری ۱۳۸۵ (نخستین دوره جامع تفکیکی محلات)
  - سالنامه‌های آماری ۱۳۹۰، ۱۳۹۵ (منطبق با نتایج سرشماری عمومی نفوس و مسکن)
  - سالنامه‌های آماری ۱۳۹۸ تا ۱۴۰۲ (بروزرسانی داده‌نما)
- **Relevant Chapters for Tehran Radar**:
  - *فصل ۴ — عمران و ساختمان*: پروانه‌های ساختمانی صادره، مساحت زیربنا، تعداد واحد مسکونی، نوع اسکلت سازه (فلزی، بتن‌آرمه، سنتی).
  - *فصل ۶ — حمل‌ونقل و انبارداری*: تعداد مسافران مترو، اتوبوسرانی، سرانه خودرو، محدوده طرح ترافیک.
  - *فصل ۸ — محیط زیست و بهداشت*: سرانه فضای سبز به ازای هر شهروند، شاخص‌های آلودگی هوا و صوت.
  - *فصل ۱۰ — بافت فرسوده و بازآفرینی شهری*: درصد پهنه‌های نیازمند نوسازی و ریزدانگی کالبدی.

---

### Document Series 3: Master & Detailed Urban Plans (طرح جامع و طرح تفصیلی یکپارچه تهران)
- **Title**: اسناد و نقشه‌های طرح تفصیلی یکپارچه شهر تهران
- **Publishing Body**: معاونت شهرسازی و معماری شهرداری تهران / کمیسیون ماده ۵
- **Format**: Vector CAD / Shapefile / PDF Map Sheets
- **Core Zoning Classifications**:
  - **پهنه‌های سکونت (`R`)**:
    - `R121`, `R122`: بافت متراکم ۴ و ۵ طبقه
    - `R241`, `R231`: بافت ویلایی و کم‌تراکم (شمال تهران / لواسانات)
  - **پهنه‌های فعالیت و تجاری (`S`)**: محورهای خدماتی، اداری و مراکز تجاری
  - **پهنه‌های مختلط سکونت و فعالیت (`M`)**: املاک تجاری-مسکونی بر معابر اصلی
  - **پهنه‌های حفاظت سبز و باز (`G`)**: باغات، پارک‌ها، کمربند سبز و کاربری‌های غیرقابل ساخت‌وساز

---

### Document Series 4: Statutory Tariffs & Union Commission Decrees
- **Title**: آیین‌نامه تعرفه حق‌الزحمه مشاوران املاک تهران
- **Publishing Body**: هیئت عالی نظارت بر سازمان‌های صنفی کشور / کمیسیون نظارت استان تهران
- **Statutory Rules**:
  - **خرید و فروش**: ۰.۲۵ درصد از هر طرف قرارداد بر اساس کل مبلغ معامله + ۱۰ درصد مالیات بر ارزش افزوده (VAT).
  - **رهن و اجاره**: نیم درصد از کل رهن کامل (با ضریب تبدیل هر ۱ میلیون تومان ودیعه = ۳۰ هزار تومان اجاره) + ۱۰ درصد VAT.
  - **تمدید قرارداد**: ۲۵ درصد از تعرفه قرارداد اول.

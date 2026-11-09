# THE INFORMATION HUNTER LAB & SOURCE GRAPH INTELLIGENCE ENGINE
## Project Tehran Radar — Reusable Urban Intelligence Research Playbook (`v2026.11-V2`)

---

## 1. Purpose & Non-Negotiable Epistemic Rules

This playbook codifies the operational research craft and **Source Graph Intelligence Engine** executed for **Project Tehran Radar** across all **80 covered neighborhoods** (60 Tehran municipal neighborhoods across Districts 1–22 + 20 Tehran Province satellite cities).

### Four-Layer Epistemic Separation
1. **Layer 1 — Raw Observations (`مشاهدات خام`)**: Individual property listings, single-station sensor readings, or specific table rows with exact timestamps and source citations.
2. **Layer 2 — Validated Records (`رکوردهای اعتبارسنجی‌شده`)**: Cross-checked medians, official census/yearbook statistics, and deduplicated neighborhood baselines.
3. **Layer 3 — Derived Intelligence (`شاخص‌های محاسبه‌شده`)**: Deterministically computed indicators (e.g., Gross Population Density, Price-to-Rent Ratio, Gross Annual Rental Yield, Weighted Mean Parcel Area).
4. **Layer 4 — Model Predictions (`تخمین‌های مدل هدانیک`)**: Outputs of `calculateHedonicValuation` (`src/data/hedonicPricingEngine.ts`) and `FAST_SALE_FACTOR = 0.88`.

---

## 2. Source Graph Architecture (Engines 1, 2, 4 & 9)

Rather than treating queries as isolated events, Tehran Radar models urban intelligence as a directed multigraph $G = (V, E)$ connecting institutions, legal statutes, registries, publications, GIS datasets, districts, and neighborhoods:

### Core Verified Source Chains
1. **Housing Transaction & Price Chain**:
   - `قانون جهش تولید مسکن (ماده ۱۸)` + `قانون الزام به ثبت رسمی معاملات اموال غیرمنقول`
   - $\xrightarrow{\text{ESTABLISHED}}$ `سامانه خودنویس (وزارت راه و شهرسازی - khodnevis.mrud.ir - >4.9M contracts)` + `سامانه کاتب (سازمان ثبت اسناد و املاک کشور - kateb.ir)`
   - $\xrightarrow{\text{SUPERSEDED (H2 1403)}}$ `سامانه ایران املاک`
   - $\xrightarrow{\text{EXPLAINS PAUSE OF}}$ `گزارش ماهانه تحولات بازار مسکن بانک مرکزی (cbi.ir - paused after Shahrivar/Aban 1403 at 88.5M/m²)`
   - $\xrightarrow{\text{COMPLEMENTED BY}}$ `سکوی عمومی آگهی‌های دیوار/کیلید (freeLiveMarketScraper.ts)` $\times$ `FAST_SALE_FACTOR (0.88)`.

2. **Demographic & Neighborhood Profile Chain**:
   - `مرکز آمار ایران (amar.org.ir)` $\xrightarrow{\text{PUBLISHED}}$ `سرشماری نفوس و مسکن ۱۳۹۵ + برآوردهای ۱۴۰۲`
   - $\xrightarrow{\text{CITED BY}}$ `آمارنامه شهر تهران (مرکز مطالعات و برنامه‌ریزی شهر تهران - mpsc.tehran.ir)`
   - $\xrightarrow{\text{EXPANDED INTO}}$ `اسناد نیمرخ محلات (Neighborhood Profiles)` + `سند راهبردی توسعه محلات ۳۵۴گانه` + `اطلس محلات شهر تهران`
   - $\xrightarrow{\text{VALIDATES}}$ District & Neighborhood Population, Households, Gross Density, and Intra-Neighborhood vs. Regional Green Space per Capita.

3. **Urban Morphology, Historical Parcel & Hazard Chain**:
   - `بانک ساختمانی (۱۳۳۱ خورشیدی)` $\xrightarrow{\text{SUBDIVIDED}}$ `کوی نارمک (۳,۹۹۱ قطعه ۲۰۰ تا ۵۰۰ متری و ۱۰۰ میدان)`
   - $\xrightarrow{\text{GOVERNED TODAY BY}}$ `ضوابط طرح تفصیلی تهران (معاونت شهرسازی - پهنه‌های R122, R231, M111)` + `سازمان نوسازی شهر تهران (۴,۴۲۸ هکتار بافت فرسوده)`
   - $\xrightarrow{\text{BOUNDED BY HAZARDS}}$ `مرکز تحقیقات راه، مسکن و شهرسازی (BHRC)` + `سازمان زمین‌شناسی (GSI)` (`گسل شمال تهران، نیاوران، ری، پردیسان` + `فرونشست راداری InSAR تا ۳۱۰–۳۳۰ میلی‌متر در سال در مناطق ۱۸ و ۱۹`).

---

## 3. Research Target Decomposition Cards (Lesson 1)

| Card ID | Parameter | Entity / Scope | Unit | Primary Information Owner | Public Publisher / Format | Reconstruction Fallback |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RTC-01** | Residential Property Price | Neighborhood (80) | Million Toman / m² | Ministry of Roads (`خودنویس`), SSAA (`کاتب`), CBI, Listing Platforms | CBI Monthly PDF (`cbi.ir`), Divar / Kilid / MelkRadar public listings | Median of deduplicated size/age-stratified asking sample × `0.88–0.92` deal factor |
| **RTC-02** | Rental Price (Deposit & Monthly) | Neighborhood (80) | Million Toman | Ministry of Roads (`خودنویس`), Public Listing Platforms | Divar / Kilid rental tables | Full-Deposit Equivalent = `Deposit + (MonthlyRent × 100 / 3)` (36% annual conversion) |
| **RTC-03** | Population (`جمعیت`) | District (22) & Neighborhood (354) | Persons (`نفر`) | Statistical Center of Iran (`مرکز آمار ایران`) | SCI Census Tables (`amar.org.ir`) & Tehran Statistical Yearbook Ch. 2 (`amar.tehran.ir`) | District census total × neighborhood residential floor-area share |
| **RTC-04** | Household Count & Size (`خانوار`) | District & Neighborhood | Households / Mean Size | Statistical Center of Iran | SCI Census & Municipal Yearbook | `Population ÷ MeanHouseholdSize` (`2.75–3.15` in Tehran) |
| **RTC-05** | Building Age & Parcel Stock (`قدمت بنا و تفکیک قطعات`) | Neighborhood | Construction Year / Parcel m² | Construction Bank (`بانک ساختمانی` historical), Municipal Detailed Plan (`طرح تفصیلی`) | Urban Renewal Org (`nosazi.tehran.ir`), Economic Press Archives (`donya-e-eqtesad.com`) | Historical subdivision cohort + renewal permit velocity |
| **RTC-06** | Land Use & Zoning (`پهنه‌بندی طرح تفصیلی`) | Sub-zone / Neighborhood | Zoning Code (`R122`, `R231`, `M111`, `G`) | Tehran Urban Planning Deputy (`معاونت شهرسازی`) | Detailed Plan Criteria PDF & GIS Portal (`map.tehran.ir`) | Dominant sub-zone rules (FAR %, max floors, min parcel m² & street width) |
| **RTC-07** | Green Space per Capita (`سرانه فضای سبز`) | Municipal District (1–22) | m² / person | Tehran Parks & Green Space Org (`سازمان بوستان‌ها`) | Tehran Statistical Yearbook & Neighborhood Development Docs (`سند توسعه محلات`) | Distinguish Intra-District Local Park m²/capita vs. Regional/Highway Forest-Adjusted m²/capita |
| **RTC-08** | Metro & Transit Accessibility | Station Point → Neighborhood Polygon | Count & Walking Radius (m) | Tehran Urban & Suburban Railway Co. (`مترو تهران`) | Metro Network Map Lines 1–7 (`metro.tehran.ir`) | Point-in-polygon (`INSIDE`) vs `< 1,000m` boundary buffer (`ADJACENT_BUFFER`) |
| **RTC-09** | Commercial & Office Activity | Street Corridor / Neighborhood | Million Toman / m² | Tax Affairs Org, Commercial Real Estate Registries | Commercial market reports & specialist broker bulletins | Corridor-stratified commercial/office asking spread |
| **RTC-10** | Environmental & Natural Hazards | Basin / District / Fault Line | AQI, Distance (m), InSAR (mm/yr) | AQCC (`air.tehran.ir`), BHRC (`bhrc.ac.ir`), Geological Survey (`gsi.ir`) | Seismic Microzonation Maps, Floodway Plans, Radar Interferometry Papers | Fault proximity buffer + InSAR vertical subsidence contour |

---

## 4. Search Performance Experiments & Failed Search Diagnostics (Lessons 13 & Engine 6)

| Experiment ID | Target Parameter | Naive Query (Failed / Low Yield) | Adaptive Graph Query (High Yield) | Yield Improvement & Root-Cause Discovery |
| :--- | :--- | :--- | :--- | :--- |
| **EXP-01** | Narmak Building Stock & Parcel Size Distribution | `"building age distribution Narmak Tehran"` (0 usable records) | `"نارمک" "بانک ساختمانی" مساحت قطعات میادین قدمت بنا نوسازی منطقه ۸ تهران` (7 verified records) | Searching the historical institutional developer (`بانک ساختمانی`, 1331–1332 SH) recovered the exact 3,991-parcel ledger (`1,235×200m²`, `844×300m²`, `416×400m²`, `1,496×500m²`; weighted mean `354.45 m²`). |
| **EXP-02** | Post-1403 Official CBI Monthly Housing Report Gap | `"گزارش تحولات بازار مسکن شهر تهران دی ۱۴۰۳ بانک مرکزی"` (1 symptom article) | `"سامانه خودنویس" OR "کدرهگیری" حجم معاملات مسکن تهران تعداد معاملات مناطق ۲۲ گانه بانک مرکزی` (6 institutional records) | Revealed that splitting contract registration between `سامانه خودنویس` (>4.9M contracts) and `سامانه کاتب` cut off the legacy `ایران املاک` feed to CBI in H2 1403. |
| **EXP-03** | District 8 & Narmak Population & Green Space Conflict | `"جمعیت محله نارمک"` (conflicting 30k vs 330k vs 425k) | `"سند توسعه محلات" OR "تراکم جمعیتی" محلات منطقه ۸ نارمک تهرانپارس هفت حوض شهرداری تهران` (8 verified records) | Reconciled North Narmak in District 4 (`30k` pop), Greater Narmak (`330k` pop, `720 ha`), and District 8 (`425,197` pop, `1,321–1,332 ha`), plus local park green space (`4.0 m²`) vs total urban green space (`8.4 m²`). |

# Institutional Data Catalogue — Tehran Radar
## Detailed Institutional Dataset Profiles & Schemas

- **Catalogue Reference**: `RMEP-BLACKBOX-CAT-001`
- **Scope**: Tehran Metropolitan Area (Districts 1 to 22 & Sub-districts)
- **Status**: Production Engineering Asset

---

## 1. Institution: Central Bank of the Islamic Republic of Iran (CBI)

### Dataset 1.1: Monthly Report on Tehran Real Estate Market Developments
- **Persian Title**: گزارش تحولات بازار معاملات مسکن شهر تهران
- **Publishing Division**: اداره بررسی‌ها و سیاست‌های اقتصادی بانک مرکزی
- **Original Source Registry**: سامانه ثبت معاملات املاک و مستغلات کشور
- **Data Attributes & Schema**:
  | Field Name | Type | Description | Unit / Format |
  |---|---|---|---|
  | `report_month_shamsi` | String | Reporting Iranian calendar month (e.g., `مهر ۱۴۰۳`, `شهریور ۱۴۰۴`) | Year/Month (Solar Hijri) |
  | `district_id` | Integer | Municipal District identifier | `1` to `22` |
  | `average_deal_price_per_sqm` | Float | Weighted average price of executed real contracts | Million Rials / Million Tomans |
  | `transaction_volume` | Integer | Total count of finalized residential purchase contracts | Contract count |
  | `monthly_price_change_pct` | Float | Month-over-month price change percentage | Percentage (`%`) |
  | `annual_price_change_pct` | Float | Year-over-year price change percentage | Percentage (`%`) |
  | `age_distribution_0_to_5` | Float | Share of units aged 0 to 5 years | Percentage (`%`) |
  | `age_distribution_6_to_10` | Float | Share of units aged 6 to 10 years | Percentage (`%`) |
  | `age_distribution_11_to_15` | Float | Share of units aged 11 to 15 years | Percentage (`%`) |
  | `age_distribution_16_to_20` | Float | Share of units aged 16 to 20 years | Percentage (`%`) |
  | `age_distribution_over_20` | Float | Share of units older than 20 years | Percentage (`%`) |
  | `rent_index_tehran_yoy` | Float | YoY rent growth index across Tehran City | Percentage (`%`) |
- **Acquisition Path**: Direct download from CBI Economic Statistics Publications (`https://www.cbi.ir/simplelist/1982.aspx`).
- **Update Frequency**: Monthly (typically published between the 5th and 10th of following Solar month).

---

## 2. Institution: Tehran Municipality ICT Organization & Urban Observatory

### Dataset 2.1: Tehran Statistical Yearbook (آمارنامه شهر تهران)
- **Publishing Division**: مرکز آمار و رصد شهری شهرداری تهران
- **Primary Domain**: `data.tehran.ir` / `tmicto.tehran.ir`
- **Data Attributes & Schema**:
  | Field Name | Type | Description | Resolution |
  |---|---|---|---|
  | `district_number` | Integer | District 1 through 22 | District |
  | `neighborhood_id` | Integer | 354 neighborhood identification code | Neighborhood |
  | `population_estimate` | Integer | Resident population based on municipal census updates | Neighborhood |
  | `residential_parcels_count`| Integer | Total count of registered residential parcels | District / Hood |
  | `green_space_per_capita` | Float | Square meters of public green space per resident | `m² / person` |
  | `metro_stations_count` | Integer | Count of operational subway stations | District |
  | `bus_lines_count` | Integer | Count of operating bus/BRT lines | District |
  | `traffic_zone_overlap` | Boolean | Located inside Central Congestion or Clean Air Zone | Neighborhood |
  | `dilapidated_fabric_pct` | Float | Percentage of area classified as deteriorated fabric (بافت فرسوده) | Percentage (`%`) |
  | `renovation_permit_count` | Integer | Building and reconstruction permits issued annually | District |
- **Acquisition Path**: `data.tehran.ir/web/guest/statistical-yearbook` (Sections on Urban Construction, Demographics, and Environment).
- **Available Formats**: PDF Yearbooks, XLSX data tables, CKAN dataset exports.

---

## 3. Institution: Tehran Air Quality Control Company (AQCC)

### Dataset 3.1: Hourly Air Quality Telemetry by Station
- **Publishing Division**: شرکت کنترل کیفیت هوای تهران
- **Primary Domain**: `air.tehran.ir` / `airnow.tehran.ir`
- **Data Attributes & Schema**:
  | Field Name | Type | Description | Range / Unit |
  |---|---|---|---|
  | `station_id` | String | Unique station identifier (e.g., `aghdasiyeh`, `poonak`, `sharif`) | String |
  | `station_name_fa` | String | Persian official name (e.g., `اقدسیه (منطقه ۱)`) | Persian Text |
  | `latitude` | Float | Station geographic latitude | WGS84 (`35.5` to `35.9`) |
  | `longitude` | Float | Station geographic longitude | WGS84 (`51.1` to `51.6`) |
  | `aqi_us` | Integer | Real-time United States AQI Standard Index | `0` to `500` |
  | `pm25_concentration` | Float | Fine particulate matter (PM2.5) mass concentration | `µg/m³` |
  | `pollutant_primary` | String | Dominant pollutant index | `PM2.5`, `PM10`, `O3`, `NO2` |
  | `health_category` | String | Qualitative health classification (پاک، قابل قبول، ناسالم) | Standard Persian classification |
  | `observation_timestamp` | ISO8601 | Exact reading timestamp | UTC / Asia/Tehran |
- **Acquisition Path**: Direct sensor telemetry mapped via Open-Meteo REST service (`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=...&longitude=...&current=us_aqi,pm2_5`).

---

## 4. Institution: Statistical Center of Iran (SCI)

### Dataset 4.1: Construction Cost & Real Estate Price Indices
- **Publishing Division**: مرکز آمار ایران — دفتر حساب‌های ملی و قیمت‌ها
- **Primary Domain**: `amar.org.ir`
- **Data Attributes & Schema**:
  | Field Name | Type | Description | Base Year |
  |---|---|---|---|
  | `cpi_housing_index` | Float | Consumer Price Index for Housing, Water, Electricity, Gas | 1400 = 100 |
  | `cpi_rent_index` | Float | Consumer Price Index for Residential Rental Contracts | 1400 = 100 |
  | `construction_cost_index` | Float | Producer Price Index of Residential Building Construction Materials | 1400 = 100 |
  | `land_price_index_tehran` | Float | Land and Old Property Transaction Value Index | 1400 = 100 |
- **Acquisition Path**: `amar.org.ir/statistics-by-topic/housing-and-construction` (Quarterly Excel spreadsheets).

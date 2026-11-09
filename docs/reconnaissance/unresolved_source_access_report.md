# Unresolved Source Access & Security Boundaries Report — Tehran Radar
## Intentionally Unresolved, Restricted or Gated Institutional Systems

- **Report ID**: `RMEP-BLACKBOX-UNRESOLVED-001`
- **Policy Standard**: Zero Authentication Bypass, Zero Scraping of Gated Systems, 100% Legal & Ethical Reconnaissance
- **Inspection Date**: `2026-11-08`

---

## 1. Catalog of Gated or Restricted Institutional Systems

| System Name / Domain | Responsible Organization | Restriction Mechanism | Why Direct Ingestion Is Restricted | Legitimate Alternative Utilized |
|---|---|---|---|---|
| **سامانه ثبت اسناد و املاک کشور (سابانه / ثبت من)**<br>`my.ssaa.ir` | سازمان ثبت اسناد و املاک کشور | Dual-factor SMS OTP, National ID verification, Shahkar identity matching | Private cadastral deeds, personal ownership records (PII), strict legal confidentiality | Ingest aggregated anonymized monthly district statistics published by Central Bank (CBI) |
| **سامانه ملی املاک و اسکان**<br>`amlak.mrud.ir` | وزارت راه و شهرسازی | Government SSO (پنجره ملی خدمات دولت هوشمند), CAPTCHA, National ID verification | Household residency declarations and tax audit records are confidential state data | Ingest official ministerial quarterly housing bulletins and statistical releases |
| **سامانه جامع طرح‌های تفصیلی و صدور پروانه (شهرزاد / تهران من)**<br>`my.tehran.ir` | شهرداری تهران | Citizen SSO, municipal property account login | Citizen architectural files, building code violation tickets (ماده ۱۰۰), private utility records | Utilize the public municipal statistical yearbooks and public GIS layers (`data.tehran.ir` / `map.tehran.ir`) |
| **سامانه کد رهگیری معاملات ایران (سامانه املاک)**<br>`iranamlaak.ir` | اتاق اصناف ایران / وزارت صمت | Broker hardware token (توکن امضای دیجیتال), broker license credentials | B2B brokerage network intended strictly for licensed realtors registering private contracts | Rely on aggregate transaction tables published by the Central Bank and Statistical Center of Iran |
| **سامانه پایش تفصیلی سنسورهای سنجش آلودگی هوای تهران (داشبورد داخلی)**<br>`air.tehran.ir/internal` | شرکت کنترل کیفیت هوای تهران | Internal Municipal Intranet / VPN Gating | Raw telemetry calibration logs and proprietary sensor diagnostic telemetry | Ingest publicly published station-level AQI indices via OpenAQ, WAQI, and Open-Meteo REST service |

---

## 2. Policy Invariant: Zero Bypass Guarantee

Tehran Radar will **never**:
1. Implement CAPTCHA-solving scripts, proxy rotators for bypassing rate limits, or fake National ID / OTP generators.
2. Store or request private citizen lease contracts, national identity numbers, or deed numbers.
3. Use undocumented private session cookies or reverse-engineer authentication handshakes.

All data ingested into Tehran Radar is derived solely from **legitimate, authorized, publicly published institutional channels**.

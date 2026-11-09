# Public Source Infrastructure Inventory — Tehran Radar
## PROJECT BLACK BOX: Public Data Infrastructure Reconnaissance & Acquisition Engine

- **Document Version**: `1.0.0`
- **Security & Provenance Level**: `PUBLIC_UNRESTRICTED` (100% Public Data Infrastructure)
- **Program**: Tehran & Iran Multi-City Housing Radar (`رادار مسکن کلانشهرهای ایران`)
- **Inspection Date**: `2026-11-08`

---

## 1. Executive Summary

This inventory documents the underlying public information publishing systems across municipal, governmental, statistical, environmental, and commercial institutions governing Tehran's urban and real estate ecosystem. Rather than treating institutional websites as static visual pages, this inventory profiles their data publication architectures, downloadable archives, REST/WMS endpoints, and structured metadata channels.

---

## 2. Comprehensive Institutional Source Matrix

| Institution ID | Institution Name (EN / FA) | Primary Domain | Publishing System Architecture | Data Categories | Geographic Resolution | Temporal Resolution | Access & Interface Type | Reliability & Status |
|---|---|---|---|---|---|---|---|---|
| `INST-001` | **Tehran Municipality ICT & Urban Observatory**<br>(سازمان فاوا و مرکز آمار و رصد شهری تهران) | `data.tehran.ir`<br>`tehran.ir` | CKAN / Open Data Portal + Statistical Publishing CMS | Building permits, renovation, housing density, urban services, green space per capita | 22 Districts, 122 Sub-districts, 354 Neighborhoods | Annual (1385–1403), Monthly permits | Public Web Portal, XLSX Downloads, PDF Yearbooks | **High (A)**<br>Inspected & Verified |
| `INST-002` | **Tehran Spatial & GIS Information Center**<br>(مرکز اطلاعات جغرافیایی و نقشه تهران) | `map.tehran.ir`<br>`atlas.tehran.ir` | WebGIS, Esri ArcGIS Server / GeoServer Tiles, REST/WMS | Parcel boundaries, street networks, transit stops, zoning layers, traffic zones | Coordinates (WGS84 / UTM Zone 39N), District/Neighborhood polygons | Continuous updates / Master Plan revisions | Web Map Viewer, Raster Tiles, Feature Services | **High (A)**<br>Inspected & Active |
| `INST-003` | **Central Bank of the Islamic Republic of Iran (CBI)**<br>(بانک مرکزی جمهوری اسلامی ایران) | `cbi.ir` | Economic Statistics Archive & PDF/XLS Monthly Bulletins | Notarized deal prices per sqm, transaction volume, age brackets, rent inflation index | 22 Urban Districts of Tehran | Monthly (1392–1404 continuous series) | Public HTTP Publications, Excel data series, Bulletins | **Authoritative (A+)**<br>Extracted & Normalized |
| `INST-004` | **Statistical Center of Iran (SCI)**<br>(مرکز آمار ایران) | `amar.org.ir` | National Statistical Portal, SuperWEB2 Data Engine | National census, household expenditure, construction material cost index, rental inflation | National, Tehran Province, Tehran City | Decennial census, Quarterly & Annual surveys | Web Portal, SDMX/XLSX downloads, Statistical Yearbooks | **Authoritative (A+)**<br>Inspected & Verified |
| `INST-005` | **Ministry of Roads and Urban Development (MRUD)**<br>(وزارت راه و شهرسازی) | `mrud.ir`<br>`amlak.mrud.ir` | Real Estate Registration Registry (SABANEH / Amlak) | National real estate registry, registered lease contracts, statutory commission rules | National, Provincial, Metropolitan | Periodic policy bulletins, Continuous contract registry | Public Notices, Regulatory tables, Portal forms | **High (A)**<br>Inspected & Documented |
| `INST-006` | **Tehran Air Quality Control Company (AQCC)**<br>(شرکت کنترل کیفیت هوای تهران) | `air.tehran.ir`<br>`airnow.tehran.ir` | IoT Station Sensor Network + Hourly Environmental Telemetry | Air Quality Index (AQI), PM2.5, PM10, NO2, O3, meteorological parameters | 20+ Physical Monitoring Stations (Aghdasiyeh, Poonak, Sharif, Piroozi, etc.) | Hourly, Daily averages | Web Dashboard, Public WAQI/OpenAQ feeds, Open-Meteo REST API | **High (A)**<br>Extracted & Integrated |
| `INST-007` | **Tehran Urban & Suburb Railway Co. (Metro)**<br>(شرکت راه‌آهن شهری تهران و حومه) | `metro.tehran.ir` | Transit Operations Portal, Static GTFS/Schematics | Lines 1–7, interchange stations, operating headways, trip duration matrices | Geographic coordinates of 150+ operational stations | Annual timetable revisions, Line extensions | Web Portal, Schematic Maps, Geographic Catalogs | **High (A)**<br>Extracted & Integrated |
| `INST-008` | **Tehran Real Estate Advisors Union**<br>(اتحادیه مشاوران املاک تهران) | `amlaktehran.org` | Regulatory Chamber & Statutory Tariff Portal | Legal commission rates (0.25% buy/sell, 0.5% rent), statutory arbitration guidelines | Tehran Metropolitan Jurisdiction | Statutory revisions (Cabinet & Union decrees) | Official Gazettes, Regulatory Tables | **Authoritative (A+)**<br>Extracted & Verified |
| `INST-009` | **Iran Meteorological Organization (IRIMO)**<br>(سازمان هواشناسی کشور) | `irimo.ir` | Synoptic Meteorological Station Archive | Temperature, precipitation, wind speed/direction, inversion risk | Mehrabad, Shemiran, Geophysics synoptic stations | Hourly synoptic observations, Seasonal summaries | Synoptic bulletins, Public Weather APIs | **High (A)**<br>Inspected & Verified |
| `INST-010` | **Public Online Real Estate Exchanges**<br>(پلتفرم‌های عمومی تبادل املاک — دیوار / شیپور) | `divar.ir`<br>`sheypoor.com` | Microservice Public Search Catalogs & Web APIs | Asking prices, rent/rahn quotes, bargain listings, floor/elevator attributes | Neighborhood level (Poonak, Saadat Abad, Narmak, etc.) | Real-time continuous stream | Public search JSON widgets, Public Web listings | **Medium (B)**<br>Live Stream with Provenance |

---

## 3. Provenance & Security Compliance Guarantee

All sources profiled in this inventory adhere to:
1. **Zero Authentication Bypass**: Only publicly exposed tables, reports, catalogues, and documented endpoints are catalogued.
2. **Zero PII Exposure**: No individual transaction records, buyer names, phone numbers, or national IDs are collected.
3. **Data Integrity & Versioning**: Every acquired dataset is timestamped, schema-validated, and cross-referenced with official ministerial or municipal publications.

# Initial Geographic Data Inventory & 59-Neighborhood Reconciliation Report

- **Document Path**: `server/modules/geography/docs/INITIAL-DATA-INVENTORY.md`
- **Owner**: Employee 8 — Geographic Reference Data Backend
- **Audit Date**: `2026-11-07`
- **Dataset Version**: `v1.0.0-2026.11-reconciled`

---

## 1. Executive Summary

As required by the Employee 8 specification:
> "The currently reported 59 neighborhoods must be inventoried and reconciled with existing source data. Never invent neighborhood names, IDs, boundaries or coordinates."

This report details the audit, historical reconciliation, and current inventory of all geographic reference entities in Radartehran across the initial supported metropolitan areas: **Tehran, Karaj, Mashhad, Isfahan, and Shiraz**.

---

## 2. Historical 59-Neighborhood Reconciliation Analysis

### Origin of the "59 Neighborhoods" Figure
A prior operator or milestone report referenced "59 neighborhoods". An exhaustive audit of the repository's git and data files explains this discrepancy:

1. **Legacy Tehran Municipal Sequence**:
   - The initial urban core of Tehran was numbered `1` through `35` (from Zaferaniyeh to Saadat Abad, Punak, Sadeghiyeh, Shahrak Gharb, etc.).
   - The catalog was subsequently expanded with remaining municipal neighborhoods with IDs `36` through `60` (`tehranCityRemainingHoods.ts`).
   - In that sequence, record **#59** is:
     `{ id: 59, name: 'خانی‌آباد نو و عبدل‌آباد', zone: 'جنوب پایتخت (منطقه ۱۹ و ۲۰ - خانی‌آباد نو، عبدل‌آباد، شهرک شریعتی، نعمت‌آباد و ولایت)', lat: 35.6245, lng: 51.3765, radius: 1300 }`
   - Therefore, a partial legacy extract or checkpoint referencing records `1` through `59` yielded exactly 59 neighborhoods.

2. **Active Repository Reality**:
   - **Tehran**: Contains **80** neighborhoods in total:
     - Municipal core districts: 60 neighborhoods (IDs `1` to `60`).
     - Tehran County and satellite cities: 20 locations (IDs `61` to `80`, e.g., Lavasan, Pardis, Damavand, Shahriar, Andisheh, Parand, Eslamshahr).
   - **Karaj**: Contains **55** neighborhoods (IDs `101` to `155`).
   - **Mashhad**: Contains **40** neighborhoods (IDs `201` to `240`).
   - **Isfahan**: Contains **45** neighborhoods (IDs `301` to `345`).
   - **Shiraz**: Contains **45** neighborhoods (IDs `401` to `445`).
   - **Reconciled Platform Total**: **265 canonical neighborhoods** across 5 cities.

---

## 3. Metropolitan Inventory Breakdown

| City | Province | ID Allocation Range | Active Neighborhood Count | Municipal Districts | Center [Lat, Lng] |
|---|---|---|---|---|---|
| **تهران (Tehran)** | تهران (Tehran) | `1` .. `80` | 80 | 22 + County Hubs | `[35.735, 51.395]` |
| **کرج (Karaj)** | البرز (Alborz) | `101` .. `155` | 55 | 10 | `[35.8327, 50.9915]` |
| **مشهد (Mashhad)** | خراسان رضوی (Razavi Khorasan) | `201` .. `240` | 40 | 13 | `[36.2972, 59.6067]` |
| **اصفهان (Isfahan)** | اصفهان (Isfahan) | `301` .. `345` | 45 | 15 | `[32.6539, 51.666]` |
| **شیراز (Shiraz)** | فارس (Fars) | `401` .. `445` | 45 | 11 | `[29.5918, 52.5837]` |
| **Total** | **5 Provinces** | — | **265** | **71 Districts** | — |

---

## 4. Data Integrity & Verification Audit

The automated audit function `auditGeographicDataIntegrity()` validates the entire reference dataset against four invariants:

1. **Zero Duplicate Numeric IDs**:
   - Every neighborhood ID across all 265 records is globally distinct (`duplicateNumericIds: []`).
   - Distinct ID namespaces (`1..80`, `101..155`, `201..240`, `301..345`, `401..445`) prevent numeric collisions.

2. **Zero Missing Coordinates**:
   - `missingCoordinatesCount: 0`. All 265 records possess valid, finite WGS84 `lat` and `lng` floats.

3. **Cross-City Duplicate Name Detection**:
   - Identifies exact homonymous neighborhood names across different metropolitan areas:
     - Name: `ستارخان` (Sattarkhan)
     - Tehran ID: `28` (`zone: "غرب / مرکز (منطقه ۲)"`)
     - Shiraz ID: `404` (`zone: "شمال مرکز شیراز (منطقه ۱ - رادفر، کوی دنا، صوراسرافیل، فلکه سنگی، قدوسی شرقی و مطهری)"`)
   - Reaffirms the architectural rule: *Names and IDs must be qualified by `cityId` to prevent cross-city misattribution.*

4. **Single-City Ownership Invariant**:
   - 100% (265/265) of neighborhoods belong to exactly one city (`allHoodsBelongToExactlyOneCity: true`).

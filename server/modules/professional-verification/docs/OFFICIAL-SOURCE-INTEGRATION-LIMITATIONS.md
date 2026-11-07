# Official-Source Integration Limitations (`Employee 12`)

## 1. Honest Disclosure of External Registry Capabilities

In compliance with Radartehran engineering governance, this module **does not invent official government or union API endpoints** and **does not claim automated real-time verification** where no authorized machine-to-machine integration exists.

Every entry in `OFFICIAL_VERIFICATION_AUTHORITIES` (`server/modules/professional-verification/authoritiesAndStateMachine.ts`) explicitly sets:

```ts
hasAuthorizedAutomatedApi: false
```

---

## 2. Cataloged Iranian Issuing Authorities & Portal Constraints

| Authority Code | Persian Name | Official Portal Base URL | Allowed HTTPS Hostname Suffixes | Current Verification Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| `tehran_real_estate_union` | اتحادیه صنف مشاوران املاک | `https://iranamlaak.ir` | `iranamlaak.ir`, `asnaf.ir`, `iranianasnaf.ir` | Manual cross-check by reviewer on union/Asnaf portal |
| `iran_business_licenses_portal_mojavez` | درگاه ملی مجوزهای کشور (مجوز) | `https://mojavez.ir` | `mojavez.ir`, `qr.mojavez.ir` | Manual QR / tracking code lookup on `mojavez.ir` |
| `construction_engineering_org_irceo` | سازمان نظام مهندسی ساختمان | `https://irceo.ir` | `irceo.ir`, `tceo.ir` | Manual membership/employment license lookup |
| `judiciary_official_experts_center` | کانون کارشناسان رسمی دادگستری / مرکز کارشناسان | `https://karshenasan.ir` | `karshenasan.ir`, `23055.ir`, `adliran.ir` | Manual appraiser license & annual renewal check |
| `plan_and_budget_org_sajat` | سازمان برنامه و بودجه (سامانه ساجات) | `https://sajat.mporg.ir` | `sajat.mporg.ir`, `mporg.ir` | Manual contractor qualification lookup on SAJAT |
| `company_registration_org_ssaa` | سازمان ثبت اسناد و املاک (ثبت شرکت‌ها) | `https://ilenc.ssaa.ir` | `ssaa.ir`, `rrk.ir` | Manual legal entity national ID & Official Gazette check |
| `other_regulated_authority` | سایر مراجع رسمی و صنفی ذی‌صلاح | `null` | `gov.ir`, `ir` | Manual inspection of official certificates |

---

## 3. Anti-Spoofing & URL Validation Rules

- `validateOfficialAuthorityVerificationUrl(authorityCode, rawUrl)` enforces:
  1. `https:` protocol only (rejects `http:`, `javascript:`, `data:`).
  2. Hostname must match or be a subdomain of the authority's `allowedHostnameSuffixes`.
  3. Phishing domains (e.g., `https://mojavez.ir.attacker.com`) are rejected with a 400 validation error.
- Distinction in Public Summaries:
  - Credentials verified via `manual_document_review` display: *«بازبینی دستی اسناد و مدارک بارگذاری‌شده توسط بازرس»*.
  - Credentials verified via `official_authority_registry_cross_check` display: *«تطبیق دستی بازرس با درگاه رسمی مرجع صادرکننده»*.

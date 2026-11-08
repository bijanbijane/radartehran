# Cloudflare Cost & Capacity Projections (Phase 9.1 Reconciled)
## Tehran Radar — Infrastructure Economics & Scaling Analysis

**Document Reference**: `docs/cloudflare/cost-and-capacity-estimates.md`  
**Evaluation Date**: November 2026 (Updated Phase 9.1)  
**Auditor**: Infrastructure Financial Engineering & Platform Architecture Team  
**Evaluation Status**: `ESTIMATED_THEORETICAL_MODEL`

---

## 1. Workload Assumptions & Methodology

These projections represent an **estimated theoretical model** based on Cloudflare's published Workers Paid pricing (effective 2026) and projected baseline traffic for Tehran Radar.

### 1.1 Model Parameters (Projected Monthly Staging / Production Baseline)
- **Active Monthly Users (MAU)**: ~15,000 unique users.
- **Total Invocations**: ~2,500,000 HTTP requests / month.
- **Static Assets (CDN Cache)**: ~12,000,000 requests / month (served via Workers Static Assets / Anycast CDN).
- **Valuation Invocations (Hedonic Engine)**: ~120,000 calculations / month.
- **New Media Ingestion**: ~15,000 files / month (~45 GB cumulative storage).
- **KV Read Operations**: ~1,800,000 operations / month.
- **KV Write Operations**: ~75,000 operations / month.
- **D1 Read Queries**: ~1,200,000 queries / month (if D1 reads are enabled in future phases).

---

## 2. Cloudflare Cost Breakdown (Workers Paid: $5.00/month Base)

| Service / Resource | Included in Base Plan | Projected Usage | Overage Rate (Cloudflare) | Estimated Monthly Cost | Estimation Uncertainty |
|---|---|---|---|---|---|
| **Workers Paid Base Plan** | 10,000,000 requests + 30ms CPU | 2,500,000 requests | $0.30 per 1M additional | **$5.00** | Low ($\pm 5\%$) |
| **Workers Static Assets (CDN)** | Unlimited fair-use requests | 12,000,000 requests | Free with Workers | **$0.00** | Low |
| **Workers KV (Reads)** | 10,000,000 reads included | 1,800,000 reads | $0.50 per 1M additional | **$0.00** | Low |
| **Workers KV (Writes)** | 1,000,000 writes included | 75,000 writes | $5.00 per 1M additional | **$0.00** | Medium ($\pm 20\%$) |
| **Cloudflare R2 (Storage)** | 10 GB included free | 45 GB (projected) | $0.015 per GB-mo (over 10GB) | **~$0.52** | Medium (depends on user uploads) |
| **Cloudflare R2 (Class A Writes)** | 1,000,000 writes included | 15,000 operations | $4.50 per 1M additional | **$0.00** | Low |
| **Cloudflare R2 (Class B Reads)** | 10,000,000 reads included | 250,000 operations | $0.36 per 1M additional | **$0.00** | Low |
| **Cloudflare R2 (Egress Bandwidth)**| **Zero egress fees** | ~180 GB egress | $0.00 (No egress fees) | **$0.00** | Zero |
| **Cloudflare D1 (Rows Read)** | 25,000,000,000 rows / mo | ~4,500,000 rows | $0.001 per 1M rows | **$0.00** | Low |
| **Cloudflare D1 (Rows Written)** | 50,000,000 rows / mo | ~350,000 rows | $1.00 per 1M rows | **$0.00** | Low |
| **Cloudflare Queues** | 1,000,000 ops included | ~120,000 ops | $0.40 per 1M additional | **$0.00** | Low |
| **Total Cloudflare Platform Cost** | — | — | — | **~$5.52 / month** | **$\pm 15\%$ Variance** |

---

## 3. Explicitly Excluded Operational Costs

The above estimate covers **Cloudflare edge compute, CDN, and storage bindings only**. It does **not** include:
1. **Firebase / Google Cloud Firestore**: Firestore reads, writes, and storage remain billed under the user's existing Google Cloud billing account.
2. **External Divar Sync Proxying**: Upstream proxy bandwidth or scraping proxies (if used) remain external.
3. **Google Maps Platform**: Map tile API and Geocoding requests are billed separately under Google Cloud Platform.
4. **Domain & DNS**: `radartehran.ir` domain registration and any premium DNS add-ons.

---

## 4. Financial Risk Controls

1. **R2 Signed URL Expiry**: Enforced 15-minute TTL to prevent persistent hotlinking bandwidth.
2. **Billing Alerts**: Configure a Cloudflare Notification Rule at the **$10.00 / month threshold** in Phase 10 to guard against DDoS or runaway queue invocations.

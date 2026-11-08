# Cloudflare Cost & Capacity Projections (Phase 9)
## Tehran Radar — Infrastructure Economics & Scaling Analysis

**Document Reference**: `docs/cloudflare/cost-and-capacity-estimates.md`  
**Evaluation Date**: November 2026  
**Auditor**: Infrastructure Financial Engineering & Platform Architecture Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Cloudflare Tier Comparison & Projected Traffic Models

### 1.1 Baseline Traffic Assumptions (Monthly Model)
- **Active Monthly Users (MAU)**: ~15,000 unique property searchers & realtors.
- **Monthly Edge Invocations**: ~2,500,000 HTTP requests.
- **Static Asset Requests (Images, Bundles)**: ~12,000,000 requests (served via Workers Static Assets / CDN cache).
- **Valuation Invocations (Hedonic Engine)**: ~120,000 calculations / month.
- **Media Uploads (Floorplans, Photos)**: ~15,000 files / month (~45 GB new storage / month).
- **KV Read Operations**: ~1,800,000 reads / month.
- **KV Write Operations**: ~75,000 writes / month.
- **D1 Read Operations**: ~1,200,000 queries / month.

---

## 2. Cost Analysis: Cloudflare Workers Paid ($5/month plan)

| Service / Resource | Included Free Tier / Base Plan | Estimated Monthly Usage | Overage Rate | Projected Monthly Cost |
|---|---|---|---|---|
| **Workers Paid Base Plan** | Includes 10M requests & 30ms CPU | 2.5M requests | $0.30 per additional 1M | **$5.00** |
| **Workers Static Assets (CDN)** | Unlimited / Fair Use | 12M asset requests | Included | **$0.00** |
| **Workers KV (Reads)** | 10M reads included / mo | 1.8M reads | $0.50 per 1M | **$0.00** |
| **Workers KV (Writes)** | 1M writes included / mo | 75,000 writes | $5.00 per 1M | **$0.00** |
| **Workers KV (Storage)** | 1 GB included | ~120 MB | $0.50 / GB-mo | **$0.00** |
| **Cloudflare R2 (Storage)** | 10 GB included free | 45 GB (accumulated) | $0.015 / GB-mo (over 10GB) | **~$0.52** |
| **Cloudflare R2 (Class A Ops - Writes)** | 1M ops included free | 15,000 ops | $4.50 per 1M | **$0.00** |
| **Cloudflare R2 (Class B Ops - Reads)** | 10M ops included free | 250,000 ops | $0.36 per 1M | **$0.00** |
| **Cloudflare R2 (Egress / Bandwidth)** | **Free / Zero egress fees** | ~180 GB egress | $0.00 | **$0.00** |
| **Cloudflare D1 (Rows Read)** | 25B rows read / mo (Paid) | ~4.5M rows read | $0.001 per 1M rows | **$0.00** |
| **Cloudflare D1 (Rows Written)** | 50M rows written / mo | ~350,000 rows | $1.00 per 1M rows | **$0.00** |
| **Cloudflare D1 (Storage)** | 5 GB included | ~250 MB | $0.75 / GB-mo | **$0.00** |
| **Cloudflare Queues** | 1M operations included | ~120,000 ops | $0.40 per 1M | **$0.00** |
| **Total Cloudflare Projected Cost** | — | — | — | **~$5.52 / month** |

---

## 3. Comparison with Legacy Cloud Infrastructure (GCP/AWS/VPS)

| Infrastructure Item | Legacy Dedicated / Cloud Setup | Cloudflare Hybrid Edge Setup | Net Monthly Savings |
|---|---|---|---|
| **Edge CDN + Compute** | GCP Cloud Run / VPS ($25–$65/mo) | Cloudflare Workers Paid ($5.00/mo) | ~$20–$60 / mo |
| **Bandwidth & Media Egress** | GCP Cloud Storage egress ($0.12/GB = ~$21.60/mo) | Cloudflare R2 (Zero egress = $0.00) | ~$21.60 / mo |
| **Global Latency Reduction** | High latency to Iran/MENA without CDN | < 25ms TTFB across regional edge PoPs | Significant UX & SEO gains |
| **Total Estimated Savings** | ~$50–$90 / month | ~$5.52 / month | **> 85% cost reduction** |

---

## 4. Cost Optimization Safeguards & Budget Alerts

1. **R2 Signed URL Expiry**: Set to 15 minutes by default to eliminate persistent unauthorized hotlinking bandwidth.
2. **Workers KV Coalescing**: Promise coalescing on market pulse prevents redundant KV write cycles.
3. **Billing Alerts**: Configure Cloudflare Notification Rule at $10.00 threshold to detect abnormal request spikes or DDoS attacks.

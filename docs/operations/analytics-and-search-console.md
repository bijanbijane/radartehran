# RadarTehran — Web Analytics & Search Console

## Cloudflare Web Analytics

- Production hostname: `radartehran.ir`
- Web Analytics site tag: `cee41305fdfd4248bb40ce4ba809593f`
- Setup mode: manual JavaScript beacon (`auto_install=false`); the hostname is not an orange-clouded zone in this Cloudflare account.
- The beacon is installed in the root `index.html` and only loads when `location.hostname === "radartehran.ir"`.
- Cloudflare documents Web Analytics as free and privacy-first, using a JavaScript beacon and browser Performance APIs. It is distinct from Radar's own behavioral/research telemetry.
- SPA navigation measurement is enabled by the Cloudflare beacon's default SPA support.
- To exclude the current browser session from Cloudflare Web Analytics, open the site once with `?cf-analytics=off`. The session opt-out is retained in sessionStorage until the browser tab session ends.
- Preview, staging, and `workers.dev` hostnames are intentionally not counted by this production beacon.
- No deployment was performed as part of this setup.

## Search Console — pending DNS ownership verification

The repository already serves:
- `https://radartehran.ir/robots.txt`
- `https://radartehran.ir/sitemap.xml`

The sitemap is referenced from robots.txt. The canonical URL is configured as `https://radartehran.ir/`.

Google Search Console is **not yet verified or connected**. The Cloudflare account currently has no DNS Zone for `radartehran.ir`, so this repository/Cloudflare integration cannot publish the required DNS TXT ownership record.

Required operator action:
1. Add the Domain property `radartehran.ir` in Google Search Console.
2. Copy the exact DNS TXT verification value Google provides.
3. Publish that TXT record at the DNS provider authoritative for `radartehran.ir` (do not add it to a different DNS provider).
4. After DNS propagation, complete verification in Search Console.
5. Submit `https://radartehran.ir/sitemap.xml` in Search Console.
6. Inspect the homepage and a representative public neighborhood URL with URL Inspection; confirm canonical selection, crawl eligibility, and indexing status.

Do not claim Google indexing until Search Console reports it. A crawler request to `robots.txt` alone is not evidence of page indexing.

## Privacy boundary

Cloudflare Web Analytics is limited to aggregate site traffic and performance metrics. Do not add raw search text, account identifiers, contact details, exact location, session replay, keystrokes, or private content to this beacon.

Radar's separate behavioral/research telemetry must remain default-deny until explicit consent is reliably connected to the authoritative privacy-consent source and revoked consent clears queued optional events. Do not use the existing client-side default-true preference as proof of consent.

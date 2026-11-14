/** @file src/components/navigation/urlSyncHelpers.ts — Extracted SEO head updater helper */
export function updateSeoHeadMeta(title: string, desc: string, canonicalQuery: string, jsonLdObj: Record<string, unknown>): void {
  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute('content', content);
  };
  document.title = title;
  const canonicalHref = canonicalQuery.startsWith('/') ? `https://radartehran.ir${canonicalQuery}` : `https://radartehran.ir/${canonicalQuery}`;
  const canonicalEl = document.getElementById('canonical-url-tag') as HTMLLinkElement | null;
  if (canonicalEl) canonicalEl.href = canonicalHref;
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[property="og:url"]', canonicalHref);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', desc);
  const ldEl = document.getElementById('seo-jsonld-schema');
  if (ldEl) ldEl.textContent = JSON.stringify(jsonLdObj);
}

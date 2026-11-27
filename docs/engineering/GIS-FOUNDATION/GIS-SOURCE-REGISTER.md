# GIS Source Register

| Source / system | Intended role | Authority / license state | Current evidence | Action |
|---|---|---|---|---|
| IRNI Geographic Registry | Canonical entity IDs, names, hierarchy, aliases, revisions and checksums | Canonical owner under approved IRNI contract | Internal Workers Service Binding and v2 client present | Continue read-only; verify deployed contract before cutover |
| Radar local GeographyCatalog | Legacy compatibility / fixture only | Explicitly non-canonical; boundary provenance unverified | Legacy-safety tests assert non-canonical status | Never use as canonical identity or official geometry |
| Worker computed hex fallback | Temporary map visualization | Algorithmic, non-authoritative | Route labels source `computed_hex_fallback` and disclaims official boundary | Exclude from analytical paths |
| Tehran municipal GIS dataset reference | Candidate boundary source | Not independently verified in this session; rights and source record not established | Referenced as a source provenance token in tests only | Do not ingest or publish until actual source, license and CRS are verified |
| Cloudflare D1 documentation | Database capability reference | Official product documentation | Supported extension subset and export changelog reviewed | Probe runtime before RTree use |

No external boundary dataset has been downloaded, licensed, validated or imported in this work package.

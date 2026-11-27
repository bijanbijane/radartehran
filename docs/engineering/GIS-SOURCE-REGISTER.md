# Radar Tehran GIS Source Register

**Status date:** 2026-11-27

| Source / registry | Intended authority | Current evidence | Status |
|---|---|---|---|
| IRNI canonical geographic registry | Canonical IDs, identity lifecycle, aliases and geographic relationships | Repository migrations `migrations/neighborhood-d1/0001_geographic_registry.sql` through `0003_irni_identity_registry_staging.sql`; owner-side RPC work is separate | Authority is defined; live service/binding integration is not verified in this task |
| Trusted boundary source registry | Publisher, source reference, authority, CRS and verification status | `NeighborhoodProfileBoundaryResolvers.resolveSource` expects a trusted resolver independent of the boundary payload | Production resolver wiring is not verified; profile evidence remains fail-closed without it |
| Municipal boundary datasets | Potential authoritative neighborhood/city/district geometry | Code contains source tokens such as `tehran_municipality_gis_2025`; tokens alone do not prove the dataset, license, or geometry | NOT VERIFIED |
| Open geographic datasets | Supplementary POIs, roads and urban features | Import API supports source-provenance strings, but no selected dataset/license packet is approved in this record | NOT VERIFIED |
| NIPS variable catalog | Definitions for neighborhood indicators | IRNI catalog version 2.0.0: 120 variable definitions across 12 categories, as recorded in the NIPS implementation tracker | Definitions only; no real observation values implied |

## Required metadata for each future dataset

Publisher; dataset name and version; source URI/reference; license and attribution requirements; publication date; retrieval date; coverage; source CRS; format; processing steps; validation results; checksum; import batch; and effective date.

A `sourceProvenance` string is not a substitute for this register entry. Never generate real neighborhood values, coordinates or boundaries to fill gaps.

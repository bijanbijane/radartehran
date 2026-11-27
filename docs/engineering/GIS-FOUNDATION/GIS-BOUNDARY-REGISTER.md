# GIS Boundary Register

| Boundary class | Status | Authority | Permitted use |
|---|---|---|---|
| IRNI neighborhood identity anchor / point | Exists in registry inventory as point-only records | Canonical identity, not polygon boundary | Identity and map navigation only |
| Radar reviewed Polygon / MultiPolygon version | Local geospatial service scaffold | Pending independent source, canonical identity and review gates | Profile evidence only when all gates return READY |
| Worker `computed_hex_fallback` | Generated on demand | Algorithmic approximation | Visualization only; prohibited for area, property assignment and analytics |
| Simplified display geometry | Derived from canonical boundary | Not authoritative | Rendering only |

Boundary evidence requirements: canonical entity ID; approved legacy crosswalk; unique active version; explicit CRS; server-recomputed geometry hash; source registry resolution; independent reviewer; geometry validity; version history. No official Tehran neighborhood polygon set has been verified or imported in this work package.

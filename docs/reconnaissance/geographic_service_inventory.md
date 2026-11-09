# Geographic Service & Spatial Data Infrastructure Inventory — Tehran Radar
## Spatial Layers, Coordinate Reference Systems, Map Tiles & GeoJSON Infrastructure

- **Inventory ID**: `RMEP-BLACKBOX-GEO-001`
- **Spatial Coverage**: Tehran Metropolitan Area (Bounds: `[35.50, 51.10]` to `[35.85, 51.65]`)
- **Authority**: Open Geospatial Consortium (OGC) Standards Compliance

---

## 1. Coordinate Reference Systems (CRS) & Projection Rules

1. **WGS 84 (EPSG:4326)**:
   - Primary storage format for all latitude/longitude points in Tehran Radar.
   - Standard Leaflet map coordinate representation (`[lat, lng]`).
2. **Web Mercator (EPSG:3857 / Pseudo-Mercator)**:
   - Used for slippy map raster and vector tile delivery (`{z}/{x}/{y}`).
3. **UTM Zone 39N (EPSG:32639)**:
   - Official projection used by Tehran Municipality (`map.tehran.ir`) and National Cartographic Center (NCC).
   - Used for official municipal cadastral plans and sub-meter area calculations.

---

## 2. Public Spatial Layers Inventory

| Layer ID | Layer Name | Authority / Provider | Format / Protocol | Coordinate System | Features Covered |
|---|---|---|---|---|---|
| `GEO-001` | **Tehran 22 Urban Districts Boundary** | Tehran Municipality / NCC | GeoJSON / Polygon | EPSG:4326 | Outer boundary of Districts 1 through 22 |
| `GEO-002` | **Tehran 354 Neighborhood Boundaries** | Tehran Urban Planning / Atlas | GeoJSON / Polygon | EPSG:4326 | Standard municipal neighborhoods (محلات ۳۵۴گانه) |
| `GEO-003` | **Subway Network (Lines 1 to 7)** | Tehran Metro Co. | GeoJSON / MultiLineString | EPSG:4326 | Active track alignments and 150+ station coordinates |
| `GEO-004` | **Central Traffic Congestion Zone (طرح ترافیک)** | Tehran Traffic Org. | GeoJSON / Polygon | EPSG:4326 | Core restriction area (District 6, 11, 12) |
| `GEO-005` | **Clean Air Zone (طرح کنترل آلودگی هوا)** | Tehran Traffic Org. | GeoJSON / Polygon | EPSG:4326 | Secondary ring (Resalat to Hemmat/Chamran) |
| `GEO-006` | **Public Fault Lines (گسل‌های فعال تهران)** | Geological Survey of Iran / BHRC | GeoJSON / Polyline | EPSG:4326 | North Tehran, Ray, and Mosha fault traces |
| `GEO-007` | **Raster Tile Base Services** | Neshan Maps / OpenStreetMap / CartoDB | Tile URL (`{z}/{x}/{y}`) | EPSG:3857 | Keyless raster basemaps with Persian labels |

---

## 3. Spatial Aggregation & Point-in-Polygon Resolution

Tehran Radar implements deterministic spatial resolution:
1. **Latitude/Longitude Pinning**: Each neighborhood has an authoritative geographic centroid (`lat`, `lng`).
2. **Bounding Box Validation**: Centroids are validated to fall strictly within Tehran bounding coordinates (`[35.50, 51.10]` to `[35.85, 51.65]`).
3. **Distance Calculation**: Haversine distance formula calculates accurate proximity in kilometers or miles (`convertAreaFromSqm`, `formatAreaShort`).
4. **Traffic & Metro Overlay**: `src/components/mapAdvancedLayers.ts` coordinates real-time layer toggling without re-rendering base Leaflet tiles.

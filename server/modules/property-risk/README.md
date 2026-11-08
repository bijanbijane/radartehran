# Property Environmental Risk & Resilience Intelligence Backend Module

Exclusive Module Directory: `server/modules/property-risk/`

## 1. Domain Purpose & Responsibilities
This module provides evidence-based natural hazard, environmental exposure, and physical resilience intelligence for real estate.

### Strict Conceptual Invariants:
- **Separation of Hazard, Exposure, Vulnerability, and Risk**:
  - **Hazard**: The natural/environmental phenomenon (fault line, flood basin, subsidence bowl).
  - **Exposure**: Location overlap of an asset within a hazard zone ($E$).
  - **Vulnerability**: Physical structural attributes of the building determining susceptibility ($V$).
  - **Risk**: Synthesized analytical outcome derived from a documented matrix ($E \times V$).
- **No Disaster Prediction or Safety Certification**: Does NOT claim to predict individual earthquake/flood events or certify structural stability.
- **Geospatial Resolution Preservation**: Differentiates parcel/buffer exact matches from neighborhood centroid or regional coarse layers.
- **Decoupled Architecture**: Consumes external data exclusively via adapter interfaces in `contracts.ts`.

## 2. Integration Interface
```ts
import { createPropertyRiskService } from './index.js';

const riskService = createPropertyRiskService({
  repository: new InMemoryPropertyRiskRepository(),
  outboxPublisher: eventPublisherAdapter
});
```

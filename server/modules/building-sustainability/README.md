# Building Energy Efficiency & Sustainability Intelligence Backend Module

Exclusive Module Directory: `server/modules/building-sustainability/`

## 1. Domain Overview & Purpose
This module provides evidence-backed building energy profiles, multi-fuel consumption normalization, Energy-Use Intensity (EUI) analytics, Scope 1 and Scope 2 operational carbon emissions accounting, solar photovoltaic scenario modeling, compound retrofit impact projections, and regional sustainability benchmarking.

### Invariants & Non-Ownership:
- **No Physical Auditing or Equipment Operation**: Does NOT conduct physical engineering inspections, install solar equipment, operate utility meters, or certify buildings.
- **Unit Normalization & Primary Energy**: Normalizes disparate fuels (m³, liters, MJ, GJ) to delivered kWh, computing both Site EUI and Primary Energy EUI.
- **GHG Scope 1 & Scope 2 Accounting**: Computes direct on-site combustion emissions (Scope 1) and grid electricity emissions (Scope 2) with avoidance credits for on-site renewables.
- **Compound Retrofit Modeling**: Models multiple retrofit interventions using multiplicative compound interaction $1 - \prod (1 - r_i)$ to prevent unrealistic $> 100\%$ savings.
- **Decoupled Architecture**: Consumes external data exclusively via adapter interfaces in `contracts.ts`.

## 2. Integration Interface
```ts
import { createBuildingSustainabilityService } from './index.js';

const sustainabilityService = createBuildingSustainabilityService({
  repository: new InMemoryBuildingSustainabilityRepository(),
  outboxPublisher: eventPublisherAdapter
});
```

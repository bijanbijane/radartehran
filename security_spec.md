# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Unmatched paths are strictly denied (`allow read, write: if false;`).
2. **Verified Authentication**: All client writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Identity & Ownership Integrity**:
   - A `ResidentVote` (`/votes/{voteId}`) must have `userId == request.auth.uid` and deterministic document ID `request.auth.uid + '_hood_' + string(hoodId)` on creation.
   - A `UserPreference` (`/userPreferences/{userId}`) must have path `{userId} == request.auth.uid` and payload `userId == request.auth.uid`.
   - A `BargainSubmission` (`/bargains/{bargainId}`) stores no `userId` on the public document; ownership is bound atomically in `/bargainOwners/{bargainId}` via `writeBatch`.
   - A `BuyerAlertLead` (`/buyerAlerts/{alertId}`) must have `userId == request.auth.uid` and deterministic document ID `request.auth.uid + '_hood_' + string(hoodId)` on creation.
4. **Strict Key, Range & Cooldown Validation**:
   - `ResidentVote` requires exact keys (`hoodId`, `hoodName`, `userId`, `userDisplayName`, `air`, `powerWater`, `internet`, `metro`, `security`, `flatTerrain`, `comment`, `locationVerified`, `createdAt`, `lastUpdatedAt`) with bounded string sizes (`hoodName <= 80`, `userDisplayName <= 100`, `comment <= 500`), numeric ranges (`1..999` for `hoodId`, `1..10` for scores), `createdAt == request.time`, and a 24-hour update cooldown (`request.time >= resource.data.lastUpdatedAt + duration.value(24, 'h')`).
   - `UserPreference` requires exact keys (`userId`, `mode`, `deposit`, `monthlyRent`, `buyTotalBudget`, `targetSqm`, `workHubId`, `favoriteHoodIds`, `updatedAt`) with bounded array size (`favoriteHoodIds.size() <= 25`) and `updatedAt == request.time`.
5. **PII Protection & Query Enforcement**:
   - Public unauthenticated reads on `/votes/{voteId}`, `/buyerAlerts/{alertId}`, `/sponsorRequests/{requestId}`, and `/bargainOwners/{bargainId}` are denied.
   - `/userPreferences/{userId}` allows `get` only by the owner (`request.auth.uid == userId`), and `list` is forbidden (`if false`).

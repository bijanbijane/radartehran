# Backup & Recovery Runbook — Tehran Housing Radar (رادار مسکن)

## 1. Server-Side Disk Cache Persistence (`.cache-data.json`)
- **Mechanism**: `src/utils/serverMarketPulseEngine.ts` (`flushDiskCache` & `saveDiskPersistedCache`) asynchronously and atomically persists `lastPulseUpdatedMs`, `lastPulseUpdatedMsByCity`, `deepSyncedOverrides`, `liveMacroRates`, `latestZoneAirQuality`, and `serverAuditLogs` (up to 40 redacted entries) to `.cache-data.json` by writing a PID-scoped temporary file with mode `0o600` and renaming it (`fs.promises.rename`).
- **Privacy Guarantee**: Buyer contact leads (`buyerLeads`) and secret environment variables (`SECRET_ENV_KEYS`) are never written to `.cache-data.json` or `.runtime-config.json`.
- **Startup Recovery**: On process startup, `loadDiskPersistedCache()` validates and clamps all fields before restoring them into memory so server restarts preserve synced city-scoped neighborhood pricing and AQI readings without risk of cross-city data pollution.

## 2. Admin JSON Backup Export & Validated Atomic Restore (`src/components/useRadarAdminActions.ts`, `src/data/neighborhoods.ts`)
- **Full JSON Export (`handleDownloadFullBackupJson`)**:
  - Exports a timestamped JSON file (`tehran-radar-full-backup-YYYY-MM-DDTHH-mm-ss.json`) to the verified administrator's device containing `schemaVersion`, `exportedAtIso`, `neighborhoods` (Tehran + multi-city overrides), `sponsorRequests`, `buyerLeads`, `favoriteHoodIds`, and `featureFlags`.
- **Validated Atomic JSON Restore (`validateAndBuildRestoredState` & `handleRestoreFullBackupJson`)**:
  - Parses and validates the uploaded JSON before mutating any state.
  - Rejects empty, corrupted, or schema-invalid files (`ok: false`) without touching existing application state.
  - Merges all Tehran neighborhoods (`INITIAL_NEIGHBORHOODS`) and multi-city neighborhoods (`101..406` via `ALL_EXPANSION_SEEDS`) using `mergeNeighborhoodWithSeed`, preserving explicit empty `bargains: []` arrays and clamping numeric fields.
  - Filters and sanitizes `sponsorRequests`, `buyerLeads`, `favoriteHoodIds` (deduplicated, `1..999`, max 25), and `featureFlags`.

## 3. Client Offline Resilience
- Browser `localStorage` caches non-sensitive neighborhood overrides (`tehran_neighborhoods_radar_v2`), local non-cloud CRM demo items, and feature flags (`tehran_radar_feature_flags_v2`), while `src/firebase.ts` configures `experimentalAutoDetectLongPolling: true` for resilient Firestore synchronization.

## Object Storage Pending-Delete Recovery

Media records in `.object-storage-bucket/index.json` may have:

```json
{
  "deletionState": "pending_delete"
}
```

This state means deletion was requested, the server recorded that intent durably, and the operation had not yet completed across remote storage, local disk, and index persistence.

### Safety Rules

1. Never delete all `pending_delete` files blindly by hand.
2. If a record has `bargainId`, verify that both Firestore documents are absent in the named database (`ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`):
   - `bargains/{bargainId}`
   - `bargainOwners/{bargainId}`
3. Use the administrative recovery route:

```bash
POST /api/object-storage/admin/reconcile-pending-deletes?limit=25
```

4. A `200` response means all scanned pending deletions completed.
5. A `207` response means at least one record failed or remains blocked (`bargain_still_exists`, `owner_still_exists`, `remote_delete_failed`, `local_delete_failed`, or `invalid_record`).
6. Do not remove index entries manually unless you have verified both the remote bucket object and the local `.object-storage-local` file.

---

## 5. Incident-Response & Emergency Triage Framework (`SEV-1` to `SEV-4`)

| Severity | Definition | Target Triage SLA | Primary Containment Action |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Complete service outage, secret exposure, or cross-tenant data leak | `< 15 min` | Rotate compromised credentials immediately, disable affected feature flag in `/appConfig/featureFlags`, and preserve forensic audit chain (`TamperResistantForensicLedger`). |
| **SEV-2 (High)** | Degraded write path (upload failure, admin sync failure, Firestore rule regression) | `< 1 hour` | Switch to read-only fallback mode, inspect `GET /api/system-health` audit logs, and redeploy verified `firestore.rules`. |
| **SEV-3 (Medium)** | Upstream provider degradation (Open-Meteo, Overpass, Gemini, or Neshan timeout) | `< 4 hours` | Confirm automatic circuit-breaker & local seed/rule fallback activation; monitor recovery without restarting server. |
| **SEV-4 (Low)** | Minor UI/visual anomaly or single-neighborhood override discrepancy | `< 24 hours` | Correct override via Admin Panel or submit a tested pull request passing `npm test`. |

### Post-Incident Checklist (10 Steps)
1. **Severity Classification**: Assign `SEV-1..SEV-4` and establish a correlation ID.
2. **Initial Triage**: Inspect `GET /api/system-health` and redacted `serverAuditLogs`.
3. **Evidence Preservation**: Export tamper-evident forensic ledger entries before restarting any ephemeral instance.
4. **Containment**: Toggle feature flags or revoke compromised tokens without deleting user data.
5. **Service Restoration**: Restore from verified encrypted backup (`decryptAndVerifyEncryptedBackup`) or redeploy last known-good commit.
6. **Data Integrity Verification**: Run `validateCrossServiceBackupConsistency` across Firestore `/bargains` and Object Storage keys.
7. **Security Incident Handling**: If credentials were exposed, rotate `ADMIN_API_SECRET`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, and S3 keys.
8. **User/Operator Communication**: Display accurate Persian status banner via `translateTechnicalErrorToRecoverableUxMessage`.
9. **Blameless Post-Incident Review**: Document root cause, timeline, and detection gap in `docs/adr-evolution-and-governance.md`.
10. **Preventive Regression Test**: Add a deterministic reproduction test to `tests/` so the failure mode can never silently recur.



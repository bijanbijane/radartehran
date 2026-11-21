# radartehran-api — container packaging (RT-INFRA-005)

## Build (repository root)

```bash
docker build --platform linux/amd64 -f apps/api/Dockerfile -t radartehran-api:local .
```

## Run

Inject secrets via environment (never bake `.env` into the image):

```bash
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e RADAR_API_ONLY=1 \
  -e FIREBASE_PROJECT_ID=... \
  radartehran-api:local
```

Default `CMD` uses `apps/api/scripts/start-production.mjs` (sets `NODE_ENV=production` and `RADAR_API_ONLY=1` when unset).

Combined static+API (not default in this image): set `RADAR_SERVE_FRONTEND=1` and mount a `dist/` volume.

## Persistence (RT-INFRA-006)

| Path | Role |
|------|------|
| `.object-storage-bucket/` | User media bytes + `index.json` (local dev cache; **production uploads require S3/R2 sync**) |
| `.runtime-config.json` | Admin non-secret overrides (dev); production uses env unless `RADAR_ALLOW_RUNTIME_CONFIG_DISK=1` |
| `.cache-data.json` | Rebuildable market-pulse / macro cache |
| `.cache/repositories/` | Rebuildable module JSON repos |

Required for durable media in production:

```bash
-e NODE_ENV=production \
-e OBJECT_STORAGE_PROVIDER=r2 \
-e OBJECT_STORAGE_BUCKET=... \
-e OBJECT_STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
-e OBJECT_STORAGE_ACCESS_KEY=... \
-e OBJECT_STORAGE_SECRET_KEY=... \
-e R2_ACCOUNT_ID=...
```

- Uploads fail closed (`503`) if credentials or remote sync fail — no durable local-only success in production.
- `GET /api/object-storage/file/:id` can fetch from remote when the local copy is missing and `remoteS3Synced` is true.
- `RADAR_STRICT_PERSISTENCE=1` exits on boot when object storage is misconfigured.
- **Production metadata authority:** Firestore `media_object_metadata_v2` (`stored_object_record_v1`); `index.json` is dev/test only.
- Legacy `index.json` / `mediaObjects` records are **not auto-migrated**; see RT-INFRA-007 migration notes in code comments.
- **Repository JSON (RT-INFRA-008):** production persists `.cache/repositories/*.json` to R2 (`platform/repository-snapshots/v1/...`) with Firestore registry `radar_repository_snapshots_v1`. Local JSON is dev/test only unless `RADAR_REPOSITORY_LOCAL_JSON=1`.
- Dry-run migration: `npx tsx -e "import('./server/modules/shared/repositorySnapshotMigration').then(m=>m.runRepositorySnapshotMigrationDryRun().then(console.log))"` (no production writes).
- Geospatial migration (RT-INFRA-009 §5): dry-run default via `buildGeospatialPreMigrationReport()` or `runGeospatialOperatorMigration({ dryRun: true })`. Execute requires `{ dryRun: false, execute: true }`; production also needs `authorizeProduction: true` and `RADAR_GEO_MIGRATION_AUTHORIZE=1`. No startup migration, no local file deletion.
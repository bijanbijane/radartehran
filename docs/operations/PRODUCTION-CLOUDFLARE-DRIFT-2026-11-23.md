# Production Cloudflare Drift — 2026-11-23

This is a read-only operational snapshot. It is not a deployment approval and does not authorize production database mutations.

## D1 usage snapshot

Cloudflare D1 Insights, UTC window `2026-11-23T00:00:00Z` through approximately `09:37Z`:

| Database | Rows read | Rows written | Queries |
|---|---:|---:|---:|
| `radar-neighborhood-db` (`f335efe8-37ac-4c7d-a057-bc9f4480f6c6`) | 2,740,971 | 723,737 | 109,950 |
| `radar-user-db` | 2,183 | 0 | 108 |
| `radar-researcher-db` | 755 | 0 | 86 |

The shared neighborhood database accounts for nearly all measured activity.

The D1 query insights for the same window showed repeated staging inserts:

| Stage table | Executions | Rows written |
|---|---:|---:|
| `geo_registry_entity_stage` | 19,507 | 97,535 |
| `geo_registry_relationship_stage` | 19,884 | 79,536 |
| `geo_registry_identity_anchor_stage` | 19,848 | 79,392 |
| `geo_registry_identity_entry_stage` | 19,823 | 79,292 |
| `geo_registry_source_mapping_stage` | 18,319 | 73,276 |

A grouped stage-count query also read approximately 1.65 million rows over 84 executions. The publisher-side staging inserts are the clearest observed write source. D1's daily Free-tier limit is 100,000 rows written; whether that limit applies to this account is unverified because the connected API identity lacks Billing Read access.

## Live Worker binding and route drift

Read-only Cloudflare Worker settings showed:

- Production script: `radartehran-api`.
- Its live D1 binding includes `NEIGHBORHOOD_DB` pointing at `radar-neighborhood-db`.
- No production `RADAR_QUEUE` binding was present.
- The staging Worker has a queue binding; production does not.
- The live Worker source map contains `worker/routes/geographicRegistryRoutes.ts` and the internal IRNI publish endpoints (`publish/start`, `publish/batch`, `publish/finalize`). That route module is absent from the current GitHub branch's Worker route tree.
- The live Worker source applies `DB_WRITES_PAUSED_UNTIL_UTC` to queue and scheduled handlers, but not to the HTTP `fetch` dispatch path. The production variable is currently set to `2026-11-24T00:00:00Z`.

The current PR branch adds an HTTP write-pause guard and a regression test for the internal IRNI publisher path. However, the branch's intended data-domain isolation also treats `NEIGHBORHOOD_DB` as a forbidden Radar binding. Deploying it as-is would remove the live publisher route while IRNI's current workflow still posts to that route.

## Required sequencing before deployment

1. Keep production D1 read-only from this debugging session. Do not run SQL probes, migrations, load tests, or publish workflows as diagnostics.
2. Merge and deploy no Worker branch until the IRNI publisher endpoint has a supported replacement under IRNI ownership and the publisher workflow points to it.
3. Provision and verify the production Queue resource/binding before enabling scheduled jobs.
4. Deploy the HTTP write-pause guard only with an explicit review of its allowlisted write paths and user-facing impact.
5. Keep the deterministic publisher batch-ID change in the IRNI PR. It makes retries of the same revision/checksum reuse the same D1 staging session; it does not delete older orphaned staging sessions.
6. Confirm the account's actual D1 plan and monthly/daily usage through an identity with Billing Read permission before deciding whether the observed write volume is an over-quota event.

## Actions not performed

- No D1 SQL was executed.
- No D1 migration was applied.
- No production Worker was deployed or modified.
- No Queue, D1, R2, or other Cloudflare resource was created, deleted, or reconfigured.
- No production registry publication was dispatched.

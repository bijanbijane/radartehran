/**
 * Employee 7 — Complete User Data Export Service
 * (`server/modules/account-lifecycle/exportService.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Enforces all export requirements:
 *  - Includes all supported user-owned records (`USER_PROFILE`, `FAVORITES_AND_WORKSPACES`,
 *    `BUYER_ALERTS`, `BARGAIN_LISTINGS`, `SPONSOR_RECORDS`, `CROWD_CLAIMS`, `MEDIA_METADATA`).
 *  - Uses bounded pagination (`pageSize` 1..50, `maxPagesPerSource` 1..200).
 *  - Prevents cross-user data leakage (actor authorization + strict per-record `ownerUid === targetUid` verification).
 *  - Records export completeness (`COMPLETE` vs `INCOMPLETE_PARTIAL`).
 *  - Reports incomplete exports truthfully and never silently omits failed pages.
 */

import crypto from 'node:crypto';
import {
  AccountLifecycleActorContext,
  AccountLifecycleError,
  ALL_USER_OWNED_DOMAIN_SOURCES,
  CompleteUserDataExportEnvelope,
  ExportUserDataOptions,
  OwnedDomainRecordItem,
  SourceExportProgressReport,
  UserOwnedDomainRepositoryAdapter,
  UserOwnedDomainSource,
} from './types.ts';

export const DEFAULT_EXPORT_PAGE_SIZE = 20;
export const MAX_EXPORT_PAGE_SIZE = 50;
export const DEFAULT_MAX_PAGES_PER_SOURCE = 50;

export function assertAuthorizedForTargetAccount(
  actor: AccountLifecycleActorContext,
  targetUid: string,
  operation: 'EXPORT' | 'DELETE' | 'STATUS',
): void {
  if (!actor || typeof actor.uid !== 'string' || actor.uid.trim().length === 0) {
    throw new AccountLifecycleError(
      'UNAUTHORIZED_ACTOR',
      `Authenticated actor is required to perform account ${operation}.`,
      401,
    );
  }
  const normalizedTarget = typeof targetUid === 'string' ? targetUid.trim() : '';
  if (!normalizedTarget) {
    throw new AccountLifecycleError(
      'UNAUTHORIZED_ACTOR',
      `Valid targetUid is required for account ${operation}.`,
      400,
    );
  }
  if (actor.uid !== normalizedTarget && !actor.isAdmin) {
    throw new AccountLifecycleError(
      'CROSS_USER_ACCESS_FORBIDDEN',
      `Actor "${actor.uid}" is forbidden from performing ${operation} on user "${normalizedTarget}".`,
      403,
    );
  }
}

export class AccountDataExportService {
  private readonly adapters: Map<UserOwnedDomainSource, UserOwnedDomainRepositoryAdapter>;

  constructor(adapters: Iterable<UserOwnedDomainRepositoryAdapter>) {
    this.adapters = new Map();
    for (const adapter of adapters) {
      this.adapters.set(adapter.source, adapter);
    }
  }

  public registerAdapter(adapter: UserOwnedDomainRepositoryAdapter): void {
    this.adapters.set(adapter.source, adapter);
  }

  public async exportUserData(
    actor: AccountLifecycleActorContext,
    targetUid: string,
    options?: ExportUserDataOptions,
  ): Promise<CompleteUserDataExportEnvelope> {
    assertAuthorizedForTargetAccount(actor, targetUid, 'EXPORT');

    const requestedPageSize = options?.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE;
    if (
      !Number.isInteger(requestedPageSize) ||
      requestedPageSize < 1 ||
      requestedPageSize > MAX_EXPORT_PAGE_SIZE
    ) {
      throw new AccountLifecycleError(
        'INVALID_PAGINATION_OPTIONS',
        `Export pageSize must be an integer between 1 and ${MAX_EXPORT_PAGE_SIZE} (received ${requestedPageSize}).`,
        400,
      );
    }

    const maxPagesPerSource = options?.maxPagesPerSource ?? DEFAULT_MAX_PAGES_PER_SOURCE;
    if (!Number.isInteger(maxPagesPerSource) || maxPagesPerSource < 1 || maxPagesPerSource > 500) {
      throw new AccountLifecycleError(
        'INVALID_PAGINATION_OPTIONS',
        `maxPagesPerSource must be an integer between 1 and 500 (received ${maxPagesPerSource}).`,
        400,
      );
    }

    const requestedSources: readonly UserOwnedDomainSource[] =
      options?.sources && options.sources.length > 0
        ? options.sources
        : ALL_USER_OWNED_DOMAIN_SOURCES;

    const sourceReports = {} as Record<UserOwnedDomainSource, SourceExportProgressReport>;
    const recordsBySource = {} as Record<UserOwnedDomainSource, OwnedDomainRecordItem[]>;
    for (const source of ALL_USER_OWNED_DOMAIN_SOURCES) {
      recordsBySource[source] = [];
      sourceReports[source] = {
        source,
        status: 'COMPLETE',
        pagesFetched: 0,
        recordsExported: 0,
        lastCursor: null,
        hasMoreAtStop: false,
      };
    }

    const omittedOrFailedSources: UserOwnedDomainSource[] = [];
    let totalRecordsExported = 0;
    let totalPagesFetched = 0;
    let omittedPagesCount = 0;

    for (const source of requestedSources) {
      const adapter = this.adapters.get(source);
      if (!adapter) {
        sourceReports[source] = {
          source,
          status: 'FAILED_INCOMPLETE',
          pagesFetched: 0,
          recordsExported: 0,
          lastCursor: null,
          hasMoreAtStop: true,
          failedPageNumber: 1,
          failureReason: `No repository adapter registered for domain source "${source}".`,
        };
        omittedOrFailedSources.push(source);
        omittedPagesCount += 1;
        continue;
      }

      let cursor: string | null = null;
      let pagesFetched = 0;
      let hasMore = true;

      while (hasMore && pagesFetched < maxPagesPerSource) {
        const currentPageNumber = pagesFetched + 1;
        try {
          const page = await adapter.fetchOwnedRecordsPage({
            targetUid,
            cursor,
            pageSize: requestedPageSize,
          });

          // Enforce bounded page size invariant and strict cross-user isolation on every item
          if (page.items.length > requestedPageSize) {
            throw new AccountLifecycleError(
              'INVALID_PAGINATION_OPTIONS',
              `Adapter "${source}" returned ${page.items.length} records, exceeding bounded pageSize ${requestedPageSize}.`,
              500,
            );
          }

          for (const item of page.items) {
            if (!item || item.ownerUid !== targetUid) {
              throw new AccountLifecycleError(
                'CROSS_USER_DATA_LEAK_DETECTED',
                `Cross-user data leak prevented in source "${source}": record "${item?.recordId ?? 'unknown'}" belongs to "${item?.ownerUid ?? 'unknown'}", not target "${targetUid}".`,
                500,
              );
            }
          }

          recordsBySource[source].push(...page.items);
          pagesFetched += 1;
          totalPagesFetched += 1;
          totalRecordsExported += page.items.length;
          cursor = page.nextCursor;
          hasMore = Boolean(page.hasMore);

          sourceReports[source] = {
            source,
            status: 'COMPLETE',
            pagesFetched,
            recordsExported: recordsBySource[source].length,
            lastCursor: cursor,
            hasMoreAtStop: hasMore,
          };
        } catch (err) {
          if (err instanceof AccountLifecycleError && err.code === 'CROSS_USER_DATA_LEAK_DETECTED') {
            throw err;
          }
          const reason = err instanceof Error ? err.message : String(err);
          sourceReports[source] = {
            source,
            status: 'FAILED_INCOMPLETE',
            pagesFetched,
            recordsExported: recordsBySource[source].length,
            lastCursor: cursor,
            hasMoreAtStop: true,
            failedPageNumber: currentPageNumber,
            failureReason: reason,
          };
          omittedOrFailedSources.push(source);
          omittedPagesCount += 1;
          hasMore = false;
          break;
        }
      }

      // If pagination stopped because maxPagesPerSource was reached while hasMore is still true,
      // report incomplete status truthfully rather than pretending the export is complete.
      if (
        sourceReports[source].status === 'COMPLETE' &&
        sourceReports[source].hasMoreAtStop
      ) {
        sourceReports[source] = {
          ...sourceReports[source],
          status: 'PAGINATION_LIMIT_INCOMPLETE',
          failureReason: `Pagination bound maxPagesPerSource=${maxPagesPerSource} reached while additional records remain at cursor="${sourceReports[source].lastCursor}".`,
        };
        omittedOrFailedSources.push(source);
        omittedPagesCount += 1;
      }
    }

    const isComplete = omittedOrFailedSources.length === 0;

    return {
      exportId: `exp_${targetUid}_${crypto.randomUUID().slice(0, 8)}`,
      schemaVersion: '2026-05.account-export.v1',
      targetUid,
      requestedByUid: actor.uid,
      generatedAtIso: new Date().toISOString(),
      completenessStatus: isComplete ? 'COMPLETE' : 'INCOMPLETE_PARTIAL',
      isComplete,
      omittedOrFailedSources,
      totalRecordsExported,
      totalPagesFetched,
      omittedPagesCount,
      sourceReports,
      recordsBySource,
    };
  }
}

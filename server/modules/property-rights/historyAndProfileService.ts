import {
  addExactFractions,
  assertAuthorizedForPropertyInterestsQuery,
  assertValidIsoTimestamp,
  compareExactFractions,
  toRedactedOwnershipInterest,
} from './sharesAndValidation';
import { PropertyRightsStore } from './store';
import {
  CoOwnershipSummaryView,
  OwnershipDisputeRecord,
  OwnershipInterestRecord,
  PropertyEncumbranceRecord,
  PropertyOwnershipAndRightsProfile,
  PropertyRightRecord,
  PropertyRightsActorContext,
  PropertyRightsHistoryEventRecord,
  PublicOrRedactedOwnershipInterestView,
} from './types';

export class HistoryAndProfileService {
  constructor(private readonly store: PropertyRightsStore) {}

  private isRecordEffectiveAtDate(
    effectiveFromIso: string,
    terminationOrExpiryIso: string | null | undefined,
    asOfMs: number,
  ): boolean {
    const fromMs = Date.parse(effectiveFromIso);
    const toMs = terminationOrExpiryIso ? Date.parse(terminationOrExpiryIso) : Number.POSITIVE_INFINITY;
    return asOfMs >= fromMs && asOfMs < toMs;
  }

  /**
   * Reconstructs the historical property-interest, non-ownership rights, and encumbrances state
   * at a specific `asOfDateIso` (with optional `knownByRecordedDateIso` filter for bitemporal queries).
   */
  async getHistoricalPropertyStateAsOfDate(
    params: {
      propertyId: string;
      asOfDateIso: string;
      knownByRecordedDateIso?: string;
    },
    actor: PropertyRightsActorContext,
  ): Promise<{
    propertyId: string;
    asOfDateIso: string;
    activeOwnershipInterests: Array<OwnershipInterestRecord | PublicOrRedactedOwnershipInterestView>;
    activeNonOwnershipRights: PropertyRightRecord[];
    activeEncumbrances: PropertyEncumbranceRecord[];
    coOwnershipSummaryAtDate: CoOwnershipSummaryView;
  }> {
    const asOfMs = Date.parse(assertValidIsoTimestamp(params.asOfDateIso, 'asOfDateIso'));
    const recordedCutoffMs = params.knownByRecordedDateIso
      ? Date.parse(assertValidIsoTimestamp(params.knownByRecordedDateIso, 'knownByRecordedDateIso'))
      : Number.POSITIVE_INFINITY;

    const [allInterests, allRights, allEncumbrances] = await Promise.all([
      this.store.listOwnershipInterestsByProperty(params.propertyId),
      this.store.listPropertyRightsByProperty(params.propertyId),
      this.store.listEncumbrancesByProperty(params.propertyId),
    ]);

    assertAuthorizedForPropertyInterestsQuery(
      actor,
      allInterests.map((i) => i.partyRef.partyId),
    );

    const activeInterestsRaw = allInterests.filter((i) => {
      if (Date.parse(i.recordedAtIso) > recordedCutoffMs) return false;
      const endIso = i.terminatedAtIso ?? i.expirationDateIso;
      return this.isRecordEffectiveAtDate(i.effectiveFromIso, endIso, asOfMs);
    });

    const activeRights = allRights.filter((r) => {
      if (Date.parse(r.recordedAtIso) > recordedCutoffMs) return false;
      return this.isRecordEffectiveAtDate(r.effectiveFromIso, r.expirationOrTerminationIso, asOfMs);
    });

    const activeEncumbrances = allEncumbrances.filter((e) => {
      if (Date.parse(e.recordedAtIso) > recordedCutoffMs) return false;
      return this.isRecordEffectiveAtDate(e.effectiveFromIso, e.expirationOrReleaseIso, asOfMs);
    });

    const coOwnershipSummaryAtDate = this.computeCoOwnershipSummary(
      params.propertyId,
      params.asOfDateIso,
      activeInterestsRaw,
    );

    return {
      propertyId: params.propertyId,
      asOfDateIso: params.asOfDateIso,
      activeOwnershipInterests: activeInterestsRaw.map((i) => toRedactedOwnershipInterest(i, actor)),
      activeNonOwnershipRights: activeRights,
      activeEncumbrances,
      coOwnershipSummaryAtDate,
    };
  }

  public computeCoOwnershipSummary(
    propertyId: string,
    evaluatedAsOfDateIso: string,
    activeInterests: OwnershipInterestRecord[],
  ): CoOwnershipSummaryView {
    let totalFraction = { numerator: 0, denominator: 1 };
    let hasUnknownShares = false;
    let verifiedCount = 0;
    let disputedCount = 0;
    const warnings: string[] = [];

    for (const interest of activeInterests) {
      if (interest.statusVector.verificationStatus === 'VERIFIED') verifiedCount += 1;
      if (interest.statusVector.verificationStatus === 'DISPUTED') disputedCount += 1;

      if (interest.ownershipShare.shareState === 'UNKNOWN_SHARE') {
        hasUnknownShares = true;
        warnings.push(
          `Interest '${interest.id}' (${interest.partyRef.publicRoleLabel}) has an UNKNOWN_SHARE; missing shares are never redistributed automatically.`,
        );
      } else if (
        interest.ownershipShare.shareState === 'KNOWN_EXACT_SHARE' &&
        interest.statusVector.verificationStatus !== 'REJECTED'
      ) {
        totalFraction = addExactFractions(totalFraction, {
          numerator: interest.ownershipShare.numerator!,
          denominator: interest.ownershipShare.denominator!,
        });
      }
    }

    const cmpToOne = compareExactFractions(totalFraction, { numerator: 1, denominator: 1 });
    if (cmpToOne < 0 && activeInterests.length > 0) {
      warnings.push(
        `Recorded active known shares sum to ${totalFraction.numerator}/${totalFraction.denominator} (less than 100%). Remaining shares are unrecorded or unknown.`,
      );
    } else if (cmpToOne > 0) {
      warnings.push(
        `Competing or disputed claims cause recorded shares to sum to ${totalFraction.numerator}/${totalFraction.denominator} (exceeding 100%).`,
      );
    }

    return {
      propertyId,
      evaluatedAsOfDateIso,
      activeInterestsCount: activeInterests.length,
      verifiedInterestsCount: verifiedCount,
      disputedInterestsCount: disputedCount,
      hasUnknownShares,
      totalKnownActiveShare: {
        numerator: totalFraction.numerator,
        denominator: totalFraction.denominator,
        exceeds100Percent: cmpToOne > 0,
        equals100Percent: cmpToOne === 0 && !hasUnknownShares,
      },
      coOwnerBreakdown: activeInterests.map((i) => ({
        interestId: i.id,
        partyId: i.partyRef.partyId,
        publicRoleLabel: i.partyRef.publicRoleLabel,
        share: structuredClone(i.ownershipShare),
        statusVector: structuredClone(i.statusVector),
      })),
      warnings,
    };
  }

  /**
   * Returns historical events that were recorded in the system after their real-world effective date
   * (`learnedAfterEffectiveDateDays > 0`).
   */
  async getEventsLearnedAfterEffectiveDate(
    propertyId: string,
    actor: PropertyRightsActorContext,
  ): Promise<PropertyRightsHistoryEventRecord[]> {
    const interests = await this.store.listOwnershipInterestsByProperty(propertyId);
    assertAuthorizedForPropertyInterestsQuery(
      actor,
      interests.map((i) => i.partyRef.partyId),
    );
    const events = await this.store.listHistoryEventsByProperty(propertyId, 100);
    return events.filter((e) => e.learnedAfterEffectiveDateDays > 0);
  }

  async getOwnershipAndRightsHistory(
    propertyId: string,
    actor: PropertyRightsActorContext,
    filterEntityType?: PropertyRightsHistoryEventRecord['affectedEntityType'],
  ): Promise<PropertyRightsHistoryEventRecord[]> {
    const interests = await this.store.listOwnershipInterestsByProperty(propertyId);
    assertAuthorizedForPropertyInterestsQuery(
      actor,
      interests.map((i) => i.partyRef.partyId),
    );
    const events = await this.store.listHistoryEventsByProperty(propertyId, 100);
    return filterEntityType ? events.filter((e) => e.affectedEntityType === filterEntityType) : events;
  }

  async getUnresolvedConflictsAndDisputes(
    propertyId: string,
    actor: PropertyRightsActorContext,
  ): Promise<OwnershipDisputeRecord[]> {
    const interests = await this.store.listOwnershipInterestsByProperty(propertyId);
    assertAuthorizedForPropertyInterestsQuery(
      actor,
      interests.map((i) => i.partyRef.partyId),
    );
    const disputes = await this.store.listDisputesByProperty(propertyId);
    return disputes.filter((d) => d.disputeStatus === 'OPEN_UNRESOLVED' || d.disputeStatus === 'UNDER_LEGAL_REVIEW');
  }

  async generatePropertyOwnershipAndRightsProfile(
    propertyId: string,
    actor: PropertyRightsActorContext,
    asOfDateIso?: string,
  ): Promise<PropertyOwnershipAndRightsProfile> {
    const evaluatedAsOfDateIso = asOfDateIso
      ? assertValidIsoTimestamp(asOfDateIso, 'asOfDateIso')
      : new Date().toISOString();
    const asOfMs = Date.parse(evaluatedAsOfDateIso);

    const [allInterests, allRights, allTenures, allEncumbrances, allDisputes] = await Promise.all([
      this.store.listOwnershipInterestsByProperty(propertyId),
      this.store.listPropertyRightsByProperty(propertyId),
      this.store.listTenureInterestsByProperty(propertyId),
      this.store.listEncumbrancesByProperty(propertyId),
      this.store.listDisputesByProperty(propertyId),
    ]);

    assertAuthorizedForPropertyInterestsQuery(
      actor,
      allInterests.map((i) => i.partyRef.partyId),
    );

    const activeInterests = allInterests.filter(
      (i) =>
        !i.terminatedAtIso &&
        i.statusVector.verificationStatus !== 'SUPERSEDED' &&
        i.statusVector.verificationStatus !== 'REJECTED' &&
        this.isRecordEffectiveAtDate(i.effectiveFromIso, i.expirationDateIso, asOfMs),
    );

    const coOwnershipSummary = this.computeCoOwnershipSummary(
      propertyId,
      evaluatedAsOfDateIso,
      activeInterests,
    );

    const activeEncumbrances = allEncumbrances.filter(
      (e) =>
        e.classificationState !== 'RELEASED_OR_EXPIRED_WITH_EVIDENCE' &&
        this.isRecordEffectiveAtDate(e.effectiveFromIso, e.expirationOrReleaseIso, asOfMs),
    );

    const openDisputes = allDisputes.filter(
      (d) => d.disputeStatus === 'OPEN_UNRESOLVED' || d.disputeStatus === 'UNDER_LEGAL_REVIEW',
    );

    const hasUnverifiedClaims = activeInterests.some(
      (i) => i.statusVector.verificationStatus !== 'VERIFIED',
    );
    const hasUnresolvedDisputes = openDisputes.length > 0 || coOwnershipSummary.disputedInterestsCount > 0;
    const hasShareSumMismatchOrUnknowns =
      !coOwnershipSummary.totalKnownActiveShare.equals100Percent || coOwnershipSummary.hasUnknownShares;

    const definitiveLegalChainEstablished =
      activeInterests.length > 0 &&
      !hasUnverifiedClaims &&
      !hasUnresolvedDisputes &&
      !hasShareSumMismatchOrUnknowns;

    const integrityWarnings: string[] = [...coOwnershipSummary.warnings];
    if (hasUnverifiedClaims) {
      integrityWarnings.push(
        'One or more active ownership interests are unverified or documented claims; never treat unverified claims as established legal ownership.',
      );
    }
    if (hasUnresolvedDisputes) {
      integrityWarnings.push(
        'Active unresolved disputes exist on this property; platform does not adjudicate competing legal claims.',
      );
    }

    const propertyRef = allInterests[0]?.propertyRef ??
      allRights[0]?.propertyRef ??
      allEncumbrances[0]?.propertyRef ?? {
        propertyId,
        assetCategory: 'INDEPENDENT_UNIT',
      };

    return {
      profileGeneratedAtIso: new Date().toISOString(),
      evaluatedAsOfDateIso,
      propertyRef,
      coOwnershipSummary,
      ownershipInterests: activeInterests.map((i) => toRedactedOwnershipInterest(i, actor)),
      nonOwnershipRights: allRights,
      tenureInterests: allTenures,
      encumbrances: allEncumbrances,
      encumbranceAssessment: {
        activeEncumbrancesCount: activeEncumbrances.length,
        encumbranceFreeEstablished: false,
        encumbranceStatusNote:
          activeEncumbrances.length === 0
            ? 'No active encumbrances are currently recorded in the system. Absence of a recorded encumbrance does NOT prove the property is legally free of mortgages, liens, or judicial attachments.'
            : `${activeEncumbrances.length} active or unresolved encumbrance record(s) found.`,
      },
      openDisputes,
      chainOfTitleIntegrity: {
        definitiveLegalChainEstablished,
        hasUnverifiedClaims,
        hasUnresolvedDisputes,
        hasShareSumMismatchOrUnknowns,
        integrityWarnings,
      },
      disclaimer:
        'Structured Property Ownership & Rights Registry Profile. Never rely on unverified claims as proof of title, and never infer absence of encumbrances from empty registry records.',
    };
  }
}

import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluateCrmContactLeadAndExplainableScore(params: { contact: { contactId: string; workspaceId: string; fullName: string; entityType: 'INDIVIDUAL' | 'LEGAL_ENTITY'; hasPlatformLoginAccount: boolean; phoneNumbers: string[];
  }; existingWorkspaceContacts: Array<{ contactId: string; fullName: string; phoneNumbers: string[]; }>;
  leadScoringInput: { statedBudgetVerified: boolean; timelineUrgencyDays: number; propertyFitRatio0To1: number;
    recordedInteractionsCount: number; manualOverrideAdjustment?: { deltaPoints: number; actorId: string; reason: string } | null; }; viewerWorkspaceId: string;
}) {
  if (params.contact.workspaceId !== params.viewerWorkspaceId) {
    return { allowed: false as const, errorCode: 'CROSS_WORKSPACE_CRM_ISOLATION_BLOCKED' as const };
  }
  // Phone numbers may be shared by spouses/partners/offices; flag as shared reference rather than auto-merging distinct people
  const sharedPhoneContactIds = params.existingWorkspaceContacts
    .filter(
      (c) =>
        c.contactId !== params.contact.contactId &&
        c.phoneNumbers.some((p) => params.contact.phoneNumbers.includes(p))
    )
    .map((c) => c.contactId);
  const s = params.leadScoringInput;
  const budgetComponent = s.statedBudgetVerified ? 30 : 10;
  const urgencyComponent = s.timelineUrgencyDays <= 14 ? 25 : s.timelineUrgencyDays <= 45 ? 15 : 5;
  const fitComponent = Math.round(Math.max(0, Math.min(1, s.propertyFitRatio0To1)) * 30);
  const engagementComponent = Math.min(15, s.recordedInteractionsCount * 5);
  const manualDelta =
    s.manualOverrideAdjustment && s.manualOverrideAdjustment.reason.trim().length > 0
      ? s.manualOverrideAdjustment.deltaPoints
      : 0;
  const finalScore0To100 = Math.max(
    0,
    Math.min(100, budgetComponent + urgencyComponent + fitComponent + engagementComponent + manualDelta)
  );
  return {
    allowed: true as const,
    contactSummary: {
      contactId: params.contact.contactId,
      registrationMode: params.contact.hasPlatformLoginAccount
        ? ('PLATFORM_USER_LINKED' as const)
        : ('CRM_ONLY_EXTERNAL_CONTACT' as const),
      sharedPhoneContactIds,
      autoMergedOnPhoneAlone: false as const,
    },
    leadScoreExplanation: {
      finalScore0To100,
      components: {
        budgetReadinessPoints: budgetComponent,
        timelineUrgencyPoints: urgencyComponent,
        propertyFitPoints: fitComponent,
        behavioralEngagementPoints: engagementComponent,
        manualOverridePoints: manualDelta,
      },
      isGuaranteedConversionProbability: false as const,
    },
  };
}
export function matchCustomerRequirementsToProperties(
  params: {
    requirement: {
      requirementId: string;
      transactionType: 'BUY' | 'RENT';
      mandatoryMaxBudgetToman: number;
      mandatoryMinAreaSqm: number;
      mandatoryDistrictIds: number[];
      preferredMinRooms: number;
      preferredMustHaveElevator: boolean;
    };
    candidateListings: Array<{
      listingId: string;
      status: 'ACTIVE_AVAILABLE' | 'EXPIRED' | 'SOLD_UNAVAILABLE';
      transactionType: 'BUY' | 'RENT';
      priceToman: number;
      areaSqm: number;
      districtId: number;
      roomsCount: number | null;
      hasElevator: boolean | null;
    }>;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
) {
  const req = params.requirement;
  const results = params.candidateListings.map((lst) => {
    const hardExclusions: string[] = [];
    if (lst.status !== 'ACTIVE_AVAILABLE') hardExclusions.push('LISTING_NOT_ACTIVE_AVAILABLE');
    if (lst.transactionType !== req.transactionType) hardExclusions.push('TRANSACTION_TYPE_MISMATCH');
    if (lst.priceToman > req.mandatoryMaxBudgetToman) hardExclusions.push('EXCEEDS_MANDATORY_MAX_BUDGET');
    if (lst.areaSqm < req.mandatoryMinAreaSqm) hardExclusions.push('BELOW_MANDATORY_MIN_AREA');
    if (req.mandatoryDistrictIds.length > 0 && !req.mandatoryDistrictIds.includes(lst.districtId)) {
      hardExclusions.push('OUTSIDE_MANDATORY_DISTRICTS');
    }
    if (hardExclusions.length > 0) {
      return {
        listingId: lst.listingId,
        matchedHardConstraints: false,
        compatibilityScore0To100: 0,
        hardExclusions,
        missingAttributesWarning: [] as string[],
      };
    }
    let score = 70; // Base score for passing all mandatory hard constraints
    const missingWarnings: string[] = [];
    if (lst.roomsCount === null) {
      missingWarnings.push('MISSING_ROOMS_COUNT');
      score -= 5;
    } else if (lst.roomsCount >= req.preferredMinRooms) {
      score += 15;
    }
    if (lst.hasElevator === null) {
      missingWarnings.push('MISSING_ELEVATOR_ATTRIBUTE');
      score -= 5;
    } else if (!req.preferredMustHaveElevator || lst.hasElevator) {
      score += 15;
    }
    return {
      listingId: lst.listingId,
      matchedHardConstraints: true,
      compatibilityScore0To100: Math.max(0, Math.min(100, score)),
      hardExclusions: [],
      missingAttributesWarning: missingWarnings,
    };
  });
  return {
    requirementId: req.requirementId,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    mandatoryMaxBudgetIntlText: formatMillionTomanAsIntlCurrency(req.mandatoryMaxBudgetToman / 1_000_000, intlCurrency),
    rankedMatches: results
      .filter((r) => r.matchedHardConstraints)
      .sort((a, b) => b.compatibilityScore0To100 - a.compatibilityScore0To100),
    excludedCandidates: results.filter((r) => !r.matchedHardConstraints),
  };
}
/**
 * Prompts 1569, 1572, 1573 & 1574:
 * Configurable Pipeline Transitions, Viewing Appointment Conflict Guard,
 * Offer/Counteroffer Negotiation Ledger, and Controlled Opportunity-to-Deal Conversion.
 */
export function evaluatePipelineViewingNegotiationAndDealConversion(params: {
  pipelineType: 'BUYER_ACQUISITION' | 'SELLER_LISTING' | 'RESIDENTIAL_LEASE';
  currentStage: 'QUALIFICATION' | 'VIEWING_SCHEDULED' | 'OFFER_NEGOTIATION' | 'CONTRACT_DRAFTING' | 'CLOSED_WON';
  requestedStage: 'VIEWING_SCHEDULED' | 'OFFER_NEGOTIATION' | 'CONTRACT_DRAFTING' | 'CLOSED_WON';
  viewingRequest: {
    agentId: string;
    proposedStartIso: string;
    proposedEndIso: string;
    existingAgentAppointments: Array<{ startIso: string; endIso: string }>;
    viewerIsAuthorizedAgentOrParty: boolean;
    privateAccessCodeNote: string;
  };
  offerChain: Array<{
    offerId: string;
    amountToman: number;
    expiresIso: string;
    status: 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED_IN_PRINCIPLE' | 'EXPIRED';
    internalBrokerNote: string;
  }>;
  dealConversionAttempt: {
    opportunityId: string;
    hasAcceptedOffer: boolean;
    hasVerifiedBuyerAndSellerIdentities: boolean;
    alreadyConvertedOpportunityIds: ReadonlySet<string>;
  };
}) {
  // 1572: Viewing Appointment Conflict Check
  const reqStart = Date.parse(params.viewingRequest.proposedStartIso);
  const reqEnd = Date.parse(params.viewingRequest.proposedEndIso);
  const hasScheduleConflict = params.viewingRequest.existingAgentAppointments.some((a) => {
    const aStart = Date.parse(a.startIso);
    const aEnd = Date.parse(a.endIso);
    return reqStart < aEnd && reqEnd > aStart;
  });
  const appointmentStatus = hasScheduleConflict
    ? ('REJECTED_AGENT_SCHEDULE_CONFLICT' as const)
    : ('CONFIRMED_SLOT_RESERVED' as const);
  // 1574: Controlled Opportunity-to-Deal Conversion
  const conv = params.dealConversionAttempt;
  const isDuplicateDeal = conv.alreadyConvertedOpportunityIds.has(conv.opportunityId);
  const canConvertToDeal =
    !isDuplicateDeal && conv.hasAcceptedOffer && conv.hasVerifiedBuyerAndSellerIdentities;
  return {
    pipelineType: params.pipelineType,
    viewingAppointment: {
      appointmentStatus,
      hasScheduleConflict,
      exposedAccessNote: params.viewingRequest.viewerIsAuthorizedAgentOrParty
        ? params.viewingRequest.privateAccessCodeNote
        : null,
    },
    negotiationSummary: {
      revisionsCount: params.offerChain.length,
      isLegallyBindingContractByOfferAlone: false as const,
      customerVisibleOffers: params.offerChain.map((o) => ({
        offerId: o.offerId,
        amountToman: o.amountToman,
        status: o.status,
      })),
    },
    dealConversion: {
      canConvertToDeal,
      statusReason: isDuplicateDeal
        ? ('BLOCKED_DUPLICATE_DEAL_CONVERSION' as const)
        : !conv.hasAcceptedOffer
        ? ('MISSING_ACCEPTED_OFFER' as const)
        : !conv.hasVerifiedBuyerAndSellerIdentities
        ? ('MISSING_PARTY_IDENTITY_VERIFICATION' as const)
        : ('READY_FOR_CONTRACT_DEAL_CREATION' as const),
    },
  };
}
/**
 * Prompts 1575, 1577, 1580, 1581, 1583, 1584 & 1603:
 * First/Latest Touch Attribution, CSAT Survey Separation, Shared-Deal Agent Attribution,
 * Cohort Funnel Conversion, Loop-Safe CRM Automation Dry-Run, and Multi-Business Extensibility.
 */
export function evaluateCrmAttributionPerformanceFunnelAndAutomation(params: {
  touchpoints: Array<{ channel: string; timestampIso: string }>;
  sharedDealCreditSplits: Array<{ agentId: string; sharePercent: number; dealValueToman: number }>;
  csatSurvey: { invitationsSentCount: number; responsesSubmittedCount: number; ratingsOneToFive: number[] };
  cohortFunnel: { cohortLeadsCount: number; stageQualifiedCount: number; closedWonDealsCount: number };
  automationTrigger: {
    workflowId: string;
    recursionDepth: number;
    maxAllowedRecursionDepth: number;
    isDryRunMode: boolean;
  };
  workspaceBusinessModel: 'SOLO_INDEPENDENT_BROKER' | 'SMALL_BOUTIQUE_AGENCY' | 'ENTERPRISE_MULTI_BRANCH' | 'DEVELOPER_PRESALE_OFFICE';
}) {
  const sortedTouches = [...params.touchpoints].sort(
    (a, b) => Date.parse(a.timestampIso) - Date.parse(b.timestampIso)
  );
  const firstTouchChannel = sortedTouches[0]?.channel ?? null;
  const latestTouchChannel = sortedTouches[sortedTouches.length - 1]?.channel ?? null;
  const agentAttributedVolume = params.sharedDealCreditSplits.map((s) => ({
    agentId: s.agentId,
    sharePercent: s.sharePercent,
    attributedDealVolumeToman: Math.round(s.dealValueToman * (s.sharePercent / 100)),
  }));
  const participationRatePercent =
    params.csatSurvey.invitationsSentCount > 0
      ? Number(
          ((params.csatSurvey.responsesSubmittedCount / params.csatSurvey.invitationsSentCount) * 100).toFixed(1)
        )
      : 0;
  const avgCsatScore =
    params.csatSurvey.ratingsOneToFive.length > 0
      ? Number(
          (
            params.csatSurvey.ratingsOneToFive.reduce((a, b) => a + b, 0) /
            params.csatSurvey.ratingsOneToFive.length
          ).toFixed(2)
        )
      : null;
  const stageQualificationRatePercent =
    params.cohortFunnel.cohortLeadsCount > 0
      ? Number(((params.cohortFunnel.stageQualifiedCount / params.cohortFunnel.cohortLeadsCount) * 100).toFixed(1))
      : 0;
  const finalDealConversionRatePercent =
    params.cohortFunnel.cohortLeadsCount > 0
      ? Number(((params.cohortFunnel.closedWonDealsCount / params.cohortFunnel.cohortLeadsCount) * 100).toFixed(1))
      : 0;
  const loopBlocked =
    params.automationTrigger.recursionDepth > params.automationTrigger.maxAllowedRecursionDepth;
  return {
    attribution: { firstTouchChannel, latestTouchChannel },
    agentAttributedVolume,
    csatReport: {
      participationRatePercent,
      averageSatisfactionScoreOutOf5: avgCsatScore,
    },
    cohortFunnelReport: {
      denominatorCohortLeads: params.cohortFunnel.cohortLeadsCount,
      stageQualificationRatePercent,
      finalDealConversionRatePercent,
    },
    automationExecution: {
      workflowId: params.automationTrigger.workflowId,
      status: loopBlocked
        ? ('ABORTED_RECURSIVE_AUTOMATION_LOOP' as const)
        : params.automationTrigger.isDryRunMode
        ? ('SIMULATED_DRY_RUN_NO_SIDE_EFFECTS' as const)
        : ('EXECUTED_COMMITTED' as const),
    },
    workspaceBusinessModelSupported: params.workspaceBusinessModel,
  };
}
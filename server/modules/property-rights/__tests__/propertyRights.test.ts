import assert from 'node:assert/strict';
import {
  createPropertyRightsModuleFacade,
  DeterministicPropertyRightsStore,
  PropertyRightsActorContext,
  PropertyRightsError,
  ReadOnlyMediaReferenceAdapter,
  ReadOnlyPartyIdentityAdapter,
  ReadOnlyPropertyRegistryAdapter,
} from '../index';

const ADMIN_ACTOR: PropertyRightsActorContext = {
  actorId: 'officer-sabt-01',
  role: 'RIGHTS_VERIFICATION_OFFICER',
  isAuthenticated: true,
};
const REGISTRAR_ACTOR: PropertyRightsActorContext = {
  actorId: 'registrar-notary-11',
  role: 'AUTHORIZED_REGISTRAR',
  isAuthenticated: true,
};
const PARTY_A_ACTOR: PropertyRightsActorContext = {
  actorId: 'user-party-a',
  role: 'AUTHENTICATED_PARTY',
  isAuthenticated: true,
  linkedPartyIds: ['party_ind_ali'],
};
const UNLINKED_USER_ACTOR: PropertyRightsActorContext = {
  actorId: 'user-stranger-99',
  role: 'AUTHENTICATED_PARTY',
  isAuthenticated: true,
  linkedPartyIds: ['party_stranger_99'],
};
const PUBLIC_ACTOR: PropertyRightsActorContext = {
  actorId: 'anonymous',
  role: 'PUBLIC_CALLER',
  isAuthenticated: false,
};

async function runTests(): Promise<void> {
  const store = new DeterministicPropertyRightsStore();
  const propertyAdapter = new ReadOnlyPropertyRegistryAdapter([
    {
      propertyId: 'prop_tehran_unit_101',
      assetCategory: 'INDEPENDENT_UNIT',
      cityId: 'tehran',
      registrationPlatePelakSabti: 'SYNTH-1245/88',
    },
    {
      propertyId: 'prop_tehran_parcel_202',
      assetCategory: 'LAND_PARCEL',
      cityId: 'tehran',
      registrationPlatePelakSabti: 'SYNTH-9900/12',
    },
  ]);

  const partyAdapter = new ReadOnlyPartyIdentityAdapter([
    { partyId: 'party_ind_ali', partyType: 'INDIVIDUAL', identityConfidence: 'KYC_DOCUMENT_MATCHED' },
    { partyId: 'party_ind_sara', partyType: 'INDIVIDUAL', identityConfidence: 'KYC_DOCUMENT_MATCHED' },
    { partyId: 'party_org_holding', partyType: 'LEGAL_ENTITY', identityConfidence: 'OFFICIAL_REGISTRY_CONFIRMED_PARTY' },
    { partyId: 'party_bank_maskan', partyType: 'PUBLIC_AUTHORITY', identityConfidence: 'OFFICIAL_REGISTRY_CONFIRMED_PARTY' },
    { partyId: 'party_tenant_reza', partyType: 'INDIVIDUAL', identityConfidence: 'AUTHENTICATED_PLATFORM_USER' },
    { partyId: 'party_claimant_dispute', partyType: 'INDIVIDUAL', identityConfidence: 'UNVERIFIED_SELF_ASSERTION' },
  ]);

  const mediaAdapter = new ReadOnlyMediaReferenceAdapter(['media_deed_01', 'media_release_02']);

  const {
    ownershipAndSharesService,
    rightsEncumbrancesAndDisputesService,
    historyAndProfileService,
  } = createPropertyRightsModuleFacade({
    store,
    propertyAdapter,
    partyAdapter,
    mediaAdapter,
  });

  // 6 & 7. Party reference validation & Canonical property reference validation
  await assert.rejects(
    () =>
      ownershipAndSharesService.registerOwnershipInterest(
        {
          propertyRef: { propertyId: 'prop_unknown_999', assetCategory: 'INDEPENDENT_UNIT' },
          partyRef: {
            partyId: 'party_ind_ali',
            partyType: 'INDIVIDUAL',
            identityConfidence: 'KYC_DOCUMENT_MATCHED',
            publicRoleLabel: 'Co-owner',
          },
          interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
          share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 3, denominator: 6 },
          effectiveFromIso: '2020-01-01',
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'INVALID_PROPERTY_REFERENCE',
  );

  await assert.rejects(
    () =>
      ownershipAndSharesService.registerOwnershipInterest(
        {
          propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
          partyRef: {
            partyId: 'party_non_existent',
            partyType: 'INDIVIDUAL',
            identityConfidence: 'KYC_DOCUMENT_MATCHED',
            publicRoleLabel: 'Co-owner',
          },
          interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
          share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 3, denominator: 6 },
          effectiveFromIso: '2020-01-01',
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'INVALID_PARTY_REFERENCE',
  );

  // 4 & 5. Invalid ownership shares & Unknown vs Zero ownership shares
  await assert.rejects(
    () =>
      ownershipAndSharesService.registerOwnershipInterest(
        {
          propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
          partyRef: {
            partyId: 'party_ind_ali',
            partyType: 'INDIVIDUAL',
            identityConfidence: 'KYC_DOCUMENT_MATCHED',
            publicRoleLabel: 'Owner',
          },
          interestType: 'FRACTIONAL_DANG_OR_SAHM',
          share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 7, denominator: 6 }, // > 100%
          effectiveFromIso: '2020-01-01',
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'INVALID_OWNERSHIP_SHARE',
  );

  await assert.rejects(
    () =>
      ownershipAndSharesService.registerOwnershipInterest(
        {
          propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
          partyRef: {
            partyId: 'party_ind_ali',
            partyType: 'INDIVIDUAL',
            identityConfidence: 'KYC_DOCUMENT_MATCHED',
            publicRoleLabel: 'Owner',
          },
          interestType: 'FRACTIONAL_DANG_OR_SAHM',
          share: { shareState: 'UNKNOWN_SHARE', numerator: 0, denominator: 1 }, // conflating unknown with zero
          effectiveFromIso: '2020-01-01',
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'INVALID_OWNERSHIP_SHARE',
  );

  // 21 & 22. Evidence provenance preservation & Duplicate source record handling
  const deedEv1 = await rightsEncumbrancesAndDisputesService.registerEvidenceReference(
    {
      id: 'ev_sanad_ali_2020',
      propertyId: 'prop_tehran_unit_101',
      evidenceCategory: 'OFFICIAL_SINGLE_LEAF_DEED_SANAD_TAK_BARG',
      issuingSourceAuthority: 'سازمان ثبت اسناد و املاک کشور - منطقه شمال غرب تهران',
      documentReferenceNumber: 'SYNTH-TAKBARG-1399-01',
      issueDateIso: '2020-02-01',
      effectiveDateIso: '2020-02-01',
      sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
      verificationMethod: 'OFFICIAL_REGISTRY_INQUIRY_CONFIRMED',
      mediaFileObjectId: 'media_deed_01',
      isSyntheticTestFixture: true,
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(deedEv1.provenance.isSyntheticTestFixture, true);
  assert.equal(deedEv1.verificationStatus, 'VERIFIED');

  await assert.rejects(
    () =>
      rightsEncumbrancesAndDisputesService.registerEvidenceReference(
        {
          propertyId: 'prop_tehran_unit_101',
          evidenceCategory: 'OFFICIAL_SINGLE_LEAF_DEED_SANAD_TAK_BARG',
          issuingSourceAuthority: 'سازمان ثبت اسناد و املاک کشور - منطقه شمال غرب تهران',
          documentReferenceNumber: 'SYNTH-TAKBARG-1399-01',
          issueDateIso: '2020-02-01',
          effectiveDateIso: '2020-02-01',
          sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
          verificationMethod: 'OFFICIAL_REGISTRY_INQUIRY_CONFIRMED',
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'DUPLICATE_SOURCE_EVIDENCE',
  );

  // 1, 2, 3, 12, 24. Ownership-interest creation, Multiple co-owners, Fractional precision, Effective vs Recorded date, Idempotency
  const aliInterest = await ownershipAndSharesService.registerOwnershipInterest(
    {
      id: 'int_ali_4dang',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      partyRef: {
        partyId: 'party_ind_ali',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'KYC_DOCUMENT_MATCHED',
        publicRoleLabel: 'مالک مشاع (۴ دانگ)',
        confidentialFullName: 'علی رضایی (آزمایشی)',
        confidentialNationalOrRegistrationId: '0010000001',
      },
      interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
      share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 4, denominator: 6, calculationBasis: 'SIX_DANG_6' },
      effectiveFromIso: '2020-02-01T00:00:00Z',
      recordedAtIso: '2020-02-11T00:00:00Z', // recorded 10 days after effective date
      evidenceIds: [deedEv1.id],
      sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
      internalReviewNotes: 'PRIVATE_REVIEW_NOTE_DO_NOT_EXPOSE',
      idempotencyKey: 'idem-reg-ali-4dang',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(aliInterest.ownershipShare.numerator, 2);
  assert.equal(aliInterest.ownershipShare.denominator, 3); // exact GCD reduction 4/6 -> 2/3
  assert.equal(aliInterest.statusVector.legalStatus, 'DOCUMENTED_UNVERIFIED_INTEREST');

  const aliReplay = await ownershipAndSharesService.registerOwnershipInterest(
    {
      id: 'int_ali_4dang',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      partyRef: {
        partyId: 'party_ind_ali',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'KYC_DOCUMENT_MATCHED',
        publicRoleLabel: 'مالک مشاع',
      },
      interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
      share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 4, denominator: 6 },
      effectiveFromIso: '2020-02-01T00:00:00Z',
      idempotencyKey: 'idem-reg-ali-4dang',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(aliReplay.id, aliInterest.id);

  // Add second co-owner (Sara: 2/6 Dang = 1/3)
  const saraInterest = await ownershipAndSharesService.registerOwnershipInterest(
    {
      id: 'int_sara_2dang',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      partyRef: {
        partyId: 'party_ind_sara',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'KYC_DOCUMENT_MATCHED',
        publicRoleLabel: 'مالک مشاع (۲ دانگ)',
        confidentialFullName: 'سارا محمدی (آزمایشی)',
      },
      interestType: 'UNDIVIDED_CO_OWNERSHIP_MOSHA',
      share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 2, denominator: 6, calculationBasis: 'SIX_DANG_6' },
      effectiveFromIso: '2020-02-01T00:00:00Z',
      recordedAtIso: '2020-02-01T00:00:00Z',
      evidenceIds: [deedEv1.id],
      sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(saraInterest.ownershipShare.numerator, 1);
  assert.equal(saraInterest.ownershipShare.denominator, 3);

  // 20. Unauthorized verification decision rejected, authorized decision succeeds
  await ownershipAndSharesService.submitInterestForVerification(aliInterest.id, [deedEv1.id], PARTY_A_ACTOR);
  await assert.rejects(
    () =>
      ownershipAndSharesService.recordVerificationDecision(
        {
          interestId: aliInterest.id,
          decision: 'VERIFIED',
          sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
          reviewerNotes: 'Illegal self-verification by party',
        },
        PARTY_A_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.statusCode === 403,
  );

  const verifiedAli = await ownershipAndSharesService.recordVerificationDecision(
    {
      interestId: aliInterest.id,
      decision: 'VERIFIED',
      sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
      reviewerNotes: 'Verified against Sabt Tak-Barg inquiry.',
    },
    ADMIN_ACTOR,
  );
  assert.equal(verifiedAli.statusVector.verificationStatus, 'VERIFIED');
  assert.equal(verifiedAli.statusVector.legalStatus, 'INDEPENDENTLY_VERIFIED_INTEREST');

  // 8, 9, 10, 11, 28. Partial share transfer, Share consolidation, Historical reconstruction & preservation
  // Ali (4/6 = 2/3) transfers 1/6 Dang to Sara (who already holds 2/6 = 1/3) effective 2022-06-01
  const transferRes = await ownershipAndSharesService.transferOwnershipShare(
    {
      fromInterestId: verifiedAli.id,
      recipientPartyRef: {
        partyId: 'party_ind_sara',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'KYC_DOCUMENT_MATCHED',
        publicRoleLabel: 'خریدار ۱ دانگ مشاع',
      },
      transferFraction: { numerator: 1, denominator: 6, calculationBasis: 'SIX_DANG_6' },
      transferCategory: 'PARTIAL_SHARE_TRANSFER',
      effectiveDateIso: '2022-06-01T00:00:00Z',
      recordedAtIso: '2022-06-05T00:00:00Z',
      evidenceIds: [deedEv1.id],
      sourceReliability: 'NOTARIAL_INSTRUMENT_SANAD_RASMI',
      idempotencyKey: 'idem-partial-transfer-1dang',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(transferRes.supersededSourceInterest.statusVector.verificationStatus, 'SUPERSEDED');
  assert.equal(transferRes.retainedSourceInterest?.ownershipShare.numerator, 1);
  assert.equal(transferRes.retainedSourceInterest?.ownershipShare.denominator, 2); // 3/6 = 1/2
  assert.equal(transferRes.recipientNewInterest.ownershipShare.numerator, 1);
  assert.equal(transferRes.recipientNewInterest.ownershipShare.denominator, 6);

  // Consolidate Sara's two active shares (2/6 + 1/6 = 3/6 = 1/2) effective 2023-01-01
  const consolidatedSara = await ownershipAndSharesService.consolidateOwnershipShares(
    {
      propertyId: 'prop_tehran_unit_101',
      partyId: 'party_ind_sara',
      sourceInterestIds: [saraInterest.id, transferRes.recipientNewInterest.id],
      effectiveDateIso: '2023-01-01T00:00:00Z',
      recordedAtIso: '2023-01-02T00:00:00Z',
      evidenceIds: [deedEv1.id],
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(consolidatedSara.ownershipShare.numerator, 1);
  assert.equal(consolidatedSara.ownershipShare.denominator, 2); // 3/6 = 1/2

  // Historical reconstruction at 2021-01-01 (Ali had 2/3, Sara had 1/3, total = 1/1)
  const state2021 = await historyAndProfileService.getHistoricalPropertyStateAsOfDate(
    { propertyId: 'prop_tehran_unit_101', asOfDateIso: '2021-01-01T00:00:00Z' },
    ADMIN_ACTOR,
  );
  assert.equal(state2021.activeOwnershipInterests.length, 2);
  assert.equal(state2021.coOwnershipSummaryAtDate.totalKnownActiveShare.equals100Percent, true);

  // Historical reconstruction at 2024-01-01 (Ali has 1/2, Sara has consolidated 1/2, total = 1/1)
  const state2024 = await historyAndProfileService.getHistoricalPropertyStateAsOfDate(
    { propertyId: 'prop_tehran_unit_101', asOfDateIso: '2024-01-01T00:00:00Z' },
    ADMIN_ACTOR,
  );
  assert.equal(state2024.activeOwnershipInterests.length, 2);
  assert.equal(state2024.coOwnershipSummaryAtDate.totalKnownActiveShare.equals100Percent, true);

  // Verify late-recorded events query (effectiveDate vs recordedAt)
  const lateEvents = await historyAndProfileService.getEventsLearnedAfterEffectiveDate(
    'prop_tehran_unit_101',
    ADMIN_ACTOR,
  );
  assert.ok(lateEvents.length >= 2);
  assert.equal(lateEvents[0].learnedAfterEffectiveDateDays, 10);

  // 13 & 14. Non-ownership rights creation & Leasehold vs Ownership distinction
  const usufructRight = await rightsEncumbrancesAndDisputesService.registerPropertyRight(
    {
      id: 'right_usufruct_01',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      beneficiaryParty: {
        partyId: 'party_org_holding',
        partyType: 'LEGAL_ENTITY',
        identityConfidence: 'OFFICIAL_REGISTRY_CONFIRMED_PARTY',
        publicRoleLabel: 'دارنده حق انتفاع',
      },
      rightCategory: 'USUFRUCT_HAQQ_ENTEFA',
      scopeDescription: 'حق انتفاع بهره‌برداری از پارکینگ و انباری به مدت ۵ سال',
      effectiveFromIso: '2023-03-01T00:00:00Z',
      expirationOrTerminationIso: '2028-03-01T00:00:00Z',
      evidenceIds: [deedEv1.id],
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(usufructRight.establishesLegalOwnership, false);

  const tenureRecord = await rightsEncumbrancesAndDisputesService.registerTenureInterest(
    {
      id: 'tenure_lease_01',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      tenantOrBeneficiaryParty: {
        partyId: 'party_tenant_reza',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'AUTHENTICATED_PLATFORM_USER',
        publicRoleLabel: 'مستاجر واحد مسکونی',
      },
      grantingParty: {
        partyId: 'party_ind_ali',
        partyType: 'INDIVIDUAL',
        identityConfidence: 'KYC_DOCUMENT_MATCHED',
        publicRoleLabel: 'موجر',
      },
      tenureCategory: 'RESIDENTIAL_LEASEHOLD_EJAREH',
      effectiveFromIso: '2024-01-01T00:00:00Z',
      effectiveToIso: '2025-01-01T00:00:00Z',
      recordedRights: ['سکونت و بهره‌برداری مسکونی'],
      externalContractReference: 'SYNTH-RAHGIRI-889900',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(tenureRecord.establishesLegalOwnership, false);
  assert.equal(tenureRecord.operationalTenancyManagedExternally, true);

  // 15, 16, 17. Encumbrance registration, release history, and unknown encumbrance status
  const mortgageEnc = await rightsEncumbrancesAndDisputesService.registerEncumbrance(
    {
      id: 'enc_mortgage_maskan_01',
      propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
      beneficiaryOrAuthorityParty: {
        partyId: 'party_bank_maskan',
        partyType: 'PUBLIC_AUTHORITY',
        identityConfidence: 'OFFICIAL_REGISTRY_CONFIRMED_PARTY',
        publicRoleLabel: 'مرتهن (بانک مسکن)',
      },
      affectedOwnershipInterestId: transferRes.retainedSourceInterest!.id,
      encumbranceType: 'MORTGAGE_RAHN',
      sourceAuthorityName: 'دفتر اسناد رسمی ۱۲۳ تهران',
      registrationReferenceNumber: 'SYNTH-RAHN-4455',
      effectiveFromIso: '2023-02-01T00:00:00Z',
      classificationState: 'VERIFIED_REGISTERED_ENCUMBRANCE',
      evidenceIds: [deedEv1.id],
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(mortgageEnc.statusVector.verificationStatus, 'VERIFIED');

  const releaseEv = await rightsEncumbrancesAndDisputesService.registerEvidenceReference(
    {
      id: 'ev_fak_rahn_2024',
      propertyId: 'prop_tehran_unit_101',
      evidenceCategory: 'ENCUMBRANCE_RELEASE_LETTER_FAK_E_RAHN',
      issuingSourceAuthority: 'بانک مسکن شعبه مرکزی',
      documentReferenceNumber: 'SYNTH-FAK-2024-99',
      issueDateIso: '2024-05-01',
      effectiveDateIso: '2024-05-01',
      sourceReliability: 'AUTHORITATIVE_OFFICIAL_REGISTRY',
      verificationMethod: 'OFFICIAL_REGISTRY_INQUIRY_CONFIRMED',
      mediaFileObjectId: 'media_release_02',
      isSyntheticTestFixture: true,
    },
    REGISTRAR_ACTOR,
  );

  const releasedEnc = await rightsEncumbrancesAndDisputesService.recordEncumbranceRelease(
    {
      encumbranceId: mortgageEnc.id,
      releasedAtEffectiveIso: '2024-05-01T00:00:00Z',
      releaseReferenceNumber: 'SYNTH-FAK-2024-99',
      releasingAuthorityName: 'بانک مسکن',
      releaseEvidenceIds: [releaseEv.id],
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(releasedEnc.classificationState, 'RELEASED_OR_EXPIRED_WITH_EVIDENCE');
  assert.equal(releasedEnc.releaseHistory.length, 1);

  const unknownEnc = await rightsEncumbrancesAndDisputesService.registerEncumbrance(
    {
      id: 'enc_unknown_status_02',
      propertyRef: { propertyId: 'prop_tehran_parcel_202', assetCategory: 'LAND_PARCEL' },
      beneficiaryOrAuthorityParty: {
        partyId: 'party_bank_maskan',
        partyType: 'PUBLIC_AUTHORITY',
        identityConfidence: 'OFFICIAL_REGISTRY_CONFIRMED_PARTY',
        publicRoleLabel: 'مرجع ثبتی',
      },
      encumbranceType: 'LEGAL_RESTRICTION_REFERENCE',
      sourceAuthorityName: 'مرجع قضایی',
      registrationReferenceNumber: 'SYNTH-UNK-01',
      effectiveFromIso: '2024-01-01T00:00:00Z',
      classificationState: 'UNKNOWN_ENCUMBRANCE_STATUS',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(unknownEnc.statusVector.verificationStatus, 'UNKNOWN');

  // 18 & 19. Conflicting ownership claims & Dispute state transitions (without platform adjudication)
  await assert.rejects(
    () =>
      ownershipAndSharesService.registerOwnershipInterest(
        {
          propertyRef: { propertyId: 'prop_tehran_unit_101', assetCategory: 'INDEPENDENT_UNIT' },
          partyRef: {
            partyId: 'party_claimant_dispute',
            partyType: 'INDIVIDUAL',
            identityConfidence: 'UNVERIFIED_SELF_ASSERTION',
            publicRoleLabel: 'مدعی مالکیت',
          },
          interestType: 'FRACTIONAL_DANG_OR_SAHM',
          share: { shareState: 'KNOWN_EXACT_SHARE', numerator: 2, denominator: 6 },
          effectiveFromIso: '2024-02-01T00:00:00Z',
          // allowDisputedShareOverflow defaults to false -> must reject overflow > 100%
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'SHARE_OVERFLOW_CONFLICT',
  );

  await assert.rejects(
    () =>
      rightsEncumbrancesAndDisputesService.recordInterestDispute(
        {
          propertyId: 'prop_tehran_unit_101',
          affectedInterestOrRightIds: [consolidatedSara.id],
          competingPartyIds: ['party_ind_sara', 'party_claimant_dispute'],
          disputeCategory: 'COMPETING_OWNERSHIP_CLAIM',
          supportingEvidenceIds: [],
          initialReviewNote: 'Attempt illegal platform adjudication',
          attemptPlatformAdjudication: true,
        },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'DISPUTE_ADJUDICATION_PROHIBITED',
  );

  const disputeRec = await rightsEncumbrancesAndDisputesService.recordInterestDispute(
    {
      id: 'disp_sara_claim_01',
      propertyId: 'prop_tehran_unit_101',
      affectedInterestOrRightIds: [consolidatedSara.id],
      competingPartyIds: ['party_ind_sara', 'party_claimant_dispute'],
      disputeCategory: 'COMPETING_OWNERSHIP_CLAIM',
      supportingEvidenceIds: [deedEv1.id],
      relatedLegalCaseReference: 'SYNTH-DADGAH-1403-77',
      initialReviewNote: 'Recorded competing claim pending judicial outcome.',
    },
    REGISTRAR_ACTOR,
  );
  assert.equal(disputeRec.adjudicatedByPlatform, false);
  const saraAfterDispute = await store.getOwnershipInterestById(consolidatedSara.id);
  assert.equal(saraAfterDispute?.statusVector.verificationStatus, 'DISPUTED');

  // 25 & 26. Personal information access restrictions & Unauthorized property-interest enumeration
  await assert.rejects(
    () => ownershipAndSharesService.retrievePropertyInterestsForViewer('prop_tehran_unit_101', PUBLIC_ACTOR),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'UNAUTHORIZED_ENUMERATION',
  );

  await assert.rejects(
    () => ownershipAndSharesService.retrievePropertyInterestsForViewer('prop_tehran_unit_101', UNLINKED_USER_ACTOR),
    (err: unknown) => err instanceof PropertyRightsError && err.code === 'UNAUTHORIZED_ENUMERATION',
  );

  // Party A can view the property's interests, receiving own PII but having Co-owner Sara's PII redacted
  const partyAViews = await ownershipAndSharesService.retrievePropertyInterestsForViewer(
    'prop_tehran_unit_101',
    PARTY_A_ACTOR,
  );
  const saraViewedByAli = partyAViews.find((i) => i.id === saraInterest.id)!;
  assert.equal('confidentialFullName' in saraViewedByAli.partyRef, false);
  assert.equal('internalReviewNotes' in saraViewedByAli, false);

  // Profile check: encumbranceFreeEstablished is always false even after mortgage release
  const profile = await historyAndProfileService.generatePropertyOwnershipAndRightsProfile(
    'prop_tehran_unit_101',
    ADMIN_ACTOR,
    '2024-08-01T00:00:00Z',
  );
  assert.equal(profile.encumbranceAssessment.activeEncumbrancesCount, 0);
  assert.equal(profile.encumbranceAssessment.encumbranceFreeEstablished, false);
  assert.equal(profile.chainOfTitleIntegrity.definitiveLegalChainEstablished, false);
  assert.equal(profile.chainOfTitleIntegrity.hasUnresolvedDisputes, true);

  // 23 & 27. Concurrency conflicts & Persistence failure handling
  store.simulateNextWriteFailure(1);
  await assert.rejects(
    () =>
      rightsEncumbrancesAndDisputesService.amendOrTerminatePropertyRight(
        { rightId: usufructRight.id, newScopeDescription: 'Outage test' },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) =>
      err instanceof PropertyRightsError && err.code === 'PERSISTENCE_UNAVAILABLE' && err.statusCode === 503,
  );

  await assert.rejects(
    () =>
      rightsEncumbrancesAndDisputesService.amendOrTerminatePropertyRight(
        { rightId: usufructRight.id, newScopeDescription: 'Stale version', expectedVersion: 999 },
        REGISTRAR_ACTOR,
      ),
    (err: unknown) =>
      err instanceof PropertyRightsError &&
      err.code === 'CONCURRENT_MODIFICATION_CONFLICT' &&
      err.statusCode === 409,
  );

  // 29. Prevention of cross-module direct writes
  assert.throws(
    () => propertyAdapter.attemptProhibitedPropertyWrite('prop_tehran_unit_101'),
    (err: unknown) =>
      err instanceof PropertyRightsError && err.code === 'CROSS_MODULE_WRITE_PROHIBITED' && err.statusCode === 403,
  );
  assert.throws(
    () => partyAdapter.attemptProhibitedPartyWrite('party_ind_ali'),
    (err: unknown) =>
      err instanceof PropertyRightsError && err.code === 'CROSS_MODULE_WRITE_PROHIBITED' && err.statusCode === 403,
  );

  console.log(
    '✅ [PROPERTY OWNERSHIP & RIGHTS REGISTRY MODULE] All 29 required test scenarios passed.',
  );
}

runTests().catch((err) => {
  console.error('❌ [PROPERTY OWNERSHIP & RIGHTS REGISTRY MODULE] Test suite failed:', err);
  process.exit(1);
});

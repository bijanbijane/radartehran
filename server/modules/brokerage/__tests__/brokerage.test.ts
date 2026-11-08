/**
 * @file server/modules/brokerage/__tests__/brokerage.test.ts
 * @description Comprehensive Automated Test Suite for Real Estate Brokerage & Agency Management Backend Module.
 */

import assert from 'node:assert';
import {
  createBrokerageModule,
  BrokerageFacade,
} from '../facade';
import {
  DurableBrokerageStore,
} from '../store';
import {
  BrokerageValidationError,
} from '../validation';
import {
  InactiveNotificationEventSink,
  type ListingValidationAdapter,
  type TransactionReferenceAdapter,
} from '../adapters';

async function runTestSuite() {
  console.log('[TEST] Starting Real Estate Brokerage Backend Test Suite...');
  let testsPassed = 0;

  // Mock adapters
  class MockListingAdapter implements ListingValidationAdapter {
    public validListings = new Set<string>(['listing_101', 'listing_202', 'listing_tehran_303']);
    async checkListingExists(id: string) {
      return { exists: this.validListings.has(id), status: 'active' };
    }
  }

  class MockTransactionAdapter implements TransactionReferenceAdapter {
    async verifyDealStatus(dealReference: string) {
      if (dealReference === 'deal_confirmed_99') {
        return { exists: true, isConfirmed: true, confirmedValueToman: 10_000_000_000 };
      }
      return { exists: true, isConfirmed: false };
    }
  }

  function setupModule() {
    const store = new DurableBrokerageStore();
    const notificationSink = new InactiveNotificationEventSink();
    const listingAdapter = new MockListingAdapter();
    const transactionAdapter = new MockTransactionAdapter();

    const facade = createBrokerageModule({
      store,
      notificationSink,
      listingAdapter,
      transactionAdapter,
    });

    return { facade, store, notificationSink, listingAdapter, transactionAdapter };
  }

  // 1. Agency Creation & Ownership
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('user_owner_1', {
      publicDisplayName: 'آژانس مسکن شمیران',
      description: 'پیشرو در خدمات املاک شمال تهران',
      organizationType: 'real_estate_office',
      businessContact: {
        phone: '+982122334455',
        email: 'info@shemiran-realestate.ir',
      },
      mainGeographicReference: {
        cityId: 'tehran',
        district: 'منطقه ۱',
        neighborhoodId: 1,
      },
    });

    assert.strictEqual(agency.publicDisplayName, 'آژانس مسکن شمیران');
    assert.strictEqual(agency.ownerUid, 'user_owner_1');
    assert.strictEqual(agency.operatingStatus, 'pending_review');

    // Verify owner membership was auto-created
    const memberships = await facade.membershipService.listAgencyMembers(agency.id);
    assert.strictEqual(memberships.length, 1);
    assert.strictEqual(memberships[0].userUid, 'user_owner_1');
    assert.strictEqual(memberships[0].role, 'agency_owner');
    assert.strictEqual(memberships[0].status, 'active');
    testsPassed++;
    console.log('✓ 1. Agency creation & auto-owner membership passed');
  }

  // 2. Multi-Branch Organizations
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('user_owner_1', {
      publicDisplayName: 'املاک بزرگ آریا',
      description: 'آژانس چندشعبه‌ای پایتخت',
      organizationType: 'multi_branch_agency',
      businessContact: {
        phone: '+982188990011',
        email: 'headquarters@arya-realty.ir',
      },
      mainGeographicReference: { cityId: 'tehran' },
    });

    // Create 2 branches
    const branch1 = await facade.agencyService.createBranch('user_owner_1', {
      agencyId: agency.id,
      branchName: 'شعبه سعادت‌آباد',
      contact: { phone: '+982122114455', email: 'saadatabad@arya-realty.ir' },
      geographicReference: { cityId: 'tehran', neighborhoodId: 3 },
      branchManagerUid: 'user_manager_saadat',
    });

    const branch2 = await facade.agencyService.createBranch('user_owner_1', {
      agencyId: agency.id,
      branchName: 'شعبه عظیمیه کرج',
      contact: { phone: '+982632551122', email: 'azimieh@arya-realty.ir' },
      geographicReference: { cityId: 'karaj', neighborhoodId: 101 },
      branchManagerUid: 'user_manager_karaj',
    });

    const branches = await facade.agencyService.listAgencyBranches(agency.id);
    assert.strictEqual(branches.length, 2);
    assert.strictEqual(branches[0].id, branch1.id);
    assert.strictEqual(branches[1].id, branch2.id);
    testsPassed++;
    console.log('✓ 2. Multi-branch creation & relationship passed');
  }

  // 3. Agent Professional Profiles & Multiple Memberships
  {
    const { facade } = setupModule();
    const profile = await facade.membershipService.registerAgentProfile('user_agent_ali', {
      publicDisplayName: 'علی حسینی - کارشناس ارشد منطقه ۲',
      professionalBio: '۱۰ سال سابقه تخصصی در خرید و فروش آپارتمان‌های سعادت‌آباد و شهرک غرب',
      languages: ['fa', 'en'],
      serviceCategories: ['residential_sale', 'commercial_sale'],
      geographicCoverage: [{ cityId: 'tehran', coveredNeighborhoodIds: [3, 4] }],
      experienceYears: 10,
    });

    assert.strictEqual(profile.userUid, 'user_agent_ali');
    assert.strictEqual(profile.publicationStatus, 'published');

    // Create 2 agencies
    const ag1 = (await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'آژانس یک',
      description: 'آژانس اول',
      organizationType: 'independent_brokerage',
      businessContact: { phone: '+982188880001', email: 'ag1@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    })).agency;

    const ag2 = (await facade.agencyService.createAgency('owner_2', {
      publicDisplayName: 'آژانس دو',
      description: 'آژانس دوم',
      organizationType: 'independent_brokerage',
      businessContact: { phone: '+982188880002', email: 'ag2@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    })).agency;

    // Agent can hold invited/active memberships in different agencies
    const inv1 = await facade.membershipService.inviteMember('owner_1', {
      agencyId: ag1.id,
      userUid: 'user_agent_ali',
      role: 'senior_consultant',
    });
    const inv2 = await facade.membershipService.inviteMember('owner_2', {
      agencyId: ag2.id,
      userUid: 'user_agent_ali',
      role: 'real_estate_consultant',
    });

    await facade.membershipService.acceptInvitation(inv1.id, 'user_agent_ali');
    await facade.membershipService.acceptInvitation(inv2.id, 'user_agent_ali');

    const userMemberships = await facade.store.findMembershipsByUser('user_agent_ali');
    assert.strictEqual(userMemberships.length, 2);
    assert.strictEqual(userMemberships[0].role, 'senior_consultant');
    assert.strictEqual(userMemberships[1].role, 'real_estate_consultant');
    testsPassed++;
    console.log('✓ 3. Agent profiles & multi-agency memberships passed');
  }

  // 4. Invitation Lifecycle & Role Escalation Prevention
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک نوین',
      description: 'تست امنیت و دسترسی',
      organizationType: 'real_estate_office',
      businessContact: { phone: '+982188881234', email: 'novin@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });

    // Consultant tries to invite or self-assign owner role -> BLOCKED
    const consultInv = await facade.membershipService.inviteMember('owner_1', {
      agencyId: agency.id,
      userUid: 'consultant_user',
      role: 'real_estate_consultant',
    });
    await facade.membershipService.acceptInvitation(consultInv.id, 'consultant_user');

    // Consultant attempts to invite an owner -> rejected
    await assert.rejects(
      async () => {
        await facade.membershipService.inviteMember('consultant_user', {
          agencyId: agency.id,
          userUid: 'target_victim',
          role: 'agency_owner',
        });
      },
      (err: any) => err instanceof BrokerageValidationError && err.code === 'FORBIDDEN',
    );

    // Branch manager attempts to invite someone as agency_director -> rejected by hierarchy check
    const mgrInv = await facade.membershipService.inviteMember('owner_1', {
      agencyId: agency.id,
      userUid: 'mgr_user',
      role: 'branch_manager',
    });
    await facade.membershipService.acceptInvitation(mgrInv.id, 'mgr_user');

    await assert.rejects(
      async () => {
        await facade.membershipService.inviteMember('mgr_user', {
          agencyId: agency.id,
          userUid: 'target_victim_2',
          role: 'agency_director',
        });
      },
      (err: any) => err instanceof BrokerageValidationError && err.code === 'UNAUTHORIZED_ROLE_ESCALATION',
    );
    testsPassed++;
    console.log('✓ 4. Role escalation guards & hierarchy enforcement passed');
  }

  // 5. Branch-Scoped Permissions
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'آژانس مرکزی',
      description: 'چند شعبه',
      organizationType: 'multi_branch_agency',
      businessContact: { phone: '+982188889999', email: 'branch@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });

    const b1 = await facade.agencyService.createBranch('owner_1', {
      agencyId: agency.id,
      branchName: 'شعبه ۱',
      contact: { phone: '+982188881111', email: 'b1@test.ir' },
      geographicReference: { cityId: 'tehran' },
      branchManagerUid: 'b1_mgr',
    });

    const b2 = await facade.agencyService.createBranch('owner_1', {
      agencyId: agency.id,
      branchName: 'شعبه ۲',
      contact: { phone: '+982188882222', email: 'b2@test.ir' },
      geographicReference: { cityId: 'tehran' },
      branchManagerUid: 'b2_mgr',
    });

    // Give b1_mgr active branch_manager membership assigned to b1
    const b1MgrMem = await facade.membershipService.inviteMember('owner_1', {
      agencyId: agency.id,
      userUid: 'b1_mgr',
      branchId: b1.id,
      role: 'branch_manager',
    });
    await facade.membershipService.acceptInvitation(b1MgrMem.id, 'b1_mgr');

    // b1_mgr attempts to invite member to b2 -> REJECTED (Branch Scope Mismatch)
    await assert.rejects(
      async () => {
        await facade.membershipService.inviteMember('b1_mgr', {
          agencyId: agency.id,
          userUid: 'new_agent_b2',
          branchId: b2.id,
          role: 'real_estate_consultant',
        });
      },
      (err: any) => err instanceof BrokerageValidationError && err.code === 'FORBIDDEN',
    );

    // b1_mgr invites member to b1 -> ALLOWED
    const validInv = await facade.membershipService.inviteMember('b1_mgr', {
      agencyId: agency.id,
      userUid: 'new_agent_b1',
      branchId: b1.id,
      role: 'real_estate_consultant',
    });
    assert.strictEqual(validInv.branchId, b1.id);
    testsPassed++;
    console.log('✓ 5. Branch-scoped permission boundaries passed');
  }

  // 6. Representation Mandates Lifecycle & Authority Validation Contract
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک پونک',
      description: 'غرب تهران',
      organizationType: 'real_estate_office',
      businessContact: { phone: '+982144445555', email: 'poonak@test.ir' },
      mainGeographicReference: { cityId: 'tehran', neighborhoodId: 1 },
    });

    // Activate agency
    await facade.agencyService.setOperatingStatus(agency.id, 'active', 'owner_1');

    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const mandate = await facade.mandateService.createMandate('owner_1', {
      agencyId: agency.id,
      propertyReference: 'prop_tajrish_88',
      clientReference: 'client_farhad',
      representationType: 'exclusive_sale_representation',
      scopeOfAuthority: {
        canAdvertise: true,
        canConductViewings: true,
        canNegotiateTerms: false,
        canCollectDeposit: false,
        canSignContractOnBehalf: false,
      },
      startDateIso: startDate,
      expirationDateIso: expDate,
      evidenceReferences: ['notary_mandate_doc_8899.pdf'],
      issuingParty: 'مالک اصلی - جناب فرهاد',
    });

    assert.strictEqual(mandate.confirmationStatus, 'pending');

    // Before activation, authority validation must return false
    const check1 = await facade.mandateService.validateRepresentationAuthority(
      'prop_tajrish_88',
      agency.id,
      'canAdvertise',
    );
    assert.strictEqual(check1.authorized, false);

    // Confirm/activate mandate
    await facade.mandateService.updateMandateStatus(mandate.id, 'active', 'client_farhad');

    // Now canAdvertise is authorized
    const check2 = await facade.mandateService.validateRepresentationAuthority(
      'prop_tajrish_88',
      agency.id,
      'canAdvertise',
    );
    assert.strictEqual(check2.authorized, true);
    assert.strictEqual(check2.mandateId, mandate.id);

    // canNegotiateTerms was false in mandate scope -> rejected
    const checkScope = await facade.mandateService.validateRepresentationAuthority(
      'prop_tajrish_88',
      agency.id,
      'canNegotiateTerms',
    );
    assert.strictEqual(checkScope.authorized, false);

    // Revocation test
    await facade.mandateService.updateMandateStatus(mandate.id, 'revoked', 'client_farhad', 'انصراف مالک');
    const checkRevoked = await facade.mandateService.validateRepresentationAuthority(
      'prop_tajrish_88',
      agency.id,
      'canAdvertise',
    );
    assert.strictEqual(checkRevoked.authorized, false);
    testsPassed++;
    console.log('✓ 6. Mandate lifecycle & authority verification passed');
  }

  // 7. Listing Assignment vs Authority Invariant
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک نیاوران',
      description: 'شمال شرق',
      organizationType: 'real_estate_office',
      businessContact: { phone: '+982122880011', email: 'niavaran@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });
    await facade.agencyService.setOperatingStatus(agency.id, 'active', 'owner_1');

    const agentMem = await facade.membershipService.inviteMember('owner_1', {
      agencyId: agency.id,
      userUid: 'agent_reza',
      role: 'senior_consultant',
    });
    await facade.membershipService.acceptInvitation(agentMem.id, 'agent_reza');

    // Assigning valid listing
    const assignment = await facade.mandateService.assignListingToAgent('owner_1', {
      listingReference: 'listing_101',
      agencyId: agency.id,
      agentUid: 'agent_reza',
      notes: 'پیگیری خریداران محترم',
    });

    assert.strictEqual(assignment.assignedAgentUid, 'agent_reza');
    assert.strictEqual(assignment.status, 'active');

    // Invariant check: Listing assignment alone does NOT grant legal authority if no mandate exists!
    const authorityCheck = await facade.mandateService.validateRepresentationAuthority(
      'listing_101',
      agency.id,
      'canAdvertise',
    );
    assert.strictEqual(authorityCheck.authorized, false);

    // Reassigning listing to another agent
    const agent2Mem = await facade.membershipService.inviteMember('owner_1', {
      agencyId: agency.id,
      userUid: 'agent_sara',
      role: 'real_estate_consultant',
    });
    await facade.membershipService.acceptInvitation(agent2Mem.id, 'agent_sara');

    const reassignment = await facade.mandateService.assignListingToAgent('owner_1', {
      listingReference: 'listing_101',
      agencyId: agency.id,
      agentUid: 'agent_sara',
    });

    assert.strictEqual(reassignment.assignedAgentUid, 'agent_sara');
    // Verify old assignment marked reassigned
    const oldAss = await facade.store.getListingAssignmentById(assignment.id);
    assert.strictEqual(oldAss?.status, 'reassigned');
    testsPassed++;
    console.log('✓ 7. Listing assignment & reassignment without unauthorized authority passed');
  }

  // 8. Commission Agreements & Unconfirmed Deal Guard
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک پارس',
      description: 'قراردادهای کمیسیون',
      organizationType: 'real_estate_office',
      businessContact: { phone: '+982188884433', email: 'pars@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });
    await facade.agencyService.setOperatingStatus(agency.id, 'active', 'owner_1');

    // 1% commission on confirmed deal
    const agreement = await facade.commissionService.createAgreement('owner_1', {
      agencyId: agency.id,
      agentUid: 'agent_reza',
      dealReference: 'deal_unconfirmed_12',
      commissionType: 'percentage_of_transaction_value',
      agreedAmountOrPercentage: 1.0, // 1%
      currency: 'IRT',
      calculationBasis: 'confirmed_transaction_value',
      payer: 'seller',
      allocationRules: {
        agencySharePercentage: 50,
        agentSharePercentage: 50,
      },
      effectiveDateIso: new Date().toISOString(),
    });

    assert.strictEqual(agreement.version, 1);
    assert.strictEqual(agreement.approvalStatus, 'proposed');

    // Calculate on unconfirmed deal -> MUST BE ESTIMATED, ZERO PAYABLE
    const calcUnconfirmed = await facade.commissionService.calculatePayableCommission(agreement.id);
    assert.strictEqual(calcUnconfirmed.isConfirmed, false);
    assert.strictEqual(calcUnconfirmed.status, 'ESTIMATED_PENDING_CONFIRMATION');
    assert.strictEqual(calcUnconfirmed.totalCommissionToman, 0);

    // Agreement tied to confirmed deal (10 Billion Toman)
    const agreement2 = await facade.commissionService.createAgreement('owner_1', {
      agencyId: agency.id,
      agentUid: 'agent_reza',
      dealReference: 'deal_confirmed_99',
      commissionType: 'percentage_of_transaction_value',
      agreedAmountOrPercentage: 1.0, // 1% of 10B = 100M
      currency: 'IRT',
      calculationBasis: 'confirmed_transaction_value',
      payer: 'seller',
      allocationRules: {
        agencySharePercentage: 60,
        agentSharePercentage: 40,
      },
      effectiveDateIso: new Date().toISOString(),
    });

    const calcConfirmed = await facade.commissionService.calculatePayableCommission(agreement2.id);
    assert.strictEqual(calcConfirmed.isConfirmed, true);
    assert.strictEqual(calcConfirmed.status, 'CALCULATED_ON_CONFIRMED_DEAL');
    assert.strictEqual(calcConfirmed.totalCommissionToman, 100_000_000); // 100M Toman
    assert.strictEqual(calcConfirmed.agencyShareToman, 60_000_000);
    assert.strictEqual(calcConfirmed.agentShareToman, 40_000_000);

    // Versioning / Amendment
    const amended = await facade.commissionService.amendAgreement('owner_1', agreement2.id, {
      agreedAmountOrPercentage: 1.5,
    });
    assert.strictEqual(amended.version, 2);
    assert.strictEqual(amended.amendedFromId, agreement2.id);
    testsPassed++;
    console.log('✓ 8. Commission agreement versioning & unconfirmed deal safety guards passed');
  }

  // 9. Agency Suspension & Operational Blockade
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک تعلیقی',
      description: 'تست تعلیق',
      organizationType: 'independent_brokerage',
      businessContact: { phone: '+982188880099', email: 'suspend@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });

    // Suspend agency
    await facade.agencyService.setOperatingStatus(agency.id, 'suspended', 'owner_1', 'بازرسی اتحادیه');

    // Attempting to create mandate under suspended agency -> BLOCKED
    await assert.rejects(
      async () => {
        await facade.mandateService.createMandate('owner_1', {
          agencyId: agency.id,
          propertyReference: 'prop_test',
          clientReference: 'client_test',
          representationType: 'sale_representation',
          scopeOfAuthority: {
            canAdvertise: true,
            canConductViewings: true,
            canNegotiateTerms: false,
            canCollectDeposit: false,
            canSignContractOnBehalf: false,
          },
          startDateIso: new Date().toISOString(),
          expirationDateIso: new Date(Date.now() + 86400000).toISOString(),
          evidenceReferences: [],
          issuingParty: 'مالک',
        });
      },
      (err: any) => err instanceof BrokerageValidationError && err.code === 'AGENCY_SUSPENDED',
    );
    testsPassed++;
    console.log('✓ 9. Agency suspension & operational blockade passed');
  }

  // 10. Account Lifecycle Integration (Export & Anonymization)
  {
    const { facade } = setupModule();
    await facade.membershipService.registerAgentProfile('user_to_delete', {
      publicDisplayName: 'کاربر قابل حذف',
      professionalBio: 'اطلاعات خصوصی که باید آرشیو شود',
      serviceCategories: ['residential_sale'],
      geographicCoverage: [],
    });

    const exportData = await facade.exportUserData('user_to_delete');
    assert.ok(exportData.profile);
    assert.strictEqual((exportData.profile as any).publicDisplayName, 'کاربر قابل حذف');

    const purgeResult = await facade.purgeOrAnonymizeUserData('user_to_delete', 'GDPR Request');
    assert.strictEqual(purgeResult.purgedProfileCount, 1);

    const updatedProfile = await facade.store.getAgentProfileByUserUid('user_to_delete');
    assert.strictEqual(updatedProfile?.publicationStatus, 'archived');
    assert.strictEqual(updatedProfile?.professionalBio, '[REDACTED PURSUANT TO ACCOUNT DELETION]');
    testsPassed++;
    console.log('✓ 10. Account lifecycle export and anonymization boundaries passed');
  }

  // 11. Performance Summaries & Activity Aggregations
  {
    const { facade } = setupModule();
    const { agency } = await facade.agencyService.createAgency('owner_1', {
      publicDisplayName: 'املاک البرز',
      description: 'گزارش عملکرد',
      organizationType: 'real_estate_office',
      businessContact: { phone: '+982188880011', email: 'alborz@test.ir' },
      mainGeographicReference: { cityId: 'tehran' },
    });
    await facade.agencyService.setOperatingStatus(agency.id, 'active', 'owner_1');

    const summary = await facade.analyticsService.getAgencyPerformanceSummary(agency.id, 'owner_1', 30);
    assert.strictEqual(summary.agencyId, agency.id);
    assert.strictEqual(typeof summary.activeAgentCount, 'number');
    assert.strictEqual(typeof summary.activeMandatesCount, 'number');
    assert.strictEqual(typeof summary.completedTransactionsCount, 'number');
    testsPassed++;
    console.log('✓ 11. Performance summaries & analytics aggregations passed');
  }

  console.log(`\n🎉 ALL ${testsPassed} BROKERAGE MODULE TEST SUITES PASSED CLEANLY!\n`);
}

runTestSuite().catch((err) => {
  console.error('❌ Brokerage test suite failed:', err);
  process.exit(1);
});

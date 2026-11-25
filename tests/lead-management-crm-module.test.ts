/**
 * @file tests/lead-management-crm-module.test.ts
 * @description Comprehensive unit, integration, and security tests for Employee 14
 * Lead Management & Real Estate CRM Backend Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createLeadRouter,
  LeadEngine,
  MemoryGeographyAdapter,
  MemoryLeadStore,
  MemoryListingAdapter,
  MemoryNotificationPublisher,
  MemoryProfessionalAdapter,
  type LeadRecord,
} from '../server/modules/leads';

console.log('🧪 Running Employee 14 Lead Management & Real Estate CRM Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  const store = new MemoryLeadStore();
  const listingAdapter = new MemoryListingAdapter();
  const professionalAdapter = new MemoryProfessionalAdapter();
  const geographyAdapter = new MemoryGeographyAdapter();
  const publisher = new MemoryNotificationPublisher();

  const engine = new LeadEngine(store, listingAdapter, professionalAdapter, geographyAdapter, publisher);

  // Setup initial mock fixtures
  listingAdapter.setListing('brg_active_101', {
    found: true,
    isApproved: true,
    cityId: 'tehran',
    hoodId: 5,
    assignedProfessionalUid: 'pro_reza_1',
    representingAgencyId: 'agency_alpha_1',
  });

  listingAdapter.setListing('brg_unapproved_102', {
    found: true,
    isApproved: false,
  });

  professionalAdapter.setAgency('agency_alpha_1', {
    exists: true,
    ownerUid: 'user_agency_owner_1',
    managerUids: ['user_agency_mgr_1'],
    activeBranchIds: ['branch_north_1'],
  });

  professionalAdapter.setProfessional('pro_reza_1', {
    exists: true,
    isLicenseVerified: true,
    agencyId: 'agency_alpha_1',
    branchId: 'branch_north_1',
    role: 'consultant',
  });

  professionalAdapter.setProfessional('pro_independent_2', {
    exists: true,
    isLicenseVerified: true,
  });

  // Test 1: Property inquiry creation with verified listing reference
  let createdLead1: LeadRecord | undefined;
  await verify('Property inquiry binds to authenticated customer and approved listing reference', async () => {
    const res = await engine.createLead('cust_ali_1', {
      leadType: 'PROPERTY_INQUIRY',
      intent: 'CALLBACK_REQUEST',
      targetListingId: 'brg_active_101',
      customerDisplayName: 'علی حسینی',
      customerPhone: '09121112233',
      preferredContactMethod: 'PHONE',
      requirements: {
        cityId: 'tehran',
        hoodId: 5,
        propertyCategory: 'RESIDENTIAL_APARTMENT',
        transactionType: 'BUY',
        budgetMaxMillion: 15000,
      },
      consentPurpose: 'درخواست تماس جهت دریافت اطلاعات قیمت و بازدید',
      consentTextVersion: 'v1.0',
    });

    assert.ok(res.success, 'Lead creation must succeed');
    assert.ok(res.lead);
    assert.equal(res.lead.customerAccountUid, 'cust_ali_1');
    assert.equal(res.lead.targetListingId, 'brg_active_101');
    assert.equal(res.lead.targetProfessionalId, 'pro_reza_1');
    assert.equal(res.lead.targetAgencyId, 'agency_alpha_1');
    assert.equal(res.lead.lifecycleState, 'ASSIGNED');
    assert.equal(res.lead.assignmentStatus, 'ASSIGNED_TO_PROFESSIONAL');
    assert.equal(publisher.publishedEvents.length, 1);
    assert.equal(publisher.publishedEvents[0].eventType, 'lead.created');

    createdLead1 = res.lead;
  });

  // Test 2: Reject unapproved or nonexistent listing references
  await verify('Rejects inquiry on unapproved or missing property listings', async () => {
    const unapprovedRes = await engine.createLead('cust_ali_1', {
      leadType: 'PROPERTY_INQUIRY',
      intent: 'CALLBACK_REQUEST',
      targetListingId: 'brg_unapproved_102',
      customerDisplayName: 'علی',
      customerPhone: '09121112233',
      preferredContactMethod: 'PHONE',
      requirements: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: 'تماس',
      consentTextVersion: 'v1.0',
    });
    assert.equal(unapprovedRes.success, false);
    assert.ok(unapprovedRes.errors?.[0].includes('INVALID_LISTING_REFERENCE'));

    const missingRes = await engine.createLead('cust_ali_1', {
      leadType: 'PROPERTY_INQUIRY',
      intent: 'CALLBACK_REQUEST',
      targetListingId: 'brg_nonexistent_999',
      customerDisplayName: 'علی',
      customerPhone: '09121112233',
      preferredContactMethod: 'PHONE',
      requirements: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: 'تماس',
      consentTextVersion: 'v1.0',
    });
    assert.equal(missingRes.success, false);
  });

  // Test 3: General property search inquiry and commercial office inquiries
  await verify('Creates general requirement and commercial office inquiries with structured parameters', async () => {
    const genRes = await engine.createLead('cust_sara_2', {
      leadType: 'GENERAL_PROPERTY_REQUIREMENT',
      intent: 'DIRECT_CONSULTATION',
      customerDisplayName: 'سارا تهرانی',
      customerPhone: '09359998877',
      preferredContactMethod: 'TELEGRAM',
      requirements: {
        cityId: 'tehran',
        hoodId: 10,
        propertyCategory: 'RESIDENTIAL_APARTMENT',
        transactionType: 'RENT',
        budgetMaxMillion: 500, // Deposit
        rentMaxMillion: 25,
        sqmMin: 80,
        sqmMax: 110,
        roomsMin: 2,
      },
      consentPurpose: 'دریافت پیشنهادات ملکی',
      consentTextVersion: 'v1.0',
    });
    assert.ok(genRes.success);
    assert.equal(genRes.lead?.lifecycleState, 'NEW');

    const comRes = await engine.createLead('cust_biz_3', {
      leadType: 'COMMERCIAL_OFFICE_INQUIRY',
      intent: 'DIRECT_CONSULTATION',
      customerDisplayName: 'شرکت فناوران',
      customerPhone: '09127776655',
      preferredContactMethod: 'EMAIL',
      requirements: {
        cityId: 'tehran',
        propertyCategory: 'OFFICE_SPACE',
        transactionType: 'RENT',
        sqmMin: 200,
        commercialAttributes: {
          parkingSpots: 4,
          powerKW: 50,
        },
      },
      consentPurpose: 'مشاوره اجاره واحد اداری',
      consentTextVersion: 'v1.0',
    });
    assert.ok(comRes.success);
    assert.equal(comRes.lead?.requirements.propertyCategory, 'OFFICE_SPACE');
  });

  // Test 4: Duplicate detection and idempotency protection
  await verify('Duplicate detection blocks identical active leads while idempotency returns original', async () => {
    // Exact duplicate within 24h
    const dupRes = await engine.createLead('cust_ali_1', {
      leadType: 'PROPERTY_INQUIRY',
      intent: 'CALLBACK_REQUEST',
      targetListingId: 'brg_active_101',
      customerDisplayName: 'علی حسینی',
      customerPhone: '09121112233',
      preferredContactMethod: 'PHONE',
      requirements: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: 'تماس مجدد',
      consentTextVersion: 'v1.0',
    });
    assert.equal(dupRes.success, false);
    assert.ok(dupRes.errors?.[0].includes('DUPLICATE_ACTIVE_LEAD_EXISTS'));

    // Idempotent retry with matching idempotency key
    const idempRes = await engine.createLead('cust_ali_1', {
      leadType: 'PROPERTY_INQUIRY',
      intent: 'CALLBACK_REQUEST',
      targetListingId: 'brg_active_101',
      customerDisplayName: 'علی حسینی',
      customerPhone: '09121112233',
      preferredContactMethod: 'PHONE',
      requirements: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: 'تماس',
      consentTextVersion: 'v1.0',
      idempotencyKey: createdLead1!.idempotencyKey,
    });
    assert.ok(idempRes.success);
    assert.equal(idempRes.replayed, true);
    assert.equal(idempRes.lead?.id, createdLead1!.id);
  });

  // Test 5: Lead assignment and agency authorization
  await verify('Enforces agency manager permissions and branch membership when assigning leads', async () => {
    assert.ok(createdLead1);

    // Agency manager assigns to professional in the same agency
    const assignRes = await engine.assignLead(
      'user_agency_mgr_1',
      'AGENCY_MANAGER',
      createdLead1.id,
      { agencyId: 'agency_alpha_1', professionalId: 'pro_reza_1' },
      'ارجاع به مشاور منطقه جهت پیگیری فوری',
    );
    assert.ok(assignRes.success);
    assert.equal(assignRes.lead?.currentAssignment?.assignedByUid, 'user_agency_mgr_1');

    // Unauthorized outsider fails to assign
    const unauthAssign = await engine.assignLead(
      'user_stranger_9',
      'AGENCY_MANAGER',
      createdLead1.id,
      { agencyId: 'agency_alpha_1', professionalId: 'pro_reza_1' },
    );
    assert.equal(unauthAssign.success, false);
    assert.ok(unauthAssign.errors?.[0].includes('FORBIDDEN_AGENCY_ACCESS'));

    // Assigning to a professional outside the agency is blocked
    const foreignAssign = await engine.assignLead(
      'user_agency_mgr_1',
      'AGENCY_MANAGER',
      createdLead1.id,
      { agencyId: 'agency_alpha_1', professionalId: 'pro_independent_2' },
    );
    assert.equal(foreignAssign.success, false);
    assert.ok(foreignAssign.errors?.[0].includes('PROFESSIONAL_NOT_IN_AGENCY'));
  });

  // Test 6: Assignee acceptance and lifecycle state machine transitions
  await verify('Assignee accepts lead and transitions through valid lifecycle states', async () => {
    assert.ok(createdLead1);

    // Assignee accepts
    const acceptRes = await engine.respondToAssignment('pro_reza_1', createdLead1.id, true);
    assert.ok(acceptRes.success);
    assert.equal(acceptRes.lead?.lifecycleState, 'ACCEPTED');

    // Attempt invalid transition: directly from ACCEPTED to SUCCESSFUL (must contact first)
    const invalidTrans = await engine.transitionLeadState(
      'pro_reza_1',
      'PROFESSIONAL',
      createdLead1.id,
      'SUCCESSFUL',
    );
    assert.equal(invalidTrans.success, false);
    assert.ok(invalidTrans.errors?.[0].includes('انتقال وضعیت'));

    // Valid progression: ACCEPTED -> CONTACT_ATTEMPTED -> CONTACTED -> VISIT_SCHEDULED -> NEGOTIATION -> SUCCESSFUL
    const callRes = await engine.transitionLeadState('pro_reza_1', 'PROFESSIONAL', createdLead1.id, 'CONTACT_ATTEMPTED', {
      reasonFa: 'تماس تلفنی اولیه برقرار شد',
    });
    assert.ok(callRes.success);

    const contactRes = await engine.transitionLeadState('pro_reza_1', 'PROFESSIONAL', createdLead1.id, 'CONTACTED');
    assert.ok(contactRes.success);

    const visitRes = await engine.transitionLeadState('pro_reza_1', 'PROFESSIONAL', createdLead1.id, 'VISIT_SCHEDULED', {
      scheduledAtIso: '2026-11-10T14:00:00Z',
      reasonFa: 'هماهنگی بازدید برای سه‌شنبه ساعت ۱۴',
    });
    assert.ok(visitRes.success);

    const negRes = await engine.transitionLeadState('pro_reza_1', 'PROFESSIONAL', createdLead1.id, 'NEGOTIATION', {
      reasonFa: 'مذاکره بر سر تخفیف قیمت در جریان است',
    });
    assert.ok(negRes.success);

    const successRes = await engine.transitionLeadState('pro_reza_1', 'PROFESSIONAL', createdLead1.id, 'SUCCESSFUL', {
      reasonFa: 'توافق حاصل شد و فایل به مرحله عقد قرارداد رسید',
    });
    assert.ok(successRes.success);
    assert.equal(successRes.lead?.lifecycleState, 'SUCCESSFUL');
  });

  // Test 7: Controlled contact access and audit logging
  await verify('Contact data is masked in summaries and unmasked access is auditable', async () => {
    assert.ok(createdLead1);
    const lead = await store.getLeadById(createdLead1.id);
    assert.ok(lead);

    const proj = engine.projectProfessionalLead(lead);
    assert.equal(proj.customerPhoneMasked, '0912***2233');

    // Authorized professional accesses contact
    const contactRes = await engine.accessCustomerContactDetails(
      'pro_reza_1',
      'PROFESSIONAL',
      lead.id,
      'تماس با خریدار جهت اعلام زمان بازدید',
    );
    assert.ok(contactRes.success);
    assert.equal(contactRes.contact?.phone, '09121112233');

    // Verify audit record was persisted
    const audits = await store.listContactAccessAudits(lead.id);
    assert.ok(audits.length >= 1);
    assert.equal(audits[0].accessedByUid, 'pro_reza_1');
    assert.ok(audits[0].accessPurposeFa.includes('زمان بازدید'));

    // Unauthorized outsider is denied contact access
    const unauthRes = await engine.accessCustomerContactDetails(
      'pro_stranger_3',
      'PROFESSIONAL',
      lead.id,
      'کنجکاوی',
    );
    assert.equal(unauthRes.success, false);
    assert.ok(unauthRes.errors?.[0].includes('FORBIDDEN_CONTACT_ACCESS'));
  });

  // Test 8: Consent withdrawal revokes contact access
  await verify('Customer consent withdrawal immediately revokes contact access', async () => {
    assert.ok(createdLead1);

    const withdrawRes = await engine.withdrawConsent('cust_ali_1', createdLead1.id, 'منصرف شدم');
    assert.ok(withdrawRes.success);

    // After withdrawal, contact access is blocked even for assigned professional
    const contactRes = await engine.accessCustomerContactDetails(
      'pro_reza_1',
      'PROFESSIONAL',
      createdLead1.id,
      'تلاش مجدد تماس',
    );
    assert.equal(contactRes.success, false);
    assert.ok(contactRes.errors?.[0].includes('CONSENT_WITHDRAWN'));
  });

  // Test 9: Customer vs Internal CRM notes separation
  await verify('Timeline strictly hides internal CRM notes from customer projection', async () => {
    assert.ok(createdLead1);

    // Customer records public note
    await engine.recordActivity('cust_ali_1', 'CUSTOMER', createdLead1.id, {
      activityType: 'LEAD_CREATED',
      notesFa: 'لطفاً بعد از ساعت ۵ بعدازظهر تماس بگیرید.',
    });

    // Professional records internal note
    await engine.recordActivity('pro_reza_1', 'PROFESSIONAL', createdLead1.id, {
      activityType: 'INTERNAL_NOTE_ADDED',
      notesFa: 'مشتری بودجه نقدی دارد اما روی کمیسیون چانه‌زنی می‌کند.',
      visibility: 'INTERNAL_CRM',
    });

    const publicActivities = await store.listActivities(createdLead1.id, 'PUBLIC_CUSTOMER');
    const allActivities = await store.listActivities(createdLead1.id);

    assert.ok(publicActivities.every((a) => a.visibility === 'PUBLIC_CUSTOMER'));
    assert.ok(allActivities.some((a) => a.notesFa?.includes('چانه‌زنی')));
    assert.ok(!publicActivities.some((a) => a.notesFa?.includes('چانه‌زنی')));
  });

  // Test 10: Account Lifecycle export and anonymization compatibility
  await verify('Account Lifecycle integration exports customer leads and safely anonymizes records', async () => {
    const exported = await store.exportCustomerLeads('cust_ali_1');
    assert.ok(exported.leads.length >= 1);
    assert.equal(exported.leads[0].customerAccountUid, 'cust_ali_1');

    const anonRes = await store.anonymizeCustomerLeads('cust_ali_1');
    assert.ok(anonRes.anonymizedCount >= 1);

    const postAnon = await store.getLeadById(createdLead1!.id);
    assert.ok(postAnon);
    assert.equal(postAnon.isAnonymized, true);
    assert.equal(postAnon.customerPhone, '09000000000');
    assert.ok(postAnon.customerDisplayName.includes('حذف‌شده'));
  });

  // Test 11: CRM Operational metrics calculation
  await verify('Calculates operational CRM metrics with response times and status breakdowns', async () => {
    const metrics = await engine.calculateOperationalMetrics({ agencyId: 'agency_alpha_1', windowDays: 30 });
    assert.ok(metrics.totalLeadsCount >= 1);
    assert.equal(typeof metrics.newLeadsCount, 'number');
    assert.equal(typeof metrics.successfulLeadsCount, 'number');
  });

  // Test 12: Express API routes integration
  await verify('Express API router fails closed without a verifier and enforces verified identity and scoped access', async () => {
    const noVerifierApp = express();
    noVerifierApp.use(express.json());
    noVerifierApp.use('/api/leads', createLeadRouter(engine));
    const noVerifierServer = http.createServer(noVerifierApp);
    await new Promise<void>((resolve) => noVerifierServer.listen(0, resolve));
    const noVerifierPort = (noVerifierServer.address() as any).port;
    try {
      const noVerifierRes = await fetch(`http://127.0.0.1:${noVerifierPort}/api/leads/my-leads`, {
        headers: { 'x-test-uid': 'spoofed_user_uid_12345' },
      });
      assert.equal(noVerifierRes.status, 503);
    } finally {
      await new Promise<void>((resolve) => noVerifierServer.close(() => resolve()));
    }

    const leadTokenVerifier = {
      async verifyIdToken(token: string) {
        const identities: Record<string, { uid: string; email: string; email_verified: boolean }> = {
          token_customer_lead_test_123456: { uid: 'cust_express_test', email: 'customer@example.com', email_verified: true },
          token_professional_lead_test_123456: { uid: 'pro_reza_1', email: 'pro@example.com', email_verified: true },
          token_attacker_lead_test_123456: { uid: 'attacker_lead_user', email: 'attacker@example.com', email_verified: true },
        };
        const identity = identities[token];
        if (!identity) throw new Error('INVALID_TOKEN');
        return identity;
      },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/leads', createLeadRouter(engine, leadTokenVerifier));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/leads`;

    try {
      // 1. POST /api/leads/property-inquiry
      const postRes = await fetch(`${baseUrl}/property-inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_customer_lead_test_123456',
        },
        body: JSON.stringify({
          targetListingId: 'brg_active_101',
          customerDisplayName: 'تست اکسپرس',
          customerPhone: '09124445566',
          requirements: { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
          consentPurpose: 'مشاوره خرید',
          consentTextVersion: 'v1.0',
        }),
      });
      assert.equal(postRes.status, 201);
      const postJson = (await postRes.json()) as any;
      assert.ok(postJson.ok);
      const newLeadId = postJson.data.lead.id;

      // 2. GET /api/leads/my-leads
      const getRes = await fetch(`${baseUrl}/my-leads`, {
        headers: { Authorization: 'Bearer token_customer_lead_test_123456' },
      });
      assert.equal(getRes.status, 200);
      const getJson = (await getRes.json()) as any;
      assert.ok(getJson.data.leads.length >= 1);

      // 3. POST /api/leads/:leadId/activities
      const actRes = await fetch(`${baseUrl}/${newLeadId}/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_professional_lead_test_123456',
        },
        body: JSON.stringify({
          activityType: 'CALL_ATTEMPTED',
          notesFa: 'تماس گرفته شد اما بوق اشغال بود.',
        }),
      });
      assert.equal(actRes.status, 201);

      // 4. GET /api/leads/:leadId/activities
      const getActsRes = await fetch(`${baseUrl}/${newLeadId}/activities`, {
        headers: { Authorization: 'Bearer token_customer_lead_test_123456' },
      });
      assert.equal(getActsRes.status, 200);

      // An authenticated but unassigned user cannot read internal activities or impersonate ADMIN via x-role.
      const forbiddenActivities = await fetch(`${baseUrl}/${newLeadId}/activities`, {
        headers: { Authorization: 'Bearer token_attacker_lead_test_123456' },
      });
      assert.equal(forbiddenActivities.status, 403);

      const spoofedAdminContact = await fetch(`${baseUrl}/${newLeadId}/contact-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_attacker_lead_test_123456',
          'x-role': 'ADMIN',
        },
        body: JSON.stringify({ accessPurposeFa: 'test' }),
      });
      assert.equal(spoofedAdminContact.status, 403);

      const forbiddenAgencyQueue = await fetch(`${baseUrl}/crm/agency?agencyId=agency_alpha_1`, {
        headers: { Authorization: 'Bearer token_attacker_lead_test_123456' },
      });
      assert.equal(forbiddenAgencyQueue.status, 403);

      const forbiddenAgencyMetrics = await fetch(`${baseUrl}/crm/metrics?agencyId=agency_alpha_1`, {
        headers: { Authorization: 'Bearer token_attacker_lead_test_123456' },
      });
      assert.equal(forbiddenAgencyMetrics.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log(`\n🎉 ALL ${passed} EMPLOYEE 14 LEAD MANAGEMENT & REAL ESTATE CRM TESTS PASSED!`);
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});

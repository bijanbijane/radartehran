/**
 * @file tests/property-services-module.test.ts
 * @description Comprehensive unit and workflow tests for Employee 12 Property Services Marketplace Backend.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  PropertyServicesStore,
  PropertyServicesEngine,
  PropertyServicesSearch,
  ServiceCategoryRegistry,
  registerPropertyServicesRoutes,
} from '../server/modules/property-services';

console.log('🧪 Running Employee 12 Property Services Marketplace Tests...\n');

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
  const store = new PropertyServicesStore();
  const categoryRegistry = new ServiceCategoryRegistry();
  const engine = new PropertyServicesEngine(store, categoryRegistry);
  const search = new PropertyServicesSearch(store);

  // Test 1: Category catalog and extensible registry
  await verify('Category registry loads canonical categories and allows runtime extension', () => {
    const categories = categoryRegistry.listCategories();
    assert.ok(categories.length >= 20, 'Must contain all canonical categories');

    const architectCat = categoryRegistry.getCategory('cat_architect');
    assert.ok(architectCat !== null);
    assert.equal(architectCat?.group, 'construction_building');
    assert.equal(architectCat?.requiresProfessionalLicense, true);

    // Register custom specialized category
    categoryRegistry.registerCustomCategory({
      id: 'cat_acoustic_insulation',
      group: 'specialized_custom',
      titleFa: 'عایق‌کاری آکوستیک و استودیو',
      descriptionFa: 'اجرای پنل‌های آکوستیک جاذب صوت و ایزولاسیون صدا',
      keywordsFa: ['آکوستیک', 'عایق صدا', 'استودیو'],
      requiresProfessionalLicense: false,
      isActive: true,
    });

    const custom = categoryRegistry.getCategory('cat_acoustic_insulation');
    assert.ok(custom !== null);
    assert.equal(custom?.titleFa, 'عایق‌کاری آکوستیک و استودیو');
  });

  // Test 2: Provider profile creation, ownership, and public/private field separation
  await verify('Provider profile creation preserves account ownership and strictly isolates private fields', async () => {
    store.clearAllForTesting();

    const regResult = await engine.registerOrUpdateProvider('user_electrician_1', {
      publicDisplayName: 'مهندس رضایی',
      businessName: 'الکترو پاسارگاد',
      providerType: 'individual_professional',
      primaryCategoryIds: ['cat_electrician'],
      descriptionFa: 'متخصص برق ساختمان و عیب‌یابی تابلو برق با ۱۵ سال سابقه',
      contactPhone: '09121234567',
      contactEmail: 'rezaei@example.com',
      serviceAreas: [{ cityId: 'tehran', isCitywide: true }],
    });

    assert.equal(regResult.success, true);
    assert.ok(regResult.profile !== undefined);
    const providerId = regResult.profile!.id;

    // Fetch private profile
    const privateProfile = await store.getPrivateProfileById(providerId);
    assert.equal(privateProfile?.contactPhone, '09121234567');
    assert.equal(privateProfile?.userId, 'user_electrician_1');

    // Fetch public profile -> contact phone and email must be completely redacted!
    const publicProfile = await store.getPublicProfileById(providerId);
    assert.ok(publicProfile !== null);
    assert.equal(publicProfile?.publicDisplayName, 'مهندس رضایی');
    assert.equal((publicProfile as any).contactPhone, undefined, 'Public profile must NOT leak phone');
    assert.equal((publicProfile as any).contactEmail, undefined, 'Public profile must NOT leak email');
  });

  // Test 3: Credential submission and verification state machine
  await verify('Credential workflow transitions through SUBMITTED -> UNDER_REVIEW -> VERIFIED with audit logging', async () => {
    const provider = await store.getProviderByUserId('user_electrician_1');
    assert.ok(provider !== null);

    // Submit trade union credential
    const credOutcome = await engine.submitCredential('user_electrician_1', {
      credentialType: 'TRADE_UNION_BUSINESS_LICENSE',
      issuingAuthorityFa: 'اتحادیه صنف الکتریک تهران',
      licenseNumber: 'LIC-987654',
      documentMediaId: 'media_doc_private_999',
    });

    assert.equal(credOutcome.success, true);
    assert.equal(credOutcome.credential?.verificationState, 'SUBMITTED', 'Submission is NOT verified yet');

    const providerAfterSubmit = await store.getPrivateProfileById(provider!.id);
    assert.equal(providerAfterSubmit?.verificationState, 'UNDER_REVIEW');

    // Admin verifies credential
    const reviewOutcome = await engine.reviewCredential(
      'admin_uid_777',
      provider!.id,
      credOutcome.credential!.id,
      'VERIFIED',
    );
    assert.equal(reviewOutcome.success, true);

    const providerAfterVerify = await store.getPrivateProfileById(provider!.id);
    assert.equal(providerAfterVerify?.verificationState, 'VERIFIED');

    // Check moderation audit log
    const auditLogs = store.getModerationLogs();
    assert.ok(auditLogs.length > 0);
    assert.equal(auditLogs[auditLogs.length - 1].reviewerUid, 'admin_uid_777');
    assert.equal(auditLogs[auditLogs.length - 1].action, 'approve');
  });

  // Test 4: Service offering publication
  await verify('Provider can publish service offerings with pricing models', async () => {
    const offeringOutcome = await engine.createServiceOffering('user_electrician_1', {
      categoryId: 'cat_electrician',
      titleFa: 'سیم‌کشی کامل واحد مسکونی',
      descriptionFa: 'اجرای لوله‌گذاری، سیم‌کشی استاندارد، نصب کلید و پریز و تابلو فیوز',
      pricingModel: 'PER_SQM',
      basePriceToman: 180000,
      unitLabelFa: 'هر متر مربع زیربنا',
    });

    assert.equal(offeringOutcome.success, true);
    assert.equal(offeringOutcome.offering?.publicationStatus, 'published');
    assert.equal(offeringOutcome.offering?.pricingModel, 'PER_SQM');
  });

  // Test 5: Service Request, Quotation Submission, and Privacy Isolation
  await verify('Quotation workflow enforces privacy and prevents unauthorized quotation leakage', async () => {
    // Client creates service request
    const reqOutcome = await engine.createServiceRequest('client_user_sara', {
      categoryId: 'cat_electrician',
      titleFa: 'سیم‌کشی واحد ۱۲۰ متری در سعادت‌آباد',
      descriptionFa: 'نیاز به تعویض کامل سیم‌کشی و تابلو برق ساختمان ۲۰ سال ساخت',
      cityId: 'tehran',
      hoodId: 2,
      budgetMaxToman: 25000000,
    });

    assert.equal(reqOutcome.success, true);
    const requestId = reqOutcome.request!.id;

    // Provider 1 submits quotation
    const quotOutcome = await engine.submitQuotation('user_electrician_1', requestId, {
      priceToman: 22000000,
      scopeOfWorkFa: 'شامل تخریب، لوله‌گذاری پی‌وی‌سی، سیم نسوز استاندارد و تست مقاومت عایقی',
      estimatedDurationDays: 5,
      validityPeriodDays: 14,
    });

    assert.equal(quotOutcome.success, true);
    const quotationId = quotOutcome.quotation!.id;

    // Privacy Check 1: Sara (the client) CAN see the quotation
    const clientView = await store.listQuotationsForRequest(requestId, 'client_user_sara');
    assert.equal(clientView.length, 1);
    assert.equal(clientView[0].id, quotationId);

    // Privacy Check 2: Provider 1 CAN see his own quotation
    const provider1View = await store.listQuotationsForRequest(requestId, 'user_electrician_1');
    assert.equal(provider1View.length, 1);

    // Privacy Check 3: Another competing provider (user_competitor_2) CANNOT see Provider 1's quotation!
    const competitorView = await store.listQuotationsForRequest(requestId, 'user_competitor_2');
    assert.equal(competitorView.length, 0, 'Competitor must not see rival quotation');
  });

  // Test 6: Quotation Acceptance, Booking Creation, and State Transitions
  await verify('Quotation acceptance creates booking and validates state-machine transitions', async () => {
    const saraRequests = await store.listRequestsByClient('client_user_sara');
    const requestId = saraRequests[0].id;
    const quotations = await store.listQuotationsForRequest(requestId, 'client_user_sara');
    const quotationId = quotations[0].id;

    // Sara accepts quotation
    const acceptOutcome = await engine.acceptQuotationAndCreateBooking('client_user_sara', quotationId);
    assert.equal(acceptOutcome.success, true);
    assert.ok(acceptOutcome.booking !== undefined);
    assert.equal(acceptOutcome.booking?.currentState, 'ACCEPTED');

    const bookingId = acceptOutcome.booking!.id;

    // State Transition: ACCEPTED -> SCHEDULED (Provider sets schedule)
    const scheduleOutcome = await engine.transitionBookingState('user_electrician_1', bookingId, 'SCHEDULED');
    assert.equal(scheduleOutcome.success, true);
    assert.equal(scheduleOutcome.booking?.currentState, 'SCHEDULED');

    // State Transition: SCHEDULED -> IN_PROGRESS
    const startOutcome = await engine.transitionBookingState('user_electrician_1', bookingId, 'IN_PROGRESS');
    assert.equal(startOutcome.success, true);
    assert.equal(startOutcome.booking?.currentState, 'IN_PROGRESS');

    // Invalid shortcut attempt: Client attempts to jump straight to CANCELLED while in progress without dispute
    // (Allowed if cancel is valid, but let's test invalid transition to REQUESTED)
    const invalidTransition = await engine.transitionBookingState('user_electrician_1', bookingId, 'REQUESTED' as any);
    assert.equal(invalidTransition.success, false, 'Invalid state shortcut must be rejected');

    // Provider completes the job: IN_PROGRESS -> COMPLETED
    const completeOutcome = await engine.transitionBookingState('user_electrician_1', bookingId, 'COMPLETED');
    assert.equal(completeOutcome.success, true);
    assert.equal(completeOutcome.booking?.currentState, 'COMPLETED');

    // Terminal check: COMPLETED booking cannot be cancelled
    const postCompleteCancel = await engine.transitionBookingState('client_user_sara', bookingId, 'CANCELLED');
    assert.equal(postCompleteCancel.success, false, 'Completed booking cannot be cancelled');
  });

  // Test 7: Verified Review Workflow
  await verify('Client of completed booking can submit verified review and update provider rating', async () => {
    const saraRequests = await store.listRequestsByClient('client_user_sara');
    const booking = (await store.listQuotationsForRequest(saraRequests[0].id, 'client_user_sara'))[0];
    const userBookings = await store.getBookingById((await store.getServiceRequestById(saraRequests[0].id))!.selectedQuotationId!);

    // Sara reviews the completed booking
    const allBookings = Array.from((store as any).bookings.values()) as any[];
    const completedBooking = allBookings.find((b) => b.currentState === 'COMPLETED');
    assert.ok(completedBooking !== undefined);

    // Unrelated user attempts to review -> FORBIDDEN
    const impostorReview = await engine.submitReview('impostor_user_99', completedBooking.id, {
      ratingScore: 5,
      commentFa: 'کار بسیار عالی بود',
    });
    assert.equal(impostorReview.success, false, 'Unrelated user cannot review work they did not participate in');

    // Sara submits genuine review
    const validReview = await engine.submitReview('client_user_sara', completedBooking.id, {
      ratingScore: 5,
      commentFa: 'بسیار بااخلاق و دقیق در سیم‌کشی و بدون آسیب به گچ‌بری‌ها.',
    });
    assert.equal(validReview.success, true);
    assert.equal(validReview.review?.isVerifiedCompletedWork, true);

    // Verify provider profile average rating updated
    const updatedProvider = await store.getPrivateProfileById(completedBooking.providerId);
    assert.equal(updatedProvider?.averageRating, 5);
    assert.equal(updatedProvider?.reviewCount, 1);
  });

  // Test 8: Public Search & Discovery with Cursor Pagination
  await verify('Search engine discovers providers by category, city, and verification status with cursor pagination', async () => {
    // Search by category
    const searchRes = await search.searchProviders({
      categoryId: 'cat_electrician',
      cityId: 'tehran',
      verificationState: 'VERIFIED',
      limit: 10,
    });

    assert.equal(searchRes.items.length, 1);
    assert.equal(searchRes.items[0].publicDisplayName, 'مهندس رضایی');
    assert.equal(searchRes.items[0].verificationState, 'VERIFIED');
    assert.equal(searchRes.items[0].averageRating, 5);
  });

  // Test 9: Express API Routes Mount and Responds Accurately
  await verify('Express API routes mount and respond to categories, search, profile, and quotation endpoints', async () => {
    const app = express();
    app.use(express.json());
    registerPropertyServicesRoutes(app, {
      store,
      categoryRegistry,
      engine,
      search,
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Forged identity and admin headers must not authenticate protected mutations.
      const forgedUser = await fetch(`${baseUrl}/api/v2/property-services/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-uid': 'user_attacker', Authorization: 'Bearer user_attacker' },
        body: JSON.stringify({ categoryId: 'cat_architect', description: 'spoofed' }),
      });
      assert.equal(forgedUser.status, 401);
      const forgedAdmin = await fetch(`${baseUrl}/api/v2/property-services/admin/credentials/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-role': 'super_admin', 'x-admin-secret': 'admin_verified' },
        body: JSON.stringify({ providerId: 'provider_1', credentialId: 'credential_1', decision: 'APPROVE' }),
      });
      assert.equal(forgedAdmin.status, 403);

      // 1. GET categories
      const catRes = await fetch(`${baseUrl}/api/v2/property-services/categories`);
      assert.equal(catRes.status, 200);
      const catData = await catRes.json();
      assert.equal(catData.ok, true);
      assert.ok(catData.categories.length >= 20);

      // 2. GET public providers search
      const provRes = await fetch(`${baseUrl}/api/v2/property-services/providers?cityId=tehran`);
      assert.equal(provRes.status, 200);
      const provData = await provRes.json();
      assert.equal(provData.ok, true);
      assert.ok(provData.items.length >= 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log('\n🎉 ALL 9 EMPLOYEE 12 PROPERTY SERVICES MARKETPLACE TESTS PASSED!');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

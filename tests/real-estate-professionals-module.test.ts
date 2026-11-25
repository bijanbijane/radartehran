/**
 * @file tests/real-estate-professionals-module.test.ts
 * @description Unit and workflow tests for Employee 13 Real Estate Professionals & License Verification Backend.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  ProfessionalStore,
  ProfessionalEngine,
  ProfessionalSearch,
  MockOfficialRegistryAdapter,
  UnavailableRegistryAdapter,
  validateOfficialVerificationUrl,
  registerRealEstateProfessionalRoutes,
} from '../server/modules/real-estate-professionals';

console.log('🧪 Running Employee 13 Real Estate Professionals & Verification Tests...\n');

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
  const store = new ProfessionalStore();
  const mockRegistry = new MockOfficialRegistryAdapter('اتحادیه املاک و سامانه کاتب', 'VERIFIED');
  const engine = new ProfessionalEngine(store, mockRegistry);
  const search = new ProfessionalSearch(store);

  // Test 1: Professional profile creation and verified account ownership
  await verify('Professional profile creation binds to verified auth UID and initializes unverified pillars', async () => {
    store.clearAllForTesting();

    const regOutcome = await engine.registerOrUpdateProfessional('user_broker_ali', {
      publicDisplayName: 'علی حسینی',
      role: 'licensed_consultant',
      primaryCityId: 'tehran',
      activeHoodIds: [5, 6], // Punak, Shahrak Gharb
      publicBioFa: 'مشاور تخصصی خرید و فروش آپارتمان در منطقه ۲ و ۵ تهران',
      contactPhone: '09123334455',
    });

    assert.equal(regOutcome.success, true);
    assert.ok(regOutcome.profile !== undefined);
    assert.equal(regOutcome.profile?.userId, 'user_broker_ali');
    assert.equal(regOutcome.profile?.verificationPillars.phoneVerified, false);
    assert.equal(regOutcome.profile?.verificationPillars.licenseVerified, false);
    assert.equal(regOutcome.profile?.verificationStatus, 'NOT_SUBMITTED');
  });

  // Test 2: Phone number verification vs License verification distinction
  await verify('Phone number verification verifies phone control but NEVER grants license verification', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');
    assert.ok(prof !== null);

    // User completes phone OTP
    const phoneSuccess = await engine.recordPhoneVerification('user_broker_ali');
    assert.equal(phoneSuccess, true);

    const updatedProf = await store.getPrivateProfessionalById(prof!.id);
    assert.equal(updatedProf?.verificationPillars.phoneVerified, true, 'Phone must be marked verified');
    assert.equal(updatedProf?.verificationPillars.licenseVerified, false, 'License must STILL be false');
    assert.equal(updatedProf?.verificationStatus, 'NOT_SUBMITTED', 'Status must NOT become verified');
  });

  // Test 3: Agency creation, branch management, and authorization
  await verify('Agency creation establishes ownership and restricts branch addition to managers', async () => {
    const agencyOutcome = await engine.registerAgency('user_agency_owner_taghi', {
      registeredLegalNameFa: 'شرکت خدمات مسکن رویال آرمانی',
      publicTradingNameFa: 'املاک رویال نیاوران',
      tradeUnionLicenseNumber: 'TU-99120',
      cityId: 'tehran',
      centralOfficeAddressFa: 'تهران، نیاوران، سه راه یاسر، پلاک ۱۲',
      publicPhone: '02122889900',
      privateContactPhone: '09121112233',
    });

    assert.equal(agencyOutcome.success, true);
    assert.ok(agencyOutcome.agency !== undefined);
    const agencyId = agencyOutcome.agency!.id;

    // Owner adds branch 1
    const branchOutcome = await engine.addAgencyBranch('user_agency_owner_taghi', agencyId, {
      branchNameFa: 'شعبه الهیه',
      cityId: 'tehran',
      districtId: 'district:tehran:1',
      streetAddressFa: 'الهیه، خیابان فرشته',
      phone: '02122001122',
    });
    assert.equal(branchOutcome.success, true);
    assert.ok(branchOutcome.branch !== undefined);

    // Unauthorized outsider attempts to add branch -> FORBIDDEN
    const outsiderBranch = await engine.addAgencyBranch('user_outsider_hacker', agencyId, {
      branchNameFa: 'شعبه جعلی',
      cityId: 'tehran',
      streetAddressFa: 'جعلی',
      phone: '02111111111',
    });
    assert.equal(outsiderBranch.success, false, 'Non-owner must not be able to add agency branches');
  });

  // Test 4: Agency Membership State Transitions
  await verify('Agency membership enforces invitation, acceptance, and role authorization state transitions', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');
    const agency = Array.from((store as any).agencies.values())[0] as any;

    // Agency owner invites Ali
    const inviteOutcome = await engine.inviteProfessionalToAgency(
      agency.ownerUid,
      agency.id,
      prof!.id,
      'agency_agent',
    );
    assert.equal(inviteOutcome.success, true);
    assert.equal(inviteOutcome.membership?.state, 'INVITED');

    const memId = inviteOutcome.membership!.id;

    // Unauthorized person attempts to accept Ali's invitation -> FORBIDDEN
    const hackerAccept = await engine.transitionMembershipState('user_outsider', memId, 'ACTIVE');
    assert.equal(hackerAccept.success, false, 'Only the invited professional can accept');

    // Ali accepts invitation -> ACTIVE
    const aliAccept = await engine.transitionMembershipState(prof!.userId, memId, 'ACTIVE');
    assert.equal(aliAccept.success, true);
    assert.equal(aliAccept.membership?.state, 'ACTIVE');

    // Check that professional profile is now linked to agency
    const updatedProf = await store.getPrivateProfessionalById(prof!.id);
    assert.equal(updatedProf?.agencyId, agency.id);
  });

  // Test 5: Authoritative Registry Verification vs Unavailable State
  await verify('Registry verification records authoritative status and reports unavailable gateway truthfully', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');

    // 1. Successful lookup with mock authoritative registry
    const credOutcome = await engine.submitAndVerifyCredential('user_broker_ali', {
      ownerId: prof!.id,
      ownerType: 'professional',
      credentialType: 'TRADE_UNION_REAL_ESTATE_LICENSE',
      issuingAuthorityFa: 'اتحادیه صنف مشاورین املاک تهران',
      licenseNumber: 'REG-1405-VALID',
      documentMediaId: 'media_doc_license_999',
      autoQueryRegistry: true,
    });

    assert.equal(credOutcome.success, true);
    assert.equal(credOutcome.credential?.verificationStatus, 'VERIFIED_BY_REGISTRY');
    assert.equal(credOutcome.credential?.verificationMethod, 'OFFICIAL_REGISTRY');

    // 2. Truthful handling when registry gateway is not connected
    const unavailEngine = new ProfessionalEngine(store, new UnavailableRegistryAdapter());
    const unavailOutcome = await unavailEngine.submitAndVerifyCredential('user_broker_ali', {
      ownerId: prof!.id,
      ownerType: 'professional',
      credentialType: 'KATIB_OFFICIAL_BROKER_CODE',
      issuingAuthorityFa: 'سامانه کاتب',
      licenseNumber: 'KATIB-7788',
      documentMediaId: 'media_katib_doc',
      autoQueryRegistry: true,
    });

    assert.equal(unavailOutcome.credential?.verificationStatus, 'REGISTRY_UNAVAILABLE');
  });

  // Test 6: Manual Compliance Review and Anti-Self-Approval
  await verify('Manual review updates status with audit log and enforces anti-self-approval rule', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');
    const creds = await store.listCredentialsForOwner(prof!.id);
    const targetCred = creds[0];

    // Anti-self-approval: applicant attempts to approve own credential -> REJECTED
    const selfApprove = await engine.reviewCredentialManually(prof!.id, targetCred.id, 'MANUALLY_REVIEWED_BY_PLATFORM');
    assert.equal(selfApprove.success, false, 'Applicant cannot approve own credential');

    // Compliance officer reviews credential
    const reviewOutcome = await engine.reviewCredentialManually(
      'compliance_officer_99',
      targetCred.id,
      'MANUALLY_REVIEWED_BY_PLATFORM',
      'مدارک با استعلام کتبی از اتحادیه مطابقت داده شد.',
    );
    assert.equal(reviewOutcome.success, true);

    const updatedCred = await store.getCredentialById(targetCred.id);
    assert.equal(updatedCred?.verificationStatus, 'MANUALLY_REVIEWED_BY_PLATFORM');
    assert.equal(updatedCred?.verificationMethod, 'MANUAL_COMPLIANCE_AUDIT');
  });

  // Test 7: Public Verification Profile and Privacy Redaction
  await verify('Public verification profile exposes clear trust badges and redacts private contact details', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');
    const verifyView = await search.getPublicVerificationProfile(prof!.id);

    assert.equal(verifyView.found, true);
    assert.equal(verifyView.type, 'professional');
    assert.ok(verifyView.verificationBadgeFa.includes('رادار') || verifyView.verificationBadgeFa.includes('معتبر'));
    assert.ok(verifyView.trustNoticeFa.length > 10);

    // Ensure private fields are redacted
    assert.equal((verifyView.profile as any).contactPhone, undefined);
    assert.equal((verifyView.profile as any).nationalIdMasked, undefined);
  });

  // Test 8: Official Verification URL Validation and Open Redirect Prevention
  await verify('Official verification URL validator approves whitelisted domains and rejects malicious links', () => {
    // Approved official domains
    const ssaaCheck = validateOfficialVerificationUrl('https://ssaa.ir/inquiry/realestate/12345');
    assert.equal(ssaaCheck.valid, true);
    assert.equal(ssaaCheck.metadata?.verifiedDomain, 'ssaa.ir');

    const katibCheck = validateOfficialVerificationUrl('https://katib.ir/verify/broker/987');
    assert.equal(katibCheck.valid, true);

    const asnafCheck = validateOfficialVerificationUrl('https://iranianasnaf.ir/license/check?id=55');
    assert.equal(asnafCheck.valid, true);

    // Unapproved / Phishing / Open redirect attacks
    const phishingCheck = validateOfficialVerificationUrl('https://fake-ssaa-phishing.com/verify');
    assert.equal(phishingCheck.valid, false, 'Phishing domain must be rejected');

    const httpCheck = validateOfficialVerificationUrl('http://ssaa.ir/inquiry');
    assert.equal(httpCheck.valid, false, 'Non-HTTPS must be rejected');

    const jsCheck = validateOfficialVerificationUrl('javascript:alert(1)');
    assert.equal(jsCheck.valid, false, 'JavaScript URL must be rejected');
  });

  // Test 9: Listing representation association
  await verify('Listing association connects approved professional to listing without altering Bargains records', async () => {
    const prof = await store.getProfessionalByUserId('user_broker_ali');

    const assocOutcome = await engine.associateProfessionalWithListing(
      'user_broker_ali',
      'listing_bargain_101',
      prof!.id,
      'EXCLUSIVE_BROKER',
    );

    assert.equal(assocOutcome.success, true);
    assert.ok(assocOutcome.association !== undefined);
    assert.equal(assocOutcome.association?.representationType, 'EXCLUSIVE_BROKER');

    const activeAssoc = await store.getActiveListingAssociation('listing_bargain_101');
    assert.ok(activeAssoc !== null);
    assert.equal(activeAssoc?.professionalId, prof!.id);
  });

  // Test 10: Express Routes Integration
  await verify('Express API routes mount and respond to search, profile, agency, and verification endpoints', async () => {
    const app = express();
    app.use(express.json());
    registerRealEstateProfessionalRoutes(app, {
      store,
      engine,
      search,
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Forged identity and admin headers must not authenticate protected mutations.
      const forgedUser = await fetch(`${baseUrl}/api/v2/real-estate-professionals/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-uid': 'user_attacker', Authorization: 'Bearer user_attacker' },
        body: JSON.stringify({ publicDisplayName: 'spoofed' }),
      });
      assert.equal(forgedUser.status, 401);
      const forgedAdmin = await fetch(`${baseUrl}/api/v2/real-estate-professionals/admin/credentials/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-role': 'super_admin', 'x-admin-secret': 'admin_verified' },
        body: JSON.stringify({ credentialId: 'credential_1', decision: 'APPROVE' }),
      });
      assert.equal(forgedAdmin.status, 403);

      // 1. GET professionals search
      const profRes = await fetch(`${baseUrl}/api/v2/real-estate-professionals?cityId=tehran`);
      assert.equal(profRes.status, 200);
      const profData = await profRes.json();
      assert.equal(profData.ok, true);
      assert.ok(profData.items.length >= 1);

      // 2. GET verification profile
      const prof = await store.getProfessionalByUserId('user_broker_ali');
      const verifyRes = await fetch(`${baseUrl}/api/v2/real-estate-professionals/verify/${prof!.id}`);
      assert.equal(verifyRes.status, 200);
      const verifyData = await verifyRes.json();
      assert.equal(verifyData.ok, true);
      assert.equal(verifyData.type, 'professional');
      assert.ok(verifyData.verificationBadgeFa !== undefined);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log('\n🎉 ALL 10 EMPLOYEE 13 REAL ESTATE PROFESSIONALS TESTS PASSED!');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

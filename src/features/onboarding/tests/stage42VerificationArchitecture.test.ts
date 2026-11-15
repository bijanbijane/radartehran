import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE42_DESIGN_COMPONENT_IDS,
  completePhoneVerificationOnly,
  evaluateReviewerDecision,
  evaluateSensitiveDocumentAccess,
  expireSpecificBadgeOnly,
  recordUnverifiedAbuseComplaint,
  revokeSpecificBadgeOnly,
  submitVerificationAppealPreservingCase,
} from '../services/professionalVerificationEngine';
import { INITIAL_STAGE42_CASE, INITIAL_STAGE42_PROFILES } from '../services/stage42VerificationFixtures';

test('Stage 42 (RT-UI-VERIFICATION-001): enforces scoped phone verification, branch independence, expiry history preservation, unverified complaint safety, document privacy, appeal linkage, and dual-review conflict guard', () => {
  const individual = INITIAL_STAGE42_PROFILES[0];
  const company = INITIAL_STAGE42_PROFILES[1];
  const branch = INITIAL_STAGE42_PROFILES[2];

  // 1. Phone verification only validates phone scope, never professional license (Test 1)
  const phoneOnly = completePhoneVerificationOnly(individual);
  assert.equal(phoneOnly.badges.find((b) => b.scope === 'phone')?.status, 'valid');
  assert.notEqual(phoneOnly.badges.find((b) => b.scope === 'credential_license')?.status, 'valid');

  // 2. Branch verification stays independent from parent company (Tests 4 & 11)
  assert.equal(company.badges[0].status, 'valid');
  assert.equal(branch.badges[0].status, 'unverified');

  // 3. Expiry and revocation affect only targeted badge & keep history intact (Tests 5 & 8)
  const expired = expireSpecificBadgeOnly(phoneOnly, 'b-lic-1');
  assert.equal(expired.badges.find((b) => b.badgeId === 'b-lic-1')?.status, 'expired');
  assert.ok((expired.badges.find((b) => b.badgeId === 'b-lic-1')?.historyNotesFa.length ?? 0) >= 2);
  assert.equal(expired.badges.find((b) => b.badgeId === 'b-id-1')?.status, 'valid');

  const revoked = revokeSpecificBadgeOnly(expired, 'b-lic-1', 'تغییر وضعیت مجوز');
  assert.equal(revoked.badges.find((b) => b.badgeId === 'b-lic-1')?.status, 'revoked');
  assert.equal(revoked.badges.find((b) => b.badgeId === 'b-id-1')?.status, 'valid');

  // 4. Unverified abuse complaint never labels profile as confirmed violator (Test 7)
  const complaintRes = recordUnverifiedAbuseComplaint(individual);
  assert.equal(complaintRes.updatedProfile.pendingComplaintsCount, 1);
  assert.equal(complaintRes.updatedProfile.publiclyShowViolationLabel, false);

  // 5. Public users blocked from viewing private ID documents (Test 10)
  assert.equal(evaluateSensitiveDocumentAccess('public_user').allowed, false);
  assert.equal(evaluateSensitiveDocumentAccess('assigned_reviewer').allowed, true);

  // 6. Appeal connects to parent case without deleting history (Test 6)
  const withAppeal = submitVerificationAppealPreservingCase(INITIAL_STAGE42_CASE, 'اسکن خوانا پیوست شد', 'doc-v2');
  assert.equal(withAppeal.appeals[0].parentCaseId, INITIAL_STAGE42_CASE.caseId);

  // 7. Reviewer conflict of interest & image-only approval guard + dual control (Test 12 & Section 16-17)
  const conflictBlock = evaluateReviewerDecision({
    reqCase: withAppeal,
    reviewerId: 'rev-1',
    hasConflictOfInterest: true,
    evidenceVerifiedBySource: true,
    decision: 'approve',
  });
  assert.equal(conflictBlock.accepted, false);

  const imageOnlyBlock = evaluateReviewerDecision({
    reqCase: withAppeal,
    reviewerId: 'rev-1',
    hasConflictOfInterest: false,
    evidenceVerifiedBySource: false,
    decision: 'approve',
  });
  assert.equal(imageOnlyBlock.accepted, false);

  const dualControlHold = evaluateReviewerDecision({
    reqCase: withAppeal,
    reviewerId: 'rev-1',
    hasConflictOfInterest: false,
    evidenceVerifiedBySource: true,
    decision: 'approve',
  });
  assert.equal(dualControlHold.nextStatus, 'in_review');

  // 8. VRF-01..28 Design System parity
  assert.equal(STAGE42_DESIGN_COMPONENT_IDS.length, 28);
});

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as fs from 'fs';
import {
  INITIAL_BUYER_LEADS,
  INITIAL_NEIGHBORHOODS,
  isAuthorizedAdminUser,
  mergeNeighborhoodWithSeed,
  validateAndBuildRestoredState,
} from './src/data/neighborhoods';
import { MULTI_CITY_CONFIGS } from './src/data/multiCityData';

export interface BehavioralTestReport {
  totalAssertions: number;
  passedAssertions: number;
  categories: Record<string, number>;
}

/**
 * Real Firestore Emulator Behavioral Authorization Test Suite.
 * Executes live gRPC operations against the local Firestore Emulator using @firebase/rules-unit-testing.
 */
export async function runDirtyDozenSecurityTests(): Promise<BehavioralTestReport> {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'demo-tehran-neighborhood-radar-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  let totalAssertions = 0;
  let passedAssertions = 0;
  const categories: Record<string, number> = {};

  async function expectAllowed<T>(category: string, label: string, op: Promise<T>): Promise<T> {
    totalAssertions += 1;
    try {
      const res = await assertSucceeds(op);
      passedAssertions += 1;
      categories[category] = (categories[category] || 0) + 1;
      return res;
    } catch (err) {
      throw new Error(`[EMULATOR TEST FAILED - EXPECTED ALLOW] (${category}) ${label}: ${String(err)}`);
    }
  }

  async function expectDenied(category: string, label: string, op: Promise<unknown>): Promise<void> {
    totalAssertions += 1;
    try {
      await assertFails(op);
      passedAssertions += 1;
      categories[category] = (categories[category] || 0) + 1;
    } catch (err) {
      throw new Error(`[EMULATOR TEST FAILED - EXPECTED DENY] (${category}) ${label}: ${String(err)}`);
    }
  }

  try {
    await testEnv.clearFirestore();

    await testEnv.withSecurityRulesDisabled(async (adminBypassCtx) => {
      await setDoc(doc(adminBypassCtx.firestore(), 'admins/delegated_admin'), {
        role: 'admin',
      });
      await setDoc(doc(adminBypassCtx.firestore(), 'admins/ordinary_role'), {
        role: 'viewer',
      });
      await setDoc(
        doc(
          adminBypassCtx.firestore(),
          'admins/user_with_viewer_doc'
        ),
        {
          role: 'viewer',
          email: 'viewer@example.com',
        }
      );
    });

    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const unverifiedDb = testEnv
      .authenticatedContext('user_1', {
        email: 'user1@example.com',
        email_verified: false,
      })
      .firestore();
    const user1Db = testEnv
      .authenticatedContext('user_1', {
        email: 'user1@example.com',
        email_verified: true,
      })
      .firestore();
    const user2Db = testEnv
      .authenticatedContext('user_2', {
        email: 'user2@example.com',
        email_verified: true,
      })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_uid', {
        email: 'radio837isf@gmail.com',
        email_verified: true,
      })
      .firestore();
    const delegatedAdminDb = testEnv
      .authenticatedContext('delegated_admin', {
        email: 'delegated@example.com',
        email_verified: true,
      })
      .firestore();
    const ordinaryRoleDb = testEnv
      .authenticatedContext('ordinary_role', {
        email: 'viewer@example.com',
        email_verified: true,
      })
      .firestore();
    const viewerWithAdminDocumentDb = testEnv
      .authenticatedContext('user_with_viewer_doc', {
        email: 'viewer@example.com',
        email_verified: true,
      })
      .firestore();

    // =========================================================================
    // 1. /admins/{adminId} — Admin Role Collection Tests
    // =========================================================================
    await expectAllowed(
      '/admins',
      'Bootstrap admin can get /admins/delegated_admin',
      getDoc(doc(adminDb, 'admins/delegated_admin'))
    );
    await expectAllowed(
      '/admins',
      'Delegated admin (via /admins/{uid}) can get /admins/delegated_admin',
      getDoc(doc(delegatedAdminDb, 'admins/delegated_admin'))
    );
    await expectAllowed(
      '/admins',
      'Bootstrap admin can list /admins with role == admin filter',
      getDocs(query(collection(adminDb, 'admins'), where('role', '==', 'admin')))
    );
    await expectAllowed(
      '/admins',
      'Delegated admin can list /admins with role == admin filter',
      getDocs(query(collection(delegatedAdminDb, 'admins'), where('role', '==', 'admin')))
    );
    await expectDenied(
      '/admins',
      'A viewer-role document must not grant admin privileges',
      getDoc(
        doc(
          viewerWithAdminDocumentDb,
          'admins/delegated_admin'
        )
      )
    );
    await expectDenied(
      '/admins',
      'A viewer-role user cannot list administrator documents',
      getDocs(
        query(
          collection(viewerWithAdminDocumentDb, 'admins'),
          where('role', '==', 'admin')
        )
      )
    );
    await expectDenied(
      '/admins',
      'User with role == viewer in /admins/{uid} does NOT gain admin list privileges',
      getDocs(query(collection(ordinaryRoleDb, 'admins'), where('role', '==', 'admin')))
    );
    await expectDenied(
      '/admins',
      'Unauthenticated user cannot get /admins/delegated_admin',
      getDoc(doc(unauthedDb, 'admins/delegated_admin'))
    );
    await expectDenied(
      '/admins',
      'Non-admin user cannot get /admins/delegated_admin',
      getDoc(doc(user1Db, 'admins/delegated_admin'))
    );
    await expectDenied(
      '/admins',
      'Non-admin user cannot list /admins',
      getDocs(query(collection(user1Db, 'admins'), where('role', '==', 'admin')))
    );
    await expectDenied(
      '/admins',
      'Admin unbounded list on /admins without role == admin filter is denied',
      getDocs(collection(adminDb, 'admins'))
    );
    await expectDenied(
      '/admins',
      'Non-admin user cannot create admin-role document /admins/user_1',
      setDoc(doc(user1Db, 'admins/user_1'), { role: 'admin' })
    );
    await expectDenied(
      '/admins',
      'Admin cannot create admin-role document from client SDK',
      setDoc(doc(adminDb, 'admins/new_admin'), { role: 'admin' })
    );
    await expectDenied(
      '/admins',
      'Non-admin user cannot update /admins/delegated_admin',
      updateDoc(doc(user1Db, 'admins/delegated_admin'), { role: 'superadmin' })
    );
    await expectDenied(
      '/admins',
      'Admin cannot update /admins/delegated_admin from client SDK',
      updateDoc(doc(adminDb, 'admins/delegated_admin'), { role: 'superadmin' })
    );
    await expectDenied(
      '/admins',
      'Non-admin user cannot delete /admins/delegated_admin',
      deleteDoc(doc(user1Db, 'admins/delegated_admin'))
    );
    await expectDenied(
      '/admins',
      'Admin cannot delete /admins/delegated_admin from client SDK',
      deleteDoc(doc(adminDb, 'admins/delegated_admin'))
    );

    // =========================================================================
    // 2. /votes/{voteId} — Resident Votes Collection Tests
    // =========================================================================
    const validVote = {
      hoodId: 5,
      hoodName: 'پونک',
      userId: 'user_1',
      userDisplayName: 'علی رضایی',
      air: 8,
      powerWater: 8,
      internet: 9,
      metro: 7,
      security: 8,
      flatTerrain: 8,
      comment: 'محله بسیار عالی و خوش مسیر',
      locationVerified: true,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    };

    await expectAllowed(
      '/votes',
      'Verified user can create their own deterministic vote user_1_hood_5',
      setDoc(doc(user1Db, 'votes/user_1_hood_5'), validVote)
    );
    await expectDenied(
      '/votes',
      'Verified user cannot create vote with arbitrary non-matching document ID',
      setDoc(doc(user1Db, 'votes/vote_arbitrary_id'), validVote)
    );
    await expectDenied(
      '/votes',
      'Public unauthenticated user cannot get raw vote containing userId',
      getDoc(doc(unauthedDb, 'votes/user_1_hood_5'))
    );
    await expectDenied(
      '/votes',
      'Public unauthenticated user cannot list raw votes',
      getDocs(query(collection(unauthedDb, 'votes'), where('hoodId', '==', 5)))
    );
    await expectAllowed(
      '/votes',
      'Owner (user_1) can get their own vote',
      getDoc(doc(user1Db, 'votes/user_1_hood_5'))
    );
    await expectAllowed(
      '/votes',
      'Owner (user_1) can list their own vote with hoodId and userId filter',
      getDocs(
        query(
          collection(user1Db, 'votes'),
          where('hoodId', '==', 5),
          where('userId', '==', 'user_1')
        )
      )
    );
    await expectAllowed(
      '/votes',
      'Admin can list votes with hoodId == 5 filter',
      getDocs(query(collection(adminDb, 'votes'), where('hoodId', '==', 5)))
    );
    await expectDenied(
      '/votes',
      'Owner cannot update own vote before 24-hour cooldown expires',
      updateDoc(doc(user1Db, 'votes/user_1_hood_5'), {
        air: 10,
        comment: 'ویرایش فوری پیش از ۲۴ ساعت',
        lastUpdatedAt: serverTimestamp(),
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminBypassCtx) => {
      const oldTime = Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000);
      await setDoc(doc(adminBypassCtx.firestore(), 'votes/user_1_hood_5'), {
        ...validVote,
        createdAt: oldTime,
        lastUpdatedAt: oldTime,
      });
    });

    await expectAllowed(
      '/votes',
      'Owner can update own vote after 24-hour cooldown has elapsed',
      updateDoc(doc(user1Db, 'votes/user_1_hood_5'), {
        air: 10,
        comment: 'ویرایش مجدد امتیاز پس از ۲۴ ساعت',
        lastUpdatedAt: serverTimestamp(),
      })
    );
    await expectDenied(
      '/votes',
      'Unauthenticated user cannot create vote',
      setDoc(doc(unauthedDb, 'votes/user_1_hood_5'), validVote)
    );
    await expectDenied(
      '/votes',
      'Unverified user cannot create vote',
      setDoc(doc(unverifiedDb, 'votes/user_1_hood_5'), validVote)
    );
    await expectDenied(
      '/votes',
      'User cannot spoof another userId on vote creation',
      setDoc(doc(user1Db, 'votes/user_2_hood_5'), { ...validVote, userId: 'user_2' })
    );
    await expectDenied(
      '/votes',
      'Unexpected shadow field on vote creation is denied',
      setDoc(doc(user1Db, 'votes/user_1_hood_6'), { ...validVote, hoodId: 6, isAdmin: true })
    );
    await expectDenied(
      '/votes',
      'Out-of-range score (999) on vote creation is denied',
      setDoc(doc(user1Db, 'votes/user_1_hood_6'), { ...validVote, hoodId: 6, air: 999 })
    );
    await expectDenied(
      '/votes',
      'Oversized comment (>500 chars) on vote creation is denied',
      setDoc(doc(user1Db, 'votes/user_1_hood_6'), {
        ...validVote,
        hoodId: 6,
        comment: 'الف'.repeat(600),
      })
    );
    await expectDenied(
      '/votes',
      'Forged client timestamp on vote creation is denied',
      setDoc(doc(user1Db, 'votes/user_1_hood_6'), {
        ...validVote,
        hoodId: 6,
        createdAt: Timestamp.fromMillis(100000),
      })
    );
    await expectDenied(
      '/votes',
      'Owner cannot mutate immutable hoodId when updating vote',
      updateDoc(doc(user1Db, 'votes/user_1_hood_5'), { hoodId: 9, lastUpdatedAt: serverTimestamp() })
    );
    await expectDenied(
      '/votes',
      'Owner cannot mutate immutable userId when updating vote',
      updateDoc(doc(user1Db, 'votes/user_1_hood_5'), { userId: 'user_2', lastUpdatedAt: serverTimestamp() })
    );
    await expectDenied(
      '/votes',
      'Another user (user_2) cannot update user_1 vote',
      updateDoc(doc(user2Db, 'votes/user_1_hood_5'), { comment: 'دستکاری رای دیگران', lastUpdatedAt: serverTimestamp() })
    );
    await expectDenied(
      '/votes',
      'Another user (user_2) cannot delete user_1 vote',
      deleteDoc(doc(user2Db, 'votes/user_1_hood_5'))
    );
    await expectDenied(
      '/votes',
      'Unauthenticated user cannot delete user_1 vote',
      deleteDoc(doc(unauthedDb, 'votes/user_1_hood_5'))
    );
    await expectDenied(
      '/votes',
      'Owner (user_1) cannot delete their own vote before 24-hour cooldown expires (prevents cooldown reset)',
      deleteDoc(doc(user1Db, 'votes/user_1_hood_5'))
    );
    await testEnv.withSecurityRulesDisabled(async (adminBypassCtx) => {
      const oldTime = Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000);
      await setDoc(doc(adminBypassCtx.firestore(), 'votes/user_1_hood_5'), {
        ...validVote,
        createdAt: oldTime,
        lastUpdatedAt: oldTime,
      });
    });
    await expectAllowed(
      '/votes',
      'Owner (user_1) can delete their own vote after 24-hour cooldown has elapsed',
      deleteDoc(doc(user1Db, 'votes/user_1_hood_5'))
    );
    await expectAllowed(
      '/votes',
      'Re-create vote for admin deletion test',
      setDoc(doc(user1Db, 'votes/user_1_hood_5'), validVote)
    );
    await expectAllowed(
      '/votes',
      'Bootstrap admin can delete any vote immediately',
      deleteDoc(doc(adminDb, 'votes/user_1_hood_5'))
    );
    await expectAllowed(
      '/votes',
      'Re-create vote for delegated admin deletion test',
      setDoc(doc(user1Db, 'votes/user_1_hood_5'), validVote)
    );
    await expectAllowed(
      '/votes',
      'Delegated admin can delete any vote immediately',
      deleteDoc(doc(delegatedAdminDb, 'votes/user_1_hood_5'))
    );

    // =========================================================================
    // 3. /bargains/{bargainId} & /bargainOwners/{bargainId} Tests
    // =========================================================================
    const validBargain = {
      hoodId: 101,
      title: 'آپارتمان ۸۵ متری عظیمیه کرج',
      type: 'خرید',
      sqm: 85,
      priceText: 'متری ۹۵ میلیون',
      discountPercent: 15,
      buyerProfitText: '۱.۲ میلیارد سود خریدار',
      street: 'بلوار شریعتی',
      createdAt: serverTimestamp(),
    };

    await expectAllowed(
      '/bargains',
      'Public unauthenticated get on non-existent bargain succeeds cleanly',
      getDoc(doc(unauthedDb, 'bargains/nonexistent_bargain'))
    );

    await expectDenied(
      '/bargains',
      'Cannot create public bargain without matching /bargainOwners document',
      setDoc(doc(user1Db, 'bargains/bargain_orphan'), validBargain)
    );

    await expectAllowed(
      '/bargains',
      'Verified user can atomically create bargain + bargainOwner via writeBatch',
      (async () => {
        const b = writeBatch(user1Db);
        b.set(doc(user1Db, 'bargains/bargain_valid_1'), validBargain);
        b.set(doc(user1Db, 'bargainOwners/bargain_valid_1'), {
          bargainId: 'bargain_valid_1',
          userId: 'user_1',
          createdAt: serverTimestamp(),
        });
        await b.commit();
      })()
    );

    await expectAllowed(
      '/bargains',
      'Public unauthenticated user can get an existing bargain (without userId)',
      getDoc(doc(unauthedDb, 'bargains/bargain_valid_1'))
    );
    await expectDenied(
      '/bargainOwners',
      'Public unauthenticated user cannot get private /bargainOwners document',
      getDoc(doc(unauthedDb, 'bargainOwners/bargain_valid_1'))
    );
    await expectDenied(
      '/bargainOwners',
      'Another user (user_2) cannot get user_1 /bargainOwners document',
      getDoc(doc(user2Db, 'bargainOwners/bargain_valid_1'))
    );
    await expectAllowed(
      '/bargainOwners',
      'Owner (user_1) can get their own /bargainOwners document',
      getDoc(doc(user1Db, 'bargainOwners/bargain_valid_1'))
    );
    await expectAllowed(
      '/bargains',
      'Public unauthenticated user can list bargains with bounded hoodId 1..999 filter',
      getDocs(
        query(collection(unauthedDb, 'bargains'), where('hoodId', '>=', 1), where('hoodId', '<=', 999))
      )
    );
    await expectDenied(
      '/bargains',
      'Unbounded list on /bargains without hoodId filter is denied',
      getDocs(collection(unauthedDb, 'bargains'))
    );
    await expectAllowed(
      '/bargains',
      'Owner can update allowed fields on their own bargain',
      updateDoc(doc(user1Db, 'bargains/bargain_valid_1'), {
        priceText: 'متری ۹۲ میلیون',
        discountPercent: 18,
      })
    );
    await expectDenied(
      '/bargains',
      'Owner cannot mutate immutable hoodId on bargain update',
      updateDoc(doc(user1Db, 'bargains/bargain_valid_1'), { hoodId: 5 })
    );
    await expectDenied(
      '/bargains',
      'Another user (user_2) cannot update user_1 bargain',
      updateDoc(doc(user2Db, 'bargains/bargain_valid_1'), { priceText: 'متری ۵۰ میلیون' })
    );
    await expectDenied(
      '/bargains',
      'Another user (user_2) cannot delete user_1 bargain',
      deleteDoc(doc(user2Db, 'bargains/bargain_valid_1'))
    );
    await expectDenied(
      '/bargains',
      'Bargain containing raw userId field in public document is denied',
      (async () => {
        const b = writeBatch(user1Db);
        b.set(doc(user1Db, 'bargains/bargain_with_uid'), { ...validBargain, userId: 'user_1' });
        b.set(doc(user1Db, 'bargainOwners/bargain_with_uid'), {
          bargainId: 'bargain_with_uid',
          userId: 'user_1',
          createdAt: serverTimestamp(),
        });
        await b.commit();
      })()
    );
    await expectAllowed(
      '/bargains',
      'Owner (user_1) can delete their own bargain and bargainOwner',
      (async () => {
        const b = writeBatch(user1Db);
        b.delete(doc(user1Db, 'bargains/bargain_valid_1'));
        b.delete(doc(user1Db, 'bargainOwners/bargain_valid_1'));
        await b.commit();
      })()
    );
    await expectAllowed(
      '/bargains',
      'Verified owner can create a bargain with Object Storage IDs',
      (async () => {
        const b = writeBatch(user1Db);
        b.set(doc(user1Db, 'bargains/bargain_media_ids'), {
          ...validBargain,
          objectStorageObjectIds: ['obj_test_1', 'obj_test_2'],
          createdAt: serverTimestamp(),
        });
        b.set(doc(user1Db, 'bargainOwners/bargain_media_ids'), {
          bargainId: 'bargain_media_ids',
          userId: 'user_1',
          createdAt: serverTimestamp(),
        });
        await b.commit();
      })()
    );
    await expectDenied(
      '/bargains',
      'Bargain with more than six Object Storage IDs is rejected',
      (async () => {
        const b = writeBatch(user1Db);
        b.set(doc(user1Db, 'bargains/bargain_too_many_media_ids'), {
          ...validBargain,
          objectStorageObjectIds: ['id1', 'id2', 'id3', 'id4', 'id5', 'id6', 'id7'],
          createdAt: serverTimestamp(),
        });
        b.set(doc(user1Db, 'bargainOwners/bargain_too_many_media_ids'), {
          bargainId: 'bargain_too_many_media_ids',
          userId: 'user_1',
          createdAt: serverTimestamp(),
        });
        await b.commit();
      })()
    );

    // =========================================================================
    // 4. /buyerAlerts/{alertId} — Private Buyer Contact Leads Tests
    // =========================================================================
    const validLead = {
      userId: 'user_1',
      hoodId: 5,
      hoodName: 'پونک',
      fullName: 'رضا محمدی',
      phone: '09121234567',
      dealType: 'خرید',
      maxBudgetText: '۱۱ میلیارد تومان',
      createdAt: serverTimestamp(),
    };

    await expectAllowed(
      '/buyerAlerts',
      'Verified user can create deterministic buyer alert lead user_1_hood_5',
      setDoc(doc(user1Db, 'buyerAlerts/user_1_hood_5'), validLead)
    );
    await expectDenied(
      '/buyerAlerts',
      'Verified user cannot create buyer alert with arbitrary document ID',
      setDoc(doc(user1Db, 'buyerAlerts/lead_arbitrary'), validLead)
    );
    await expectDenied(
      '/buyerAlerts',
      'Unauthenticated user cannot read buyer contact details (get)',
      getDoc(doc(unauthedDb, 'buyerAlerts/user_1_hood_5'))
    );
    await expectAllowed(
      '/buyerAlerts',
      'Owner (user_1) can get their own buyer alert document',
      getDoc(doc(user1Db, 'buyerAlerts/user_1_hood_5'))
    );
    await expectAllowed(
      '/buyerAlerts',
      'Owner (user_1) can update their own buyer alert document',
      updateDoc(doc(user1Db, 'buyerAlerts/user_1_hood_5'), { maxBudgetText: '۱۲ میلیارد تومان' })
    );
    await expectDenied(
      '/buyerAlerts',
      'Another authenticated user (user_2) cannot read user_1 buyer alert',
      getDoc(doc(user2Db, 'buyerAlerts/user_1_hood_5'))
    );
    await expectDenied(
      '/buyerAlerts',
      'Non-admin user cannot list /buyerAlerts even with bounded hoodId query',
      getDocs(
        query(collection(user1Db, 'buyerAlerts'), where('hoodId', '>=', 1), where('hoodId', '<=', 999))
      )
    );
    await expectAllowed(
      '/buyerAlerts',
      'Bootstrap admin can get buyer alert lead',
      getDoc(doc(adminDb, 'buyerAlerts/user_1_hood_5'))
    );
    await expectAllowed(
      '/buyerAlerts',
      'Bootstrap admin can list buyer alerts with bounded hoodId 1..999 query',
      getDocs(
        query(collection(adminDb, 'buyerAlerts'), where('hoodId', '>=', 1), where('hoodId', '<=', 999))
      )
    );
    await expectAllowed(
      '/buyerAlerts',
      'Owner (user_1) can delete their own buyer alert',
      deleteDoc(doc(user1Db, 'buyerAlerts/user_1_hood_5'))
    );

    // =========================================================================
    // 5. /sponsorRequests/{requestId} — Agency Sponsorship CRM Tests
    // =========================================================================
    const validSponsorBase = {
      hoodId: 5,
      hoodName: 'پونک',
      agencyName: 'املاک پونک',
      phone: '09121234567',
      specialty: 'فروش آپارتمان',
      experienceYears: 12,
      monthlyTariffMillion: 10,
      planMonths: 3,
      totalPayableMillion: 24,
      trackingCode: 'TR-123456',
      createdAt: serverTimestamp(),
    };

    await expectDenied(
      '/sponsorRequests',
      'Non-admin user attempting to create already-approved sponsor request is denied',
      setDoc(doc(user1Db, 'sponsorRequests/req_self_approve'), {
        ...validSponsorBase,
        status: 'approved',
      })
    );
    await expectDenied(
      '/sponsorRequests',
      'Non-admin user attempting to supply custom expiresAtIso on create is denied',
      setDoc(doc(user1Db, 'sponsorRequests/req_forged_expiry'), {
        ...validSponsorBase,
        status: 'pending',
        expiresAtIso: '2099-01-01T00:00:00.000Z',
      })
    );
    await expectDenied(
      '/sponsorRequests',
      'Non-admin user attempting to manipulate totalPayableMillion formula is denied',
      setDoc(doc(user1Db, 'sponsorRequests/req_forged_total'), {
        ...validSponsorBase,
        status: 'pending',
        totalPayableMillion: 1,
      })
    );
    await expectAllowed(
      '/sponsorRequests',
      'Verified non-admin user can create a pending sponsor request',
      setDoc(doc(user1Db, 'sponsorRequests/req_pending_1'), {
        ...validSponsorBase,
        status: 'pending',
      })
    );
    await expectAllowed(
      '/sponsorRequests',
      'Bootstrap admin can approve pending sponsor request and set expiresAtIso',
      updateDoc(doc(adminDb, 'sponsorRequests/req_pending_1'), {
        status: 'approved',
        expiresAtIso: '2027-01-01T00:00:00.000Z',
      })
    );

    // =========================================================================
    // 6. /appConfig/featureFlags & /appConfig/monetization — Global Config Tests
    // =========================================================================
    const validFlags = {
      enableCommissionCalc: true,
      enableMultiCity: true,
      enableSponsorBilling: true,
      enableAiContractCheck: true,
      enableTelegramFeed: true,
      updatedAt: serverTimestamp(),
    };

    await expectAllowed(
      '/appConfig/featureFlags',
      'Bootstrap admin can create /appConfig/featureFlags',
      setDoc(doc(adminDb, 'appConfig/featureFlags'), validFlags)
    );
    await expectAllowed(
      '/appConfig/featureFlags',
      'Public unauthenticated user can get existing /appConfig/featureFlags',
      getDoc(doc(unauthedDb, 'appConfig/featureFlags'))
    );
    await expectAllowed(
      '/appConfig/monetization',
      'Bootstrap admin can create validated /appConfig/monetization',
      setDoc(doc(adminDb, 'appConfig/monetization'), {
        enableSponsorBilling: true,
        baseMonthlyTariffMillion: 15,
        quarterlyDiscountMultiplier: 2.4,
        updatedAt: serverTimestamp(),
      })
    );
    await expectDenied(
      '/appConfig/monetization',
      'Admin cannot write arbitrary unvalidated fields to /appConfig/monetization',
      setDoc(doc(adminDb, 'appConfig/monetization'), {
        arbitraryMaliciousField: 'evil',
        updatedAt: serverTimestamp(),
      })
    );

    // =========================================================================
    // 7. /userPreferences/{userId} — User Preferences Isolation Tests
    // =========================================================================
    const validPrefs = {
      userId: 'user_1',
      mode: 'rent',
      deposit: 500,
      monthlyRent: 25,
      buyTotalBudget: 9500,
      targetSqm: 80,
      workHubId: 'vanak',
      favoriteHoodIds: [5, 13, 101],
      updatedAt: serverTimestamp(),
    };

    await expectAllowed(
      '/userPreferences',
      'Owner (user_1) can create their own userPreferences document',
      setDoc(doc(user1Db, 'userPreferences/user_1'), validPrefs)
    );
    await expectDenied(
      '/userPreferences',
      'Another user (user_2) cannot get user_1 preferences',
      getDoc(doc(user2Db, 'userPreferences/user_1'))
    );

    // =========================================================================
    // 8. /neighborhoodOverrides/{overrideId} — Validated Price Overrides Tests
    // =========================================================================
    await expectAllowed(
      '/neighborhoodOverrides',
      'Admin can create valid neighborhoodOverride with hood_5 ID',
      setDoc(doc(adminDb, 'neighborhoodOverrides/hood_5'), {
        hoodId: 5,
        buyPerSqm: 155,
        rahn80m: 1850,
        updatedAt: serverTimestamp(),
      })
    );
    await expectAllowed(
      '/neighborhoodOverrides',
      'Admin can create valid neighborhoodOverride for extended Tehran hood 65',
      setDoc(doc(adminDb, 'neighborhoodOverrides/65'), {
        hoodId: 65,
        buyPerSqm: 72,
        rahn80m: 810,
        updatedAt: serverTimestamp(),
      })
    );
    await expectAllowed(
      '/neighborhoodOverrides',
      'Admin can create valid neighborhoodOverride for multi-city hood 101 (Task 425)',
      setDoc(doc(adminDb, 'neighborhoodOverrides/hood_101'), {
        hoodId: 101,
        buyPerSqm: 118,
        rahn80m: 980,
        updatedAt: serverTimestamp(),
      })
    );
    await expectDenied(
      '/neighborhoodOverrides',
      'Admin cannot create neighborhoodOverride with rahn80m below 50 million minimum (Task 451)',
      setDoc(doc(adminDb, 'neighborhoodOverrides/hood_5'), {
        hoodId: 5,
        buyPerSqm: 155,
        rahn80m: 10,
        updatedAt: serverTimestamp(),
      })
    );
    await expectDenied(
      '/neighborhoodOverrides',
      'Admin cannot create neighborhoodOverride with mismatched ID hood_99 for hoodId 5',
      setDoc(doc(adminDb, 'neighborhoodOverrides/hood_99'), {
        hoodId: 5,
        buyPerSqm: 155,
        rahn80m: 1850,
        updatedAt: serverTimestamp(),
      })
    );
    await expectDenied(
      '/neighborhoodOverrides',
      'Non-admin user cannot write to /neighborhoodOverrides',
      setDoc(doc(user1Db, 'neighborhoodOverrides/hood_5'), {
        hoodId: 5,
        buyPerSqm: 90,
        rahn80m: 900,
        updatedAt: serverTimestamp(),
      })
    );
    await expectAllowed(
      '/neighborhoodOverrides',
      'Public unauthenticated user can list /neighborhoodOverrides with bounded hoodId 1..999',
      getDocs(
        query(
          collection(unauthedDb, 'neighborhoodOverrides'),
          where('hoodId', '>=', 1),
          where('hoodId', '<=', 999)
        )
      )
    );

    // =========================================================================
    // 9. /{document=**} — Unmatched Paths Default-Deny Catch-All Tests
    // =========================================================================
    await expectDenied(
      'default-deny',
      'Bootstrap admin cannot get unmatched path /secretCollection/doc_1',
      getDoc(doc(adminDb, 'secretCollection/doc_1'))
    );

    return {
      totalAssertions,
      passedAssertions,
      categories,
    };
  } finally {
    await testEnv.cleanup();
  }
}

/**
 * Separate Static Structural Check (kept distinct from live Emulator behavioral tests).
 */
export function runStaticRulesStructuralAudit(): { passed: number; total: number } {
  const rulesText = fs.readFileSync('firestore.rules', 'utf8');
  const checks: { name: string; pass: boolean }[] = [
    {
      name: 'Global default deny catch-all exists',
      pass: /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;/m.test(rulesText),
    },
    {
      name: 'isAdmin() checks verified user + bootstrap email or /admins/{uid} with role == admin',
      pass:
        rulesText.includes("request.auth.token.email == 'radio837isf@gmail.com'") &&
        rulesText.includes('/databases/$(database)/documents/admins/$(request.auth.uid)') &&
        rulesText.includes(".data.role == 'admin'"),
    },
    {
      name: '/buyerAlerts enforces owner/admin access and userId binding',
      pass:
        rulesText.includes('match /buyerAlerts/{alertId}') &&
        rulesText.includes('data.userId == request.auth.uid'),
    },
    {
      name: '/votes enforces 24h update cooldown and restricts public reads',
      pass:
        rulesText.includes('match /votes/{voteId}') &&
        rulesText.includes("duration.value(24, 'h')") &&
        /match\s+\/votes\/\{voteId\}[\s\S]*?allow\s+list:\s*if\s+isAdmin\(\)/m.test(rulesText),
    },
    {
      name: '/bargains separates ownership into /bargainOwners/{bargainId}',
      pass:
        rulesText.includes('match /bargainOwners/{bargainId}') &&
        rulesText.includes('hasBargainOwnerInCurrentBatch(bargainId)') &&
        rulesText.includes('ownsBargain(bargainId)'),
    },
    {
      name: '/neighborhoodOverrides validates schema and admin writes',
      pass:
        rulesText.includes('match /neighborhoodOverrides/{hoodId}') &&
        rulesText.includes('isValidNeighborhoodOverride(hoodId)'),
    },
    {
      name: '/sponsorRequests blocks non-admin self-approval (status == pending || isAdmin()) on create',
      pass: /match\s+\/sponsorRequests\/\{requestId\}[\s\S]*?\(incoming\(\)\.status\s*==\s*'pending'\s*\|\|\s*isAdmin\(\)\)/m.test(
        rulesText
      ),
    },
    {
      name: '/appConfig/featureFlags restricts create/update to isAdmin() and denies list/delete',
      pass:
        /match\s+\/appConfig\/\{configId\}[\s\S]*?allow\s+get:\s*if\s+configId\s*==\s*'featureFlags'/m.test(rulesText) &&
        /match\s+\/appConfig\/\{configId\}[\s\S]*?allow\s+create:\s*if\s+isAdmin\(\)/m.test(rulesText),
    },
    {
      name: '/userPreferences enforces favoriteHoodIds.size() <= 25 and owner isolation',
      pass:
        rulesText.includes('data.favoriteHoodIds.size() <= 25') &&
        rulesText.includes('request.auth.uid == userId'),
    },
    {
      name: '/bargains and /neighborhoodOverrides enforce bounded hoodId list queries and /buyerAlerts enforces affectedKeys on update',
      pass:
        /match\s+\/bargains\/\{bargainId\}[\s\S]*?allow\s+list:\s*if\s+existing\(\)\.hoodId\s*>=\s*1\s*&&\s*existing\(\)\.hoodId\s*<=\s*999/m.test(
          rulesText
        ) &&
        /match\s+\/neighborhoodOverrides\/\{hoodId\}[\s\S]*?allow\s+list:\s*if\s+existing\(\)\.hoodId\s*>=\s*1\s*&&\s*existing\(\)\.hoodId\s*<=\s*999/m.test(
          rulesText
        ) &&
        /match\s+\/buyerAlerts\/\{alertId\}[\s\S]*?incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly/m.test(
          rulesText
        ),
    },
    {
      name: 'Client and server Firebase projectId and firestoreDatabaseId are strictly synchronized across config files',
      pass: (() => {
        const appletCfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
        const firebaserc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
        const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
        const validatorSrc = fs.readFileSync('src/utils/serverConfigValidator.ts', 'utf8');
        const envStoreSrc = fs.readFileSync('src/utils/serverRuntimeEnvStore.ts', 'utf8');
        return (
          Boolean(appletCfg.projectId) &&
          Boolean(appletCfg.firestoreDatabaseId) &&
          firebaserc.projects?.default === appletCfg.projectId &&
          Array.isArray(firebaseJson.firestore) &&
          firebaseJson.firestore.some((db: { database?: string }) => db.database === appletCfg.firestoreDatabaseId) &&
          validatorSrc.includes(`EXPECTED_FIREBASE_PROJECT_ID = '${appletCfg.projectId}'`) &&
          validatorSrc.includes(`EXPECTED_FIRESTORE_DATABASE_ID = '${appletCfg.firestoreDatabaseId}'`) &&
          envStoreSrc.includes(appletCfg.projectId)
        );
      })(),
    },
    {
      name: 'Multi-city overrides (1..999), buyerAlerts rolling 91d expiry, and cloud sync expiry/admin checks are enforced',
      pass: (() => {
        const repoSrc =
          fs.readFileSync('src/data/firestoreNeighborhoodRepository.ts', 'utf8') +
          fs.readFileSync('src/data/firestoreNeighborhoodMappers.ts', 'utf8');
        const cloudSyncSrc = fs.readFileSync('src/components/useRadarCloudSync.ts', 'utf8') + repoSrc;
        const crudSrc = fs.readFileSync('src/components/useRadarCrudActions.ts', 'utf8') + repoSrc;
        const adminSrc = fs.readFileSync('src/components/useRadarAdminActions.ts', 'utf8') + repoSrc;
        return (
          rulesText.includes("data.expiresAt <= request.time + duration.value(91, 'd')") &&
          rulesText.includes('^(hood_)?([1-9][0-9]{0,2})$') &&
          cloudSyncSrc.includes('isAuthorizedAdminUser(currentUser, isDelegatedAdmin)') &&
          cloudSyncSrc.includes('expMs > nowMs') &&
          (crudSrc.includes('clampNumber(p.voteAir, 1, 10, 7)') || crudSrc.includes('clampNumber(input.air, 1, 10, 7)')) &&
          adminSrc.includes('hoodId > 999')
        );
      })(),
    },
    {
      name: '/neighborhoodOverrides validates sponsor map, /appConfig/monetization validates campaignDiscountPercent, and admin actions sync sponsor overrides to cloud',
      pass: (() => {
        const repoSrc =
          fs.readFileSync('src/data/firestoreNeighborhoodRepository.ts', 'utf8') +
          fs.readFileSync('src/data/firestoreNeighborhoodMappers.ts', 'utf8');
        const cloudSyncSrc = fs.readFileSync('src/components/useRadarCloudSync.ts', 'utf8') + repoSrc;
        const adminSrc = fs.readFileSync('src/components/useRadarAdminActions.ts', 'utf8') + repoSrc;
        const monetizationSrc = fs.readFileSync('src/components/AdminMonetizationCard.tsx', 'utf8');
        return (
          rulesText.includes('function isValidOverrideSponsor(sponsor)') &&
          rulesText.includes('data.campaignDiscountPercent >= 0') &&
          cloudSyncSrc.includes("doc(db, 'appConfig', 'monetization')") &&
          adminSrc.includes('persistHoodOverrideToCloud') &&
          monetizationSrc.includes("doc(db, 'appConfig', 'monetization')")
        );
      })(),
    },
  ];

  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) {
    throw new Error(
      `Static Firestore Rules Audit failed: ${failed.map((f) => f.name).join(', ')}`
    );
  }
  return { passed: checks.length, total: checks.length };
}

/**
 * Application Data Integrity, Multi-City Seed Merge, Final Bargain Deletion & Atomic Backup Restoration Tests.
 */
export function runDataIntegrityRegressionTests(): { passed: number; total: number } {
  const allExpansionSeeds = [
    ...MULTI_CITY_CONFIGS.karaj.neighborhoods,
    ...MULTI_CITY_CONFIGS.mashhad.neighborhoods,
    ...MULTI_CITY_CONFIGS.isfahan.neighborhoods,
    ...MULTI_CITY_CONFIGS.shiraz.neighborhoods,
  ];

  const assertions: { name: string; pass: boolean }[] = [];

  assertions.push({
    name: 'All 5 cities exist in MULTI_CITY_CONFIGS with non-empty neighborhoods',
    pass:
      MULTI_CITY_CONFIGS.tehran.neighborhoods.length === INITIAL_NEIGHBORHOODS.length &&
      MULTI_CITY_CONFIGS.tehran.neighborhoods.length >= 35 &&
      MULTI_CITY_CONFIGS.karaj.neighborhoods.length >= 6 &&
      MULTI_CITY_CONFIGS.mashhad.neighborhoods.length >= 6 &&
      MULTI_CITY_CONFIGS.isfahan.neighborhoods.length >= 6 &&
      MULTI_CITY_CONFIGS.shiraz.neighborhoods.length >= 6,
  });

  const seedHood = INITIAL_NEIGHBORHOODS[0];
  const mergedEmptyBargains = mergeNeighborhoodWithSeed(seedHood, {
    ...seedHood,
    bargains: [],
  });
  assertions.push({
    name: 'mergeNeighborhoodWithSeed preserves empty bargains: [] after final bargain deletion',
    pass: Array.isArray(mergedEmptyBargains.bargains) && mergedEmptyBargains.bargains.length === 0,
  });

  const emptyBackupRes = validateAndBuildRestoredState('', allExpansionSeeds);
  const corruptBackupRes = validateAndBuildRestoredState('{corrupt_json', allExpansionSeeds);
  const emptyHoodsRes = validateAndBuildRestoredState(
    JSON.stringify({ neighborhoods: [null, { bad: true }] }),
    allExpansionSeeds
  );
  assertions.push({
    name: 'validateAndBuildRestoredState rejects empty, malformed, or neighborhood-less JSON backups',
    pass: !emptyBackupRes.ok && !corruptBackupRes.ok && !emptyHoodsRes.ok,
  });

  const malformedCrmRes = validateAndBuildRestoredState(
    JSON.stringify({
      neighborhoods: [{ id: 1, name: 'زعفرانیه', buyPerSqm: 260, rahn80m: 3500 }],
      sponsorRequests: 'corrupted-string-instead-of-array',
    }),
    allExpansionSeeds
  );
  const malformedLeadsRes = validateAndBuildRestoredState(
    JSON.stringify({
      neighborhoods: [{ id: 1, name: 'زعفرانیه', buyPerSqm: 260, rahn80m: 3500 }],
      buyerLeads: 12345,
    }),
    allExpansionSeeds
  );
  assertions.push({
    name: 'validateAndBuildRestoredState atomically rejects backups with invalid secondary collection types',
    pass: !malformedCrmRes.ok && !malformedLeadsRes.ok,
  });

  const validBackupPayload = JSON.stringify({
    schemaVersion: '1.0.0',
    neighborhoods: [
      { id: 1, name: 'زعفرانیه', buyPerSqm: 275, rahn80m: 3800, bargains: [] },
      { id: 101, name: 'عظیمیه', buyPerSqm: 145 },
    ],
    sponsorRequests: [
      {
        id: 'crm-1',
        hoodId: 101,
        hoodName: 'عظیمیه',
        agencyName: 'املاک البرز',
        phone: '09121112233',
        specialty: 'فروش ویلایی',
        experienceYears: 15,
        monthlyTariffMillion: 8,
        planMonths: 3,
        totalPayableMillion: 19.2,
        trackingCode: 'TR-999',
        status: 'approved',
      },
      { malformedItem: true },
    ],
    buyerLeads: [
      {
        id: 'lead-1',
        hoodId: 1,
        hoodName: 'زعفرانیه',
        fullName: 'سارا احمدی',
        phone: '09123334455',
        dealType: 'خرید',
        maxBudgetText: '۱۸ میلیارد',
      },
      null,
    ],
    favoriteHoodIds: [1, 101, 1, 99999, -5],
    featureFlags: {
      enableCommissionCalc: true,
      enableMultiCity: true,
      enableSponsorBilling: false,
      enableAiContractCheck: true,
      enableTelegramFeed: false,
    },
  });

  const validRes = validateAndBuildRestoredState(validBackupPayload, allExpansionSeeds);
  const restoredHood1 = validRes.restoredNeighborhoods?.find((n) => n.id === 1);
  const restoredAzimieh = validRes.restoredNeighborhoods?.find((n) => n.id === 101);

  assertions.push({
    name: 'validateAndBuildRestoredState restores all Tehran seeds + validated multi-city overrides',
    pass:
      validRes.ok === true &&
      validRes.restoredNeighborhoods?.length === INITIAL_NEIGHBORHOODS.length + 1 &&
      restoredHood1?.buyPerSqm === 275 &&
      restoredHood1?.bargains.length === 0 &&
      restoredAzimieh?.buyPerSqm === 145 &&
      typeof restoredAzimieh?.lat === 'number' &&
      typeof restoredAzimieh?.sponsor?.name === 'string',
  });

  assertions.push({
    name: 'validateAndBuildRestoredState filters malformed CRM/lead items and deduplicates favoriteHoodIds',
    pass:
      validRes.sponsorRequests?.length === 1 &&
      validRes.sponsorRequests[0].agencyName === 'املاک البرز' &&
      validRes.buyerLeads?.length === 1 &&
      validRes.buyerLeads[0].fullName === 'سارا احمدی' &&
      JSON.stringify(validRes.favoriteHoodIds) === JSON.stringify([1, 101]) &&
      validRes.featureFlags?.enableSponsorBilling === false,
  });

  assertions.push({
    name: 'isAuthorizedAdminUser enforces verified radio837isf@gmail.com identity matching Firestore isAdmin()',
    pass:
      isAuthorizedAdminUser(null) === false &&
      isAuthorizedAdminUser(undefined) === false &&
      isAuthorizedAdminUser({ email: 'user@example.com', emailVerified: true }) === false &&
      isAuthorizedAdminUser({ email: 'radio837isf@gmail.com', emailVerified: false }) === false &&
      isAuthorizedAdminUser({ email: 'radio837isf@gmail.com', emailVerified: true }) === true &&
      isAuthorizedAdminUser({ email: '  RADIO837ISF@GMAIL.COM ', emailVerified: true }) === true,
  });

  assertions.push({
    name: 'INITIAL_BUYER_LEADS masks all sample phone numbers and exposes zero raw 11-digit mobile numbers',
    pass:
      INITIAL_BUYER_LEADS.length > 0 &&
      INITIAL_BUYER_LEADS.every(
        (lead) => lead.phone.includes('***') && !/^09\d{9}$/.test(lead.phone)
      ),
  });

  const appSource =
    fs.readFileSync('src/App.tsx', 'utf8') +
    fs.readFileSync('src/components/RadarWorkspaceShell.tsx', 'utf8');
  const adminModalSource = fs.readFileSync('src/components/AdminModal.tsx', 'utf8');
  assertions.push({
    name: 'src/App.tsx and src/components/AdminModal.tsx contain zero hardcoded admin1404 passwords and enforce isVerifiedAdmin',
    pass:
      !appSource.includes('admin1404') &&
      !adminModalSource.includes('admin1404') &&
      (appSource.includes('isAuthorizedAdminUser(currentUser') || appSource.includes('isAuthorizedAdminUser(auth.currentUser')) &&
      adminModalSource.includes('!isVerifiedAdmin || !adminUnlocked'),
  });

  const failed = assertions.filter((a) => !a.pass);
  if (failed.length > 0) {
    throw new Error(
      `Application Data Integrity Regression Tests failed: ${failed.map((f) => f.name).join(', ')}`
    );
  }

  return { passed: assertions.length, total: assertions.length };
}

const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('firestore.rules.test.ts');

if (isMainModule) {
  (async () => {
    const staticResult = runStaticRulesStructuralAudit();
    console.log(
      `[STATIC CHECK] Firestore Rules Structural Audit: ${staticResult.passed}/${staticResult.total} checks passed`
    );

    const integrityResult = runDataIntegrityRegressionTests();
    console.log(
      `[APPLICATION TEST] Data Integrity & Backup Recovery Suite: ${integrityResult.passed}/${integrityResult.total} checks passed`
    );

    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      console.error(
        '[ERROR] FIRESTORE_EMULATOR_HOST is not set. Behavioral tests require a running Firestore Emulator (e.g. 127.0.0.1:8080).'
      );
      process.exit(1);
    }

    const report = await runDirtyDozenSecurityTests();
    console.log(
      `[BEHAVIORAL EMULATOR PASS] Executed ${report.passedAssertions}/${report.totalAssertions} live Firestore Emulator assertions across ${Object.keys(report.categories).length} categories:`
    );
    for (const [cat, count] of Object.entries(report.categories)) {
      console.log(`  - ${cat}: ${count} behavioral tests passed`);
    }
  })().catch((err) => {
    console.error('[FAIL]', err);
    process.exit(1);
  });
}

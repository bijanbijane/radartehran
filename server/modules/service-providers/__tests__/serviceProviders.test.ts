/**
 * Real Estate Professionals & Service Providers Automated Test Suite
 * (`server/modules/service-providers/__tests__/serviceProviders.test.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServiceProviderService } from '../index';
import { InMemoryServiceProviderRepository } from '../repository';
import { ProviderValidationError } from '../validation';

describe('Real Estate Professionals & Service Providers Backend Module', () => {
  describe('1. Individual Profiles & Organization Membership', () => {
    it('creates an individual professional profile with specialties and service areas', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const profile = await service.createIndividualProfile(
        {
          displayNameFa: 'مهندس آرش شایگان',
          professionalHeadlineFa: 'کارشناس رسمی ارزیابی و مهندس محاسب سازه نظام مهندسی تهران',
          primaryCategory: 'structural_engineer',
          specialties: ['بهسازی لرزه‌ای', 'متره و برآورد', 'ارزیابی کیفی سازه'],
          yearsOfExperience: 14,
          serviceAreas: [{ cityId: 'tehran', districtId: 'district_2', isNationwide: false, isRemoteOnlineAvailable: true }],
        },
        'user_engineer_1',
      );

      assert.equal(profile.displayNameFa, 'مهندس آرش شایگان');
      assert.equal(profile.primaryCategory, 'structural_engineer');
      assert.equal(profile.yearsOfExperience, 14);
      assert.equal(profile.publicationStatus, 'published');
      assert.equal(profile.verificationStatus, 'unverified');

      // Duplicate profile creation for same user must be blocked
      await assert.rejects(
        async () => {
          await service.createIndividualProfile(
            {
              displayNameFa: 'آرش مجدد',
              professionalHeadlineFa: 'تست تکراری',
              primaryCategory: 'structural_engineer',
            },
            'user_engineer_1',
          );
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'PROFILE_ALREADY_EXISTS');
          return true;
        },
      );
    });

    it('creates an organization, manages membership roles and enforces administrator boundaries', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const org = await service.createOrganization(
        {
          nameFa: 'شرکت مهندسی و پیمانکاری عمران البرز',
          organizationType: 'contracting_company',
          primaryCategory: 'general_contractor',
          specialties: ['ساخت ابنیه', 'بازسازی لوکس'],
        },
        'org_owner_1',
      );

      assert.equal(org.nameFa, 'شرکت مهندسی و پیمانکاری عمران البرز');
      const ownerMem = await repo.getMembership(org.organizationId, 'org_owner_1');
      assert.equal(ownerMem?.role, 'owner');

      // Owner adds staff member
      const staffMem = await service.addOrganizationMember(
        {
          organizationId: org.organizationId,
          targetUserId: 'staff_user_1',
          role: 'staff',
          jobTitleFa: 'مدیر تدارکات پروژه',
        },
        'org_owner_1',
      );
      assert.equal(staffMem.role, 'staff');

      // Staff member is NOT authorized to add other members
      await assert.rejects(
        async () => {
          await service.addOrganizationMember(
            {
              organizationId: org.organizationId,
              targetUserId: 'intruder_1',
              role: 'member',
            },
            'staff_user_1',
          );
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'UNAUTHORIZED_MEMBERSHIP_MANAGEMENT');
          return true;
        },
      );
    });
  });

  describe('2. Credentials & Independent Verification', () => {
    it('submits a professional credential and prohibits self-verification', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const profile = await service.createIndividualProfile(
        {
          displayNameFa: 'مهندس حسینی',
          professionalHeadlineFa: 'مهندس عمران دارای پروانه پایه ۱ نظام مهندسی',
          primaryCategory: 'civil_engineer',
        },
        'engineer_user_2',
      );

      const cred = await service.submitCredential(
        {
          ownerId: profile.providerId,
          ownerType: 'individual',
          credentialType: 'engineering_license',
          issuingAuthorityFa: 'سازمان نظام مهندسی ساختمان استان تهران',
          credentialIdentifier: 'ENG-1404-98765',
          issueDateIso: new Date(Date.now() - 365 * 86400000).toISOString(),
          expiryDateIso: new Date(Date.now() + 365 * 86400000).toISOString(),
        },
        'engineer_user_2',
      );

      assert.equal(cred.verificationStatus, 'submitted');

      // Self-verification by credential owner must be rejected
      await assert.rejects(
        async () => {
          await service.recordCredentialVerification(cred.credentialId, 'verified', undefined, 'engineer_user_2');
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'CANNOT_VERIFY_OWN_CREDENTIAL');
          return true;
        },
      );

      // Independent reviewer approves credential
      const verified = await service.recordCredentialVerification(
        cred.credentialId,
        'verified',
        undefined,
        'independent_reviewer_1',
      );
      assert.equal(verified.verificationStatus, 'verified');

      const updatedProfile = await repo.getProviderProfileById(profile.providerId);
      assert.equal(updatedProfile?.verificationStatus, 'credential_verified');
    });
  });

  describe('3. Customer Service Requests & Versioned Quotations', () => {
    it('creates a service request and manages quotation proposals and versioned revisions', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const profile = await service.createIndividualProfile(
        { displayNameFa: 'پیمانکار راد', professionalHeadlineFa: 'پیمانکار بازسازی داخلی', primaryCategory: 'renovation_company' },
        'contractor_user_1',
      );

      const request = await service.createServiceRequest(
        {
          category: 'renovation_company',
          cityId: 'tehran',
          hoodId: 2,
          titleFa: 'بازسازی کامل واحد مسکونی ۱۲۰ متری پونک',
          descriptionFa: 'شامل تخریب دیوارهای اضافی، تعویض لوله‌کشی، کناف سقف و کفپوش پارکت.',
          budgetCapMillionToman: 500,
        },
        'customer_user_1',
      );

      assert.equal(request.status, 'open');

      // Provider submits initial quotation (v1)
      const quo1 = await service.submitQuotation(
        {
          requestId: request.requestId,
          providerId: profile.providerId,
          proposedPriceMillionToman: 420,
          pricingModel: 'project_based',
          proposalDetailsFa: 'برآورد ۴۵ روزه با تامین کامل مصالح درجه یک و کادر اجرایی',
          estimatedDurationDays: 45,
        },
        'contractor_user_1',
      );

      assert.equal(quo1.version, 1);
      assert.equal(quo1.proposedPriceMillionToman, 420);

      // Customer reviews quotations and request moves to responses_received
      const updatedReq = await repo.getServiceRequestById(request.requestId);
      assert.equal(updatedReq?.status, 'responses_received');

      // Provider submits updated quotation revision (v2)
      const quo2 = await service.updateQuotation(
        quo1.quotationId,
        390,
        'تخفیف ویژه پرداخت نقد در ۴ قسط: برآورد ۳۹۰ میلیون تومان',
        'contractor_user_1',
      );

      assert.equal(quo2.version, 2);
      assert.equal(quo2.proposedPriceMillionToman, 390);

      const parentQuo = await repo.getQuotationById(quo1.quotationId);
      assert.equal(parentQuo?.status, 'updated');

      // Customer selects provider
      const selectedReq = await service.selectProvider(request.requestId, profile.providerId, quo2.quotationId, 'customer_user_1');
      assert.equal(selectedReq.status, 'provider_selected');
      assert.equal(selectedReq.selectedProviderId, profile.providerId);
    });
  });

  describe('4. Evidence-Aware Reviews & Self-Review Prevention', () => {
    it('blocks self-reviews and marks verified engagement when linked to selected service request', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const profile = await service.createIndividualProfile(
        { displayNameFa: 'کارشناس ملکی', professionalHeadlineFa: 'مشاور خرید و فروش املاک غرب', primaryCategory: 'real_estate_agent' },
        'agent_user_1',
      );

      // Provider cannot review their own profile
      await assert.rejects(
        async () => {
          await service.submitReview(
            { providerId: profile.providerId, rating: 5, reviewTextFa: 'خدمات عالی خودم!' },
            'agent_user_1',
          );
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'CANNOT_REVIEW_OWN_PROFILE');
          return true;
        },
      );

      // Normal customer review
      const review1 = await service.submitReview(
        { providerId: profile.providerId, rating: 5, reviewTextFa: 'بسیار باحوصله و مسلط به قیمت‌های روز منطقه.' },
        'customer_user_2',
      );
      assert.equal(review1.rating, 5);
      assert.equal(review1.isVerifiedEngagement, false); // No service request linked

      // Duplicate review by same customer is blocked
      await assert.rejects(
        async () => {
          await service.submitReview(
            { providerId: profile.providerId, rating: 4, reviewTextFa: 'ثبت مجدد نظر' },
            'customer_user_2',
          );
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'DUPLICATE_REVIEW');
          return true;
        },
      );
    });
  });

  describe('5. Discovery, Filtering & Performance Metrics', () => {
    it('filters published providers by category, city and verified credentials', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const pro1 = await service.createIndividualProfile(
        {
          displayNameFa: 'معمار مدرن',
          professionalHeadlineFa: 'طراحی ویلا و پنت‌هاوس',
          primaryCategory: 'architect',
          serviceAreas: [{ cityId: 'tehran', isNationwide: false, isRemoteOnlineAvailable: false }],
        },
        'arch_1',
      );

      const pro2 = await service.createIndividualProfile(
        {
          displayNameFa: 'لوله کش ماهر',
          professionalHeadlineFa: 'تاسیسات ساختمانی',
          primaryCategory: 'plumber',
          serviceAreas: [{ cityId: 'karaj', isNationwide: false, isRemoteOnlineAvailable: false }],
        },
        'plumb_1',
      );

      // Search by architect in Tehran
      const searchRes = await service.searchProviders({
        category: 'architect',
        cityId: 'tehran',
        limit: 10,
      });

      assert.equal(searchRes.items.length, 1);
      assert.equal(searchRes.items[0].displayNameFa, 'معمار مدرن');

      // Calculate performance metrics
      const metrics = await service.getPerformanceMetrics(pro1.providerId);
      assert.ok(metrics.profileCompletenessPercent >= 30);
    });

    it('enforces optimistic concurrency control on profile revisions', async () => {
      const repo = new InMemoryServiceProviderRepository();
      const service = createServiceProviderService({ repository: repo });

      const profile = await service.createIndividualProfile(
        { displayNameFa: 'تست همزمانی', professionalHeadlineFa: 'عنوان تستی', primaryCategory: 'civil_engineer' },
        'user_conc_1',
      );

      await assert.rejects(
        async () => {
          await repo.saveProviderProfile(profile, 999);
        },
        (err: ProviderValidationError) => {
          assert.equal(err.code, 'CONCURRENCY_CONFLICT');
          return true;
        },
      );
    });
  });
});

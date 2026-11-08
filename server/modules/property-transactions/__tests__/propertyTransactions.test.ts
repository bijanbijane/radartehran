/**
 * Property Transaction & Deal Management Module Automated Test Suite
 * (`server/modules/property-transactions/__tests__/propertyTransactions.test.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthoritativeListingSnapshot, BargainsListingValidationAdapter } from '../contracts';
import { createPropertyTransactionService } from '../index';
import { InMemoryPropertyTransactionRepository } from '../repository';
import { DealValidationError } from '../validation';

function createMockBargainsAdapter(overrides?: Partial<AuthoritativeListingSnapshot>): BargainsListingValidationAdapter {
  const defaultSnapshot: AuthoritativeListingSnapshot = {
    listingId: 'listing_punak_sale_1',
    isAvailable: true,
    isApproved: true,
    isExpired: false,
    ownerUserId: 'seller_user_1',
    transactionType: 'sale',
    propertyCategory: 'residential',
    cityId: 'tehran',
    hoodId: 2,
    hoodNameFa: 'پونک',
    streetText: 'خیابان سردار جنگل، کوچه گلستان',
    askingPriceMillionToman: 12500,
    ...overrides,
  };

  return {
    async getAuthoritativeListing(listingId: string) {
      if (listingId === defaultSnapshot.listingId) return defaultSnapshot;
      return null;
    },
    async validateListingForTransaction(listingId: string) {
      if (listingId !== defaultSnapshot.listingId) {
        return { valid: false, reason: 'آگهی در سامانه یافت نشد.' };
      }
      if (!defaultSnapshot.isAvailable || !defaultSnapshot.isApproved || defaultSnapshot.isExpired) {
        return { valid: false, reason: 'آگهی در دسترس یا تایید شده نیست.' };
      }
      return { valid: true, snapshot: defaultSnapshot };
    },
  };
}

describe('Property Transaction & Deal Management Backend Module', () => {
  describe('1. Inquiry Management & Listing Availability', () => {
    it('creates a valid property purchase inquiry and emits domain event', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry(
        {
          listingId: 'listing_punak_sale_1',
          message: 'سلام، مایل به خرید نقدی و تنظیم قرارداد هستم.',
          preferredContactMethod: 'platform_message',
          preferredViewingTimes: ['فردا ساعت ۱۷'],
          budgetMillionToman: 12500,
        },
        'buyer_user_1',
      );

      assert.equal(inq.listingId, 'listing_punak_sale_1');
      assert.equal(inq.initiatingUserId, 'buyer_user_1');
      assert.equal(inq.targetOwnerUserId, 'seller_user_1');
      assert.equal(inq.transactionType, 'sale');
      assert.equal(inq.status, 'submitted');

      const events = await repo.listDomainEvents(inq.inquiryId);
      assert.equal(events.length, 1);
      assert.equal(events[0].eventType, 'inquiry.created');
    });

    it('rejects inquiry if owner attempts to inquire on their own listing', async () => {
      const service = createPropertyTransactionService({
        bargainsAdapter: createMockBargainsAdapter({ ownerUserId: 'seller_user_1' }),
      });

      await assert.rejects(
        async () => {
          await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'تست' }, 'seller_user_1');
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'CANNOT_INQUIRE_OWN_LISTING');
          return true;
        },
      );
    });

    it('rejects inquiry if listing is expired or unavailable', async () => {
      const service = createPropertyTransactionService({
        bargainsAdapter: createMockBargainsAdapter({ isAvailable: false }),
      });

      await assert.rejects(
        async () => {
          await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'خرید' }, 'buyer_user_1');
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'LISTING_NOT_AVAILABLE');
          return true;
        },
      );
    });

    it('blocks duplicate active inquiries for the same user and listing', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'درخواست اول' }, 'buyer_user_1');

      await assert.rejects(
        async () => {
          await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'درخواست دوم' }, 'buyer_user_1');
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'DUPLICATE_ACTIVE_INQUIRY');
          return true;
        },
      );
    });

    it('allows owner response and inquiry withdrawal by initiator', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'پیام' }, 'buyer_user_1');
      const responded = await service.respondToInquiry(inq.inquiryId, 'ملک جهت بازدید آزاد است.', 'seller_user_1');
      assert.equal(responded.status, 'responded');

      // Unrelated user cannot withdraw
      await assert.rejects(async () => {
        await service.withdrawInquiry(inq.inquiryId, 'انصراف', 'intruder_user');
      });

      const withdrawn = await service.withdrawInquiry(inq.inquiryId, 'یافتن گزینه دیگر', 'buyer_user_1');
      assert.equal(withdrawn.status, 'withdrawn');
    });
  });

  describe('2. Viewing Appointments & Address Privacy', () => {
    it('enforces neighborhood-only address policy until appointment is confirmed', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const viewing = await service.requestViewingAppointment(
        {
          listingId: 'listing_punak_sale_1',
          hostUserId: 'seller_user_1',
          scheduledStartTimeIso: futureTime,
          durationMinutes: 45,
        },
        'buyer_user_1',
      );

      assert.equal(viewing.status, 'requested');
      assert.equal(viewing.disclosurePolicy, 'neighborhood_only');

      // Confirm by host reveals exact address
      const confirmed = await service.confirmViewingAppointment(viewing.appointmentId, 'seller_user_1');
      assert.equal(confirmed.status, 'confirmed');
      assert.equal(confirmed.disclosurePolicy, 'exact_address_confirmed');
    });

    it('detects and rejects conflicting viewing appointments for the host', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const time1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const v1 = await service.requestViewingAppointment(
        { listingId: 'listing_punak_sale_1', hostUserId: 'seller_user_1', scheduledStartTimeIso: time1, durationMinutes: 60 },
        'buyer_user_1',
      );
      await service.confirmViewingAppointment(v1.appointmentId, 'seller_user_1');

      // Attempt overlapping appointment (30 minutes into time1)
      const overlappingTime = new Date(new Date(time1).getTime() + 30 * 60 * 1000).toISOString();
      await assert.rejects(
        async () => {
          await service.requestViewingAppointment(
            { listingId: 'listing_punak_sale_1', hostUserId: 'seller_user_1', scheduledStartTimeIso: overlappingTime, durationMinutes: 45 },
            'buyer_user_2',
          );
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'VIEWING_SCHEDULE_CONFLICT');
          return true;
        },
      );
    });
  });

  describe('3. Sale vs. Rental Separation & Offer Versioning', () => {
    it('strictly separates purchase and rental financial terms', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter({ transactionType: 'sale' }),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'خرید' }, 'buyer_user_1');
      const deal = await service.convertInquiryToDeal(inq.inquiryId, 'buyer_user_1');

      // Attempting to submit rental terms to a sale deal must fail
      await assert.rejects(
        async () => {
          await service.submitOffer(
            {
              dealId: deal.dealId,
              rentalTerms: {
                depositMillionToman: 500,
                monthlyRentMillionToman: 20,
                currency: 'IRT',
                leaseDurationMonths: 12,
                proposedStartDateIso: new Date(Date.now() + 86400000).toISOString(),
              },
            },
            'buyer_user_1',
          );
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'CONTRADICTORY_OFFER_TYPES');
          return true;
        },
      );

      // Submitting valid purchase terms succeeds
      const offer = await service.submitOffer(
        {
          dealId: deal.dealId,
          purchaseTerms: {
            purchasePriceMillionToman: 12000,
            currency: 'IRT',
            paymentConditionsSummary: 'پرداخت در سه مرحله: ۵۰٪ عقد قرارداد، ۴۰٪ تحویل، ۱۰٪ انتقال سند',
            earnestMoneyDepositMillionToman: 600,
          },
        },
        'buyer_user_1',
      );
      assert.equal(offer.version, 1);
      assert.equal(offer.purchaseTerms?.purchasePriceMillionToman, 12000);
    });

    it('manages counteroffer versioning and blocks submitting counteroffer to own offer', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'شروع' }, 'buyer_user_1');
      const deal = await service.convertInquiryToDeal(inq.inquiryId, 'buyer_user_1');

      const offer1 = await service.submitOffer(
        {
          dealId: deal.dealId,
          purchaseTerms: {
            purchasePriceMillionToman: 11500,
            currency: 'IRT',
            paymentConditionsSummary: 'نقدی',
          },
        },
        'buyer_user_1',
      );

      // Buyer cannot counter their own offer
      await assert.rejects(
        async () => {
          await service.submitCounteroffer(
            {
              parentOfferId: offer1.offerId,
              purchaseTerms: { purchasePriceMillionToman: 11800, currency: 'IRT', paymentConditionsSummary: 'نقدی' },
            },
            'buyer_user_1',
          );
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'CANNOT_COUNTER_OWN_OFFER');
          return true;
        },
      );

      // Seller counters with version 2
      const counter1 = await service.submitCounteroffer(
        {
          parentOfferId: offer1.offerId,
          purchaseTerms: {
            purchasePriceMillionToman: 12200,
            currency: 'IRT',
            paymentConditionsSummary: 'تسویه کامل در ۶۰ روز',
          },
        },
        'seller_user_1',
      );

      assert.equal(counter1.version, 2);
      assert.equal(counter1.parentOfferId, offer1.offerId);

      // Parent offer is now marked 'countered'
      const updatedParent = await repo.getOfferById(offer1.offerId);
      assert.equal(updatedParent?.status, 'countered');
    });
  });

  describe('4. Offer Acceptance, Milestones & Safe Completion', () => {
    it('prohibits buyer from accepting their own offer, but allows seller acceptance', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'سلام' }, 'buyer_user_1');
      const deal = await service.convertInquiryToDeal(inq.inquiryId, 'buyer_user_1');

      const offer = await service.submitOffer(
        {
          dealId: deal.dealId,
          purchaseTerms: { purchasePriceMillionToman: 12000, currency: 'IRT', paymentConditionsSummary: 'نقد' },
        },
        'buyer_user_1',
      );

      // Buyer cannot accept their own offer
      await assert.rejects(
        async () => {
          await service.acceptOffer(deal.dealId, offer.offerId, 'buyer_user_1');
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'CANNOT_ACCEPT_OWN_OFFER');
          return true;
        },
      );

      // Seller accepts
      const acceptedDeal = await service.acceptOffer(deal.dealId, offer.offerId, 'seller_user_1');
      assert.equal(acceptedDeal.lifecycleStatus, 'offer_accepted');
      assert.equal(acceptedDeal.milestones[0].status, 'verified_complete');
    });

    it('enforces completion evidence and milestone progress before closing deal', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'خرید' }, 'buyer_user_1');
      const deal = await service.convertInquiryToDeal(inq.inquiryId, 'buyer_user_1');
      const offer = await service.submitOffer(
        { dealId: deal.dealId, purchaseTerms: { purchasePriceMillionToman: 12500, currency: 'IRT', paymentConditionsSummary: 'نقد' } },
        'buyer_user_1',
      );
      await service.acceptOffer(deal.dealId, offer.offerId, 'seller_user_1');

      // Attempting to complete without evidence fails
      await assert.rejects(async () => {
        await service.completeDeal(deal.dealId, '', 'seller_user_1');
      });

      // Seller closes deal with verified completion summary
      const closed = await service.completeDeal(
        deal.dealId,
        'تنظیم سند قطعی انتقال در دفتر اسناد رسمی شماره ۱۲۴ تهران و تحویل کامل مبیع',
        'seller_user_1',
      );
      assert.equal(closed.lifecycleStatus, 'completed');
      assert.ok(closed.closedAtIso);
    });

    it('allows deal cancellation with reason from any active state', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const service = createPropertyTransactionService({
        repository: repo,
        bargainsAdapter: createMockBargainsAdapter(),
      });

      const inq = await service.createInquiry({ listingId: 'listing_punak_sale_1', message: 'شروع' }, 'buyer_user_1');
      const deal = await service.convertInquiryToDeal(inq.inquiryId, 'buyer_user_1');

      const cancelled = await service.cancelDeal(deal.dealId, 'عدم توافق طرفین بر سر شرایط پرداخت', 'buyer_user_1');
      assert.equal(cancelled.lifecycleStatus, 'cancelled');
      assert.equal(cancelled.cancellationReason, 'عدم توافق طرفین بر سر شرایط پرداخت');
    });
  });

  describe('5. Concurrency, Pagination & Audit History', () => {
    it('detects optimistic concurrency conflicts on deal updates', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const deal = {
        dealId: 'deal_concurrency_test',
        listingId: 'listing_1',
        transactionType: 'sale' as const,
        propertyCategory: 'residential' as const,
        initiatorUserId: 'user_1',
        lifecycleStatus: 'active_negotiation' as const,
        participants: [],
        milestones: [],
        statusHistory: [],
        revision: 1,
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      };

      await repo.saveDeal(deal);

      // Stale revision expectation must fail
      await assert.rejects(
        async () => {
          await repo.saveDeal(deal, 999);
        },
        (err: DealValidationError) => {
          assert.equal(err.code, 'CONCURRENCY_CONFLICT');
          return true;
        },
      );
    });

    it('paginates inquiries deterministically using cursor', async () => {
      const repo = new InMemoryPropertyTransactionRepository();
      const now = Date.now();

      for (let i = 1; i <= 5; i++) {
        await repo.saveInquiry({
          inquiryId: `inq_page_${i}`,
          listingId: 'listing_1',
          initiatingUserId: 'buyer_user_page',
          targetOwnerUserId: 'seller_1',
          transactionType: 'sale',
          propertyCategory: 'residential',
          message: `پیام ${i}`,
          preferredContactMethod: 'platform_message',
          status: 'submitted',
          createdAtIso: new Date(now + i * 1000).toISOString(),
          updatedAtIso: new Date(now + i * 1000).toISOString(),
          expiresAtIso: new Date(now + 100000).toISOString(),
        });
      }

      const page1 = await repo.listInquiriesByUser('buyer_user_page', 'initiator', 2);
      assert.equal(page1.items.length, 2);
      assert.ok(page1.nextCursor);

      const page2 = await repo.listInquiriesByUser('buyer_user_page', 'initiator', 2, page1.nextCursor);
      assert.equal(page2.items.length, 2);
      assert.notEqual(page1.items[0].inquiryId, page2.items[0].inquiryId);
    });
  });
});

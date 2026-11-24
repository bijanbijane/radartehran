/** @file src/features/properties/services/propertyDataAdapter.ts — Maps Canonical Neighborhoods & Submissions into Property + Listing Entities */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import type {
  AmenityValue,
  PropertyEntity,
  PropertyMediaItem,
  PropertyType,
} from '../types/property.types';

function computeStreetCoordinates(lat: number, lng: number, radiusMeters: number, key: string): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const angle = ((hash % 360) * Math.PI) / 180;
  const distKm = ((radiusMeters || 1000) / 1000) * (0.2 + ((hash % 55) / 100));
  const dLat = (distKm * Math.cos(angle)) / 111.32;
  const dLng = (distKm * Math.sin(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat: Number((lat + dLat).toFixed(6)), lng: Number((lng + dLng).toFixed(6)) };
}
import type {
  ListingEntity,
  ListingStatus,
  PropertyListingRecord,
  TransactionType,
} from '../types/listing.types';
import type { ListingHistoryEvent } from '../types/listing-history.types';

function inferRoomsFromSqm(sqm: number | null): number | null {
  if (!sqm || sqm <= 0) return null;
  if (sqm < 60) return 1;
  if (sqm < 105) return 2;
  if (sqm < 165) return 3;
  return 4;
}

function parseRoomsFromText(text: string, sqm: number | null): number | null {
  if (text) {
    const normalized = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const digitMatch = /(\d)\s*خواب/.exec(normalized);
    if (digitMatch) {
      const parsed = Number(digitMatch[1]);
      if (parsed >= 0 && parsed <= 8) return parsed;
    }
    if (/تک\s*خواب|یک\s*خواب/.test(normalized)) return 1;
    if (/دو\s*خواب/.test(normalized)) return 2;
    if (/سه\s*خواب/.test(normalized)) return 3;
    if (/چهار\s*خواب/.test(normalized)) return 4;
  }
  return inferRoomsFromSqm(sqm);
}

function parseAmenityMention(text: string, keyword: string): AmenityValue {
  if (text.includes(`بدون ${keyword}`) || text.includes(`فاقد ${keyword}`)) return 'lacks';
  if (text.includes(keyword)) return 'has';
  return 'unknown';
}

function buildMediaItems(
  imageUrl?: string,
  imageUrls?: string[],
  title = '',
): PropertyMediaItem[] {
  const urls = [...(imageUrl ? [imageUrl] : []), ...(Array.isArray(imageUrls) ? imageUrls : [])]
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u));
  if (urls.length === 0) return [];
  return urls.map((url, idx) => ({
    id: `media-${idx}`,
    url,
    caption: title || `تصویر ${idx + 1}`,
    kind: idx === 0 ? 'interior' : 'facade',
    valid: true,
  }));
}

export function buildPropertyListingRecords(
  evaluatedNeighborhoods: EvaluatedNeighborhood[],
  userSubmissions: PropertyListingRecord[] = [],
  cityId = 'tehran',
): PropertyListingRecord[] {
  const records: PropertyListingRecord[] = [];
  const hoodById = new Map<number, EvaluatedNeighborhood>();
  for (const h of evaluatedNeighborhoods) hoodById.set(h.id, h);

  // 1. User-submitted listings first (all non-removed keep lifecycle visibility when accessed directly, published appear in discovery)
  for (const sub of userSubmissions) {
    records.push(sub);
  }

  // 2. Canonical neighborhood bargains + index benchmarks
  for (const hood of evaluatedNeighborhoods) {
    const agg = aggregateNeighborhoodMarketMetrics(
      hood.id,
      hood.name,
      hood.buyPerSqm,
      buildNeighborhoodListingSamples(hood),
    );

    if (hood.bargains && hood.bargains.length > 0) {
      hood.bargains.forEach((b, idx) => {
        const listingId = b.id || `bargain-${hood.id}-${idx}`;
        const propertyId = `prop-${listingId}`;
        const isRent = b.type === 'اجاره';
        const tx: TransactionType = isRent ? 'full_deposit' : 'sale';
        const sqm = typeof b.sqm === 'number' && b.sqm > 0 ? b.sqm : 85;
        const discount = Math.min(60, Math.max(2, Number(b.discountPercent) || 8));
        const derivedBuySqm = Math.round(hood.buyPerSqm * (1 - discount / 100));
        const derivedDepositM = Math.round((hood.rahn80m * (sqm / 80)) * (1 - discount / 100));
        const saleTotalM = isRent ? null : Math.round(derivedBuySqm * sqm);
        const coords = computeStreetCoordinates(hood.lat, hood.lng, hood.radius || 1100, listingId);
        const fullText = `${b.title || ''} ${b.street || ''}`;

        const propertyType: PropertyType = fullText.includes('کلنگی')
          ? 'land'
          : fullText.includes('ویلا')
          ? 'villa_house'
          : 'apartment';

        const property: PropertyEntity = {
          propertyId,
          propertyType,
          cityId,
          hoodId: hood.id,
          hoodName: hood.name,
          zoneName: hood.zone,
          street: b.street || hood.zone,
          lat: coords.lat,
          lng: coords.lng,
          locationPrecision: b.street ? 'approximate' : 'neighborhood',
          privacyRadiusMeters: b.street ? 250 : 600,
          areaSqm: sqm,
          buildYearJalali: null,
          roomsCount: parseRoomsFromText(fullText, sqm),
          floorNumber: null,
          totalFloors: null,
          orientation: 'unknown',
          documentType: fullText.includes('سند') ? 'single_deed' : 'unknown',
          unitFeatures: {
            parking: parseAmenityMention(fullText, 'پارکینگ'),
            elevator: parseAmenityMention(fullText, 'آسانسور'),
            storage: parseAmenityMention(fullText, 'انباری'),
            balcony: parseAmenityMention(fullText, 'بالکن'),
          },
          buildingFeatures: {
            unitsPerFloor: null,
            totalUnits: null,
            hasLobby: fullText.includes('لابی') ? 'has' : 'unknown',
            renovationStatus: fullText.includes('بازسازی') ? 'renovated' : 'unknown',
          },
          media: buildMediaItems(b.imageUrl, b.imageUrls, b.title),
        };

        const gapPct =
          !isRent && agg.estimatedDealPricePerSqm > 0
            ? Math.round(((derivedBuySqm - agg.estimatedDealPricePerSqm) / agg.estimatedDealPricePerSqm) * 1000) / 10
            : null;

        const status: ListingStatus =
          b.status === 'rejected'
            ? 'rejected'
            : b.status === 'pending'
            ? 'pending_review'
            : 'published';

        const listing: ListingEntity = {
          listingId,
          propertyId,
          version: 1,
          title: b.title || `فایل زیر قیمت در ${hood.name}`,
          description: `${b.buyerProfitText || `فایل پیشنهادی در محدوده ${b.street || hood.name}`}`,
          transactionType: tx,
          status,
          price: {
            priceType: 'negotiable',
            saleTotalMillion: saleTotalM,
            pricePerSqmMillion: isRent ? null : derivedBuySqm,
            depositMillion: isRent ? derivedDepositM : null,
            monthlyRentMillion: isRent ? 0 : null,
            convertibleRent: false,
          },
          publisher: {
            id: `pub-hood-${hood.id}`,
            displayName: hood.sponsor?.name || `مشاور منتخب محله ${hood.name}`,
            role: 'partner_feed',
            agencyName: hood.sponsor?.name,
            contactAuthorized: Boolean(hood.sponsor?.phone),
            maskedPhone: hood.sponsor?.phone,
          },
          verification: {
            identity: hood.sponsor?.name ? 'verified' : 'partial',
            location: b.street ? 'verified' : 'partial',
            priceReasonableness: Math.abs(discount) <= 35 ? 'verified' : 'partial',
            freshness: 'verified',
          },
          sourceKind: 'curated_bargain',
          createdAtIso: b.createdAtIso || '2026-04-01T08:00:00.000Z',
          updatedAtIso: b.updatedAtIso || '2026-04-12T08:00:00.000Z',
          marketContext: {
            hoodBaseBuyPerSqm: hood.buyPerSqm,
            hoodRahn80mMillion: hood.rahn80m,
            estimatedDealV64PerSqm: agg.estimatedDealPricePerSqm,
            gapPercentFromV64: gapPct,
            neighborhoodOverallScore: hood.overallScore,
            metroScore: hood.metro,
            airScore: hood.air,
          },
        };

        records.push({ property, listing });
      });
    } else {
      const listingId = `ref-${hood.id}`;
      const propertyId = `prop-${listingId}`;
      const sqm = 80;
      const property: PropertyEntity = {
        propertyId,
        propertyType: 'apartment',
        cityId,
        hoodId: hood.id,
        hoodName: hood.name,
        zoneName: hood.zone,
        street: hood.zone,
        lat: hood.lat,
        lng: hood.lng,
        locationPrecision: 'neighborhood',
        privacyRadiusMeters: Math.max(400, Math.round((hood.radius || 1000) * 0.5)),
        areaSqm: sqm,
        buildYearJalali: null,
        roomsCount: 2,
        floorNumber: null,
        totalFloors: null,
        orientation: 'unknown',
        documentType: 'unknown',
        unitFeatures: { parking: 'unknown', elevator: 'unknown', storage: 'unknown', balcony: 'unknown' },
        buildingFeatures: { unitsPerFloor: null, totalUnits: null, hasLobby: 'unknown', renovationStatus: 'unknown' },
        media: [],
      };
      const gapPct =
        agg.estimatedDealPricePerSqm > 0
          ? Math.round(((hood.buyPerSqm - agg.estimatedDealPricePerSqm) / agg.estimatedDealPricePerSqm) * 1000) / 10
          : null;
      const listing: ListingEntity = {
        listingId,
        propertyId,
        version: 1,
        title: `فایل شاخص مرجع مسکونی در ${hood.name}`,
        description: `نمای مرجع محله ${hood.name} بر اساس میانگین قیمت پیشنهادی پایه (${hood.zone}).`,
        transactionType: 'sale',
        status: 'published',
        price: {
          priceType: 'negotiable',
          saleTotalMillion: Math.round(hood.buyPerSqm * sqm),
          pricePerSqmMillion: hood.buyPerSqm,
          depositMillion: null,
          monthlyRentMillion: null,
          convertibleRent: false,
        },
        publisher: {
          id: `pub-bench-${hood.id}`,
          displayName: `پایگاه مرجع رادار · ${hood.name}`,
          role: 'partner_feed',
          contactAuthorized: false,
        },
        verification: {
          identity: 'partial',
          location: 'partial',
          priceReasonableness: 'verified',
          freshness: 'partial',
        },
        sourceKind: 'neighborhood_benchmark',
        createdAtIso: '2026-04-01T08:00:00.000Z',
        updatedAtIso: '2026-04-12T08:00:00.000Z',
        marketContext: {
          hoodBaseBuyPerSqm: hood.buyPerSqm,
          hoodRahn80mMillion: hood.rahn80m,
          estimatedDealV64PerSqm: agg.estimatedDealPricePerSqm,
          gapPercentFromV64: gapPct,
          neighborhoodOverallScore: hood.overallScore,
          metroScore: hood.metro,
          airScore: hood.air,
        },
      };
      records.push({ property, listing });
    }
  }

  return records;
}

export function buildHonestListingHistory(record: PropertyListingRecord, userHistory: ListingHistoryEvent[] = []): ListingHistoryEvent[] {
  const baseEvents: ListingHistoryEvent[] = [{
    id: `hist-create-${record.listing.listingId}`,
    listingId: record.listing.listingId,
    kind: 'created',
    atIso: record.listing.createdAtIso,
    summaryFa: record.listing.sourceKind === 'curated_bargain' ? 'ثبت اولیه فایل در فهرست فرصت‌های محله'
      : record.listing.sourceKind === 'user_submitted' ? 'ثبت اولیه توسط کاربر/مشاور' : 'ایجاد شاخص مرجع محله',
    verifiedFact: true,
  }];
  if (record.listing.verification.priceReasonableness === 'verified') {
    baseEvents.push({
      id: `hist-ver-${record.listing.listingId}`,
      listingId: record.listing.listingId,
      kind: 'verified',
      atIso: record.listing.updatedAtIso,
      summaryFa: 'انطباق قیمتی با بازه متعارف محله راستی‌آزمایی شد',
      verifiedFact: true,
    });
  }
  return [...userHistory.filter((e) => e.listingId === record.listing.listingId), ...baseEvents].sort((a, b) => b.atIso.localeCompare(a.atIso));
}

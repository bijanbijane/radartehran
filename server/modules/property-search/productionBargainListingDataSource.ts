import { getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { serverPublishedBargains, type ServerPublishedBargainRecord } from '../../../src/utils/serverPublisherBargains';
import type { ListingDataSourceAdapter } from './contracts';
import type { SearchPropertyItem } from './types';

const hoodCoordIndex = new Map<string, { lat: number; lng: number }>();

function ensureHoodIndex(): void {
  if (hoodCoordIndex.size > 0) return;
  for (const h of getAllMultiCityNeighborhoods()) {
    const cityId = resolveCityIdForNeighborhood(h.id);
    hoodCoordIndex.set(`${cityId}:${h.id}`, { lat: h.lat, lng: h.lng });
  }
}

function mapBargainRecord(b: ServerPublishedBargainRecord): SearchPropertyItem {
  ensureHoodIndex();
  const cityId = b.cityId || 'tehran';
  const coords = hoodCoordIndex.get(`${cityId}:${b.hoodId}`);
  const isRent = b.dealType === 'اجاره';
  const sqm = Math.max(20, b.sqm || 80);
  const total = b.priceMillions || 0;
  return {
    id: b.id,
    sourceModule: 'bargains',
    category: 'residential',
    subtype: 'apartment',
    dealType: isRent ? 'rent' : 'sale',
    cityId,
    hoodId: b.hoodId,
    hoodNameFa: b.hoodName,
    title: b.title,
    descriptionSnippetFa: b.street ? `خیابان ${b.street}` : undefined,
    areaSqm: sqm,
    askingPriceTotalMillion: isRent ? undefined : total,
    askingPricePerSqmMillion: isRent ? undefined : Math.round((total / sqm) * 100) / 100,
    monthlyRentMillion: isRent ? Math.max(1, Math.round(total * 0.03)) : undefined,
    depositMillion: isRent ? total : undefined,
    priceDisplayTextFa: b.priceText || `${total} میلیون تومان`,
    rooms: sqm >= 130 ? 3 : sqm >= 75 ? 2 : 1,
    coordinates: coords ? { lat: coords.lat, lng: coords.lng, isApproximate: true } : undefined,
    // No independent verification evidence exists in this source record.
    isVerifiedListing: false,
    publishedAtIso: b.createdAtIso,
    updatedAtIso: b.updatedAtIso || b.createdAtIso,
  };
}

function isPublicBargain(b: ServerPublishedBargainRecord): boolean {
  if (b.lifecycleState !== 'published') return false;
  if (b.expiresAtIso && Date.parse(b.expiresAtIso) < Date.now()) return false;
  return true;
}

function pushdownFilter(item: SearchPropertyItem, params: Parameters<ListingDataSourceAdapter['queryApprovedListings']>[0]): boolean {
  if (params.category && item.category !== params.category) return false;
  if (params.dealType && item.dealType !== params.dealType) return false;
  if (params.cityId && item.cityId !== params.cityId) return false;
  if (params.neighborhoodIds?.length && !params.neighborhoodIds.includes(item.hoodId)) return false;
  if (params.verifiedOnly && !item.isVerifiedListing) return false;
  if (params.minAskingPriceMillion != null && (item.askingPriceTotalMillion ?? 0) < params.minAskingPriceMillion) return false;
  if (params.maxAskingPriceMillion != null && (item.askingPriceTotalMillion ?? Number.MAX_SAFE_INTEGER) > params.maxAskingPriceMillion) return false;
  if (params.minAreaSqm != null && item.areaSqm < params.minAreaSqm) return false;
  if (params.maxAreaSqm != null && item.areaSqm > params.maxAreaSqm) return false;
  if (params.bedroomsMin != null && (item.rooms ?? 0) < params.bedroomsMin) return false;
  if (params.boundingBox) {
    // Neighborhood centroids are context hints, not property coordinates.
    if (!item.coordinates || item.coordinates.isApproximate) return false;
    const bb = params.boundingBox;
    const { lat, lng } = item.coordinates;
    if (lat < bb.minLat || lat > bb.maxLat || lng < bb.minLng || lng > bb.maxLng) return false;
  }
  return true;
}

export function createBargainListingDataSource(): ListingDataSourceAdapter {
  return {
    async queryApprovedListings(params) {
      const mapped = Array.from(serverPublishedBargains.values())
        .filter(isPublicBargain)
        .map(mapBargainRecord)
        .filter((item) => pushdownFilter(item, params));
      const totalEstimated = mapped.length;
      const slice = mapped.slice(0, params.limit);
      return {
        listings: slice,
        totalEstimated,
        sourceExhausted: slice.length >= totalEstimated,
      };
    },
    async getListingById(id: string) {
      const raw = serverPublishedBargains.get(id);
      if (!raw || !isPublicBargain(raw)) return null;
      return mapBargainRecord(raw);
    },
  };
}
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateCanonicalSponsorPricing, computeCanonicalSponsorPricing } from '../src/utils/domainSecurityValidators';
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/security';
import { getNeighborhoodTrafficInfo, INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import { CLOUD_COLLECTION_LISTENER_LIMIT, isPubliclyVisibleBargainStatus } from '../src/utils/publicSponsorSync';
import { describeLiveTrafficWithWeather } from '../src/utils/serverMarketPulseEngine';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const threeMonth = calculateCanonicalSponsorPricing(1, 3);
const canonical = computeCanonicalSponsorPricing(15, 3);
assert.equal(threeMonth.totalPayableMillion, 36);
assert.equal(threeMonth.totalPayableMillion, canonical.totalPayableMillion);
assert.equal(threeMonth.totalPayableMillion * 10, threeMonth.monthlyTariffMillion * 24);
assert.equal(calculateCanonicalSponsorPricing(1, 1).totalPayableMillion, 15);

assert.equal(isPubliclyVisibleBargainStatus('approved'), true);
assert.equal(isPubliclyVisibleBargainStatus('pending'), false);
assert.equal(isPubliclyVisibleBargainStatus(undefined), false);
assert.equal(isPubliclyVisibleBargainStatus('rejected'), false);
assert.equal(CLOUD_COLLECTION_LISTENER_LIMIT, 999);

assert.equal(DEFAULT_FEATURE_FLAGS.enableSponsorBilling, false);
const cloud = read('src/components/useRadarCloudSync.ts');
assert.equal(cloud.includes('enableSponsorBilling: Boolean(d.enableSponsorBilling ?? false)'), true);
assert.equal(cloud.includes("d.status && d.status !== 'approved'"), false);
assert.equal(cloud.includes('isPubliclyVisibleBargainStatus'), true);
assert.equal(cloud.includes('limit(CLOUD_COLLECTION_LISTENER_LIMIT)'), true);

const crud = read('src/components/useRadarCrudActions.ts');
assert.equal(crud.includes('رأی مهمان در میانگین مشترک محله ثبت نمی‌شود'), true);
assert.equal(crud.includes('votesCount: (baseItem.votesCount'), false);
assert.equal(crud.includes("status: p.isVerifiedAdmin ? 'approved' : 'pending'"), true);
assert.equal(crud.includes('تا تأیید مدیریت روی نقشهٔ عمومی نمایش داده نمی‌شود'), true);
assert.equal(crud.includes('ثبت درخواست اسپانسر در پایگاه داده انجام نشد'), true);
assert.equal(crud.includes('درخواست در پایگاه داده پایدار ذخیره نشد'), true);

const sponsorRoutes = read('src/utils/serverSponsorAndBargainRoutes.ts');
assert.equal(sponsorRoutes.includes('SPONSOR_PERSIST_FAILED'), true);
assert.equal(sponsorRoutes.includes('verifyFirebaseAppCheckHeader'), true);
const utility = read('src/utils/serverUtilityRoutes.ts');
assert.equal(utility.includes('verifyFirebaseAppCheckHeader'), true);

const indexes = JSON.parse(read('firestore.indexes.json')) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }> };
assert.equal(indexes.indexes.some((index) => index.collectionGroup === 'votes' && index.fields.map((field) => field.fieldPath).join(',') === 'userId,hoodId'), true);

const dry = describeLiveTrafficWithWeather('برآورد پایه', { snowfallCm: 4, isRainingOrSnowing: true, provenance: { qualityStatus: 'cached_or_fallback' } });
assert.equal(dry.weatherLive, false);
assert.equal(dry.status.includes('برف'), false);
const liveSnow = describeLiveTrafficWithWeather('برآورد پایه', { snowfallCm: 2, isRainingOrSnowing: true, provenance: { qualityStatus: 'verified_live' } });
assert.equal(liveSnow.weatherLive, true);
assert.equal(liveSnow.status.includes('بارش برف'), true);

const traffic = getNeighborhoodTrafficInfo(INITIAL_NEIGHBORHOODS[0], 20);
assert.equal(traffic.liveStatus.includes('برآورد قاعده‌محور'), true);

const pulse = read('src/utils/serverMarketPulseEngine.ts');
assert.equal(pulse.includes('hourlyChangePercent: 0'), true);
assert.equal(pulse.includes('hourlyChangePercent: realChangePct'), false);
const sync = read('src/components/useMarketPulseSync.ts');
assert.equal(sync.includes('snapshot.liveBuyPerSqm - base.buyPerSqm'), true);

console.log('backend mission integrity checks passed');

import {
  extractListingSpecsFromText,
  hasAffirmativeMatch,
  normalizePersianText,
  parseIranianPriceToMillionToman,
} from './realMarketPriceAggregator';

export function verifyPricingEngineIntegrity(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const check = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };
  const c3 = extractListingSpecsFromText('قیمت ۱۰ میلیارد و ۱۰۰ متر بنا', 100);
  const c14 = extractListingSpecsFromText('بدون پارکینگ آسانسور دارد', 100);
  check(parseIranianPriceToMillionToman('۱۱ و نیم میلیارد', 100, 115).totalMillion === 11500 && parseIranianPriceToMillionToman('۱۲ میلیارد و پانصد', 100, 125).totalMillion === 12500, 'Case 1-2: Word fold failed');
  check(c3.totalMillion === 10000 && c3.sqm === 100 && extractListingSpecsFromText('قیمت کل ۶.۵ میلیارد، ۸۰۰ میلیون رهن مستاجر کسر شده است', 100).totalMillion === 7300, 'Case 3-4: Total/Rahn failed');
  check(parseIranianPriceToMillionToman('۱۲.۵۰۰.۰۰۰.۰۰۰ تومان', 100, 125).totalMillion === 12500 && extractListingSpecsFromText('قیمت هر متر: ۶۵٬۰۰۰٬۰۰۰ تومان', 65).perSqmMillion === 65, 'Case 5-6: Separator/PerSqm failed');
  check(extractListingSpecsFromText('۵ طبقه ۲ واحدی، طبقه چهارم', 100).floor === 4 && extractListingSpecsFromText('طبقه ۲ واحد جنوبی', 100).floor === 2, 'Case 7-8: Floor extraction failed');
  check(extractListingSpecsFromText('ساختمان ۵ طبقه، طبقه آخر', 100).floor === 5 && extractListingSpecsFromText('طبقه همکف', 100).floor === 0, 'Case 9-10: Top/ground floor failed');
  check(extractListingSpecsFromText('در زمینی به مساحت ۳۰۰ متر، واحد ۹۵ متری', 100).sqm === 95 && !hasAffirmativeMatch('معاوضه با خودرو ندارم', /معاوضه/) && !hasAffirmativeMatch('بدون هیچ گونه اصلاحی', /اصلاحی/), 'Case 11-13: Area/Negation failed');
  check(c14.hasParking === false && c14.hasElevator === true && extractListingSpecsFromText('صفر تا صد بازسازی شده', 100).detectedSignals.isRenovated === true && normalizePersianText('صفر تا صد بازسازی شده').includes('صفر تا صد'), 'Case 14-15: Sub-clause/Idiom failed');
  return { passed: failures.length === 0, failures };
}

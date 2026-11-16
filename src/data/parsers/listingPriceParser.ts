import { toEnglishDigits } from '../../utils/formatters';

export type PriceSourceType = 'EXPLICIT_TOTAL' | 'EXPLICIT_PER_SQM' | 'UNAVAILABLE' | 'AMBIGUOUS';

export interface ParsedSalePrice {
  priceSourceType: PriceSourceType;
  totalMillion: number | null;
  perSqmMillion: number | null;
}

export interface ParsedRentPrice {
  priceSourceType: 'EXPLICIT_RENT' | 'FULL_DEPOSIT' | 'UNAVAILABLE' | 'AMBIGUOUS';
  depositMillion: number | null;
  monthlyRentMillion: number | null;
}

export interface ListingPriceInput {
  priceText?: string | null;
  explicitTotalMillion?: number | null;
  sqm?: number | null;
  transactionType: 'sale' | 'rent';
}

export type ParsedPriceKind = 'sale' | 'rent' | 'full_deposit' | 'undisclosed';

export interface ParsedPropertyPriceInfo {
  priceKind: ParsedPriceKind;
  totalPriceMillion: number | null;
  pricePerSqmMillion: number | null;
  depositMillion: number | null;
  monthlyRentMillion: number | null;
  displayTextFa: string;
  priceBasisLabelFa: string;
  isPriceDisclosed: boolean;
  priceSourceType: PriceSourceType | 'EXPLICIT_RENT' | 'FULL_DEPOSIT';
}

function toScaledMillion(rawNumStr: string, unit: string | undefined): number | null {
  const num = Number(rawNumStr.replace(/,/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  const u = (unit || '').trim();
  if (u.includes('میلیارد')) return Math.round(num * 1000 * 100) / 100;
  if (u.includes('میلیون')) return Math.round(num * 100) / 100;
  if (u.includes('هزار')) return Math.round((num / 1000) * 1000) / 1000;
  return Math.round(num * 100) / 100;
}

export function parseListingPriceInput(input: ListingPriceInput): ParsedSalePrice | ParsedRentPrice {
  const validSqm = typeof input.sqm === 'number' && Number.isFinite(input.sqm) && input.sqm > 0 ? input.sqm : null;
  const rawText = (input.priceText || '').trim();
  const normalized = toEnglishDigits(rawText).replace(/،/g, ',').replace(/\s+/g, ' ').trim();

  if (input.transactionType === 'rent') {
    if (!normalized || /توافقی|نامشخص|تماس/.test(normalized)) {
      return { priceSourceType: 'UNAVAILABLE', depositMillion: null, monthlyRentMillion: null };
    }
    const rahnMatch = normalized.match(/(?:رهن(?:\s*کامل)?|ودیعه)\s*[:：]?\s*([\d.,]+)\s*(میلیارد|میلیون|هزار)?/);
    const ejareMatch = normalized.match(/اجاره(?:\s*ماهانه)?\s*[:：]?\s*([\d.,]+)\s*(میلیارد|میلیون|هزار)?/);
    const fullDepositTag = /رهن\s*کامل|اجاره\s*[:：]?\s*(?:0|رایگان|ندارد)/.test(normalized);

    const depositMillion = rahnMatch ? toScaledMillion(rahnMatch[1], rahnMatch[2] || 'میلیون') : null;
    const monthlyRentMillion = ejareMatch ? toScaledMillion(ejareMatch[1], ejareMatch[2] || 'میلیون') : (fullDepositTag ? 0 : null);

    if (depositMillion !== null && (fullDepositTag || monthlyRentMillion === 0)) {
      return { priceSourceType: 'FULL_DEPOSIT', depositMillion, monthlyRentMillion: 0 };
    }
    if (depositMillion !== null || (monthlyRentMillion !== null && monthlyRentMillion > 0)) {
      return { priceSourceType: 'EXPLICIT_RENT', depositMillion, monthlyRentMillion };
    }
    return { priceSourceType: 'UNAVAILABLE', depositMillion: null, monthlyRentMillion: null };
  }

  // Sale branch
  if (!normalized && typeof input.explicitTotalMillion === 'number' && Number.isFinite(input.explicitTotalMillion) && input.explicitTotalMillion > 0) {
    const totalMillion = Math.round(input.explicitTotalMillion * 100) / 100;
    const perSqmMillion = validSqm ? Math.round((totalMillion / validSqm) * 10) / 10 : null;
    return { priceSourceType: 'EXPLICIT_TOTAL', totalMillion, perSqmMillion };
  }

  if (!normalized || /توافقی|نامشخص|تماس/.test(normalized)) {
    return { priceSourceType: 'UNAVAILABLE', totalMillion: null, perSqmMillion: null };
  }

  // If rent keywords appear inside a 'sale' parser call without sale price, treat as unavailable for sale
  if (/(?:رهن|ودیعه|اجاره)/.test(normalized) && !/(?:متری|کل|فروش)/.test(normalized)) {
    return { priceSourceType: 'UNAVAILABLE', totalMillion: null, perSqmMillion: null };
  }

  const perSqmMatch = normalized.match(/متری\s*([\d.,]+)\s*(میلیارد|میلیون|هزار)?/);
  const totalParenMatch = normalized.match(/کل\s*[:：]?\s*([\d.,]+)\s*(میلیارد|میلیون|هزار)?/);

  const explicitPerSqm = perSqmMatch ? toScaledMillion(perSqmMatch[1], perSqmMatch[2] || 'میلیون') : null;
  let explicitTotal = totalParenMatch ? toScaledMillion(totalParenMatch[1], totalParenMatch[2] || 'میلیارد') : null;

  if (explicitPerSqm === null && explicitTotal === null) {
    const standaloneMatch = normalized.match(/^([\d.,]+)\s*(میلیارد|میلیون|هزار)(?:\s*تومان)?$/);
    if (standaloneMatch) {
      explicitTotal = toScaledMillion(standaloneMatch[1], standaloneMatch[2]);
    } else if (typeof input.explicitTotalMillion === 'number' && Number.isFinite(input.explicitTotalMillion) && input.explicitTotalMillion > 0) {
      explicitTotal = Math.round(input.explicitTotalMillion * 100) / 100;
    }
  }

  if (explicitPerSqm !== null && explicitTotal !== null && validSqm !== null) {
    const expectedTotal = explicitPerSqm * validSqm;
    const relativeDiff = Math.abs(expectedTotal - explicitTotal) / Math.max(expectedTotal, explicitTotal, 1);
    if (relativeDiff > 0.05) {
      return { priceSourceType: 'AMBIGUOUS', totalMillion: null, perSqmMillion: null };
    }
    return {
      priceSourceType: 'EXPLICIT_PER_SQM',
      totalMillion: Math.round(explicitTotal * 100) / 100,
      perSqmMillion: Math.round(explicitPerSqm * 10) / 10,
    };
  }

  if (explicitPerSqm !== null) {
    const computedTotal = validSqm !== null ? Math.round(explicitPerSqm * validSqm * 100) / 100 : null;
    return {
      priceSourceType: 'EXPLICIT_PER_SQM',
      totalMillion: explicitTotal ?? computedTotal,
      perSqmMillion: Math.round(explicitPerSqm * 10) / 10,
    };
  }

  if (explicitTotal !== null) {
    const computedPerSqm = validSqm !== null ? Math.round((explicitTotal / validSqm) * 10) / 10 : null;
    return {
      priceSourceType: 'EXPLICIT_TOTAL',
      totalMillion: Math.round(explicitTotal * 100) / 100,
      perSqmMillion: computedPerSqm,
    };
  }

  return { priceSourceType: 'UNAVAILABLE', totalMillion: null, perSqmMillion: null };
}

export function parsePropertyListingPriceText(
  priceText: string | undefined | null,
  rawType: 'خرید' | 'اجاره' | string | undefined,
  areaSqm: number | null,
  explicitTotalMillion?: number | null
): ParsedPropertyPriceInfo {
  const raw = (priceText || '').trim();
  const isRentType = rawType === 'اجاره' || /(?:رهن|ودیعه|اجاره)/.test(raw);

  if (isRentType) {
    const parsedRent = parseListingPriceInput({
      priceText: raw,
      sqm: areaSqm,
      transactionType: 'rent',
    }) as ParsedRentPrice;

    if (parsedRent.priceSourceType === 'FULL_DEPOSIT') {
      return {
        priceKind: 'full_deposit',
        totalPriceMillion: null,
        pricePerSqmMillion: null,
        depositMillion: parsedRent.depositMillion,
        monthlyRentMillion: 0,
        displayTextFa: raw || 'رهن کامل',
        priceBasisLabelFa: 'رهن کامل (تومان)',
        isPriceDisclosed: true,
        priceSourceType: 'FULL_DEPOSIT',
      };
    }

    if (parsedRent.priceSourceType === 'EXPLICIT_RENT') {
      return {
        priceKind: 'rent',
        totalPriceMillion: null,
        pricePerSqmMillion: null,
        depositMillion: parsedRent.depositMillion,
        monthlyRentMillion: parsedRent.monthlyRentMillion,
        displayTextFa: raw || 'ودیعه و اجاره',
        priceBasisLabelFa: 'ودیعه و اجاره ماهانه (تومان)',
        isPriceDisclosed: true,
        priceSourceType: 'EXPLICIT_RENT',
      };
    }

    return {
      priceKind: 'undisclosed',
      totalPriceMillion: null,
      pricePerSqmMillion: null,
      depositMillion: null,
      monthlyRentMillion: null,
      displayTextFa: 'قیمت اعلام نشده / توافقی',
      priceBasisLabelFa: 'قیمت اعلام نشده',
      isPriceDisclosed: false,
      priceSourceType: parsedRent.priceSourceType,
    };
  }

  const parsedSale = parseListingPriceInput({
    priceText: raw,
    explicitTotalMillion,
    sqm: areaSqm,
    transactionType: 'sale',
  }) as ParsedSalePrice;

  if (
    (parsedSale.priceSourceType === 'EXPLICIT_PER_SQM' || parsedSale.priceSourceType === 'EXPLICIT_TOTAL') &&
    (parsedSale.totalMillion !== null || parsedSale.perSqmMillion !== null)
  ) {
    return {
      priceKind: 'sale',
      totalPriceMillion: parsedSale.totalMillion,
      pricePerSqmMillion: parsedSale.perSqmMillion,
      depositMillion: null,
      monthlyRentMillion: null,
      displayTextFa: raw || 'فروش قطعی',
      priceBasisLabelFa: 'قیمت کل و بهای هر مترمربع (تومان)',
      isPriceDisclosed: true,
      priceSourceType: parsedSale.priceSourceType,
    };
  }

  return {
    priceKind: 'undisclosed',
    totalPriceMillion: null,
    pricePerSqmMillion: null,
    depositMillion: null,
    monthlyRentMillion: null,
    displayTextFa: 'قیمت اعلام نشده / توافقی',
    priceBasisLabelFa: 'قیمت اعلام نشده',
    isPriceDisclosed: false,
    priceSourceType: parsedSale.priceSourceType,
  };
}

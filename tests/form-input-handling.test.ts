/**
 * @file tests/form-input-handling.test.ts
 * @description Fast-feedback unit tests for form input normalization, numeric draft commit,
 * ListingValidation multi-step validation, and responsive CSS/z-index layout invariants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeDigitsToAscii,
  sanitizeLiveText,
  normalizeIranianMobileInput,
  isValidNormalizedIranianMobile,
  normalizeIranianPhoneDigits,
  isValidIranianContactPhone,
  parseLocalizedNumber,
  commitNumericDraft,
  classifyFeedbackTone,
  validateAdminLockPassword,
  validateTelegramPostText,
  validateCrowdClaimDraft,
  computeBargainDefaultForDealType,
} from '../src/utils/forms/formInputHelpers';
import {
  createEmptySubmissionDraft,
  validateSubmissionStep,
  validateAllSubmissionSteps,
  clearPropertyTypeIncompatibleErrors,
} from '../src/features/properties/moderation/ListingValidation';
import {
  resolveProductViewRouterShellClasses,
  resolveSheetSnapHeightPx,
  DEFAULT_BOTTOM_SHEET_CONFIG,
} from '../src/utils/productViewRouterShellClasses';
import { validateContractTotalMillion } from '../src/features/tools/services/toolsCatalogEngine';
import {
  createDefaultPropertyFilters,
  normalizeFiltersForPropertyType,
  commitPropertyFilterDraft,
  parseOptionalNumber,
  isMalformedOptionalNumber,
  validatePropertyFilterErrors,
} from '../src/features/properties/filters/PropertyFilterDraft';
import {
  validateServiceWizardStep,
  validateAllServiceWizardSteps,
  type ServiceRequestDraftPayload,
} from '../src/features/services/services/serviceWorkflowService';

const ROOT = process.cwd();

test('normalizeDigitsToAscii converts Persian and Arabic-Indic digits', () => {
  assert.equal(normalizeDigitsToAscii('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigitsToAscii('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeDigitsToAscii('۰۹۱۲-۳۴۵-۶۷۸۹'), '0912-345-6789');
});

test('sanitizeLiveText preserves trailing spaces while stripping XSS/script payloads', () => {
  assert.equal(sanitizeLiveText('سعادت آباد '), 'سعادت آباد ');
  assert.equal(sanitizeLiveText('  تست  '), '  تست  ');
  assert.equal(sanitizeLiveText('ملک <script>alert(1)</script>نوساز'), 'ملک نوساز');
  assert.equal(sanitizeLiveText('javascript:alert(1) safe'), 'alert(1) safe');
});

test('normalizeIranianMobileInput & contact phone validation handle +98, 0098, Persian digits, and landlines', () => {
  assert.equal(normalizeIranianMobileInput('۰۹۱۲ ۳۴۵ ۶۷۸۹'), '09123456789');
  assert.equal(normalizeIranianMobileInput('+98 912 345 6789'), '09123456789');
  assert.equal(normalizeIranianMobileInput('00989123456789'), '09123456789');
  assert.equal(normalizeIranianMobileInput('9123456789'), '09123456789');
  assert.equal(isValidNormalizedIranianMobile('+98-912-345-6789'), true);
  assert.equal(isValidNormalizedIranianMobile('0912345'), false);

  assert.equal(normalizeIranianPhoneDigits('۰۲۱-۸۸۷۷۶۶۵۵'), '02188776655');
  assert.equal(isValidIranianContactPhone('۰۲۱-۸۸۷۷۶۶۵۵'), true);
  assert.equal(isValidIranianContactPhone('+989123456789'), true);
  assert.equal(isValidIranianContactPhone('12345'), false);
});

test('parseLocalizedNumber & commitNumericDraft handle Persian decimals and never coerce empty to 0', () => {
  assert.equal(parseLocalizedNumber('۲۸٫۵'), 28.5);
  assert.equal(parseLocalizedNumber('28/5'), 28.5);
  assert.equal(parseLocalizedNumber('۱٬۲۵۰'), 1250);
  assert.equal(Number.isNaN(parseLocalizedNumber('')), true);
  assert.equal(Number.isNaN(parseLocalizedNumber('abc')), true);

  assert.equal(commitNumericDraft('', { min: 20, max: 500, fallback: 85 }), 85);
  assert.equal(commitNumericDraft('', { min: 0, max: 1000, fallback: 0, nullable: true }), null);
  assert.equal(commitNumericDraft('۱۵۰', { min: 20, max: 500, fallback: 85 }), 150);
  assert.equal(commitNumericDraft('999', { min: 20, max: 500, fallback: 85 }), 500);
  assert.equal(commitNumericDraft('۱۲٫۷۵', { min: 0, max: 100, fallback: 10, allowDecimal: true }), 12.75);
});

test('classifyFeedbackTone classifies error, info, and success Persian messages semantically', () => {
  assert.equal(classifyFeedbackTone('لطفاً شماره موبایل معتبر وارد کنید.'), 'error');
  assert.equal(classifyFeedbackTone('خطا در اتصال به سرور'), 'error');
  assert.equal(classifyFeedbackTone('در حال ذخیره اطلاعات...'), 'info');
  assert.equal(classifyFeedbackTone('اطلاعات با موفقیت ثبت شد.'), 'success');
});

test('ListingValidation supports Persian decimals, +98 phone, and validateAllSubmissionSteps catches earlier invalid step', () => {
  const draft = createEmptySubmissionDraft(5, 'tehran', 'user-1');
  draft.street = 'بلوار دریا';
  draft.areaSqm = '۹۵';
  draft.buildYearJalali = '۱۴۰۰';
  draft.floorNumber = '۳';
  draft.totalFloors = '۵';
  draft.saleTotalBillion = '۱۸٫۵';
  draft.title = 'آپارتمان ۹۵ متری خوش‌نقشه در سعادت‌آباد';
  draft.description = 'دارای پارکینگ، انباری، آسانسور و سند تک‌برگ آماده انتقال.';
  draft.publisherName = 'علی رضایی';
  draft.publisherPhone = '+98 912 345 6789';
  draft.agreeToVerification = true;

  assert.equal(validateSubmissionStep(draft, 5).valid, true);
  assert.equal(validateSubmissionStep(draft, 7).valid, true);
  assert.equal(validateAllSubmissionSteps(draft).valid, true);

  // Break step 3 (floor > totalFloors) while user is on step 7
  draft.floorNumber = '7';
  const allCheck = validateAllSubmissionSteps(draft);
  assert.equal(allCheck.valid, false);
  assert.equal(allCheck.firstInvalidStep, 3);
  assert.ok(allCheck.errors.totalFloors);
});

test('Responsive CSS, z-index layering, and viewport shell invariants hold', () => {
  const indexCss = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(ROOT, 'src/styles/base.css'), 'utf8');
  const shellTsx = fs.readFileSync(path.join(ROOT, 'src/components/RadarWorkspaceShell.tsx'), 'utf8');
  const diagTsx = fs.readFileSync(path.join(ROOT, 'src/components/LiveDiagnosticOverlay.tsx'), 'utf8');

  assert.equal(indexCss.includes('!important'), false, 'src/index.css must contain zero !important overrides');
  assert.match(indexCss, /\.animate-fadeIn/, 'animate-fadeIn utility must be defined');
  assert.match(indexCss, /\.animate-fade-in/, 'animate-fade-in utility must be defined');
  assert.equal((baseCss.match(/\.app-viewport-locked/g) || []).length, 1, 'base.css must not duplicate .app-viewport-locked');
  assert.equal(shellTsx.includes('w-screen'), false, 'RadarWorkspaceShell must use w-full instead of w-screen');
  assert.equal(diagTsx.includes('z-[95]'), false, 'LiveDiagnosticOverlay must not float above z-50 modals');

  // Bottom sheet snap heights never exceed mobile viewport height
  const mobileSnap = resolveSheetSnapHeightPx('expanded', { ...DEFAULT_BOTTOM_SHEET_CONFIG, viewportHeight: 844 });
  assert.ok(mobileSnap > 400 && mobileSnap < 844);

  const splitShell = resolveProductViewRouterShellClasses(true, true);
  assert.match(splitShell.splitShell, /w-full/);
  assert.match(splitShell.splitShell, /lg:w-\[60%\]/);
});

test('validateContractTotalMillion accepts Persian/Arabic digits and formatted thousands while rejecting invalid inputs', () => {
  assert.deepEqual(validateContractTotalMillion('۱۲۰۰۰'), { valid: true, value: 12000, errorFa: null });
  assert.deepEqual(validateContractTotalMillion('۱۵٬۰۰۰'), { valid: true, value: 15000, errorFa: null });
  assert.deepEqual(validateContractTotalMillion('18,500'), { valid: true, value: 18500, errorFa: null });
  assert.equal(validateContractTotalMillion('۴۹۹').valid, false);
  assert.equal(validateContractTotalMillion('۱۲۵۰.۵').valid, false);
  assert.equal(validateContractTotalMillion('').valid, false);
});

test('PropertyFilterDraft normalizes Persian numbers, swaps inverted ranges, and clears incompatible land/commercial filters', () => {
  assert.equal(parseOptionalNumber('۸۵'), 85);
  assert.equal(parseOptionalNumber('۱۲٬۵۰۰'), 12500);
  const draft = {
    ...createDefaultPropertyFilters('sale'),
    areaMin: '۱۲۰',
    areaMax: '۸۰',
    roomsMin: 3,
    elevator: 'has' as const,
  };
  const committed = commitPropertyFilterDraft(draft);
  assert.equal(committed.areaMin, '80');
  assert.equal(committed.areaMax, '120');

  const landNormalized = normalizeFiltersForPropertyType(draft, 'land');
  assert.equal(landNormalized.propertyType, 'land');
  assert.equal(landNormalized.roomsMin, null);
  assert.equal(landNormalized.elevator, 'any');
});

test('Interactive modals, hooks, and sheets uphold crash-free and keyboard-dismiss invariants', () => {
  const smartSuggest = fs.readFileSync(path.join(ROOT, 'src/components/SmartSuggestModal.tsx'), 'utf8');
  const earlyReturnIdx = smartSuggest.indexOf('if (!open) return null;');
  assert.ok(earlyReturnIdx > 0, 'SmartSuggestModal should guard closed state');
  const afterReturn = smartSuggest.slice(earlyReturnIdx);
  assert.equal(/\buse(Memo|Effect|State|Callback|Ref)\s*\(/.test(afterReturn), false, 'SmartSuggestModal must not invoke React hooks after early return');

  const discoverView = fs.readFileSync(path.join(ROOT, 'src/components/views/ProductDiscoverView.tsx'), 'utf8');
  assert.match(discoverView, /activeCity=\{activeCity\}/, 'ProductDiscoverView must forward activeCity to GlobalSearchWorkspace');
  assert.match(discoverView, /onSelectNeighborhoodId=/, 'ProductDiscoverView must wire neighborhood selection from GlobalSearchWorkspace');

  const mobileSheet = fs.readFileSync(path.join(ROOT, 'src/components/navigation/MobileMoreSheet.tsx'), 'utf8');
  assert.match(mobileSheet, /Escape/, 'MobileMoreSheet must dismiss on Escape');
  assert.match(mobileSheet, /invisible/, 'Closed MobileMoreSheet must hide descendants from keyboard tab order');

  const portaledModals = [
    'src/components/modals/ContractRoomShieldModal.tsx',
    'src/components/modals/InstantListingVerifierModal.tsx',
    'src/components/modals/ReverseBudgetDiscoveryModal.tsx',
    'src/components/ListingMediaGallery.tsx',
    'src/components/NeighborhoodPriceTrendModal.tsx',
    'src/features/properties/filters/PropertyFilterPanel.tsx',
    'src/features/properties/comparison/PropertyComparisonModal.tsx',
    'src/features/properties/detail/PropertyGallery.tsx',
    'src/features/properties/detail/PropertyDetailSections.tsx',
    'src/features/services/components/ServiceProviderModal.tsx',
    'src/features/services/components/ServiceRequestModal.tsx',
    'src/features/market/saved-analysis/SavedAnalysisPanel.tsx',
    'src/features/market/methodology/MethodologyPanel.tsx',
    'src/features/market/filters/MarketFilterPanel.tsx',
  ];
  for (const rel of portaledModals) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /createPortal\(/, `${rel} must portal to document.body to escape backdrop-filter containing blocks`);
    assert.match(src, /z-\[9500\]/, `${rel} must render above global top bar z-index`);
  }

  const floatingTopBar = fs.readFileSync(path.join(ROOT, 'src/components/FloatingTopBar.tsx'), 'utf8');
  assert.match(floatingTopBar, /z-\[44\]/, 'FloatingTopBar must elevate above MapToolRail/RadarBottomNav when floating panels open');

  const searchDropdown = fs.readFileSync(path.join(ROOT, 'src/components/SearchDropdownMenu.tsx'), 'utf8');
  assert.match(searchDropdown, /absolute top-full mt-2 inset-x-0/, 'SearchDropdownMenu must anchor via absolute positioning under the vibrancy bar');
});

test('validateAdminLockPassword, validateTelegramPostText, validateCrowdClaimDraft, and computeBargainDefaultForDealType enforce constraints', () => {
  assert.ok(validateAdminLockPassword(false, '1234'));
  assert.ok(validateAdminLockPassword(true, '   '));
  assert.ok(validateAdminLockPassword(true, '123'));
  assert.equal(validateAdminLockPassword(true, '1234'), null);

  assert.ok(validateTelegramPostText('  '));
  assert.ok(validateTelegramPostText('ab'));
  assert.equal(validateTelegramPostText('سلام تهران'), null);

  assert.equal(validateCrowdClaimDraft('کو', 'توضیح کافی برای گزارش محلی').ok, false);
  assert.equal(validateCrowdClaimDraft('گزارش معتبر', 'کوتاه').ok, false);
  assert.equal(validateCrowdClaimDraft('تغییر نرخ اجاره', 'نرخ رهن کامل در بلوار دریا افزایش یافت.').ok, true);

  const buyDef = computeBargainDefaultForDealType({ buyPerSqm: 200, rentPerMonth: 20 }, 'خرید');
  assert.equal(buyDef.proposedPrice, 180);
  assert.equal(buyDef.max, 10000);

  const rentDef = computeBargainDefaultForDealType({ buyPerSqm: 200, rentPerMonth: 20 }, 'اجاره');
  assert.equal(rentDef.proposedPrice, 1800);
  assert.equal(rentDef.max, 200000);
});

test('ListingValidation checks roomsCount integer bounds and clearPropertyTypeIncompatibleErrors prunes land/villa errors', () => {
  const draft = createEmptySubmissionDraft(5, 'tehran', 'user-1');
  draft.roomsCount = '25';
  draft.buildYearJalali = '1400.5';
  const step3Invalid = validateSubmissionStep(draft, 3);
  assert.equal(step3Invalid.valid, false);
  assert.ok(step3Invalid.errors.roomsCount);
  assert.ok(step3Invalid.errors.buildYearJalali);

  const prunedForLand = clearPropertyTypeIncompatibleErrors(
    { ...step3Invalid.errors, areaSqm: 'متراژ اشتباه', floorNumber: 'طبقه نامعتبر' },
    'land',
  );
  assert.equal(prunedForLand.roomsCount, undefined);
  assert.equal(prunedForLand.buildYearJalali, undefined);
  assert.equal(prunedForLand.floorNumber, undefined);
  assert.equal(prunedForLand.areaSqm, 'متراژ اشتباه');

  const prunedForVilla = clearPropertyTypeIncompatibleErrors(
    { roomsCount: 'خواب اشتباه', floorNumber: 'طبقه', totalFloors: 'کل' },
    'villa_house',
  );
  assert.equal(prunedForVilla.floorNumber, undefined);
  assert.equal(prunedForVilla.totalFloors, undefined);
  assert.equal(prunedForVilla.roomsCount, 'خواب اشتباه');
});

test('PropertyFilterDraft validates malformed numeric strings, rejects trailing alpha, and supports Persian decimal separator', () => {
  assert.equal(parseOptionalNumber('۸۵٫۵'), 85.5);
  assert.equal(parseOptionalNumber('12abc'), null);
  assert.equal(isMalformedOptionalNumber(''), false);
  assert.equal(isMalformedOptionalNumber('۱۲۰'), false);
  assert.equal(isMalformedOptionalNumber('12abc'), true);

  const malformedDraft = {
    ...createDefaultPropertyFilters('sale'),
    areaMin: '12abc',
    priceMaxMillion: '---',
  };
  const filterErrors = validatePropertyFilterErrors(malformedDraft);
  assert.equal(filterErrors.length, 2);
});

test('ServiceWorkflow validation checks Step 4 projectSummary, Step 5 schedule/budget, and Step 6 contact + consent', () => {
  const baseDraft: ServiceRequestDraftPayload = {
    canonicalCategory: 'inspection',
    serviceId: 'srv-tech-inspection',
    neighborhoodName: 'سعادت‌آباد',
    propertyTypeFa: 'آپارتمان مسکونی',
    areaSqm: '۱۲۰',
    budgetRangeFa: 'توافقی طبق تعرفه',
    preferredScheduleFa: 'فردا عصر',
    deliveryMode: 'onsite',
    contactPolicy: 'shared_after_approval',
    requesterName: 'رضا محمدی',
    requesterPhone: '۰۹۱۲۳۴۵۶۷۸۹',
    projectSummary: 'درخواست کارشناسی کامل تاسیسات و سازه آپارتمان',
    categorySpecificDetails: {},
    contactConsentAccepted: true,
  };

  assert.equal(validateAllServiceWizardSteps(baseDraft).valid, true);

  const badSummary = { ...baseDraft, projectSummary: 'کوتاه' };
  const s4 = validateServiceWizardStep(badSummary, 4);
  assert.equal(s4.valid, false);
  assert.ok(s4.errors.projectSummary);

  const badStep5 = { ...baseDraft, budgetRangeFa: '  ', preferredScheduleFa: '' };
  assert.equal(validateServiceWizardStep(badStep5, 5).valid, false);

  const badStep6 = { ...baseDraft, requesterPhone: '1234', contactConsentAccepted: false };
  const s6 = validateServiceWizardStep(badStep6, 6);
  assert.equal(s6.valid, false);
  assert.ok(s6.errors.requesterPhone);
  assert.ok(s6.errors.contactConsentAccepted);

  const allRes = validateAllServiceWizardSteps(badStep6);
  assert.equal(allRes.valid, false);
  assert.equal(allRes.firstInvalidStep, 6);
});

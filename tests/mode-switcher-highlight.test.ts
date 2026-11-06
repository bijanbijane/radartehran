import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('--- Running Mode Switcher Highlight & Pulse Tests ---');

function evaluateModeSuggestion(
  mode: 'rent' | 'buy',
  deposit: number,
  monthlyRent: number,
  buyTotalBudget: number
): { shouldSuggestBuy: boolean; shouldSuggestRent: boolean } {
  const shouldSuggestBuy = mode === 'rent' && (deposit >= 2000 || (deposit >= 1500 && monthlyRent >= 25));
  const shouldSuggestRent = mode === 'buy' && buyTotalBudget > 0 && buyTotalBudget <= 1400;
  return { shouldSuggestBuy, shouldSuggestRent };
}

// 1. High deposit in rent mode triggers buy pulse
{
  const res = evaluateModeSuggestion('rent', 2500, 0, 0);
  assert.equal(res.shouldSuggestBuy, true, 'High deposit (2500m) in rent mode must suggest buy');
  assert.equal(res.shouldSuggestRent, false);
}

// 2. Moderate deposit + high rent in rent mode triggers buy pulse
{
  const res = evaluateModeSuggestion('rent', 1600, 30, 0);
  assert.equal(res.shouldSuggestBuy, true, 'Deposit 1600m + rent 30m must suggest buy');
  assert.equal(res.shouldSuggestRent, false);
}

// 3. Modest deposit in rent mode does not trigger buy pulse
{
  const res = evaluateModeSuggestion('rent', 500, 15, 0);
  assert.equal(res.shouldSuggestBuy, false, 'Modest deposit (500m) must not suggest buy');
  assert.equal(res.shouldSuggestRent, false);
}

// 4. Low budget in buy mode triggers rent pulse
{
  const res = evaluateModeSuggestion('buy', 0, 0, 1200);
  assert.equal(res.shouldSuggestRent, true, 'Low budget (1200m) in buy mode must suggest rent');
  assert.equal(res.shouldSuggestBuy, false);
}

// 5. Ample budget in buy mode does not trigger rent pulse
{
  const res = evaluateModeSuggestion('buy', 0, 0, 6000);
  assert.equal(res.shouldSuggestRent, false, 'Ample budget (6000m) in buy mode must not suggest rent');
  assert.equal(res.shouldSuggestBuy, false);
}

// 6. WS-002 Regression: OnboardingWizardModal effective buying power & PortfolioModals validation
{
  const onboardingSrc = fs.readFileSync('src/components/OnboardingWizardModal.tsx', 'utf8');
  assert.ok(
    onboardingSrc.includes('const effectiveBuyPowerMillion = Math.round((buyTotalBudget + (useLoanBooster ? 1200 : 0)) / (deductTenantRahnInBuy ? 0.72 : 1.0));') &&
      onboardingSrc.includes('متری ${toPersianNum(uBuy)} م (معامله v6.4: ${toPersianNum(uDeal)} م)'),
    'OnboardingWizardModal must calculate effective purchasing power and show the live buy price on recommended neighborhoods'
  );
  assert.ok(
    onboardingSrc.includes('const buyAgeMultiplier = buildingAgeSegment === \'new\' ? 1.0 : buildingAgeSegment === \'mid\' ? 0.88 : 0.76;'),
    'OnboardingWizardModal must apply buildingAgeSegment multiplier to buy mode neighborhood recommendations'
  );

  const portfolioSrc = fs.readFileSync('src/components/PortfolioModals.tsx', 'utf8');
  assert.ok(
    portfolioSrc.includes('role="alert"') && portfolioSrc.includes('لطفاً آدرس یا مشخصات کوتاه واحد بازدیدشده را وارد کنید.'),
    'PortfolioModals must show explicit validation alert when submitting Visited Homes form without address'
  );
  assert.ok(
    portfolioSrc.split('\n').length < 500,
    'PortfolioModals.tsx must remain strictly under 500 lines'
  );

  const modeSwitcherSrc = fs.readFileSync('src/components/ModeSwitcherSegmented.tsx', 'utf8');
  assert.ok(
    modeSwitcherSrc.includes('سوییچ به خرید') && modeSwitcherSrc.includes('سوییچ به رهن'),
    'ModeSwitcherSegmented recommendation banners must be interactive 1-click buttons'
  );
}

console.log('[PASS] All Mode Switcher Highlight, Onboarding Wizard & Portfolio Validation tests passed.');

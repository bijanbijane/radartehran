/**
 * @file tests/frontend-debug-regressions.test.ts
 * @description Regression tests for frontend debugging pass:
 *   1. URL/routing contract & malformed URI decoding resilience
 *   2. Service comparison normalization & whitespace sanitization
 *   3. Legacy ADMIN_PANEL permission mapping
 *   4. Community Hub tab & member URL helper contract
 *   5. Static guards for popstate history integrity, AbortController, auth races, and Storage safety
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveRouteFromLocation, buildCanonicalPathForDestination } from '../src/navigation/url/navigationUrlContract';
import { normalizeResultItem } from '../src/platform/presentation/core/ResultNormalizer';
import { ResultComparisonController } from '../src/platform/presentation/comparison/ComparisonController';
import {
  sanitizePlainUserText,
  normalizeCollectionName,
  normalizeTagName,
} from '../src/platform/entity-engagement/core/EngagementNormalizer';
import { mapLegacyPermissionToCanonical } from '../src/platform/authorization/adapters/legacyPermissionAdapter';
import { mapSubTabToHubTab } from '../src/features/community/utils/communityHubNavHelpers';

const ROOT = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('resolveRouteFromLocation safely handles malformed percent-encoding without throwing URIError', () => {
  const badArea = resolveRouteFromLocation('/areas/%E0%A4%A', '');
  assert.equal(badArea.viewId, 'not_found');
  assert.equal(badArea.isUnknownPath, true);

  const badMember = resolveRouteFromLocation('/community/members/%E0%A4%A', '');
  assert.equal(badMember.viewId, 'not_found');
  assert.equal(badMember.isUnknownPath, true);
});

test('resolveRouteFromLocation extracts memberUsername for /community/members/:username and preserves canonical paths', () => {
  const validMember = resolveRouteFromLocation('/community/members/sara_tehran', '');
  assert.equal(validMember.viewId, 'contributions');
  assert.equal(validMember.subTab, 'members');
  assert.equal(validMember.memberUsername, 'sara_tehran');
  assert.equal(validMember.isUnknownPath, false);

  const encodedArea = resolveRouteFromLocation('/areas/%D9%BE%D9%88%D9%86%DA%A9', '');
  assert.equal(encodedArea.viewId, 'discover');
  assert.equal(encodedArea.areaSlug, 'پونک');

  assert.equal(buildCanonicalPathForDestination('discover'), '/areas');
  assert.equal(buildCanonicalPathForDestination('intelligence'), '/market');
});

test('normalizeResultItem allows service comparison up to ComparisonSchema cap (4)', () => {
  const items = [1, 2, 3, 4, 5].map((i) =>
    normalizeResultItem({
      id: `svc-${i}`,
      entityType: 'service',
      title: `سرویس ${i}`,
    }),
  );
  assert.equal(items[0].permissions.canCompare, true);

  const ctrl = new ResultComparisonController();
  for (let i = 0; i < 4; i++) {
    const res = ctrl.addEntity(items[i]);
    assert.equal(res.ok, true);
  }
  const fifth = ctrl.addEntity(items[4]);
  assert.equal(fifth.ok, false);
});

test('EngagementNormalizer collapses whitespace and strips unsafe HTML/script payloads', () => {
  assert.equal(sanitizePlainUserText('  سلام   <b>تهران</b>   پونک  ', 100), 'سلام تهران پونک');
  assert.equal(normalizeCollectionName('  لیست   منتخب   من  '), 'لیست منتخب من');
  const tag = normalizeTagName('  <script>alert(1)</script>  سرمایه   گذاری  ');
  assert.equal(tag.displayName, 'سرمایه گذاری');
  assert.ok(!tag.displayName.includes('<script>'));
});

test('Legacy permission adapter maps ADMIN_PANEL to admin:read:global', () => {
  assert.equal(mapLegacyPermissionToCanonical('ADMIN_PANEL'), 'admin:read:global');
});

test('CommunityHub nav helper maps sub-tabs cleanly', () => {
  assert.equal(mapSubTabToHubTab('discussions'), 'discussions');
  assert.equal(mapSubTabToHubTab('questions'), 'questions');
  assert.equal(mapSubTabToHubTab('members'), 'members');
  assert.equal(mapSubTabToHubTab('research'), 'research_proposals');
  assert.equal(mapSubTabToHubTab(undefined), 'overview');
});

test('Static invariants: popstate guard, AbortController, auth sequence race guard, and Storage try/catch', () => {
  const urlSync = readSrc('src/components/useAppUrlAndTitleSync.ts');
  assert.match(urlSync, /isPopStateSyncRef/);
  assert.match(urlSync, /lastTrackedRouteKeyRef/);

  const cloudSync = readSrc('src/components/useRadarCloudSync.ts');
  assert.match(cloudSync, /authSeqRef/);

  const pulseSync = readSrc('src/components/useMarketPulseSync.ts');
  assert.match(pulseSync, /AbortController/);
  assert.match(pulseSync, /pulseSeqRef/);

  const claimsPanel = readSrc('src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx');
  assert.match(claimsPanel, /AbortController/);
  assert.match(claimsPanel, /fetchSeqRef/);

  const socioCard = readSrc('src/components/stage2/SocioeconomicReferenceCard.tsx');
  assert.match(socioCard, /AbortController/);

  const appSrc = readSrc('src/App.tsx');
  assert.match(appSrc, /try\s*\{[\s\S]*sessionStorage\.getItem/);
  assert.ok(appSrc.split('\n').length <= 100, 'src/App.tsx must remain <= 100 lines');

  const crudHook = readSrc('src/components/useRadarCrudActions.ts');
  assert.ok(!crudHook.includes('finally { setIsSavingBuyerAlert(false); p.setSavingPrefs(false); }'));
});

test('Dialog scroll-lock ref counting and Escape/useDialogFocus contracts across repaired components', () => {
  const focusHook = readSrc('src/components/useDialogFocus.ts');
  assert.match(focusHook, /activeScrollLockCount/);
  assert.match(focusHook, /savedBaseBodyOverflow/);

  const popoverFilesWithEscape = [
    'src/features/communications/components/HeaderNotificationBell.tsx',
    'src/components/FloatingTopBar.tsx',
    'src/components/navigation/MapToolRail.tsx',
    'src/features/map/components/MapSpatialToolsPopover.tsx',
  ];
  for (const rel of popoverFilesWithEscape) {
    const src = readSrc(rel);
    assert.match(src, /Escape/, `${rel} must dismiss open popovers on Escape`);
  }

  const dialogFilesWithFocusHook = [
    'src/components/CasperDecisionSuiteModal.tsx',
    'src/components/casper/CasperCertifiedDossierModal.tsx',
    'src/components/casper/CasperNegotiationPlaybookModal.tsx',
    'src/features/properties/detail/PropertyGallery.tsx',
    'src/features/properties/comparison/PropertyComparisonModal.tsx',
    'src/features/properties/filters/PropertyFilterPanel.tsx',
    'src/features/properties/detail/PropertyDetailSections.tsx',
    'src/features/market/methodology/MethodologyPanel.tsx',
    'src/features/market/saved-analysis/SavedAnalysisPanel.tsx',
    'src/features/market/filters/MarketFilterPanel.tsx',
    'src/features/services/components/ServiceProviderModal.tsx',
    'src/features/services/components/ServiceRequestModal.tsx',
  ];
  for (const rel of dialogFilesWithFocusHook) {
    const src = readSrc(rel);
    assert.match(src, /useDialogFocus/, `${rel} must wire useDialogFocus for Escape/focus/scroll-lock`);
  }

  const gallerySrc = readSrc('src/features/properties/detail/PropertyGallery.tsx');
  assert.match(gallerySrc, /safeIndex/);
  assert.match(gallerySrc, /onError/);
  assert.match(gallerySrc, /ArrowLeft/);

  const casperModalSrc = readSrc('src/components/CasperDecisionSuiteModal.tsx');
  assert.match(casperModalSrc, /useIntlCurrency/);
  assert.match(casperModalSrc, /(text-slate-900 dark:text-(slate-100|\[var\(--color-text-primary\)\])|text-\[var\(--color-text-primary\)\])/);

  const serviceReqSrc = readSrc('src/features/services/components/ServiceRequestModal.tsx');
  assert.match(serviceReqSrc, /normalizeServicePhoneDigits/);
});


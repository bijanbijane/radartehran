import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NeighborhoodRankingStripSkeleton,
  InspectorDrawerSkeleton,
  NeighborhoodListSkeleton,
} from '../src/components/NeighborhoodLoadingSkeletons';

console.log('--- Running FE-001 Neighborhood Loading Skeletons Tests ---');

// 1. NeighborhoodRankingStripSkeleton test
const stripMarkup = renderToStaticMarkup(React.createElement(NeighborhoodRankingStripSkeleton, { itemCount: 6 }));
assert.ok(stripMarkup.includes('role="status"'), 'Strip skeleton must have role="status"');
assert.ok(stripMarkup.includes('aria-busy="true"'), 'Strip skeleton must have aria-busy="true"');
assert.ok(stripMarkup.includes('animate-pulse'), 'Strip skeleton must include pulse animation');
assert.ok(stripMarkup.includes('width:138px'), 'Strip skeleton cards must have consistent widths');

// 2. InspectorDrawerSkeleton test
const drawerMarkup = renderToStaticMarkup(React.createElement(InspectorDrawerSkeleton));
assert.ok(drawerMarkup.includes('role="status"'), 'Drawer skeleton must have role="status"');
assert.ok(drawerMarkup.includes('aria-busy="true"'), 'Drawer skeleton must have aria-busy="true"');
assert.ok(drawerMarkup.includes('در حال بارگذاری'), 'Drawer skeleton must include Persian loading text for assistive tech');
assert.ok(drawerMarkup.includes('apple-grouped-card'), 'Drawer skeleton must use apple-grouped-card styles');
assert.ok(drawerMarkup.includes('animate-pulse'), 'Drawer skeleton must have animated pulse placeholders');

// 3. NeighborhoodListSkeleton test
const listMarkup = renderToStaticMarkup(React.createElement(NeighborhoodListSkeleton, { count: 3 }));
assert.ok(listMarkup.includes('role="status"'), 'List skeleton must have role="status"');
assert.ok(listMarkup.includes('aria-busy="true"'), 'List skeleton must have aria-busy="true"');

// 4. Architecture and line count constraints checks
const skeletonsFile = path.resolve(process.cwd(), 'src/components/NeighborhoodLoadingSkeletons.tsx');
const skeletonsContent = fs.readFileSync(skeletonsFile, 'utf8');
const skeletonsLines = skeletonsContent.split('\n').length;
assert.ok(skeletonsLines < 500, `NeighborhoodLoadingSkeletons lines (${skeletonsLines}) must be < 500`);

const drawerFile = path.resolve(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx');
const drawerContent = fs.readFileSync(drawerFile, 'utf8');
const drawerLines = drawerContent.split('\n').length;
assert.ok(drawerLines < 500, `NeighborhoodInspectorDrawer lines (${drawerLines}) must be < 500`);

const rankingStripFile = path.resolve(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx');
const rankingStripContent = fs.readFileSync(rankingStripFile, 'utf8');
const rankingStripLines = rankingStripContent.split('\n').length;
assert.ok(rankingStripLines < 500, `QuickHoodRankingStrip lines (${rankingStripLines}) must be < 500`);

const appFile = path.resolve(process.cwd(), 'src/App.tsx');
const appContent = fs.readFileSync(appFile, 'utf8');
const appLines = appContent.split('\n').length;
assert.ok(appLines <= 270, `App.tsx lines (${appLines}) must be <= 270`);

// Check that drawer and ranking strip stay within the universal <=290-line ceiling and lazy-load subcomponents
assert.ok(drawerLines <= 290, `NeighborhoodInspectorDrawer lines (${drawerLines}) must be <= 290`);
assert.ok(rankingStripLines <= 290, `QuickHoodRankingStrip lines (${rankingStripLines}) must be <= 290`);
assert.ok(drawerContent.includes('React.lazy'), 'NeighborhoodInspectorDrawer must lazy-load heavy subcomponents');
assert.ok(skeletonsContent.includes('export function InspectorDrawerSkeleton'), 'NeighborhoodLoadingSkeletons must export InspectorDrawerSkeleton');
assert.ok(skeletonsContent.includes('export function NeighborhoodRankingStripSkeleton'), 'NeighborhoodLoadingSkeletons must export NeighborhoodRankingStripSkeleton');

console.log('✓ All FE-001 loading skeleton component tests passed successfully!');

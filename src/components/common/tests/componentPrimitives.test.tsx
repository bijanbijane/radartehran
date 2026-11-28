import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RadarButton } from '../RadarButton';
import { RadarCard as CommonRadarCard } from '../RadarCard';
import { RadarInputField } from '../RadarField';
import { RadarInput } from '../RadarInput';
import { DataCredibilityBadge, RadarCard as DataRadarCard } from '../RadarDataBadges';
import { RadarButton as LegacyRadarButton, RadarCard as PrimitiveRadarCard, RadarTabs, RadarSearchInput, RadarSheet } from '../../ui/RadarPrimitives';
import { RadarEmptyStateCard } from '../RadarField';
import { RadarMetricCard } from '../RadarDataBadges';

test('RT-UI-COMP-BEH-001 canonical RadarButton renders native disabled/loading and accessible-name contracts', () => {
  const html = renderToStaticMarkup(
    <RadarButton loading accessibleLabel="ذخیره گزارش">ذخیره</RadarButton>,
  );

  assert.match(html, /^<button/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="ذخیره گزارش"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /ذخیره/);
});

test('RT-UI-COMP-BEH-002 legacy RadarButton delegates danger to canonical destructive styling', () => {
  const html = renderToStaticMarkup(
    <LegacyRadarButton variant="danger" size="sm">حذف</LegacyRadarButton>,
  );

  assert.match(html, /^<button/);
  assert.match(html, /bg-\[var\(--color-danger-solid\)\]/);
  assert.match(html, /min-w-\[44px\]/);
  assert.match(html, /حذف/);
});

test('RT-UI-COMP-BEH-003 RadarInput exposes invalid state to assistive technology', () => {
  const invalid = renderToStaticMarkup(<RadarInput invalid aria-label="جست‌وجو" />);
  const valid = renderToStaticMarkup(<RadarInput aria-label="جست‌وجو" />);

  assert.match(invalid, /aria-invalid="true"/);
  assert.match(invalid, /border-\[var\(--color-danger\)\]/);
  assert.doesNotMatch(valid, /aria-invalid=/);
});

test('RT-UI-COMP-BEH-004 RadarInputField associates label, invalid input and alert description', () => {
  const html = renderToStaticMarkup(
    <RadarInputField label="قیمت" value="۱۲۵۰۰" onChangeValue={() => undefined} numeric errorText="مقدار نامعتبر است" />,
  );
  const fieldId = html.match(/<label[^>]+for="([^"]+)"/)?.[1];
  const inputId = html.match(/<input\b[^>]*\sid="([^"]+)"/)?.[1];
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];

  assert.ok(fieldId);
  assert.equal(inputId, fieldId);
  assert.match(html, /aria-invalid="true"/);
  assert.ok(describedBy);
  assert.ok(html.includes(`id="${describedBy}" role="alert"`));
});

test('RT-UI-COMP-BEH-005 distinct Card contracts retain their intended passive and interactive semantics', () => {
  const commonPassive = renderToStaticMarkup(<CommonRadarCard title="عنوان">محتوا</CommonRadarCard>);
  const commonInteractive = renderToStaticMarkup(
    <CommonRadarCard interactive onClick={() => undefined}>محتوای تعاملی</CommonRadarCard>,
  );
  const dataCard = renderToStaticMarkup(<DataRadarCard>شاخص</DataRadarCard>);
  const primitiveCard = renderToStaticMarkup(<PrimitiveRadarCard>قدیمی</PrimitiveRadarCard>);

  assert.match(commonPassive, /^<article/);
  assert.match(commonPassive, /<h3[^>]*>عنوان<\/h3>/);
  assert.match(commonInteractive, /role="button"/);
  assert.match(commonInteractive, /tabindex="0"/);
  assert.match(dataCard, /^<div/);
  assert.match(primitiveCard, /^<div/);
  assert.doesNotMatch(dataCard, /role="button"/);
  assert.doesNotMatch(primitiveCard, /role="button"/);
});

test('RT-UI-COMP-BEH-006 data credibility badges expose localized text and decorative icon hiding', () => {
  const html = renderToStaticMarkup(<DataCredibilityBadge status="verified" locale="fa" />);

  assert.match(html, /داده تأییدشده/);
  assert.match(html, /aria-hidden="true"/);
});


test('RT-UI-COMP-BEH-007 RadarTabs renders an accessible tablist and roving selected state', () => {
  const html = renderToStaticMarkup(
    <RadarTabs
      items={[{ id: 'overview', label: 'نمای کلی' }, { id: 'prices', label: 'قیمت‌ها', count: 3 }]}
      activeId="overview"
      onChange={() => undefined}
      ariaLabel="بخش‌های ملک"
    />,
  );

  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-label="بخش‌های ملک"/);
  assert.match(html, /role="tab" aria-selected="true" tabindex="0"/);
  assert.match(html, /role="tab" aria-selected="false" tabindex="-1"/);
  assert.match(html, /min-h-\[44px\]/);
});

test('RT-UI-COMP-BEH-008 RadarSearchInput provides an accessible name and conditional clear control', () => {
  const empty = renderToStaticMarkup(
    <RadarSearchInput value="" onChange={() => undefined} placeholder="جست‌وجو در محله‌ها" />,
  );
  const filled = renderToStaticMarkup(
    <RadarSearchInput value="ونک" onChange={() => undefined} placeholder="جست‌وجو" ariaLabel="جست‌وجوی محله" />,
  );

  assert.match(empty, /type="search"/);
  assert.match(empty, /aria-label="جست‌وجو در محله‌ها"/);
  assert.doesNotMatch(empty, /aria-label="پاک کردن جستجو"/);
  assert.match(filled, /aria-label="جست‌وجوی محله"/);
  assert.match(filled, /aria-label="پاک کردن جستجو"/);
});

test('RT-UI-COMP-BEH-009 RadarSheet exposes labelled modal semantics only while open', () => {
  const closed = renderToStaticMarkup(
    <RadarSheet open={false} onClose={() => undefined} title="فیلترها">محتوا</RadarSheet>,
  );
  const opened = renderToStaticMarkup(
    <RadarSheet open onClose={() => undefined} title="فیلترها">محتوای فیلتر</RadarSheet>,
  );

  assert.equal(closed, '');
  assert.match(opened, /role="dialog"/);
  assert.match(opened, /aria-modal="true"/);
  assert.match(opened, /aria-labelledby=/);
  assert.match(opened, /<h2[^>]*>فیلترها<\/h2>/);
  assert.match(opened, /aria-label="بستن"/);
});

test('RT-UI-COMP-BEH-010 empty-state and metric cards retain descriptive content and data context', () => {
  const empty = renderToStaticMarkup(
    <RadarEmptyStateCard title="نتیجه‌ای پیدا نشد" description="فیلترها را تغییر دهید">
      <span>اقدام</span>
    </RadarEmptyStateCard>,
  );
  const metric = renderToStaticMarkup(
    <RadarMetricCard title="میانگین قیمت" valueText="۱۲۵" unitText="میلیون تومان" periodAndSource="پاییز ۱۴۰۵ · منبع: نمونه" credibility="verified" />,
  );

  assert.match(empty, /نتیجه‌ای پیدا نشد/);
  assert.match(empty, /فیلترها را تغییر دهید/);
  assert.match(empty, /اقدام/);
  assert.match(metric, /میانگین قیمت/);
  assert.match(metric, /۱۲۵/);
  assert.match(metric, /میلیون تومان/);
  assert.match(metric, /پاییز ۱۴۰۵/);
  assert.match(metric, /داده تأییدشده/);
});

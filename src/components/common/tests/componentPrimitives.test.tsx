import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RadarButton } from '../RadarButton';
import { RadarCard as CommonRadarCard } from '../RadarCard';
import { RadarInputField } from '../RadarField';
import { RadarInput } from '../RadarInput';
import { DataCredibilityBadge, RadarCard as DataRadarCard } from '../RadarDataBadges';
import { RadarButton as LegacyRadarButton, RadarCard as PrimitiveRadarCard } from '../../ui/RadarPrimitives';

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
  const inputId = html.match(/<input\\b[^>]*\\sid="([^"]+)"/)?.[1];
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

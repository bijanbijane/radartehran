import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMillionTomanBudgetInput } from '../src/utils/persianFinancials';

test('parses Persian billion budgets into canonical million-Toman D1 values', () => {
  assert.equal(parseMillionTomanBudgetInput('۱۱ میلیارد تومان'), 11000);
  assert.equal(parseMillionTomanBudgetInput('۱٫۵ میلیارد تومان'), 1500);
  assert.equal(parseMillionTomanBudgetInput('۱۰ میلیارد خرید'), 10000);
});

test('parses Arabic/ASCII digits and explicit million-Toman units', () => {
  assert.equal(parseMillionTomanBudgetInput('١٢٠٠٠ میلیون تومان'), 12000);
  assert.equal(parseMillionTomanBudgetInput('12000 million Toman'), 12000);
  assert.equal(parseMillionTomanBudgetInput('1.25 billion Toman'), 1250);
});

test('rejects ambiguous, unitless, zero, negative, malformed, and out-of-range budgets', () => {
  assert.equal(parseMillionTomanBudgetInput('۱۱'), null);
  assert.equal(parseMillionTomanBudgetInput('۱۱ میلیارد یا ۱۱۰۰۰ میلیون'), null);
  assert.equal(parseMillionTomanBudgetInput('۰ میلیارد تومان'), null);
  assert.equal(parseMillionTomanBudgetInput('-۱ میلیارد تومان'), null);
  assert.equal(parseMillionTomanBudgetInput('بودجه نامشخص'), null);
  assert.equal(parseMillionTomanBudgetInput('۱۰۰۰۰۰۰۰۰ میلیارد تومان'), null);
  assert.equal(parseMillionTomanBudgetInput(''), null);
});

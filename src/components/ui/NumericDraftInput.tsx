/**
 * @file src/components/ui/NumericDraftInput.tsx
 * @description Controlled numeric input that avoids mid-keystroke clamping traps,
 * accepts Persian/Arabic/ASCII digits and decimals, syncs external updates while
 * unfocused, and clamps cleanly on blur or Enter.
 */

import React, { useEffect, useRef, useState } from 'react';
import { commitNumericDraft, parseLocalizedNumber } from '../../utils/forms/formInputHelpers';

export interface NumericDraftInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'
  > {
  value: number | null;
  onValueChange?: (next: number) => void;
  onNullableValueChange?: (next: number | null) => void;
  min: number;
  max: number;
  fallback: number;
  step?: number;
  allowDecimal?: boolean;
  nullable?: boolean;
}

function formatNumericValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value);
}

export function NumericDraftInput({
  value,
  onValueChange,
  onNullableValueChange,
  min,
  max,
  fallback,
  step = 1,
  allowDecimal = false,
  nullable = false,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: NumericDraftInputProps): React.ReactElement {
  const [draft, setDraft] = useState<string>(() => formatNumericValue(value));
  const isFocusedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(formatNumericValue(value));
    }
  }, [value]);

  const emitCommitted = (rawText: string) => {
    const committed = commitNumericDraft(rawText, {
      min,
      max,
      fallback,
      allowDecimal,
      nullable,
    });
    if (committed === null) {
      onNullableValueChange?.(null);
      setDraft('');
    } else {
      onNullableValueChange?.(committed);
      onValueChange?.(committed);
      setDraft(String(committed));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    setDraft(nextText);

    if (nextText.trim() === '') {
      if (nullable) {
        onNullableValueChange?.(null);
      }
      return;
    }

    const parsed = parseLocalizedNumber(nextText);
    if (!Number.isFinite(parsed)) return;
    if (!allowDecimal && !Number.isInteger(parsed)) return;

    if (parsed >= min && parsed <= max) {
      onNullableValueChange?.(parsed);
      onValueChange?.(parsed);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    emitCommitted(e.target.value);
    onBlur?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseLocalizedNumber(draft);
      const current = Number.isFinite(base) ? base : value ?? fallback;
      const delta = e.key === 'ArrowUp' ? step : -step;
      const nextRaw = allowDecimal
        ? Math.round((current + delta) * 1000) / 1000
        : Math.round(current + delta);
      const clamped = Math.min(max, Math.max(min, nextRaw));
      onNullableValueChange?.(clamped);
      onValueChange?.(clamped);
      setDraft(String(clamped));
    } else if (e.key === 'Enter') {
      emitCommitted(draft);
    }
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      role="spinbutton"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value !== null && Number.isFinite(value) ? value : undefined}
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

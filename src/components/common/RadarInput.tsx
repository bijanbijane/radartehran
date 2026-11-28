/** @file src/components/common/RadarInput.tsx — Low-level search/text input (composable) */
import React from 'react';
import { focusRing } from '../../design-system/classMaps';

export interface RadarInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

const HEIGHT = { sm: 'min-h-[44px] md:min-h-[36px]', md: 'min-h-[44px] md:min-h-[40px]', lg: 'min-h-[48px]' } as const;

export const RadarInput = React.forwardRef<HTMLInputElement, RadarInputProps>(function RadarInput(
  { inputSize = 'md', invalid = false, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full px-3 rounded-lg border text-sm font-medium bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] border-[var(--color-border-subtle)] disabled:opacity-50 ${HEIGHT[inputSize]} ${
        invalid ? 'border-[var(--color-danger)] ring-1 ring-[var(--color-danger)]/30' : 'focus:border-[var(--color-brand-600)]'
      } ${focusRing} ${className}`}
      {...rest}
    />
  );
});
/** @file src/components/common/RadarField.tsx — RT-UI-COMP-001 Section 4 & 14 Standardized Input & Feedback Primitives */
import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { normalizeNumericFieldDigits } from '../../design-system/componentSystem';

export interface RadarInputFieldProps {
  label: string;
  value: string;
  onChangeValue: (val: string) => void;
  numeric?: boolean;
  unitLabel?: string;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  size?: 'compact' | 'standard' | 'comfortable' | 'touch';
  disabled?: boolean;
  readOnly?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  dir?: 'rtl' | 'ltr';
}

const INPUT_HEIGHTS = {
  compact: 'min-h-[36px]',
  standard: 'min-h-[44px]',
  comfortable: 'min-h-[48px]',
  touch: 'min-h-[52px]',
} as const;

export const RadarInputField: React.FC<RadarInputFieldProps> = ({
  label,
  value,
  onChangeValue,
  numeric = false,
  unitLabel,
  required = false,
  placeholder,
  helperText,
  errorText,
  size = 'standard',
  disabled = false,
  readOnly = false,
  leadingIcon,
  trailingIcon,
  dir,
}) => {
  const fieldId = useId();
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const hasError = Boolean(errorText);

  return (
    <div className="space-y-1.5 text-start">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-[14px] font-medium text-[#182522] dark:text-slate-100 leading-[1.5]">
          {label}
        </label>
        {required && (
          <span className="text-[13px] font-semibold text-[#A61B1B] dark:text-rose-400">ضروری</span>
        )}
      </div>
      <div className="relative flex items-center">
        {leadingIcon && <span className="absolute right-3 text-[#586760] pointer-events-none">{leadingIcon}</span>}
        <input
          id={fieldId}
          type="text"
          inputMode={numeric ? 'decimal' : undefined}
          dir={dir || (numeric ? 'ltr' : undefined)}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
          placeholder={placeholder}
          onChange={(e) => onChangeValue(numeric ? normalizeNumericFieldDigits(e.target.value) : e.target.value)}
          className={`w-full ${INPUT_HEIGHTS[size]} rounded-[8px] border bg-white dark:bg-slate-900 px-3 text-[15px] text-[#182522] dark:text-slate-100 placeholder:text-[#64716B] transition-colors focus:outline-none focus:ring-2 ${
            hasError
              ? 'border-[#A61B1B] focus:border-[#A61B1B] focus:ring-[#A61B1B]/20'
              : 'border-[#C5D0CA] dark:border-slate-700 focus:border-[#176B63] focus:ring-[#2864DC]/20'
          } ${leadingIcon ? 'pr-9' : ''} ${unitLabel || trailingIcon ? 'pl-20' : ''} ${numeric ? 'tabular-nums text-left' : ''} disabled:bg-[#F1F4F2] disabled:text-[#64716B] disabled:cursor-not-allowed`}
        />
        {(unitLabel || trailingIcon) && (
          <span className="absolute left-3 flex items-center gap-1.5 text-[13px] font-medium text-[#586760] dark:text-slate-400 pointer-events-none">
            {unitLabel}
            {trailingIcon}
          </span>
        )}
      </div>
      {hasError ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-[#A61B1B] dark:text-rose-400 leading-[1.6]">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorText}</span>
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-[13px] text-[#586760] dark:text-slate-400 leading-[1.6]">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

export const RadarEmptyStateCard: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 bg-[#F6F8F6] dark:bg-slate-900/60 p-5 text-center space-y-2">
    <h4 className="text-[15px] font-semibold text-[#182522] dark:text-slate-100">{title}</h4>
    <p className="text-[14px] text-[#586760] dark:text-slate-400 leading-[1.7] max-w-md mx-auto">{description}</p>
    {action && <div className="pt-2 flex justify-center">{action}</div>}
  </div>
);

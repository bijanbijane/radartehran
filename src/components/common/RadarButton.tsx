/** @file src/components/common/RadarButton.tsx — RT-UI-COMP-001 Section 3 Standardized Button Primitive (zero domain logic) */
import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ButtonSize, ButtonVariant } from '../../design-system/componentSystem';

export interface RadarButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  accessibleLabel?: string;
  children?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#176B63] hover:bg-[#14534E] active:bg-[#103B38] text-white border border-transparent shadow-xs',
  secondary: 'bg-[#EAF3F0] hover:bg-[#DCECE6] active:bg-[#CCE3DB] text-[#103B38] dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/70 border border-[#C5D0CA] dark:border-emerald-800/70',
  tertiary: 'bg-transparent hover:bg-[#F1F4F2] active:bg-[#E9EFEC] text-[#34433E] dark:text-slate-300 dark:hover:bg-slate-800 border border-transparent',
  outline: 'bg-white dark:bg-slate-900 hover:bg-[#F6F8F6] dark:hover:bg-slate-800 text-[#182522] dark:text-slate-100 border border-[#C5D0CA] dark:border-slate-700',
  destructive: 'bg-[#A61B1B] hover:bg-[#8E1515] active:bg-[#751010] text-white border border-transparent shadow-xs',
  icon: 'bg-white dark:bg-slate-900 hover:bg-[#F1F4F2] dark:hover:bg-slate-800 text-[#34433E] dark:text-slate-200 border border-[#DCE3DF] dark:border-slate-700 aspect-square !px-0',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'min-h-[32px] px-[10px] text-[12px] rounded-[8px]',
  sm: 'min-h-[36px] px-[12px] text-[13px] rounded-[8px]',
  md: 'min-h-[40px] sm:min-h-[40px] max-sm:min-h-[44px] px-[16px] text-[14px] rounded-[8px]',
  lg: 'min-h-[48px] px-[20px] text-[15px] rounded-[8px]',
};

export const RadarButton: React.FC<RadarButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  accessibleLabel,
  type = 'button',
  className = '',
  children,
  onClick,
  ...rest
}) => {
  const isBlocked = disabled || loading;
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isBlocked) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      type={type}
      disabled={isBlocked}
      aria-busy={loading || undefined}
      aria-label={accessibleLabel || rest['aria-label']}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 font-semibold leading-[1.4] transition-colors cursor-pointer select-none touch-manipulation focus-visible:outline-2 focus-visible:outline-[#2864DC] focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" /> : leadingIcon}
      {children != null && <span className="truncate">{children}</span>}
      {!loading && trailingIcon}
    </button>
  );
};

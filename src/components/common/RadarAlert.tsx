/** @file src/components/common/RadarAlert.tsx — RT-UI-COMP-001 Alert / banner primitive */
import React from 'react';
import { semanticAlert } from '../../design-system/classMaps';

export type RadarAlertTone = keyof typeof semanticAlert;

export interface RadarAlertProps {
  tone?: RadarAlertTone;
  title?: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}

export const RadarAlert: React.FC<RadarAlertProps> = ({
  tone = 'warning',
  title,
  children,
  testId,
  className = '',
}) => (
  <div
    role="alert"
    data-testid={testId}
    className={`rounded-xl px-3 py-2 text-xs font-bold leading-relaxed ${semanticAlert[tone]} ${className}`}
  >
    {title ? <div className="mb-0.5 text-xs font-bold">{title}</div> : null}
    {children}
  </div>
);
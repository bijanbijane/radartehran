/** @file src/components/common/RadarBadge.tsx — Unified Badge primitive delegating to RadarPrimitives (F-08) */
export { RadarBadge, type RadarBadgeTone } from '../ui/RadarPrimitives';

export interface RadarBadgeProps {
  tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}
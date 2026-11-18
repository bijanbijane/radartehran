/**
 * @file src/platform/authorization/guards/FeatureAccessGuard.tsx
 * @description Capability + Feature Flag guard for Stage 25 access control.
 */

import React from 'react';
import type { CapabilityId } from '../core/Capability';
import { evaluateCapability } from '../catalog/capabilityRegistry';
import { useAccessController } from '../context/AccessContextProvider';

export interface FeatureAccessGuardProps {
  capability: CapabilityId;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const FeatureAccessGuard: React.FC<FeatureAccessGuardProps> = ({
  capability,
  fallback = null,
  children,
}) => {
  const { context } = useAccessController();
  const enabled = evaluateCapability(capability, context);
  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
};

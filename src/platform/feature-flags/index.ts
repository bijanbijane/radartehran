/** @file src/platform/feature-flags/index.ts — Platform Feature Flags Facade */
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '../../utils/security';

export { DEFAULT_FEATURE_FLAGS, type FeatureFlags };

export function isFeatureFlagEnabled(flags: FeatureFlags, key: keyof FeatureFlags): boolean {
  return Boolean(flags[key]);
}

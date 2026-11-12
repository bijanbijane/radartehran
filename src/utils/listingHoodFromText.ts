import { INITIAL_NEIGHBORHOODS } from '../data/neighborhoods';
import { compactPersianSearchKey } from './persianSearchAndPersonalWorkspace';

export function detectHoodNameFromListingText(text: string): string | undefined {
  const compact = compactPersianSearchKey(text);
  if (!compact) return undefined;
  const sorted = [...INITIAL_NEIGHBORHOODS].sort((a, b) => b.name.length - a.name.length);
  for (const h of sorted) {
    const hoodKey = compactPersianSearchKey(h.name);
    if (hoodKey.length >= 3 && compact.includes(hoodKey)) return h.name;
  }
  return undefined;
}

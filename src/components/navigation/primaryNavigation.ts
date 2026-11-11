import {
  Compass,
  Home,
  Map as MapIcon,
  Shield,
  TrendingUp,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  getRadarGlobalNavCopy,
  type PrimaryViewId,
  type RadarGlobalNavCopy,
} from '../../utils/areaUnit';

export type NavigationGroup = 'primary' | 'administrative';
type NavigationLabelKey = Exclude<keyof RadarGlobalNavCopy, 'searchPlaceholder'>;

export interface ProductNavigationItem {
  id: PrimaryViewId;
  label: string;
  Icon: LucideIcon;
  group: NavigationGroup;
  priority: number;
  protected: boolean;
}

const NAVIGATION_CONFIG: ReadonlyArray<{
  id: PrimaryViewId;
  labelKey: NavigationLabelKey;
  Icon: LucideIcon;
  group: NavigationGroup;
  priority: number;
  protected: boolean;
}> = [
  { id: 'map', labelKey: 'map', Icon: MapIcon, group: 'primary', priority: 10, protected: false },
  { id: 'discover', labelKey: 'discover', Icon: Compass, group: 'primary', priority: 20, protected: false },
  { id: 'intelligence', labelKey: 'intelligence', Icon: TrendingUp, group: 'primary', priority: 30, protected: false },
  { id: 'tools', labelKey: 'tools', Icon: Wrench, group: 'primary', priority: 40, protected: false },
  { id: 'home', labelKey: 'home', Icon: Home, group: 'primary', priority: 50, protected: false },
  { id: 'userspace', labelKey: 'userspace', Icon: User, group: 'primary', priority: 60, protected: false },
  { id: 'admin', labelKey: 'admin', Icon: Shield, group: 'administrative', priority: 100, protected: true },
];

export function getProductNavigationItems(
  locale: Parameters<typeof getRadarGlobalNavCopy>[0]
): ProductNavigationItem[] {
  const copy = getRadarGlobalNavCopy(locale);
  return [...NAVIGATION_CONFIG]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => ({ ...item, label: copy[item.labelKey] }));
}
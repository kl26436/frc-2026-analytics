import { useLocation } from 'react-router-dom';
import {
  BarChart3, Users, Swords, ClipboardList, Calendar, GitBranch, Sparkles,
  ClipboardCheck, AlertTriangle, Handshake, LineChart,
} from 'lucide-react';

export type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  external?: boolean;
};

export type NavGroup = {
  groupLabel: string;
  items: NavItem[];
};

// Top-level header links — the 4 most-used pages get direct, single-click access.
export const TOP_LEVEL: NavItem[] = [
  { to: '/',         icon: BarChart3,    label: 'Dashboard' },
  { to: '/teams',    icon: Users,        label: 'Teams' },
  { to: '/predict',  icon: Swords,       label: 'Predict' },
  { to: '/picklist', icon: ClipboardList, label: 'Picklist' },
];

// "More" dropdown — everything else, grouped semantically.
// Match Replay is intentionally absent: deep-link from MatchSchedule's
// per-match action button rather than from a hardcoded /replay/1 entry.
export const MORE_GROUPS: NavGroup[] = [
  {
    groupLabel: 'Match Strategy',
    items: [
      { to: '/schedule', icon: Calendar, label: 'Match Prep' },
    ],
  },
  {
    groupLabel: 'Analysis',
    items: [
      { to: '/event',                  icon: Calendar,  label: 'Event' },
      { to: '/bracket',                icon: GitBranch, label: 'Playoff Bracket' },
      { to: '/pit-analysis',           icon: BarChart3, label: 'Pit Analysis' },
      { to: '/insights',               icon: Sparkles,  label: 'AI Insights' },
      { to: '/performance-comparison', icon: LineChart, label: 'Pre-Scout vs Live' },
    ],
  },
  {
    groupLabel: 'Scouting',
    items: [
      { to: '/pit-scouting',       icon: ClipboardCheck, label: 'Ninja Scouting' },
      { to: '/alliance-selection', icon: Handshake,      label: 'Alliance Selection' },
      { to: '/data-quality',       icon: AlertTriangle,  label: 'Data Quality' },
    ],
  },
  {
    groupLabel: 'External',
    items: [
      { to: 'https://robowranglers148.dev', icon: BarChart3, label: 'Grafana', external: true },
    ],
  },
];

const ALL_MORE_ITEMS = MORE_GROUPS.flatMap(g => g.items).filter(i => !i.external);

export interface NavStructure {
  topLevel: NavItem[];
  moreGroups: NavGroup[];
  isItemActive: (path: string) => boolean;
  isMoreActive: boolean;
}

export function useNavStructure(): NavStructure {
  const location = useLocation();

  const isItemActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isMoreActive = ALL_MORE_ITEMS.some(i => isItemActive(i.to));

  return { topLevel: TOP_LEVEL, moreGroups: MORE_GROUPS, isItemActive, isMoreActive };
}

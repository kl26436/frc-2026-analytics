import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Users, ClipboardList, Menu, X, Calendar, Swords, Handshake, ClipboardCheck, ChevronDown, Search, Target, Shield, LogOut, AlertTriangle, LineChart, PlayCircle, FlaskConical, Sparkles, ExternalLink, GitBranch } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useAuth } from '../contexts/AuthContext';
import ActiveSessionBanner from './ActiveSessionBanner';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

type NavItem = { to: string; icon: React.ElementType; label: string; external?: boolean };
type NavGroup = { groupLabel: string; items: NavItem[] };

interface NavDropdownProps {
  label: string;
  icon: React.ElementType;
  items?: NavItem[];
  groups?: NavGroup[];
  isActive: boolean;
}

function NavDropdownItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const { to, icon: ItemIcon, label: itemLabel, external } = item;
  if (external) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-interactive transition-colors"
      >
        <ItemIcon size={18} />
        <span>{itemLabel}</span>
        <ExternalLink size={14} className="ml-auto text-textMuted" />
      </a>
    );
  }
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-interactive transition-colors"
    >
      <ItemIcon size={18} />
      <span>{itemLabel}</span>
    </Link>
  );
}

function NavDropdown({ label, icon: Icon, items, groups, isActive }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded-lg transition-colors text-sm xl:text-base ${
          isActive ? 'bg-surfaceElevated text-textPrimary font-semibold' : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated'
        }`}
      >
        <Icon size={20} />
        <span>{label}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50">
          {items && items.map((item) => (
            <NavDropdownItem key={item.to} item={item} onClose={close} />
          ))}
          {groups && groups.map((group, i) => (
            <div key={group.groupLabel}>
              {i > 0 && <div className="border-t border-border my-1" />}
              <p className="px-4 py-1.5 text-xs font-semibold text-textMuted uppercase tracking-wider">{group.groupLabel}</p>
              {group.items.map((item) => (
                <NavDropdownItem key={item.to} item={item} onClose={close} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Navigation structure
const dashboardItems: NavItem[] = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/bracket', icon: GitBranch, label: 'Playoff Bracket' },
];

const analysisItems: NavItem[] = [
  { to: '/teams', icon: Users, label: 'Teams' },
  { to: '/event', icon: Calendar, label: 'Event' },
  { to: '/replay/1', icon: PlayCircle, label: 'Match Replay' },
  { to: '/pit-analysis', icon: BarChart3, label: 'Pit Analysis' },
];

const scoutingItems: NavItem[] = [
  { to: '/pit-scouting', icon: ClipboardCheck, label: 'Ninja Scouting' },
  { to: 'https://robowranglers148.dev', icon: BarChart3, label: 'Grafana', external: true },
  { to: '/data-quality', icon: AlertTriangle, label: 'Data Quality' },
];

const strategyGroups: NavGroup[] = [
  {
    groupLabel: 'Match Strategy',
    items: [
      { to: '/schedule', icon: Calendar, label: 'Match Prep' },
      { to: '/predict', icon: Swords, label: 'Predict' },
    ],
  },
  {
    groupLabel: 'Alliance Strategy',
    items: [
      { to: '/picklist', icon: ClipboardList, label: 'Pick List' },
      { to: '/alliance-selection', icon: Handshake, label: 'Alliance Selection' },
    ],
  },
  {
    groupLabel: 'AI',
    items: [
      { to: '/insights', icon: Sparkles, label: 'AI Insights' },
    ],
  },
];

// Flat list for active-state detection
const allStrategyItems = strategyGroups.flatMap(g => g.items);

function UserDropdown() {
  const { user, signOut, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative pl-3 border-l border-border ml-2" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-border transition-all"
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-surfaceElevated flex items-center justify-center text-sm font-bold">
            {user?.displayName?.charAt(0) || user?.email?.charAt(0) || '?'}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-surface border border-border rounded-lg shadow-lg py-2 min-w-[200px] z-50">
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm font-medium text-textPrimary truncate">
              {user?.displayName || 'User'}
            </p>
            <p className="text-xs text-textMuted truncate">{user?.email}</p>
          </div>
          {isAdmin && (
            <>
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-interactive transition-colors"
              >
                <Shield size={16} />
                Admin Settings
              </Link>
              <Link
                to="/calibration"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-interactive transition-colors"
              >
                <FlaskConical size={16} />
                Fuel Calibration
              </Link>
            </>
          )}
          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function AppLayout() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const triggerSync = useAnalyticsStore(state => state.triggerSync);
  const { user, isAdmin, signOut, eventConfig } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Auto-sync TBA + scouting DB every 5 minutes when enabled (shared toggle via Firestore)
  useEffect(() => {
    if (!eventConfig?.autoSyncEnabled) return;
    const id = setInterval(() => {
      fetchTBAData();
      if (eventCode) triggerSync(eventCode).catch(() => {});
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [eventConfig?.autoSyncEnabled, fetchTBAData, triggerSync, eventCode]);

  const isDashboardActive = location.pathname === '/' || location.pathname === '/bracket';
  const isScoutingActive = scoutingItems.filter(item => !item.external).some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  const isAnalysisActive = analysisItems.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  const isStrategyActive = allStrategyItems.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));


  const mobileNavLinkClass = (path: string) =>
    `flex items-center gap-3 px-4 py-3 rounded transition-colors ${
      location.pathname === path || location.pathname.startsWith(path + '/')
        ? 'bg-success/20 text-success'
        : 'hover:bg-interactive'
    }`;

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-3 md:gap-4">
              <img src={`${import.meta.env.BASE_URL}team-logo.png`} alt="Team 148 Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain" />
              <div>
                <h1 className="text-lg md:text-2xl font-bold">Team 148 - Data Wrangler</h1>
                <p className="text-textSecondary text-xs md:text-sm">REBUILT 2026 • {eventCode}</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex gap-2 xl:gap-3 items-center border-l border-border pl-3 ml-3">
              <NavDropdown label="Dashboard" icon={BarChart3} items={dashboardItems} isActive={isDashboardActive} />

              <NavDropdown label="Scouting" icon={Search} items={scoutingItems} isActive={isScoutingActive} />

              <NavDropdown label="Analysis" icon={LineChart} items={analysisItems} isActive={isAnalysisActive} />

              <NavDropdown label="Strategy" icon={Target} groups={strategyGroups} isActive={isStrategyActive} />

              <UserDropdown />
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded hover:bg-interactive transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="lg:hidden mt-4 pt-4 border-t border-border space-y-1 max-h-[calc(100vh-5rem)] overflow-y-auto">
              {dashboardItems.map(({ to, icon: Icon, label }) => (
                <Link key={to} to={to} onClick={closeMobileMenu} className={mobileNavLinkClass(to)}>
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              ))}

              <div className="pt-2">
                <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">Scouting</p>
                {scoutingItems.map(({ to, icon: Icon, label, external }) =>
                  external ? (
                    <a key={to} href={to} target="_blank" rel="noopener noreferrer" onClick={closeMobileMenu} className={mobileNavLinkClass(to)}>
                      <Icon size={20} />
                      <span>{label}</span>
                      <ExternalLink size={14} className="ml-auto text-textMuted" />
                    </a>
                  ) : (
                    <Link key={to} to={to} onClick={closeMobileMenu} className={mobileNavLinkClass(to)}>
                      <Icon size={20} />
                      <span>{label}</span>
                    </Link>
                  )
                )}
              </div>

              <div className="pt-2">
                <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">Analysis</p>
                {analysisItems.map(({ to, icon: Icon, label }) => (
                  <Link key={to} to={to} onClick={closeMobileMenu} className={mobileNavLinkClass(to)}>
                    <Icon size={20} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>

              <div className="pt-2">
                <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">Strategy</p>
                {strategyGroups.map((group) => (
                  <div key={group.groupLabel} className="pt-1">
                    <p className="px-4 py-1 text-xs text-textMuted tracking-wide">{group.groupLabel}</p>
                    {group.items.map(({ to, icon: Icon, label }) => (
                      <Link key={to} to={to} onClick={closeMobileMenu} className={mobileNavLinkClass(to)}>
                        <Icon size={20} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>

              {/* User info + sign out */}
              <div className="pt-4 mt-2 border-t border-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  {user?.photoURL && (
                    <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <span className="flex-1 text-sm text-textSecondary truncate">{user?.email}</span>
                  {isAdmin && (
                    <>
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-interactive rounded transition-colors text-sm"
                      >
                        <Shield size={16} />
                        Admin
                      </Link>
                      <Link
                        to="/calibration"
                        onClick={closeMobileMenu}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-interactive rounded transition-colors text-sm"
                      >
                        <FlaskConical size={16} />
                        Calibrate
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => { closeMobileMenu(); signOut(); }}
                    className="flex items-center gap-2 px-3 py-2 text-danger hover:bg-danger/10 rounded transition-colors text-sm"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        <ActiveSessionBanner />
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;

import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Users, ClipboardList, Menu, X, Calendar, Swords, Handshake, ClipboardCheck, ChevronDown, Search, Target, Shield, LogOut } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useAuth } from '../contexts/AuthContext';
import ActiveSessionBanner from './ActiveSessionBanner';

interface NavDropdownProps {
  label: string;
  icon: React.ElementType;
  items: { to: string; icon: React.ElementType; label: string }[];
  isActive: boolean;
}

function NavDropdown({ label, icon: Icon, items, isActive }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded transition-colors text-sm xl:text-base ${
          isActive ? 'bg-success/20 text-success' : 'bg-surfaceElevated hover:bg-interactive'
        }`}
      >
        <Icon size={20} />
        <span>{label}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50">
          {items.map(({ to, icon: ItemIcon, label: itemLabel }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-interactive transition-colors"
            >
              <ItemIcon size={18} />
              <span>{itemLabel}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Navigation structure
const scoutingItems = [
  { to: '/teams', icon: Users, label: 'Teams' },
  { to: '/pit-scouting', icon: ClipboardCheck, label: 'Pit Scout' },
];

const strategyItems = [
  { to: '/picklist', icon: ClipboardList, label: 'Pick List' },
  { to: '/predict', icon: Swords, label: 'Predict' },
  { to: '/alliance-selection', icon: Handshake, label: 'Alliance' },
];

function AppLayout() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const { user, isAdmin, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Check if current path is in a group
  const isScoutingActive = scoutingItems.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
  const isStrategyActive = strategyItems.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'));

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
            <nav className="hidden lg:flex gap-2 xl:gap-3">
              {/* Dashboard - standalone */}
              <Link
                to="/"
                className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded transition-colors text-sm xl:text-base ${
                  location.pathname === '/' ? 'bg-success/20 text-success' : 'bg-surfaceElevated hover:bg-interactive'
                }`}
              >
                <BarChart3 size={20} />
                <span>Dashboard</span>
              </Link>

              {/* Scouting dropdown */}
              <NavDropdown
                label="Scouting"
                icon={Search}
                items={scoutingItems}
                isActive={isScoutingActive}
              />

              {/* Strategy dropdown */}
              <NavDropdown
                label="Strategy"
                icon={Target}
                items={strategyItems}
                isActive={isStrategyActive}
              />

              {/* Event - standalone */}
              <Link
                to="/event"
                className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded transition-colors text-sm xl:text-base ${
                  location.pathname === '/event' ? 'bg-success/20 text-success' : 'bg-surfaceElevated hover:bg-interactive'
                }`}
              >
                <Calendar size={20} />
                <span>Event</span>
              </Link>

              {/* Admin link (admins only) */}
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`flex items-center gap-2 px-3 xl:px-4 py-2 rounded transition-colors text-sm xl:text-base ${
                    location.pathname === '/admin' ? 'bg-success/20 text-success' : 'bg-surfaceElevated hover:bg-interactive'
                  }`}
                >
                  <Shield size={20} />
                  <span>Admin</span>
                </Link>
              )}

              {/* User + Sign out */}
              <div className="flex items-center gap-2 pl-2 border-l border-border ml-1">
                {user?.photoURL && (
                  <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full" />
                )}
                <span className="text-xs text-textSecondary max-w-[100px] truncate">{user?.email}</span>
                <button
                  onClick={signOut}
                  className="p-2 rounded hover:bg-interactive text-textMuted hover:text-danger transition-colors"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
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

          {/* Mobile Navigation - flat list with section headers */}
          {mobileMenuOpen && (
            <nav className="lg:hidden mt-4 pt-4 border-t border-border space-y-1">
              {/* Dashboard */}
              <Link
                to="/"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                  location.pathname === '/' ? 'bg-success/20 text-success' : 'bg-surfaceElevated hover:bg-interactive'
                }`}
              >
                <BarChart3 size={20} />
                <span>Dashboard</span>
              </Link>

              {/* Scouting section */}
              <div className="pt-2">
                <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">Scouting</p>
                {scoutingItems.map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={closeMobileMenu}
                    className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                      location.pathname === to ? 'bg-success/20 text-success' : 'hover:bg-interactive'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>

              {/* Strategy section */}
              <div className="pt-2">
                <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">Strategy</p>
                {strategyItems.map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={closeMobileMenu}
                    className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                      location.pathname === to || location.pathname.startsWith(to + '/') ? 'bg-success/20 text-success' : 'hover:bg-interactive'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>

              {/* Event */}
              <div className="pt-2">
                <Link
                  to="/event"
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                    location.pathname === '/event' ? 'bg-success/20 text-success' : 'hover:bg-interactive'
                  }`}
                >
                  <Calendar size={20} />
                  <span>Event Setup</span>
                </Link>
              </div>

              {/* Admin (admins only) */}
              {isAdmin && (
                <div className="pt-2">
                  <Link
                    to="/admin"
                    onClick={closeMobileMenu}
                    className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                      location.pathname === '/admin' ? 'bg-success/20 text-success' : 'hover:bg-interactive'
                    }`}
                  >
                    <Shield size={20} />
                    <span>Admin</span>
                  </Link>
                </div>
              )}

              {/* User info + sign out */}
              <div className="pt-4 mt-2 border-t border-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  {user?.photoURL && (
                    <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <span className="flex-1 text-sm text-textSecondary truncate">{user?.email}</span>
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

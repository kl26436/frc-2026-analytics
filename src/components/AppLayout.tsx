import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Menu, X, ChevronDown, Shield, LogOut, FlaskConical, ExternalLink, MoreHorizontal,
} from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { useEventNamesStore } from '../store/useEventNamesStore';
import { useAuth } from '../contexts/AuthContext';
import ActiveSessionBanner from './ActiveSessionBanner';
import CommandPalette from './CommandPalette';
import { matchLabel, matchSortKey } from '../utils/formatting';
import { useNavStructure, type NavItem, type NavGroup } from '../hooks/useNavStructure';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Shared link styles — single source of truth for nav active state.
// Mobile and desktop both use the same green-tinted active treatment so
// the visual language is consistent regardless of viewport.
function navLinkClass(active: boolean): string {
  return [
    'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm',
    active
      ? 'bg-success/20 text-success font-semibold'
      : 'text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated',
  ].join(' ');
}

function dropdownItemClass(active: boolean): string {
  return [
    'flex items-center gap-3 px-4 py-2.5 transition-colors',
    active ? 'bg-success/20 text-success font-semibold' : 'hover:bg-interactive',
  ].join(' ');
}

function mobileNavLinkClass(active: boolean): string {
  return [
    'flex items-center gap-3 px-4 py-3 rounded transition-colors',
    active ? 'bg-success/20 text-success font-semibold' : 'hover:bg-interactive',
  ].join(' ');
}

// ── Top-level link ────────────────────────────────────────────────────────────

function TopLevelLink({ item, isActive, onClose }: { item: NavItem; isActive: boolean; onClose?: () => void }) {
  const { to, icon: Icon, label } = item;
  return (
    <Link to={to} onClick={onClose} className={navLinkClass(isActive)}>
      <Icon size={20} />
      <span>{label}</span>
    </Link>
  );
}

// ── More dropdown (desktop) ───────────────────────────────────────────────────

interface MoreDropdownProps {
  groups: NavGroup[];
  isActive: boolean;
  isItemActive: (path: string) => boolean;
}

function MoreDropdown({ groups, isActive, isItemActive }: MoreDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className={navLinkClass(isActive)}>
        <MoreHorizontal size={20} />
        <span>More</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[220px] z-50">
          {groups.map((group, gi) => (
            <div key={group.groupLabel}>
              {gi > 0 && <div className="border-t border-border my-1" />}
              <p className="px-4 py-1.5 text-xs font-semibold text-textMuted uppercase tracking-wider">
                {group.groupLabel}
              </p>
              {group.items.map(item => {
                const Icon = item.icon;
                if (item.external) {
                  return (
                    <a
                      key={item.to}
                      href={item.to}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={close}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-interactive transition-colors"
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                      <ExternalLink size={14} className="ml-auto text-textMuted" />
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={close}
                    className={dropdownItemClass(isItemActive(item.to))}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User dropdown ─────────────────────────────────────────────────────────────

function UserDropdown() {
  const { user, signOut, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
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

// ── App layout ────────────────────────────────────────────────────────────────

function AppLayout() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const triggerSync = useAnalyticsStore(state => state.triggerSync);
  const { user, isAdmin, signOut, eventConfig } = useAuth();
  const subscribeToWatchlist = useWatchlistStore(s => s.subscribeToWatchlist);
  const unsubscribeFromWatchlist = useWatchlistStore(s => s.unsubscribeFromWatchlist);
  const setEventName = useEventNamesStore(s => s.setName);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Sync the watchlist across devices for the same user.
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    subscribeToWatchlist();
    return () => unsubscribeFromWatchlist();
  }, [user, subscribeToWatchlist, unsubscribeFromWatchlist]);

  // Seed the event-names cache with the active event so EventName lookups
  // don't need to round-trip to TBA for it.
  useEffect(() => {
    const ev = tbaData?.event;
    if (ev?.key && ev?.name) setEventName(ev.key, ev.name);
  }, [tbaData?.event, setEventName]);

  const { topLevel, moreGroups, isItemActive, isMoreActive } = useNavStructure();

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

  // Close mobile menu on route change so users don't see stale open menu
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Current match at the event (first upcoming match overall)
  const currentMatchLabel = (() => {
    if (!tbaData?.matches) return null;
    const upcoming = tbaData.matches
      .filter(m => m.alliances.red.score < 0)
      .sort((a, b) => matchSortKey(a) - matchSortKey(b));
    return upcoming.length ? matchLabel(upcoming[0]) : null;
  })();

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <img src={`${import.meta.env.BASE_URL}team-logo.png`} alt="Team 148 Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg md:text-2xl font-bold whitespace-nowrap">Team 148 - Data Wrangler</h1>
                  {currentMatchLabel && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 text-success text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Now · {currentMatchLabel}
                    </span>
                  )}
                </div>
                <p className="text-textSecondary text-xs md:text-sm truncate">
                  2026 • {tbaData?.event?.name ?? eventCode}
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex gap-1 xl:gap-2 items-center">
              {topLevel.map(item => (
                <TopLevelLink key={item.to} item={item} isActive={isItemActive(item.to)} />
              ))}
              <MoreDropdown groups={moreGroups} isActive={isMoreActive} isItemActive={isItemActive} />
              <UserDropdown />
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded hover:bg-interactive transition-colors flex-shrink-0"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <nav className="lg:hidden mt-4 pt-4 border-t border-border space-y-1 max-h-[calc(100vh-5rem)] overflow-y-auto">
              {/* Top-level (mirrors desktop top-level links) */}
              {topLevel.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeMobileMenu}
                    className={mobileNavLinkClass(isItemActive(item.to))}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* "More" groups expanded (mobile has the room — no need for a sub-dropdown) */}
              {moreGroups.map(group => (
                <div key={group.groupLabel} className="pt-3">
                  <p className="px-4 py-1 text-xs font-semibold text-textMuted uppercase tracking-wider">
                    {group.groupLabel}
                  </p>
                  {group.items.map(item => {
                    const Icon = item.icon;
                    if (item.external) {
                      return (
                        <a
                          key={item.to}
                          href={item.to}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={closeMobileMenu}
                          className={mobileNavLinkClass(false)}
                        >
                          <Icon size={20} />
                          <span>{item.label}</span>
                          <ExternalLink size={14} className="ml-auto text-textMuted" />
                        </a>
                      );
                    }
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={closeMobileMenu}
                        className={mobileNavLinkClass(isItemActive(item.to))}
                      >
                        <Icon size={20} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}

              {/* User info + admin shortcuts + sign out */}
              <div className="pt-4 mt-2 border-t border-border">
                <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
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

      <CommandPalette />
    </div>
  );
}

export default AppLayout;

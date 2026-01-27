import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { BarChart3, Users, ClipboardList, Menu, X, Calendar, Swords, Handshake } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import ActiveSessionBanner from './ActiveSessionBanner';

const navLinks = [
  { to: '/', icon: BarChart3, label: 'Dashboard' },
  { to: '/teams', icon: Users, label: 'Teams' },
  { to: '/picklist', icon: ClipboardList, label: 'Pick List' },
  { to: '/predict', icon: Swords, label: 'Predict' },
  { to: '/alliance-selection', icon: Handshake, label: 'Alliance' },
  { to: '/event', icon: Calendar, label: 'Event' },
];

function AppLayout() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
            <nav className="hidden lg:flex gap-2 xl:gap-4">
              {navLinks.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 px-3 xl:px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors text-sm xl:text-base"
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              ))}
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
            <nav className="lg:hidden mt-4 pt-4 border-t border-border space-y-2">
              {navLinks.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMobileMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              ))}
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

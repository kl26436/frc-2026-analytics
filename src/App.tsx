import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BarChart3, Users, GitCompare, ClipboardList, Settings, Sliders, Menu, X } from 'lucide-react';
import { useAnalyticsStore } from './store/useAnalyticsStore';
import TeamList from './pages/TeamList';
import TeamComparison from './pages/TeamComparison';
import Dashboard from './pages/Dashboard';
import TeamDetail from './pages/TeamDetail';
import PickList from './pages/PickList';
import TBASettings from './pages/TBASettings';
import MetricsSettings from './pages/MetricsSettings';

function App() {
  const loadMockData = useAnalyticsStore(state => state.loadMockData);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load mock data on mount
  useEffect(() => {
    loadMockData();
  }, [loadMockData]);

  const navLinks = [
    { to: '/', icon: BarChart3, label: 'Dashboard' },
    { to: '/teams', icon: Users, label: 'Teams' },
    { to: '/compare', icon: GitCompare, label: 'Compare' },
    { to: '/picklist', icon: ClipboardList, label: 'Pick List' },
    { to: '/settings', icon: Settings, label: 'TBA' },
    { to: '/metrics', icon: Sliders, label: 'Metrics' },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <Router>
      <div className="min-h-screen bg-background text-textPrimary">
        {/* Header */}
        <header className="bg-surface border-b border-border sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo and Title */}
              <div className="flex items-center gap-3 md:gap-4">
                <img src={`${import.meta.env.BASE_URL}team-logo.png`} alt="Team 148 Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain" />
                <div>
                  <h1 className="text-lg md:text-2xl font-bold">Team 148 Analytics</h1>
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/teams" element={<TeamList />} />
            <Route path="/teams/:teamNumber" element={<TeamDetail />} />
            <Route path="/compare" element={<TeamComparison />} />
            <Route path="/picklist" element={<PickList />} />
            <Route path="/settings" element={<TBASettings />} />
            <Route path="/metrics" element={<MetricsSettings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { BarChart3, Users, GitCompare, ClipboardList, Settings, Sliders } from 'lucide-react';
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

  // Load mock data on mount
  useEffect(() => {
    loadMockData();
  }, [loadMockData]);

  return (
    <Router>
      <div className="min-h-screen bg-background text-textPrimary">
        {/* Header */}
        <header className="bg-surface border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src="/team-logo.png" alt="Team 148 Logo" className="h-12 w-12 object-contain" />
                <div>
                  <h1 className="text-2xl font-bold">Team 148 Analytics</h1>
                  <p className="text-textSecondary text-sm">REBUILT 2026 • {eventCode}</p>
                </div>
              </div>
              <nav className="flex gap-4">
                <Link
                  to="/"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <BarChart3 size={20} />
                  <span>Dashboard</span>
                </Link>
                <Link
                  to="/teams"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <Users size={20} />
                  <span>Teams</span>
                </Link>
                <Link
                  to="/compare"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <GitCompare size={20} />
                  <span>Compare</span>
                </Link>
                <Link
                  to="/picklist"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <ClipboardList size={20} />
                  <span>Pick List</span>
                </Link>
                <Link
                  to="/settings"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <Settings size={20} />
                  <span>TBA</span>
                </Link>
                <Link
                  to="/metrics"
                  className="flex items-center gap-2 px-4 py-2 rounded bg-surfaceElevated hover:bg-interactive transition-colors"
                >
                  <Sliders size={20} />
                  <span>Metrics</span>
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
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

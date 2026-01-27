import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAnalyticsStore } from './store/useAnalyticsStore';
import AppLayout from './components/AppLayout';
import TeamList from './pages/TeamList';
import TeamComparison from './pages/TeamComparison';
import Dashboard from './pages/Dashboard';
import TeamDetail from './pages/TeamDetail';
import PickList from './pages/PickList';
import MetricsSettings from './pages/MetricsSettings';
import EventSetup from './pages/EventSetup';
import AlliancePredictor from './pages/AlliancePredictor';
import AllianceSelection from './pages/AllianceSelection';
import AllianceSelectionJoin from './pages/AllianceSelectionJoin';

function App() {
  const loadMockData = useAnalyticsStore(state => state.loadMockData);

  // Load event data on mount
  useEffect(() => {
    loadMockData().catch(error => {
      console.error('Failed to load mock data:', error);
    });
  }, [loadMockData]);

  return (
    <Router basename="/frc-2026-analytics">
      <Routes>
        {/* Guest route — standalone page, no nav shell */}
        <Route path="/alliance-selection/join/:sessionCode" element={<AllianceSelectionJoin />} />

        {/* All other routes — wrapped in nav shell */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/teams" element={<TeamList />} />
          <Route path="/teams/:teamNumber" element={<TeamDetail />} />
          <Route path="/compare" element={<TeamComparison />} />
          <Route path="/picklist" element={<PickList />} />
          <Route path="/predict" element={<AlliancePredictor />} />
          <Route path="/alliance-selection" element={<AllianceSelection />} />
          <Route path="/alliance-selection/:sessionCode" element={<AllianceSelection />} />
          <Route path="/event" element={<EventSetup />} />
          <Route path="/metrics" element={<MetricsSettings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAnalyticsStore } from './store/useAnalyticsStore';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
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
import PitScouting from './pages/PitScouting';
import AdminSettings from './pages/AdminSettings';

function AppContent() {
  const loadMockData = useAnalyticsStore(state => state.loadMockData);

  // Load event data on mount
  useEffect(() => {
    loadMockData().catch(error => {
      console.error('Failed to load mock data:', error);
    });
  }, [loadMockData]);

  return (
    <Routes>
      {/* Guest route — standalone page, no nav shell, no auth required */}
      <Route path="/alliance-selection/join/:sessionCode" element={<AllianceSelectionJoin />} />

      {/* All other routes — protected + wrapped in nav shell */}
      <Route element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/teams" element={<TeamList />} />
        <Route path="/teams/:teamNumber" element={<TeamDetail />} />
        <Route path="/compare" element={<TeamComparison />} />
        <Route path="/picklist" element={<PickList />} />
        <Route path="/predict" element={<AlliancePredictor />} />
        <Route path="/alliance-selection" element={<AllianceSelection />} />
        <Route path="/alliance-selection/:sessionCode" element={<AllianceSelection />} />
        <Route path="/pit-scouting" element={<PitScouting />} />
        <Route path="/event" element={<EventSetup />} />
        <Route path="/metrics" element={<MetricsSettings />} />
        <Route path="/admin" element={<AdminSettings />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <Router basename="/frc-2026-analytics">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;

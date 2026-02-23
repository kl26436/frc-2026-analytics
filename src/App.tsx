import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAnalyticsStore } from './store/useAnalyticsStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
  const setEventCode = useAnalyticsStore(state => state.setEventCode);
  const setHomeTeamNumber = useAnalyticsStore(state => state.setHomeTeamNumber);
  const subscribeToRealData = useAnalyticsStore(state => state.subscribeToRealData);
  const unsubscribeFromRealData = useAnalyticsStore(state => state.unsubscribeFromRealData);
  const storeEventCode = useAnalyticsStore(state => state.eventCode);
  const { eventConfig, user } = useAuth();

  // Sync admin-configured event settings to local store for all users
  useEffect(() => {
    if (eventConfig) {
      setEventCode(eventConfig.eventCode);
      setHomeTeamNumber(eventConfig.homeTeamNumber);
    }
  }, [eventConfig, setEventCode, setHomeTeamNumber]);

  // Subscribe to real Firestore data — only after auth, use eventConfig with store fallback
  const activeEventCode = eventConfig?.eventCode || storeEventCode;
  useEffect(() => {
    if (user && activeEventCode) {
      subscribeToRealData(activeEventCode);
    }
    return () => {
      unsubscribeFromRealData();
    };
  }, [user, activeEventCode, subscribeToRealData, unsubscribeFromRealData]);

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

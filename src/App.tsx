import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAnalyticsStore } from './store/useAnalyticsStore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import TeamList from './pages/TeamList';
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
import DataQuality from './pages/DataQuality';
import MatchReplay from './pages/MatchReplay';

import FuelCalibration from './pages/FuelCalibration';
import AIInsights from './pages/AIInsights';
import RobotPictures from './pages/RobotPictures';
import PitAnalysis from './pages/PitAnalysis';
import MatchSchedule from './pages/MatchSchedule';

function AppContent() {
  const setEventCode = useAnalyticsStore(state => state.setEventCode);
  const setHomeTeamNumber = useAnalyticsStore(state => state.setHomeTeamNumber);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const subscribeToData = useAnalyticsStore(state => state.subscribeToData);
  const unsubscribeFromData = useAnalyticsStore(state => state.unsubscribeFromData);
  const storeEventCode = useAnalyticsStore(state => state.eventCode);
  const { eventConfig, user } = useAuth();

  // Sync admin-configured event settings to local store for all users
  // and immediately fetch TBA data for the correct event code.
  // This prevents a dead-end where the Dashboard's initial fetch gets
  // discarded by the stale guard and nothing re-triggers for the real event.
  useEffect(() => {
    if (eventConfig) {
      setEventCode(eventConfig.eventCode);
      setHomeTeamNumber(eventConfig.homeTeamNumber);
      fetchTBAData(eventConfig.eventCode);
    }
  }, [eventConfig, setEventCode, setHomeTeamNumber, fetchTBAData]);

  // Subscribe to real Firestore data — use eventConfig with store fallback.
  // tbaData is not persisted so stale cache is not a concern; the stale-fetch
  // guard in fetchTBAData discards results if the event code changes mid-flight.
  const activeEventCode = eventConfig?.eventCode || storeEventCode;
  useEffect(() => {
    if (user && activeEventCode) {
      subscribeToData(activeEventCode);
    }
    return () => {
      unsubscribeFromData();
    };
  }, [user, activeEventCode, subscribeToData, unsubscribeFromData]);

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
        <Route path="/picklist" element={<PickList />} />
        <Route path="/predict" element={<AlliancePredictor />} />
        <Route path="/alliance-selection" element={<AllianceSelection />} />
        <Route path="/alliance-selection/:sessionCode" element={<AllianceSelection />} />
        <Route path="/pit-scouting" element={<PitScouting />} />
        <Route path="/pit-analysis" element={<PitAnalysis />} />
        <Route path="/data-quality" element={<DataQuality />} />
        <Route path="/replay/:matchNumber" element={<MatchReplay />} />
        <Route path="/event" element={<EventSetup />} />
        <Route path="/metrics" element={<MetricsSettings />} />
        <Route path="/schedule" element={<MatchSchedule />} />
        <Route path="/ninja" element={<Navigate to="/pit-scouting" replace />} />
        <Route path="/ninja/:teamNumber" element={<Navigate to="/pit-scouting" replace />} />
        <Route path="/admin" element={<AdminSettings />} />
        <Route path="/calibration" element={<FuelCalibration />} />
        <Route path="/insights" element={<AIInsights />} />
        <Route path="/robot-pictures" element={<RobotPictures />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;

import { useState, useEffect, useRef } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import {
  Settings,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader,
  RefreshCw,
  Trophy,
  Users,
  Calendar,
  Clock
} from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

function EventSetup() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const setEventCode = useAnalyticsStore(state => state.setEventCode);
  const loadMockData = useAnalyticsStore(state => state.loadMockData);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const tbaLoading = useAnalyticsStore(state => state.tbaLoading);
  const tbaError = useAnalyticsStore(state => state.tbaError);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const autoRefreshEnabled = useAnalyticsStore(state => state.autoRefreshEnabled);
  const setAutoRefresh = useAnalyticsStore(state => state.setAutoRefresh);

  const clearPickList = usePickListStore(state => state.clearPickList);
  const initializePickList = usePickListStore(state => state.initializePickList);
  const importFromTBARankings = usePickListStore(state => state.importFromTBARankings);

  const [inputEventCode, setInputEventCode] = useState(eventCode);
  const [isInitializing, setIsInitializing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshEnabled && eventCode) {
      // Initial fetch if no data
      if (!tbaData) {
        fetchTBAData();
      }

      // Set up interval
      refreshIntervalRef.current = setInterval(() => {
        fetchTBAData();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    }
  }, [autoRefreshEnabled, eventCode, fetchTBAData, tbaData]);

  const handleCheckEvent = async () => {
    if (!inputEventCode) {
      setStatus({ type: 'error', message: 'Please enter an event code' });
      return;
    }

    setStatus({ type: null, message: '' });
    const data = await fetchTBAData(inputEventCode);

    if (data && data.event) {
      setStatus({
        type: 'success',
        message: `Found event: ${data.event.name}`,
      });
    } else if (data) {
      setStatus({
        type: 'success',
        message: `Found ${data.teams.length} teams and ${data.matches.length} matches`,
      });
    }
  };

  const handleInitializeEvent = async () => {
    if (!inputEventCode || !tbaData) {
      setStatus({ type: 'error', message: 'Please check event first' });
      return;
    }

    setIsInitializing(true);
    setStatus({ type: null, message: '' });

    try {
      // Step 1: Clear pick list
      clearPickList();

      // Step 2: Update event code
      setEventCode(inputEventCode);

      // Step 3: Initialize new pick list
      initializePickList(inputEventCode);

      // Step 4: Import rankings if available
      let rankingsMessage = '';
      if (tbaData.rankings && tbaData.rankings.rankings.length > 0) {
        importFromTBARankings(tbaData.rankings);
        const top12Count = Math.min(12, tbaData.rankings.rankings.length);
        const remainingCount = Math.max(0, tbaData.rankings.rankings.length - 12);
        rankingsMessage = ` ${top12Count} teams imported to "Potatoes", ${remainingCount} to "Chicken Nuggets".`;
      }

      // Step 5: Load mock data
      await loadMockData();

      setStatus({
        type: 'success',
        message: `Event ${inputEventCode} initialized!${rankingsMessage}`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleResetPickList = () => {
    if (confirm('Are you sure you want to clear the entire pick list? This cannot be undone.')) {
      clearPickList();
      initializePickList(eventCode);

      // Re-import TBA rankings if available
      let message = 'Pick list cleared and reinitialized';
      if (tbaData?.rankings && tbaData.rankings.rankings.length > 0) {
        importFromTBARankings(tbaData.rankings);
        const top12Count = Math.min(12, tbaData.rankings.rankings.length);
        const remainingCount = Math.max(0, tbaData.rankings.rankings.length - 12);
        message += `. ${top12Count} teams imported to tier 2, ${remainingCount} to tier 3 (by event rank).`;
      }

      setStatus({ type: 'success', message });
    }
  };

  const handleRefresh = () => {
    fetchTBAData();
  };

  const formatLastUpdated = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Sort matches by time for display
  const sortedMatches = tbaData?.matches?.slice().sort((a, b) => {
    // Sort by comp_level first (qm, ef, qf, sf, f)
    const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
    if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
      return levelOrder[a.comp_level] - levelOrder[b.comp_level];
    }
    // Then by match number
    return a.match_number - b.match_number;
  }) || [];

  const qualMatches = sortedMatches.filter(m => m.comp_level === 'qm');
  const playoffMatches = sortedMatches.filter(m => m.comp_level !== 'qm');
  const completedMatches = sortedMatches.filter(m => m.alliances.red.score >= 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Event Setup</h1>
        <p className="text-textSecondary mt-2">
          Load event data from The Blue Alliance and manage your pick list
        </p>
      </div>

      {/* Current Event Info */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Settings size={24} className="text-blueAlliance" />
            <h2 className="text-xl font-bold">Current Event</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={tbaLoading}
              className="flex items-center gap-2 px-3 py-2 bg-surfaceElevated hover:bg-interactive rounded-lg transition-colors text-sm"
              title="Refresh TBA Data"
            >
              <RefreshCw size={16} className={tbaLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <label className="flex items-center gap-2 px-3 py-2 bg-surfaceElevated rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Auto (10 min)</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Event Code</p>
            <p className="text-xl font-bold">{eventCode}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Teams</p>
            <p className="text-xl font-bold">{tbaData?.teams?.length || 0}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Matches</p>
            <p className="text-xl font-bold">{tbaData?.matches?.length || 0}</p>
          </div>
          <div className="bg-surfaceElevated p-4 rounded-lg">
            <p className="text-xs text-textSecondary">Last Updated</p>
            <p className="text-lg font-bold flex items-center gap-1">
              <Clock size={14} />
              {formatLastUpdated(tbaData?.lastUpdated || null)}
            </p>
          </div>
        </div>

        {tbaData?.event && (
          <div className="mt-4 p-4 bg-surfaceElevated rounded-lg">
            <p className="font-bold text-lg">{tbaData.event.name}</p>
            <p className="text-sm text-textSecondary">
              {tbaData.event.city}, {tbaData.event.state_prov} • {tbaData.event.start_date} to {tbaData.event.end_date}
            </p>
          </div>
        )}

        {tbaError && (
          <div className="mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {tbaError}
          </div>
        )}
      </div>

      {/* Rankings Section */}
      {tbaData?.rankings && tbaData.rankings.rankings.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Trophy size={24} className="text-warning" />
            <h2 className="text-xl font-bold">Rankings</h2>
            <span className="text-sm text-textSecondary">({tbaData.rankings.rankings.length} teams)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2">Rank</th>
                  <th className="text-left py-2 px-2">Team</th>
                  <th className="text-center py-2 px-2">RP</th>
                  <th className="text-center py-2 px-2">W-L-T</th>
                  <th className="text-center py-2 px-2">Played</th>
                </tr>
              </thead>
              <tbody>
                {tbaData.rankings.rankings.slice(0, 20).map(r => {
                  const team = tbaData.teams.find(t => t.key === r.team_key);
                  return (
                    <tr key={r.team_key} className="border-b border-border/50 hover:bg-surfaceElevated">
                      <td className="py-2 px-2 font-bold">{r.rank}</td>
                      <td className="py-2 px-2">
                        <span className="font-semibold">{teamKeyToNumber(r.team_key)}</span>
                        {team?.nickname && (
                          <span className="text-textSecondary ml-2">{team.nickname}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold text-warning">{r.extra_stats?.[0] ?? '-'}</td>
                      <td className="py-2 px-2 text-center">{r.record.wins}-{r.record.losses}-{r.record.ties}</td>
                      <td className="py-2 px-2 text-center">{r.matches_played}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tbaData.rankings.rankings.length > 20 && (
              <p className="text-xs text-textMuted mt-2 text-center">
                Showing top 20 of {tbaData.rankings.rankings.length} teams
              </p>
            )}
          </div>
        </div>
      )}

      {/* Alliance Selection */}
      {tbaData?.alliances && tbaData.alliances.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Users size={24} className="text-success" />
            <h2 className="text-xl font-bold">Alliance Selection</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {tbaData.alliances.map((alliance, idx) => (
              <div key={idx} className="bg-surfaceElevated p-3 rounded-lg">
                <p className="font-bold text-sm mb-2">Alliance {idx + 1}</p>
                <div className="space-y-1">
                  {alliance.picks.map((teamKey, pickIdx) => (
                    <div
                      key={teamKey}
                      className={`text-sm ${pickIdx === 0 ? 'font-bold text-warning' : ''}`}
                    >
                      {pickIdx === 0 ? '★ ' : ''}{teamKeyToNumber(teamKey)}
                    </div>
                  ))}
                </div>
                {alliance.status && (
                  <p className="text-xs text-textSecondary mt-2">
                    {alliance.status.record.wins}-{alliance.status.record.losses}-{alliance.status.record.ties}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match Schedule Summary */}
      {tbaData?.matches && tbaData.matches.length > 0 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Calendar size={24} className="text-blueAlliance" />
            <h2 className="text-xl font-bold">Match Schedule</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Qual Matches</p>
              <p className="text-xl font-bold">{qualMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Playoff Matches</p>
              <p className="text-xl font-bold">{playoffMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Completed</p>
              <p className="text-xl font-bold">{completedMatches.length}</p>
            </div>
            <div className="bg-surfaceElevated p-3 rounded-lg">
              <p className="text-xs text-textSecondary">Remaining</p>
              <p className="text-xl font-bold">{sortedMatches.length - completedMatches.length}</p>
            </div>
          </div>

          {/* Recent/Upcoming Matches */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-textSecondary">Recent/Upcoming Qual Matches</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2">Match</th>
                    <th className="text-center py-2 px-2 text-redAlliance">Red Alliance</th>
                    <th className="text-center py-2 px-2">Score</th>
                    <th className="text-center py-2 px-2 text-blueAlliance">Blue Alliance</th>
                  </tr>
                </thead>
                <tbody>
                  {qualMatches.slice(-10).map(match => (
                    <tr key={match.key} className="border-b border-border/50 hover:bg-surfaceElevated">
                      <td className="py-2 px-2 font-bold">Q{match.match_number}</td>
                      <td className="py-2 px-2 text-center text-redAlliance">
                        {match.alliances.red.team_keys.map(k => teamKeyToNumber(k)).join(', ')}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {match.alliances.red.score >= 0 ? (
                          <span>
                            <span className={match.alliances.red.score > match.alliances.blue.score ? 'text-success font-bold' : ''}>
                              {match.alliances.red.score}
                            </span>
                            {' - '}
                            <span className={match.alliances.blue.score > match.alliances.red.score ? 'text-success font-bold' : ''}>
                              {match.alliances.blue.score}
                            </span>
                          </span>
                        ) : (
                          <span className="text-textMuted">--</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-blueAlliance">
                        {match.alliances.blue.team_keys.map(k => teamKeyToNumber(k)).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Load New Event */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Load New Event</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-textSecondary mb-2">
              Event Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputEventCode}
                onChange={e => setInputEventCode(e.target.value.toLowerCase())}
                placeholder="e.g., 2025txcmp1"
                className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-textPrimary focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button
                onClick={handleCheckEvent}
                disabled={tbaLoading}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-colors ${
                  tbaLoading
                    ? 'bg-textMuted text-background cursor-not-allowed'
                    : 'bg-blueAlliance text-white hover:bg-blueAlliance/90'
                }`}
              >
                {tbaLoading ? <Loader size={20} className="animate-spin" /> : <Download size={20} />}
                Check
              </button>
            </div>
            <p className="text-xs text-textMuted mt-2">
              Format: [year][region][event]. Find events on{' '}
              <a
                href="https://www.thebluealliance.com/events"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blueAlliance hover:underline"
              >
                TBA Events Page
              </a>
            </p>
          </div>

          {/* Initialize Button */}
          {tbaData && inputEventCode !== eventCode && (
            <div className="p-4 bg-surfaceElevated rounded-lg border border-success/50">
              <button
                onClick={handleInitializeEvent}
                disabled={isInitializing}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                  isInitializing
                    ? 'bg-textMuted text-background cursor-not-allowed'
                    : 'bg-success text-background hover:bg-success/90'
                }`}
              >
                {isInitializing ? <Loader size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                Initialize Event & Reset Pick List
              </button>
              <p className="text-xs text-textMuted mt-2 text-center">
                This will clear your current pick list and import teams from TBA rankings
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {status.type && (
        <div
          className={`p-4 rounded-lg border flex items-start gap-3 ${
            status.type === 'success'
              ? 'bg-success/10 border-success text-success'
              : 'bg-danger/10 border-danger text-danger'
          }`}
        >
          {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p className="flex-1">{status.message}</p>
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-danger/5 p-6 rounded-lg border border-danger">
        <div className="flex items-center gap-3 mb-4">
          <Trash2 size={24} className="text-danger" />
          <h2 className="text-xl font-bold text-danger">Danger Zone</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Reset Pick List</p>
            <p className="text-sm text-textSecondary">
              Clear all teams from your pick list
            </p>
          </div>
          <button
            onClick={handleResetPickList}
            className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors font-semibold"
          >
            Clear Pick List
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventSetup;

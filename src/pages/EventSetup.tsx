import { useState } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';
import { getEventTeams, getEventMatches, getEventRankings } from '../utils/tbaApi';
import { Settings, Download, Trash2, CheckCircle, AlertCircle, Loader } from 'lucide-react';

function EventSetup() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const setEventCode = useAnalyticsStore(state => state.setEventCode);
  const loadMockData = useAnalyticsStore(state => state.loadMockData);
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);
  const clearPickList = usePickListStore(state => state.clearPickList);
  const initializePickList = usePickListStore(state => state.initializePickList);
  const importFromTBARankings = usePickListStore(state => state.importFromTBARankings);

  const [inputEventCode, setInputEventCode] = useState(eventCode);
  const [isLoading, setIsLoading] = useState(false);
  const [eventInfo, setEventInfo] = useState<{
    teamCount: number;
    matchCount: number;
    hasRankings: boolean;
  } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  const handleCheckEvent = async () => {
    if (!inputEventCode) {
      setStatus({ type: 'error', message: 'Please enter an event code' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: null, message: '' });
    setEventInfo(null);

    try {
      const [teams, matches, rankings] = await Promise.all([
        getEventTeams(inputEventCode, tbaApiKey),
        getEventMatches(inputEventCode, tbaApiKey),
        getEventRankings(inputEventCode, tbaApiKey).catch(() => null),
      ]);

      setEventInfo({
        teamCount: teams.length,
        matchCount: matches.length,
        hasRankings: rankings !== null && rankings.rankings.length > 0,
      });

      setStatus({
        type: 'success',
        message: `Found ${teams.length} teams and ${matches.length} matches for ${inputEventCode}`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: `Failed to load event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializeEvent = async () => {
    if (!inputEventCode || !eventInfo) {
      setStatus({ type: 'error', message: 'Please check event first' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: null, message: '' });

    try {
      // Step 1: Clear pick list
      clearPickList();

      // Step 2: Update event code
      setEventCode(inputEventCode);

      // Step 3: Initialize new pick list
      initializePickList(inputEventCode);

      // Step 4: Import rankings if available (BEFORE loading mock data)
      let rankingsMessage = '';
      if (eventInfo.hasRankings) {
        try {
          const rankings = await getEventRankings(inputEventCode, tbaApiKey);
          importFromTBARankings(rankings);
          rankingsMessage = ` Top ${Math.min(12, rankings.rankings.length)} teams imported to "Potatoes" tier by ranking.`;
        } catch (error) {
          console.error('Failed to import rankings:', error);
          rankingsMessage = ' Rankings import failed - you can import manually from TBA Settings.';
        }
      }

      // Step 5: Clear mock data cache and reload (after rankings imported)
      await loadMockData();

      setStatus({
        type: 'success',
        message: `Event ${inputEventCode} initialized successfully! Pick list cleared and data loaded.${rankingsMessage}`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: `Failed to initialize event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPickList = () => {
    if (confirm('Are you sure you want to clear the entire pick list? This cannot be undone.')) {
      clearPickList();
      initializePickList(eventCode);
      setStatus({ type: 'success', message: 'Pick list cleared and reinitialized' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Event Setup</h1>
        <p className="text-textSecondary mt-2">
          Configure your event, load data from The Blue Alliance, and manage your pick list
        </p>
      </div>

      {/* Current Event Info */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <div className="flex items-center gap-3 mb-4">
          <Settings size={24} className="text-blueAlliance" />
          <h2 className="text-xl font-bold">Current Event</h2>
        </div>
        <div className="bg-surfaceElevated p-4 rounded-lg">
          <p className="text-sm text-textSecondary">Event Code</p>
          <p className="text-2xl font-bold">{eventCode}</p>
        </div>
      </div>

      {/* Event Configuration */}
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
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-colors ${
                  isLoading
                    ? 'bg-textMuted text-background cursor-not-allowed'
                    : 'bg-blueAlliance text-white hover:bg-blueAlliance/90'
                }`}
              >
                {isLoading ? <Loader size={20} className="animate-spin" /> : <Download size={20} />}
                Check Event
              </button>
            </div>
            <p className="text-xs text-textMuted mt-2">
              Format: [year][region][event code]. Find event keys on{' '}
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

          {/* Event Info Display */}
          {eventInfo && (
            <div className="bg-surfaceElevated p-4 rounded-lg border border-success/50">
              <h3 className="font-bold mb-3 text-success">Event Found!</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-textSecondary">Teams</p>
                  <p className="text-xl font-bold">{eventInfo.teamCount}</p>
                </div>
                <div>
                  <p className="text-xs text-textSecondary">Matches</p>
                  <p className="text-xl font-bold">{eventInfo.matchCount}</p>
                </div>
                <div>
                  <p className="text-xs text-textSecondary">Rankings</p>
                  <p className="text-xl font-bold">{eventInfo.hasRankings ? 'Yes' : 'No'}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={handleInitializeEvent}
                  disabled={isLoading}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                    isLoading
                      ? 'bg-textMuted text-background cursor-not-allowed'
                      : 'bg-success text-background hover:bg-success/90'
                  }`}
                >
                  {isLoading ? <Loader size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                  Initialize Event & Reset Pick List
                </button>
                <p className="text-xs text-textMuted mt-2 text-center">
                  This will clear your current pick list and load data for this event
                </p>
              </div>
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Reset Pick List</p>
              <p className="text-sm text-textSecondary">
                Clear all teams from your pick list. This does not change the event.
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

      {/* Instructions */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">How to Use</h2>
        <div className="space-y-3 text-sm text-textSecondary">
          <p>
            <strong className="text-textPrimary">1. Enter Event Code:</strong> Type the event code from The Blue Alliance (e.g., 2025txcmp1)
          </p>
          <p>
            <strong className="text-textPrimary">2. Check Event:</strong> Click "Check Event" to verify the event exists and see how many teams/matches are available
          </p>
          <p>
            <strong className="text-textPrimary">3. Initialize Event:</strong> Click "Initialize Event" to:
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>Clear your current pick list</li>
              <li>Set the new event as active</li>
              <li>Load all teams and match data from TBA</li>
              <li>Generate mock scouting data for the new event</li>
              <li>Automatically import top 12 teams by ranking (if rankings available)</li>
            </ul>
          </p>
          <p>
            <strong className="text-textPrimary">4. Customize Pick List:</strong> Teams are ordered by TBA ranking in the "Potatoes" tier. Move teams to "Steak" or "Chicken Nuggets" as needed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default EventSetup;

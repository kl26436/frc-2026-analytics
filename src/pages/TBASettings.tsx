import { useState } from 'react';
import { usePickListStore } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { getEventRankings, getEventTeams } from '../utils/tbaApi';
import { Save, Download, AlertCircle, CheckCircle } from 'lucide-react';

function TBASettings() {
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);
  const setTBAApiKey = usePickListStore(state => state.setTBAApiKey);
  const importFromTBARankings = usePickListStore(state => state.importFromTBARankings);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const setEventCode = useAnalyticsStore(state => state.setEventCode);

  const [apiKey, setApiKey] = useState(tbaApiKey);
  const [event, setEvent] = useState(eventCode);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveApiKey = () => {
    setTBAApiKey(apiKey);
    setStatus({ type: 'success', message: 'API key saved successfully!' });
  };

  const handleLoadRankings = async () => {
    if (!apiKey) {
      setStatus({ type: 'error', message: 'Please enter a TBA API key first' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: null, message: '' });

    try {
      // Update the event code in analytics store
      setEventCode(event);

      // Fetch rankings from TBA
      const rankings = await getEventRankings(event);

      // Import top 12 into pick list
      importFromTBARankings(rankings);

      setStatus({
        type: 'success',
        message: `Successfully loaded ${rankings.rankings.length} teams from TBA. Top 12 added to "Potatoes" tier.`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: `Failed to load rankings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">The Blue Alliance Integration</h1>
        <p className="text-textSecondary mt-2">
          Configure your TBA API key and import event data
        </p>
      </div>

      {/* API Key Section */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">API Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-textSecondary mb-2">
              TBA API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter your TBA API key"
                className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-textPrimary focus:outline-none focus:ring-2 focus:ring-white"
              />
              <button
                onClick={handleSaveApiKey}
                className="flex items-center gap-2 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
              >
                <Save size={20} />
                Save
              </button>
            </div>
            <p className="text-xs text-textMuted mt-2">
              Get your API key from{' '}
              <a
                href="https://www.thebluealliance.com/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blueAlliance hover:underline"
              >
                thebluealliance.com/account
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-2">
              Event Key
            </label>
            <input
              type="text"
              value={event}
              onChange={e => setEvent(e.target.value)}
              placeholder="e.g., 2026txgre"
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-textPrimary focus:outline-none focus:ring-2 focus:ring-white"
            />
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
        </div>
      </div>

      {/* Load Data Section */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Import Event Data</h2>
        <div className="space-y-4">
          <button
            onClick={handleLoadRankings}
            disabled={isLoading || !apiKey}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
              isLoading || !apiKey
                ? 'bg-textMuted text-background cursor-not-allowed'
                : 'bg-blueAlliance text-white hover:bg-blueAlliance/90'
            }`}
          >
            <Download size={20} />
            {isLoading ? 'Loading...' : 'Load Rankings from TBA'}
          </button>

          <p className="text-sm text-textSecondary">
            This will fetch the current event rankings and automatically add the top 12 teams to
            your "Potatoes" tier in the pick list.
          </p>
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

      {/* Info Section */}
      <div className="bg-surface p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">How it Works</h2>
        <div className="space-y-3 text-sm text-textSecondary">
          <p>
            <strong className="text-textPrimary">1. Get your API key:</strong> Visit The Blue
            Alliance website and sign in to get your Read API Key
          </p>
          <p>
            <strong className="text-textPrimary">2. Find your event:</strong> Look up your event on
            TBA and copy the event key from the URL (e.g., "2026txgre" for 2026 Greater Houston)
          </p>
          <p>
            <strong className="text-textPrimary">3. Load rankings:</strong> Click the button above
            to automatically import team rankings into your pick list
          </p>
          <p>
            <strong className="text-textPrimary">4. Customize:</strong> Teams will be added to
            "Potatoes" tier - move them to "Steak" or "Chicken Nuggets" as needed
          </p>
        </div>
      </div>

      {/* Future Features */}
      <div className="bg-surfaceElevated p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4">Coming Soon</h2>
        <ul className="space-y-2 text-sm text-textMuted">
          <li>• Match schedule import</li>
          <li>• Match video links</li>
          <li>• Team photos and descriptions</li>
          <li>• OPR/DPR/CCWM stats</li>
          <li>• Historical performance data</li>
        </ul>
      </div>
    </div>
  );
}

export default TBASettings;

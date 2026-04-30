import { useState } from 'react';
import { Settings, Database, Hash, Loader, Play, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { EventConfig } from '../../contexts/AuthContext';
import { useAnalyticsStore } from '../../store/useAnalyticsStore';
import { usePickListStore } from '../../store/usePickListStore';

export default function SyncTab() {
  const { eventConfig, setEventConfig } = useAuth();
  const fetchTBAData = useAnalyticsStore(s => s.fetchTBAData);
  const tbaLoading = useAnalyticsStore(s => s.tbaLoading);
  const triggerSync = useAnalyticsStore(s => s.triggerSync);
  const syncMeta = useAnalyticsStore(s => s.syncMeta);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const pgTbaMatches = useAnalyticsStore(s => s.pgTbaMatches);
  const clearPickList = usePickListStore(s => s.clearPickList);
  const initializePickList = usePickListStore(s => s.initializePickList);
  const importFromTBARankings = usePickListStore(s => s.importFromTBARankings);

  const [eventCodeInput, setEventCodeInput] = useState(eventConfig?.eventCode ?? '');
  const [homeTeamInput, setHomeTeamInput] = useState(String(eventConfig?.homeTeamNumber ?? 148));
  const [eventSaving, setEventSaving] = useState(false);
  const [eventStatusMsg, setEventStatusMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleSaveEventConfig = async () => {
    const code = eventCodeInput.trim().toLowerCase();
    const teamNum = parseInt(homeTeamInput);
    if (!code) { flash('Event code cannot be empty.'); return; }
    if (isNaN(teamNum) || teamNum <= 0) { flash('Home team number must be a positive number.'); return; }

    setEventSaving(true);
    setEventStatusMsg('Saving event config…');

    const config: EventConfig = { eventCode: code, homeTeamNumber: teamNum };
    await setEventConfig(config);

    setEventStatusMsg('Fetching TBA data…');
    const tbaData = await fetchTBAData(code);

    setEventStatusMsg('Resetting pick list…');
    clearPickList();
    initializePickList(code);
    if (tbaData?.rankings && tbaData.rankings.rankings.length > 0) {
      importFromTBARankings(tbaData.rankings);
    }

    setEventSaving(false);
    setEventStatusMsg(null);
    const rankCount = tbaData?.teams?.length ?? 0;
    flash(`Event set to ${code} · ${rankCount} teams loaded · Pick list reset · All users synced.`);
  };

  const handleSyncNow = async () => {
    const code = eventConfig?.eventCode;
    if (!code) { flash('Set an event code first.'); return; }
    setSyncing(true);
    setSyncError(null);
    try {
      const [result] = await Promise.all([
        triggerSync(code),
        fetchTBAData(code),
      ]);
      flash(`Synced ${result.scoutEntriesCount} entries, ${result.tbaMatchesCount} matches in ${(result.syncDurationMs / 1000).toFixed(1)}s`);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!eventConfig) return;
    const newVal = !eventConfig.autoSyncEnabled;
    await setEventConfig({ ...eventConfig, autoSyncEnabled: newVal });
    flash(newVal ? 'Auto-sync enabled (every 5 min)' : 'Auto-sync disabled');
  };

  return (
    <div className="space-y-6">
      {/* Last action indicator */}
      {syncMeta?.lastSyncAt && (
        <div className="text-xs text-textMuted">
          Last sync: {new Date(syncMeta.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {syncMeta.lastSyncBy && <> by <span className="text-textSecondary">{syncMeta.lastSyncBy.split('@')[0]}</span></>}
          {syncMeta.syncDurationMs != null && <> · {(syncMeta.syncDurationMs / 1000).toFixed(1)}s</>}
        </div>
      )}

      {status && (
        <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
          {status}
        </div>
      )}

      {/* Event Configuration */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Settings size={20} />
          Event Configuration
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Setting a new event here immediately updates all connected users.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1">Event Code</label>
            <input
              type="text"
              value={eventCodeInput}
              onChange={e => setEventCodeInput(e.target.value.toLowerCase())}
              placeholder="e.g. 2026txcmp1"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-sm"
            />
            <p className="text-xs text-textMuted mt-1">
              Find codes on{' '}
              <a href="https://www.thebluealliance.com/events" target="_blank" rel="noopener noreferrer" className="text-blueAlliance hover:underline">
                TBA Events
              </a>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1 flex items-center gap-1">
              <Hash size={14} />
              Home Team Number
            </label>
            <input
              type="number"
              value={homeTeamInput}
              onChange={e => setHomeTeamInput(e.target.value)}
              placeholder="148"
              min={1}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-sm"
            />
            <p className="text-xs text-textMuted mt-1">Highlights your team in match lists and predictions</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleSaveEventConfig}
            disabled={eventSaving}
            className="flex items-center gap-2 px-5 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm disabled:opacity-60"
          >
            {eventSaving ? <Loader size={16} className="animate-spin" /> : <Settings size={16} />}
            {eventSaving ? (eventStatusMsg ?? 'Working…') : 'Save Event & Initialize'}
          </button>
          {eventConfig && (
            <span className="text-xs text-textMuted">
              Current: <span className="text-textSecondary font-medium">{eventConfig.eventCode}</span>
              {' · '}Team <span className="text-textSecondary font-medium">{eventConfig.homeTeamNumber}</span>
              {eventConfig.updatedBy && (
                <> · by <span className="text-textSecondary">{eventConfig.updatedBy.split('@')[0]}</span></>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Data Sync */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Database size={20} />
          Data Sync
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Syncs scouting data from Postgres and TBA match results, rankings, and alliance selections.
          Auto-sync runs every 5 minutes for all users when enabled.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Scout Entries</p>
            <p className="text-xl font-bold">{scoutEntries.length}</p>
            {syncMeta && <p className="text-xs text-textMuted">{syncMeta.scoutEntriesCount} synced</p>}
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Teams</p>
            <p className="text-xl font-bold">{teamStatistics.length}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">TBA Matches</p>
            <p className="text-xl font-bold">{pgTbaMatches.length}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Last Sync</p>
            <p className="text-sm font-semibold">
              {syncMeta?.lastSyncAt
                ? new Date(syncMeta.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Never'}
            </p>
            {syncMeta?.syncDurationMs != null && (
              <p className="text-xs text-textMuted">{(syncMeta.syncDurationMs / 1000).toFixed(1)}s · {syncMeta.lastSyncBy}</p>
            )}
          </div>
        </div>

        {(syncMeta?.error || syncError) && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {syncError || `Last sync error: ${syncMeta?.error}`}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleSyncNow}
            disabled={syncing || tbaLoading || !eventConfig?.eventCode}
            className="flex items-center gap-2 px-5 py-2 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>

          <button
            onClick={handleToggleAutoSync}
            className="flex items-center gap-2 text-sm text-textSecondary hover:text-textPrimary transition-colors"
          >
            {eventConfig?.autoSyncEnabled ? (
              <ToggleRight size={24} className="text-success" />
            ) : (
              <ToggleLeft size={24} className="text-textMuted" />
            )}
            Auto-sync {eventConfig?.autoSyncEnabled ? 'on (5 min)' : 'off'}
          </button>
        </div>

        {scoutEntries.length === 0 && !syncing && (
          <div className="flex items-center gap-2 p-3 mt-4 bg-warning/10 rounded-lg border border-warning/30 text-sm text-warning">
            <RefreshCw size={14} />
            No scout data loaded — click Sync Now to pull from Postgres
          </div>
        )}
      </div>
    </div>
  );
}

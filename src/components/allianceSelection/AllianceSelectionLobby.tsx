import { useState } from 'react';
import { Plus, Loader2, AlertCircle, Radio, XCircle, Handshake } from 'lucide-react';
import { usePickListStore } from '../../store/usePickListStore';
import { useAnalyticsStore } from '../../store/useAnalyticsStore';
import { useAllianceSelectionStore } from '../../store/useAllianceSelectionStore';
import type { LiveSession } from '../../contexts/AuthContext';

interface AllianceSelectionLobbyProps {
  onCreateSession: (eventKey: string, displayName: string, teamNumber?: number) => Promise<void>;
  onJoinSession: (sessionCode: string, displayName: string, teamNumber?: number) => Promise<void>;
  onClearLiveSession?: () => Promise<void>;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  userDisplayName?: string;
  liveSession: LiveSession | null;
}

function AllianceSelectionLobby({ onCreateSession, onJoinSession, onClearLiveSession, loading, error, isAdmin, userDisplayName, liveSession }: AllianceSelectionLobbyProps) {
  const pickList = usePickListStore(state => state.pickList);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);
  const setLastDisplayName = useAllianceSelectionStore(state => state.setLastDisplayName);
  const setLastTeamNumber = useAllianceSelectionStore(state => state.setLastTeamNumber);

  const defaultName = userDisplayName || '';
  const [createName, setCreateName] = useState(defaultName);
  const [createTeamNum, setCreateTeamNum] = useState('148');

  const tier1Count = pickList?.teams.filter(t => t.tier === 'tier1').length ?? 0;
  const tier2Count = pickList?.teams.filter(t => t.tier === 'tier2').length ?? 0;
  const tier3Count = pickList?.teams.filter(t => t.tier === 'tier3').length ?? 0;
  const rankedCount = tier1Count + tier2Count + tier3Count;
  const totalEventTeams = teamStatistics.length;
  const unrankedCount = totalEventTeams - rankedCount;

  const hasActiveSession = !!activeSessionId;

  const parseTeamNum = (val: string): number | undefined => {
    const num = parseInt(val.trim(), 10);
    return num && !isNaN(num) ? num : undefined;
  };

  const handleCreate = async () => {
    if (!createName.trim() || !eventCode) return;
    setLastDisplayName(createName.trim());
    if (createTeamNum.trim()) setLastTeamNumber(createTeamNum.trim());
    await onCreateSession(eventCode, createName.trim(), parseTeamNum(createTeamNum));
  };

  const handleJoinLive = async () => {
    if (!liveSession || !defaultName) return;
    setLastDisplayName(defaultName);
    setLastTeamNumber('148');
    await onJoinSession(liveSession.sessionCode, defaultName, 148);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Alliance Selection</h1>
        <p className="text-textSecondary mt-1">Real-time alliance selection session for your team</p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Live Session — one-click join for team members */}
      {liveSession && !hasActiveSession && (
        <div className="bg-blueAlliance/10 border-2 border-blueAlliance/30 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Radio size={20} className="text-blueAlliance animate-pulse" />
            <h2 className="text-xl font-bold text-blueAlliance flex-1">Live Session Available</h2>
            {isAdmin && onClearLiveSession && (
              <button
                onClick={onClearLiveSession}
                className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                title="Dismiss live session broadcast"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>
          <p className="text-textSecondary text-sm mb-4">
            <span className="font-semibold text-textPrimary">{liveSession.createdByName}</span> started an alliance selection session.
            {defaultName && <span> Joining as <span className="font-semibold text-textPrimary">{defaultName}</span> (Team 148).</span>}
          </p>
          <button
            onClick={handleJoinLive}
            disabled={loading || !defaultName}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blueAlliance text-white font-bold rounded-lg hover:bg-blueAlliance/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Handshake size={20} />}
            Join Live Session
          </button>
        </div>
      )}

      {/* Admin: Create Session (only shown when no live session) */}
      {!liveSession && isAdmin && (
        <div className="bg-surface p-6 rounded-lg border border-border max-w-lg">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Plus size={20} />
            Start Alliance Selection
          </h2>

          {hasActiveSession ? (
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Session Already Active</p>
                <p className="text-sm text-textSecondary mt-1">
                  You already have an active session. Use the banner at the top of any page to rejoin it.
                </p>
              </div>
            </div>
          ) : !eventCode ? (
            <p className="text-textSecondary">
              No event loaded. Go to the Event page to set up an event first.
            </p>
          ) : totalEventTeams === 0 ? (
            <p className="text-textSecondary">
              No teams loaded. Go to the Event page to load event data first.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-textSecondary mb-1">Event</p>
                <p className="font-semibold">{eventCode}</p>
              </div>

              <div className="flex gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-textSecondary">Tier 1</p>
                  <p className="text-lg font-bold text-success">{tier1Count}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Tier 2</p>
                  <p className="text-lg font-bold text-warning">{tier2Count}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Tier 3</p>
                  <p className="text-lg font-bold text-blueAlliance">{tier3Count}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Unranked</p>
                  <p className="text-lg font-bold text-textSecondary">{unrankedCount}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Total</p>
                  <p className="text-lg font-bold">{totalEventTeams}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-textSecondary block mb-1">Your Name *</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
                  />
                </div>
                <div>
                  <label className="text-sm text-textSecondary block mb-1">Team Number</label>
                  <input
                    type="text"
                    value={createTeamNum}
                    onChange={e => setCreateTeamNum(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 148"
                    maxLength={5}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading || !createName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Create Session ({totalEventTeams} teams)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Non-admin: No active session message */}
      {!liveSession && !isAdmin && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Handshake size={48} className="text-textMuted mb-4" />
          <h2 className="text-xl font-semibold text-textSecondary mb-2">No Active Session</h2>
          <p className="text-textMuted max-w-md">
            There are no alliance selection sessions running right now. When an admin starts one, it will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}

export default AllianceSelectionLobby;

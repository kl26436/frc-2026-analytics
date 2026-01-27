import { useState } from 'react';
import { Plus, LogIn, RotateCcw, Loader2 } from 'lucide-react';
import { usePickListStore } from '../../store/usePickListStore';
import { useAnalyticsStore } from '../../store/useAnalyticsStore';
import { useAllianceSelectionStore } from '../../store/useAllianceSelectionStore';

interface AllianceSelectionLobbyProps {
  onCreateSession: (eventKey: string, displayName: string, teamNumber?: number) => Promise<void>;
  onJoinSession: (sessionCode: string, displayName: string, teamNumber?: number) => Promise<void>;
  loading: boolean;
  error: string | null;
}

function AllianceSelectionLobby({ onCreateSession, onJoinSession, loading, error }: AllianceSelectionLobbyProps) {
  const pickList = usePickListStore(state => state.pickList);
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const lastSessionCode = useAllianceSelectionStore(state => state.lastSessionCode);
  const lastDisplayName = useAllianceSelectionStore(state => state.lastDisplayName);
  const lastTeamNumber = useAllianceSelectionStore(state => state.lastTeamNumber);
  const setLastDisplayName = useAllianceSelectionStore(state => state.setLastDisplayName);
  const setLastTeamNumber = useAllianceSelectionStore(state => state.setLastTeamNumber);

  const [createName, setCreateName] = useState(lastDisplayName);
  const [createTeamNum, setCreateTeamNum] = useState(lastTeamNumber);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState(lastDisplayName);
  const [joinTeamNum, setJoinTeamNum] = useState(lastTeamNumber);

  const tier1Count = pickList?.teams.filter(t => t.tier === 'tier1').length ?? 0;
  const tier2Count = pickList?.teams.filter(t => t.tier === 'tier2').length ?? 0;
  const totalImport = tier1Count + tier2Count;

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

  const handleJoin = async () => {
    if (!joinCode.trim() || !joinName.trim()) return;
    setLastDisplayName(joinName.trim());
    if (joinTeamNum.trim()) setLastTeamNumber(joinTeamNum.trim());
    await onJoinSession(joinCode.trim().toUpperCase(), joinName.trim(), parseTeamNum(joinTeamNum));
  };

  const handleRejoin = async () => {
    if (!lastSessionCode || !joinName.trim()) return;
    setLastDisplayName(joinName.trim());
    if (joinTeamNum.trim()) setLastTeamNumber(joinTeamNum.trim());
    await onJoinSession(lastSessionCode, joinName.trim(), parseTeamNum(joinTeamNum));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Alliance Selection</h1>
        <p className="text-textSecondary mt-1">Create or join a real-time alliance selection session</p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Create Session */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Plus size={20} />
            Create New Session
          </h2>

          {!eventCode ? (
            <p className="text-textSecondary">
              No event loaded. Go to the Event page to set up an event first.
            </p>
          ) : !pickList || totalImport === 0 ? (
            <p className="text-textSecondary">
              No pick list found. Build your pick list first — tier 1 and tier 2 teams will be imported.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-textSecondary mb-1">Event</p>
                <p className="font-semibold">{eventCode}</p>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-textSecondary">Tier 1</p>
                  <p className="text-lg font-bold text-success">{tier1Count}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Tier 2</p>
                  <p className="text-lg font-bold text-warning">{tier2Count}</p>
                </div>
                <div>
                  <p className="text-sm text-textSecondary">Total</p>
                  <p className="text-lg font-bold">{totalImport}</p>
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
                Create Session ({totalImport} teams)
              </button>
            </div>
          )}
        </div>

        {/* Join Session */}
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <LogIn size={20} />
            Join Session
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-textSecondary block mb-1">Session Code *</label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. A7K3M2"
                maxLength={6}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success font-mono text-lg tracking-widest uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-textSecondary block mb-1">Your Name *</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={e => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
                />
              </div>
              <div>
                <label className="text-sm text-textSecondary block mb-1">Team Number</label>
                <input
                  type="text"
                  value={joinTeamNum}
                  onChange={e => setJoinTeamNum(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 148"
                  maxLength={5}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim() || !joinName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              Join Session
            </button>

            {lastSessionCode && (
              <button
                onClick={handleRejoin}
                disabled={loading || !joinName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surfaceElevated border border-border text-textPrimary font-semibold rounded-lg hover:bg-interactive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw size={16} />
                Rejoin: {lastSessionCode}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AllianceSelectionLobby;

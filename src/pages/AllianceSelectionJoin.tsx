import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, LogIn, Handshake } from 'lucide-react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useAllianceSession } from '../hooks/useAllianceSession';
import { useAllianceSelectionStore } from '../store/useAllianceSelectionStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import AllianceSelectionBoard from '../components/allianceSelection/AllianceSelectionBoard';

function AllianceSelectionJoin() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();
  const eventCode = useAnalyticsStore(state => state.eventCode);

  const lastDisplayName = useAllianceSelectionStore(state => state.lastDisplayName);
  const lastTeamNumber = useAllianceSelectionStore(state => state.lastTeamNumber);
  const setLastDisplayName = useAllianceSelectionStore(state => state.setLastDisplayName);
  const setLastTeamNumber = useAllianceSelectionStore(state => state.setLastTeamNumber);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);
  const setActiveSessionId = useAllianceSelectionStore(state => state.setActiveSessionId);
  const setLastSessionCode = useAllianceSelectionStore(state => state.setLastSessionCode);

  const [joinName, setJoinName] = useState(lastDisplayName);
  const [joinTeamNum, setJoinTeamNum] = useState(lastTeamNumber);
  const [needsJoinPrompt, setNeedsJoinPrompt] = useState(false);

  const {
    session,
    loading: sessionLoading,
    error,
    myRole,
    isEditor,
    joinSession,
    leaveSession,
    markTeamPicked,
    markTeamDeclined,
    undoTeamStatus,
    revealTier3,
    setSessionStatus,
    promoteToEditor,
    demoteToViewer,
    removeParticipant,
    sendMessage,
    startListening,
  } = useAllianceSession(user?.uid ?? null);

  // Auto sign-in on mount
  useEffect(() => {
    if (!user && !authLoading) {
      signIn();
    }
  }, [user, authLoading, signIn]);

  // Determine join state once authed
  useEffect(() => {
    if (!sessionCode || !user || session || sessionLoading) return;

    if (activeSessionId) {
      startListening(activeSessionId);
    } else {
      setNeedsJoinPrompt(true);
    }
  }, [sessionCode, user, session, sessionLoading, activeSessionId, startListening]);

  const handleJoinSubmit = useCallback(async () => {
    if (!sessionCode || !joinName.trim() || !user) return;

    setLastDisplayName(joinName.trim());
    const teamNum = joinTeamNum.trim() ? parseInt(joinTeamNum.trim(), 10) : undefined;
    if (joinTeamNum.trim()) setLastTeamNumber(joinTeamNum.trim());

    setNeedsJoinPrompt(false);

    const result = await joinSession(sessionCode, joinName.trim(), teamNum && !isNaN(teamNum) ? teamNum : undefined);
    if (result) {
      setLastSessionCode(sessionCode);
      setActiveSessionId(result.sessionId);
    }
  }, [sessionCode, joinName, joinTeamNum, user, joinSession, setLastDisplayName, setLastTeamNumber, setLastSessionCode, setActiveSessionId]);

  const handleLeave = useCallback(() => {
    leaveSession();
    setActiveSessionId(null);
    setNeedsJoinPrompt(true);
  }, [leaveSession, setActiveSessionId]);

  // Minimal header for guest view
  const guestHeader = (
    <header className="bg-surface border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <Handshake size={24} className="text-blueAlliance" />
          <div>
            <h1 className="text-lg font-bold">Alliance Selection</h1>
            <p className="text-textSecondary text-xs">Team 148 • {eventCode}</p>
          </div>
        </div>
      </div>
    </header>
  );

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background text-textPrimary">
        {guestHeader}
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={32} className="animate-spin text-textSecondary" />
        </div>
      </div>
    );
  }

  // Join prompt
  if (needsJoinPrompt) {
    return (
      <div className="min-h-screen bg-background text-textPrimary">
        {guestHeader}
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="bg-surface p-6 rounded-lg border border-border w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-2">Join Session</h2>
            <p className="text-textSecondary text-sm mb-4">
              Session <span className="font-mono font-bold text-textPrimary">{sessionCode}</span>
            </p>

            {error && (
              <div className="bg-danger/10 border border-danger/30 text-danger px-3 py-2 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-sm text-textSecondary block mb-1">Your Name *</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={e => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
                  autoFocus
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

              <button
                onClick={handleJoinSubmit}
                disabled={sessionLoading || !joinName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sessionLoading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                Join Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading session
  if (sessionLoading || !session) {
    return (
      <div className="min-h-screen bg-background text-textPrimary">
        {guestHeader}
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 size={32} className="animate-spin text-textSecondary" />
          <p className="text-textSecondary">Connecting to session {sessionCode}...</p>
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg mt-4">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active session — show the board
  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {guestHeader}
      <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        <AllianceSelectionBoard
          session={session}
          userId={user?.uid ?? ''}
          myRole={myRole}
          isEditor={isEditor}
          onMarkPicked={markTeamPicked}
          onMarkDeclined={markTeamDeclined}
          onUndoStatus={undoTeamStatus}
          onRevealTier3={revealTier3}
          onSetStatus={setSessionStatus}
          onLeave={handleLeave}
          onPromote={promoteToEditor}
          onDemote={demoteToViewer}
          onRemoveParticipant={removeParticipant}
          onSendMessage={sendMessage}
        />
      </main>
    </div>
  );
}

export default AllianceSelectionJoin;

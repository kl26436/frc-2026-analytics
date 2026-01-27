import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useAllianceSession } from '../hooks/useAllianceSession';
import { useAllianceSelectionStore } from '../store/useAllianceSelectionStore';
import { usePickListStore } from '../store/usePickListStore';
import AllianceSelectionLobby from '../components/allianceSelection/AllianceSelectionLobby';
import AllianceSelectionBoard from '../components/allianceSelection/AllianceSelectionBoard';

function AllianceSelection() {
  const { sessionCode } = useParams<{ sessionCode?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();
  const pickList = usePickListStore(state => state.pickList);
  const setLastSessionCode = useAllianceSelectionStore(state => state.setLastSessionCode);
  const setLastDisplayName = useAllianceSelectionStore(state => state.setLastDisplayName);
  const setLastTeamNumber = useAllianceSelectionStore(state => state.setLastTeamNumber);
  const lastDisplayName = useAllianceSelectionStore(state => state.lastDisplayName);
  const lastTeamNumber = useAllianceSelectionStore(state => state.lastTeamNumber);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);
  const setActiveSessionId = useAllianceSelectionStore(state => state.setActiveSessionId);

  // Join form state (shown when session code is in URL but user hasn't joined yet)
  const [needsJoinPrompt, setNeedsJoinPrompt] = useState(false);
  const [joinName, setJoinName] = useState(lastDisplayName);
  const [joinTeamNum, setJoinTeamNum] = useState(lastTeamNumber);

  const {
    session,
    loading: sessionLoading,
    error,
    myRole,
    isEditor,
    createSession,
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

  // When there's a session code in the URL but no active session:
  // - If we have an activeSessionId stored (navigated away and back), auto-reconnect
  // - Otherwise, show the join prompt so the user can identify themselves
  useEffect(() => {
    if (!sessionCode || !user || session || sessionLoading) return;

    if (activeSessionId) {
      // Auto-reconnect — we already joined this session before
      startListening(activeSessionId);
    } else {
      // New session code — need to ask for name/team number
      setNeedsJoinPrompt(true);
    }
  }, [sessionCode, user, session, sessionLoading, activeSessionId, startListening]);

  const handleCreateSession = useCallback(async (eventKey: string, displayName: string, teamNumber?: number) => {
    if (!user) {
      await signIn();
    }
    if (!pickList) return;

    const result = await createSession({
      eventKey,
      teams: pickList.teams,
      displayName,
      teamNumber,
    });

    setLastSessionCode(result.sessionCode);
    setActiveSessionId(result.sessionId);
    navigate(`/alliance-selection/${result.sessionCode}`);
  }, [user, signIn, pickList, createSession, setLastSessionCode, setActiveSessionId, navigate]);

  const handleJoinSession = useCallback(async (code: string, displayName: string, teamNumber?: number) => {
    if (!user) {
      await signIn();
    }

    const result = await joinSession(code, displayName, teamNumber);
    if (result) {
      setLastSessionCode(code);
      setActiveSessionId(result.sessionId);
      navigate(`/alliance-selection/${code}`);
    }
  }, [user, signIn, joinSession, setLastSessionCode, setActiveSessionId, navigate]);

  // Handle the join prompt submission (when session code is in URL)
  const handleJoinPromptSubmit = useCallback(async () => {
    if (!sessionCode || !joinName.trim()) return;

    setLastDisplayName(joinName.trim());
    const teamNum = joinTeamNum.trim() ? parseInt(joinTeamNum.trim(), 10) : undefined;
    if (joinTeamNum.trim()) setLastTeamNumber(joinTeamNum.trim());

    setNeedsJoinPrompt(false);
    await handleJoinSession(sessionCode, joinName.trim(), teamNum && !isNaN(teamNum) ? teamNum : undefined);
  }, [sessionCode, joinName, joinTeamNum, setLastDisplayName, setLastTeamNumber, handleJoinSession]);

  const handleLeaveSession = useCallback(() => {
    leaveSession();
    setActiveSessionId(null);
    navigate('/alliance-selection');
  }, [leaveSession, setActiveSessionId, navigate]);

  // Loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  // If no session code in URL, show lobby
  if (!sessionCode) {
    return (
      <AllianceSelectionLobby
        onCreateSession={handleCreateSession}
        onJoinSession={handleJoinSession}
        loading={sessionLoading}
        error={error}
      />
    );
  }

  // Join prompt — session code is in URL but user hasn't identified themselves yet
  if (needsJoinPrompt) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface p-6 rounded-lg border border-border w-full max-w-md">
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
              onClick={handleJoinPromptSubmit}
              disabled={sessionLoading || !joinName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sessionLoading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              Join Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading session (reconnecting or waiting for data)
  if (sessionLoading || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
        <p className="text-textSecondary">Connecting to session {sessionCode}...</p>
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg mt-4">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Show the board
  return (
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
      onLeave={handleLeaveSession}
      onPromote={promoteToEditor}
      onDemote={demoteToViewer}
      onRemoveParticipant={removeParticipant}
      onSendMessage={sendMessage}
    />
  );
}

export default AllianceSelection;

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Clock } from 'lucide-react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useAllianceSession } from '../hooks/useAllianceSession';
import { useAllianceSelectionStore } from '../store/useAllianceSelectionStore';
import { usePickListStore } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useAuth } from '../contexts/AuthContext';
import AllianceSelectionLobby from '../components/allianceSelection/AllianceSelectionLobby';
import AllianceSelectionBoard from '../components/allianceSelection/AllianceSelectionBoard';

function AllianceSelection() {
  const { sessionCode } = useParams<{ sessionCode?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();
  const { isAdmin, liveSession, setLiveSession, clearLiveSession } = useAuth();
  const pickList = usePickListStore(state => state.pickList);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const setLastSessionCode = useAllianceSelectionStore(state => state.setLastSessionCode);
  const setLastDisplayName = useAllianceSelectionStore(state => state.setLastDisplayName);
  const setLastTeamNumber = useAllianceSelectionStore(state => state.setLastTeamNumber);
  const lastDisplayName = useAllianceSelectionStore(state => state.lastDisplayName);
  const lastTeamNumber = useAllianceSelectionStore(state => state.lastTeamNumber);
  const activeSessionId = useAllianceSelectionStore(state => state.activeSessionId);
  const setActiveSessionId = useAllianceSelectionStore(state => state.setActiveSessionId);

  // Ref to block auto-join during leave/end transition
  // (session becomes null before navigate takes effect, which re-triggers auto-join)
  const leavingRef = useRef(false);

  // Join form state (shown when session code is in URL but user hasn't joined yet)
  const [needsJoinPrompt, setNeedsJoinPrompt] = useState(false);
  const [joinName, setJoinName] = useState(lastDisplayName || user?.displayName || '');
  const [joinTeamNum, setJoinTeamNum] = useState(lastTeamNumber);

  const {
    session,
    loading: sessionLoading,
    error,
    myRole,
    isHost,
    isEditor,
    createSession,
    joinSession,
    leaveSession,
    markTeamPicked,
    markTeamDeclined,
    undoTeamStatus,
    setSessionStatus,
    acceptParticipant,
    promoteToEditor,
    demoteToViewer,
    transferHost,
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

  const handleCreateSession = useCallback(async (eventKey: string, displayName: string, teamNumber?: number) => {
    if (!user) {
      await signIn();
    }
    if (!pickList) return;

    // Get all event team numbers from teamStatistics
    const allEventTeamNumbers = teamStatistics.map(t => t.teamNumber);

    const result = await createSession({
      eventKey,
      teams: pickList.teams,
      allEventTeamNumbers,
      displayName,
      teamNumber,
    });

    setLastSessionCode(result.sessionCode);
    setActiveSessionId(result.sessionId);

    // Broadcast to all team members
    try {
      await setLiveSession({
        sessionCode: result.sessionCode,
        sessionId: result.sessionId,
        createdBy: user!.uid,
        createdByName: displayName,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to broadcast live session:', err);
    }

    navigate(`/alliance-selection/${result.sessionCode}`);
  }, [user, signIn, pickList, teamStatistics, createSession, setLastSessionCode, setActiveSessionId, setLiveSession, navigate]);

  const handleJoinSession = useCallback(async (code: string, displayName: string, teamNumber?: number) => {
    if (!user) {
      await signIn();
    }

    // Admins join as editors automatically; non-admins join as pending (need host approval)
    const role = isAdmin ? 'editor' : 'pending';
    const result = await joinSession(code, displayName, teamNumber, role);
    if (result) {
      setLastSessionCode(code);
      setActiveSessionId(result.sessionId);
      navigate(`/alliance-selection/${code}`);
    }
  }, [user, signIn, isAdmin, joinSession, setLastSessionCode, setActiveSessionId, navigate]);

  // Reset the leaving guard when sessionCode changes (navigated to lobby or new session)
  useEffect(() => {
    leavingRef.current = false;
  }, [sessionCode]);

  // If we're in a session but no longer in the participants list, we've been kicked
  // Also kick everyone when session status becomes 'completed' (host ended it)
  useEffect(() => {
    if (!session || !user) return;
    if (!session.participants[user.uid] || session.status === 'completed') {
      leavingRef.current = true;
      leaveSession();
      setActiveSessionId(null);
      setLastSessionCode(null);
      navigate('/alliance-selection');
    }
  }, [session, user, leaveSession, setActiveSessionId, setLastSessionCode, navigate]);

  // When there's a session code in the URL but no active session:
  // - If we have an activeSessionId stored (navigated away and back), auto-reconnect
  // - Otherwise, auto-join using Google display name + team 148
  useEffect(() => {
    if (!sessionCode || !user || session || sessionLoading || leavingRef.current) return;

    if (activeSessionId) {
      // Auto-reconnect — we already joined this session before
      startListening(activeSessionId);
    } else if (user.displayName) {
      // Auto-join for team members — use Google name + team 148
      handleJoinSession(sessionCode, user.displayName, 148);
    } else {
      // Fallback: show join prompt if no display name available
      setNeedsJoinPrompt(true);
    }
  }, [sessionCode, user, session, sessionLoading, activeSessionId, startListening, handleJoinSession]);

  // Handle the join prompt submission (when session code is in URL)
  const handleJoinPromptSubmit = useCallback(async () => {
    if (!sessionCode || !joinName.trim()) return;

    setLastDisplayName(joinName.trim());
    const teamNum = joinTeamNum.trim() ? parseInt(joinTeamNum.trim(), 10) : undefined;
    if (joinTeamNum.trim()) setLastTeamNumber(joinTeamNum.trim());

    setNeedsJoinPrompt(false);
    await handleJoinSession(sessionCode, joinName.trim(), teamNum && !isNaN(teamNum) ? teamNum : undefined);
  }, [sessionCode, joinName, joinTeamNum, setLastDisplayName, setLastTeamNumber, handleJoinSession]);

  const handleSetSessionStatus = useCallback(async (status: 'active' | 'completed') => {
    const success = await setSessionStatus(status);
    if (!success) return; // Firestore update failed — don't proceed with cleanup
    if (status === 'completed') {
      leavingRef.current = true; // Block auto-rejoin during transition
      try { await clearLiveSession(); } catch (err) { console.error('Failed to clear live session:', err); }
      // Auto-leave after ending
      leaveSession();
      setActiveSessionId(null);
      setLastSessionCode(null);
      navigate('/alliance-selection');
    }
  }, [setSessionStatus, clearLiveSession, leaveSession, setActiveSessionId, setLastSessionCode, navigate]);

  const handleLeaveSession = useCallback(() => {
    leavingRef.current = true; // Block auto-rejoin during transition
    leaveSession();
    setActiveSessionId(null);
    setLastSessionCode(null);
    navigate('/alliance-selection');
  }, [leaveSession, setActiveSessionId, setLastSessionCode, navigate]);

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
        onClearLiveSession={isAdmin ? clearLiveSession : undefined}
        loading={sessionLoading}
        error={error}
        isAdmin={isAdmin}
        userDisplayName={user?.displayName ?? undefined}
        liveSession={liveSession}
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

  // Error state — session not found or connection failed (with no loading in progress)
  if (!session && error && !sessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
          {error}
        </div>
        <button
          onClick={() => {
            setActiveSessionId(null);
            setLastSessionCode(null);
            navigate('/alliance-selection');
          }}
          className="px-4 py-2 bg-surface border border-border rounded-lg hover:bg-interactive transition-colors text-textPrimary font-semibold"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  // Loading session (reconnecting or waiting for data)
  if (sessionLoading || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
        <p className="text-textSecondary">Connecting to session {sessionCode}...</p>
      </div>
    );
  }

  // Pending approval — user joined but awaiting host acceptance
  if (myRole === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface p-6 rounded-lg border border-border w-full max-w-md text-center">
          <Clock size={40} className="mx-auto mb-4 text-warning animate-pulse" />
          <h2 className="text-xl font-bold mb-2">Waiting for Approval</h2>
          <p className="text-textSecondary text-sm mb-6">
            The host needs to accept you before you can join the session. Please wait...
          </p>
          <button
            onClick={handleLeaveSession}
            className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-interactive transition-colors text-textPrimary font-semibold text-sm"
          >
            Leave Session
          </button>
        </div>
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
      isHost={isHost}
      onMarkPicked={markTeamPicked}
      onMarkDeclined={markTeamDeclined}
      onUndoStatus={undoTeamStatus}
      onSetStatus={handleSetSessionStatus}
      onLeave={handleLeaveSession}
      onAcceptParticipant={acceptParticipant}
      onPromote={promoteToEditor}
      onDemote={demoteToViewer}
      onTransferHost={transferHost}
      onRemoveParticipant={removeParticipant}
      onSendMessage={sendMessage}
    />
  );
}

export default AllianceSelection;

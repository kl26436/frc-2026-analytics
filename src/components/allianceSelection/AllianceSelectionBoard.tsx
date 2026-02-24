import { useMemo } from 'react';
import { UserCheck, UserMinus, Clock } from 'lucide-react';
import type { AllianceSelectionSession, SessionRole, SessionStatus } from '../../types/allianceSelection';
import { useAnalyticsStore } from '../../store/useAnalyticsStore';
import { useAllianceSelectionStore } from '../../store/useAllianceSelectionStore';
import ComparisonModal from '../ComparisonModal';
import SessionHeader from './SessionHeader';
import SelectionSearchBar from './SelectionSearchBar';
import SelectionTeamCard from './SelectionTeamCard';
import ChatBox from './ChatBox';
import AllianceTracker from './AllianceTracker';
import SessionParticipants from './SessionParticipants';

interface AllianceSelectionBoardProps {
  session: AllianceSelectionSession;
  userId: string;
  myRole: SessionRole | null;
  isEditor: boolean;
  isHost: boolean;
  onMarkPicked: (teamNumber: number, allianceNumber: number) => Promise<void>;
  onMarkDeclined: (teamNumber: number) => Promise<void>;
  onUndoStatus: (teamNumber: number) => Promise<void>;
  onSetStatus: (status: SessionStatus) => Promise<void>;
  onLeave: () => void;
  onAcceptParticipant: (uid: string) => Promise<void>;
  onPromote: (uid: string) => Promise<void>;
  onDemote: (uid: string) => Promise<void>;
  onTransferHost: (uid: string) => Promise<void>;
  onRemoveParticipant: (uid: string) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
}

function AllianceSelectionBoard({
  session,
  userId,
  myRole,
  isEditor,
  isHost,
  onMarkPicked,
  onMarkDeclined,
  onUndoStatus,
  onSetStatus,
  onLeave,
  onAcceptParticipant,
  onPromote,
  onDemote,
  onTransferHost,
  onRemoveParticipant,
  onSendMessage,
}: AllianceSelectionBoardProps) {
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);

  const searchQuery = useAllianceSelectionStore(state => state.searchQuery);
  const setSearchQuery = useAllianceSelectionStore(state => state.setSearchQuery);
  const selectedTeamsForCompare = useAllianceSelectionStore(state => state.selectedTeamsForCompare);
  const toggleTeamForCompare = useAllianceSelectionStore(state => state.toggleTeamForCompare);
  const clearCompareSelection = useAllianceSelectionStore(state => state.clearCompareSelection);
  const showComparisonModal = useAllianceSelectionStore(state => state.showComparisonModal);
  const setShowComparisonModal = useAllianceSelectionStore(state => state.setShowComparisonModal);
  const highlightedAlliance = useAllianceSelectionStore(state => state.highlightedAlliance);
  const setHighlightedAlliance = useAllianceSelectionStore(state => state.setHighlightedAlliance);
  const showParticipants = useAllianceSelectionStore(state => state.showParticipants);
  const setShowParticipants = useAllianceSelectionStore(state => state.setShowParticipants);

  // Build the display team list
  const displayTeams = useMemo(() => {
    let teams = [...session.teams];

    // Filter by highlighted alliance
    if (highlightedAlliance) {
      const alliance = session.alliances.find(a => a.number === highlightedAlliance);
      if (alliance) {
        const allianceTeamNumbers = [alliance.captain, alliance.firstPick, alliance.secondPick, alliance.backupPick].filter(Boolean) as number[];
        // Show alliance teams at top, then available
        teams = teams.map(t => ({
          ...t,
          _isAllianceMember: allianceTeamNumbers.includes(t.teamNumber),
        }));
      }
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      teams = teams.filter(t => {
        const stats = teamStatistics.find(s => s.teamNumber === t.teamNumber);
        return (
          t.teamNumber.toString().includes(q) ||
          stats?.teamName?.toLowerCase().includes(q)
        );
      });
    }

    // Sort: available first by globalRank, then picked/declined by globalRank
    teams.sort((a, b) => {
      const aUnavailable = a.status !== 'available' ? 1 : 0;
      const bUnavailable = b.status !== 'available' ? 1 : 0;
      if (aUnavailable !== bUnavailable) return aUnavailable - bUnavailable;
      return a.globalRank - b.globalRank;
    });

    return teams;
  }, [session.teams, searchQuery, teamStatistics, highlightedAlliance, session.alliances]);

  // Stats for the team list
  const availableCount = session.teams.filter(t => t.status === 'available').length;
  const pickedCount = session.teams.filter(t => t.status === 'picked').length;
  const unrankedCount = session.teams.filter(t => t.originalTier === 'unranked').length;

  // Comparison modal data
  const compareTeam1 = teamStatistics.find(t => t.teamNumber === selectedTeamsForCompare[0]);
  const compareTeam2 = teamStatistics.find(t => t.teamNumber === selectedTeamsForCompare[1]);
  const canShowModal = showComparisonModal && compareTeam1 && compareTeam2;

  const participantCount = Object.keys(session.participants).length;
  const pendingEntries = Object.entries(session.participants).filter(([, p]) => p.role === 'pending');
  const pendingCount = pendingEntries.length;

  return (
    <div className="space-y-3">
      {/* Session Header */}
      <SessionHeader
        session={session}
        myRole={myRole}
        isHost={isHost}
        onLeave={onLeave}
        onSetStatus={onSetStatus}
        onShowParticipants={() => setShowParticipants(!showParticipants)}
        participantCount={participantCount}
        pendingCount={pendingCount}
      />

      {/* Pending Approval Banner — shows for host when there are pending users */}
      {isHost && pendingCount > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-warning" />
            <span className="text-sm font-semibold text-warning">
              {pendingCount} {pendingCount === 1 ? 'person' : 'people'} waiting for approval
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingEntries.map(([uid, participant]) => (
              <div key={uid} className="flex items-center gap-2 bg-surface/50 rounded px-3 py-2">
                <span className="flex-1 text-sm font-semibold">
                  {participant.displayName}
                  {participant.teamNumber && (
                    <span className="text-textSecondary font-normal ml-1">#{participant.teamNumber}</span>
                  )}
                </span>
                <button
                  onClick={() => onAcceptParticipant(uid)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-success text-background text-xs font-bold hover:bg-success/90 transition-colors"
                >
                  <UserCheck size={12} />
                  Accept
                </button>
                <button
                  onClick={() => onRemoveParticipant(uid)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded bg-danger/20 text-danger text-xs font-bold hover:bg-danger/30 transition-colors"
                >
                  <UserMinus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Left: Team List */}
        <div className="flex-1 space-y-3">
          {/* Search */}
          <SelectionSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            selectedCount={selectedTeamsForCompare.length}
            onClearCompare={clearCompareSelection}
          />

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-textSecondary">
              <span className="font-bold text-textPrimary">{availableCount}</span> available
            </span>
            <span className="text-textSecondary">
              <span className="font-bold text-success">{pickedCount}</span> picked
            </span>
            {unrankedCount > 0 && (
              <span className="text-textSecondary">
                <span className="font-bold text-textMuted">{unrankedCount}</span> unranked
              </span>
            )}
            {selectedTeamsForCompare.length > 0 && (
              <span className="text-blueAlliance text-xs">
                Click teams to compare ({selectedTeamsForCompare.length}/2)
              </span>
            )}
          </div>

          {/* Team Cards */}
          <div className="space-y-1.5">
            {displayTeams.map(team => (
              <SelectionTeamCard
                key={team.teamNumber}
                team={team}
                teamStats={teamStatistics.find(s => s.teamNumber === team.teamNumber)}
                isEditor={isEditor}
                isSelectedForCompare={selectedTeamsForCompare.includes(team.teamNumber)}
                alliances={session.alliances}
                onMarkPicked={onMarkPicked}
                onMarkDeclined={onMarkDeclined}
                onUndoStatus={onUndoStatus}
                onToggleCompare={toggleTeamForCompare}
              />
            ))}

            {displayTeams.length === 0 && (
              <div className="text-center py-8 text-textMuted">
                {searchQuery ? 'No teams match your search.' : 'No teams in this session.'}
              </div>
            )}
          </div>

        </div>

        {/* Right: Chat + Alliance Tracker */}
        <div className="lg:w-80 xl:w-96 space-y-3">
          <ChatBox
            messages={session.messages}
            onSend={onSendMessage}
            myUid={userId}
          />
          <AllianceTracker
            alliances={session.alliances}
            highlightedAlliance={highlightedAlliance}
            onHighlightAlliance={setHighlightedAlliance}
          />
        </div>
      </div>

      {/* Participants Panel */}
      {showParticipants && (
        <SessionParticipants
          participants={session.participants}
          myUid={userId}
          isHost={isHost}
          onAccept={onAcceptParticipant}
          onPromote={onPromote}
          onDemote={onDemote}
          onTransferHost={onTransferHost}
          onRemove={onRemoveParticipant}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* Comparison Modal */}
      {canShowModal && (
        <ComparisonModal
          team1={compareTeam1!}
          team2={compareTeam2!}
          onClose={() => {
            setShowComparisonModal(false);
            clearCompareSelection();
          }}
        />
      )}
    </div>
  );
}

export default AllianceSelectionBoard;

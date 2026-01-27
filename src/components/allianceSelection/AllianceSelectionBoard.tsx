import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
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
  onMarkPicked: (teamNumber: number, allianceNumber: number) => Promise<void>;
  onMarkDeclined: (teamNumber: number) => Promise<void>;
  onUndoStatus: (teamNumber: number) => Promise<void>;
  onRevealTier3: () => Promise<void>;
  onSetStatus: (status: SessionStatus) => Promise<void>;
  onLeave: () => void;
  onPromote: (uid: string) => Promise<void>;
  onDemote: (uid: string) => Promise<void>;
  onRemoveParticipant: (uid: string) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
}

function AllianceSelectionBoard({
  session,
  userId,
  myRole,
  isEditor,
  onMarkPicked,
  onMarkDeclined,
  onUndoStatus,
  onRevealTier3,
  onSetStatus,
  onLeave,
  onPromote,
  onDemote,
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

    // Filter out tier3 if not revealed
    if (!session.showTier3) {
      teams = teams.filter(t => t.originalTier !== 'tier3');
    }

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
  }, [session.teams, session.showTier3, searchQuery, teamStatistics, highlightedAlliance, session.alliances]);

  // Stats for the team list
  const availableCount = session.teams.filter(t => t.status === 'available' && (session.showTier3 || t.originalTier !== 'tier3')).length;
  const pickedCount = session.teams.filter(t => t.status === 'picked').length;
  const tier3Count = session.teams.filter(t => t.originalTier === 'tier3').length;

  // Comparison modal data
  const compareTeam1 = teamStatistics.find(t => t.teamNumber === selectedTeamsForCompare[0]);
  const compareTeam2 = teamStatistics.find(t => t.teamNumber === selectedTeamsForCompare[1]);
  const canShowModal = showComparisonModal && compareTeam1 && compareTeam2;

  const participantCount = Object.keys(session.participants).length;

  return (
    <div className="space-y-3">
      {/* Session Header */}
      <SessionHeader
        session={session}
        myRole={myRole}
        onLeave={onLeave}
        onSetStatus={onSetStatus}
        onShowParticipants={() => setShowParticipants(!showParticipants)}
        participantCount={participantCount}
      />

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
          <div className="flex items-center gap-4 text-sm">
            <span className="text-textSecondary">
              <span className="font-bold text-textPrimary">{availableCount}</span> available
            </span>
            <span className="text-textSecondary">
              <span className="font-bold text-success">{pickedCount}</span> picked
            </span>
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

          {/* Reveal Tier 3 */}
          {!session.showTier3 && tier3Count > 0 && isEditor && (
            <button
              onClick={onRevealTier3}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surfaceElevated border border-border rounded-lg text-textSecondary hover:bg-interactive hover:text-textPrimary transition-colors"
            >
              <ChevronDown size={16} />
              Reveal Tier 3 Backups ({tier3Count} teams)
            </button>
          )}

          {!session.showTier3 && tier3Count > 0 && !isEditor && (
            <div className="text-center py-3 text-textMuted text-sm">
              {tier3Count} backup teams hidden (editor can reveal)
            </div>
          )}
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
          isAdmin={myRole === 'admin'}
          onPromote={onPromote}
          onDemote={onDemote}
          onRemove={onRemoveParticipant}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* Comparison Modal */}
      {canShowModal && (
        <ComparisonModal
          team1={compareTeam1!}
          team2={compareTeam2!}
          onPickTeam={() => clearCompareSelection()}
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

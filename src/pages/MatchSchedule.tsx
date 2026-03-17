import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronDown, Eye, MessageSquare } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useNinjaStore } from '../store/useNinjaStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { NINJA_TAG_LABELS, NINJA_TAG_COLORS } from '../types/ninja';
import type { TBAMatch } from '../types/tba';

const COMP_ORDER: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

function matchSortKey(m: TBAMatch): number {
  return (COMP_ORDER[m.comp_level] ?? 0) * 1000 + m.match_number;
}

function matchLabel(m: TBAMatch): string {
  if (m.comp_level === 'qm') return `Q${m.match_number}`;
  return `${m.comp_level.toUpperCase()}${m.set_number}-${m.match_number}`;
}

function MatchSchedule() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const homeTeamNumber = useAnalyticsStore(s => s.homeTeamNumber);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const pitEntries = usePitScoutStore(s => s.entries);

  const ninjaStore = useNinjaStore();

  useEffect(() => {
    if (eventCode) {
      ninjaStore.subscribeToNotes(eventCode);
    }
    return () => ninjaStore.unsubscribeAll();
  }, [eventCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  const homeKey = `frc${homeTeamNumber}`;

  // All matches sorted
  const allMatches = useMemo(() => {
    if (!tbaData?.matches) return [];
    return [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));
  }, [tbaData]);

  // Home team's matches
  const homeMatches = useMemo(() => {
    return allMatches.filter(m =>
      m.alliances.red.team_keys.includes(homeKey) ||
      m.alliances.blue.team_keys.includes(homeKey)
    );
  }, [allMatches, homeKey]);

  // Find upcoming (unplayed) home matches
  const upcomingHomeMatches = useMemo(() => {
    return homeMatches.filter(m => m.alliances.red.score < 0 && m.alliances.blue.score < 0);
  }, [homeMatches]);

  // Selected match to prep for
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);

  // Default to next unplayed match
  useEffect(() => {
    if (upcomingHomeMatches.length > 0 && !selectedMatchKey) {
      setSelectedMatchKey(upcomingHomeMatches[0].key);
    }
  }, [upcomingHomeMatches, selectedMatchKey]);

  const selectedMatch = allMatches.find(m => m.key === selectedMatchKey);

  // Teams in the selected match (partners + opponents)
  const matchTeams = useMemo(() => {
    if (!selectedMatch) return [];
    const reds = selectedMatch.alliances.red.team_keys.map(teamKeyToNumber);
    const blues = selectedMatch.alliances.blue.team_keys.map(teamKeyToNumber);
    return [...reds, ...blues];
  }, [selectedMatch]);

  // Prior matches involving any of these teams, before our match
  const priorMatches = useMemo(() => {
    if (!selectedMatch || matchTeams.length === 0) return [];
    const selectedSortKey = matchSortKey(selectedMatch);
    const teamKeys = new Set(matchTeams.map(n => `frc${n}`));

    return allMatches.filter(m => {
      if (matchSortKey(m) >= selectedSortKey) return false;
      const mTeams = [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys];
      return mTeams.some(tk => teamKeys.has(tk));
    });
  }, [allMatches, selectedMatch, matchTeams]);

  // Team intel lookup
  const getTeamIntel = (teamNumber: number) => {
    const stats = teamStatistics.find(t => t.teamNumber === teamNumber);
    const pit = pitEntries.find(e => e.teamNumber === teamNumber);
    const notes = ninjaStore.notes
      .filter(n => n.teamNumber === teamNumber)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { stats, pit, notes };
  };

  if (!tbaData?.matches?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Match Prep</h1>
        <p className="text-textSecondary">No match schedule loaded. Set up your event and load TBA data first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Match Prep</h1>
        {/* Match selector */}
        <div className="relative">
          <select
            value={selectedMatchKey || ''}
            onChange={e => setSelectedMatchKey(e.target.value)}
            className="bg-surfaceElevated border border-border rounded-lg px-4 py-2 pr-8 text-sm font-medium appearance-none"
          >
            {homeMatches.map(m => {
              const played = m.alliances.red.score >= 0;
              return (
                <option key={m.key} value={m.key}>
                  {matchLabel(m)} {played ? '(played)' : ''}
                </option>
              );
            })}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
        </div>
      </div>

      {/* Selected match overview */}
      {selectedMatch && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <h2 className="font-bold text-lg mb-3">
            <Calendar size={16} className="inline mr-2 text-blueAlliance" />
            Preparing for {matchLabel(selectedMatch)}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Red Alliance */}
            <div>
              <p className="text-sm font-bold text-redAlliance mb-2">Red Alliance</p>
              {selectedMatch.alliances.red.team_keys.map(tk => {
                const num = teamKeyToNumber(tk);
                const isHome = num === homeTeamNumber;
                return <TeamIntelCard key={num} teamNumber={num} isHome={isHome} intel={getTeamIntel(num)} expanded={expandedTeam === num} onToggle={() => setExpandedTeam(prev => prev === num ? null : num)} />;
              })}
            </div>
            {/* Blue Alliance */}
            <div>
              <p className="text-sm font-bold text-blueAlliance mb-2">Blue Alliance</p>
              {selectedMatch.alliances.blue.team_keys.map(tk => {
                const num = teamKeyToNumber(tk);
                const isHome = num === homeTeamNumber;
                return <TeamIntelCard key={num} teamNumber={num} isHome={isHome} intel={getTeamIntel(num)} expanded={expandedTeam === num} onToggle={() => setExpandedTeam(prev => prev === num ? null : num)} />;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Prior matches to watch */}
      {priorMatches.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">
            <Eye size={16} className="inline mr-2 text-warning" />
            Prior Matches to Watch ({priorMatches.length})
          </h2>
          <div className="space-y-2">
            {priorMatches.map(m => {
              const redNums = m.alliances.red.team_keys.map(teamKeyToNumber);
              const blueNums = m.alliances.blue.team_keys.map(teamKeyToNumber);
              const played = m.alliances.red.score >= 0;
              // Highlight teams that are in our upcoming match
              const highlight = (num: number) => matchTeams.includes(num);

              return (
                <div key={m.key} className="bg-surface border border-border rounded-lg p-3">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-sm">{matchLabel(m)}</span>
                    {played && (
                      <span className="text-xs text-textMuted">
                        {m.alliances.red.score} - {m.alliances.blue.score}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="flex gap-2">
                      <span className="text-redAlliance font-medium text-xs">Red:</span>
                      {redNums.map(n => (
                        <Link key={n} to={`/teams/${n}`} className={`text-xs ${highlight(n) ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>
                          {n}
                        </Link>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <span className="text-blueAlliance font-medium text-xs">Blue:</span>
                      {blueNums.map(n => (
                        <Link key={n} to={`/teams/${n}`} className={`text-xs ${highlight(n) ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>
                          {n}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Team intel card for the match prep view
function TeamIntelCard({ teamNumber, isHome, intel, expanded, onToggle }: {
  teamNumber: number;
  isHome: boolean;
  intel: ReturnType<typeof Object.prototype.valueOf> & {
    stats: ReturnType<typeof useAnalyticsStore.getState>['teamStatistics'][0] | undefined;
    pit: ReturnType<typeof usePitScoutStore.getState>['entries'][0] | undefined;
    notes: ReturnType<typeof useNinjaStore.getState>['notes'];
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const { stats, pit, notes } = intel;

  return (
    <div className={`rounded-lg border p-2 mb-2 cursor-pointer transition-colors ${isHome ? 'bg-warning/10 border-warning/40' : 'bg-card border-border hover:bg-interactive'}`} onClick={onToggle}>
      <div className="flex items-center gap-2">
        <Link to={`/teams/${teamNumber}`} className="font-bold text-sm hover:text-blueAlliance" onClick={e => e.stopPropagation()}>
          {teamNumber}
        </Link>
        {stats && <span className="text-xs text-textSecondary">{stats.avgTotalPoints.toFixed(0)} pts</span>}
        {pit?.driveType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blueAlliance/20 text-blueAlliance font-medium">{pit.driveType}</span>}
        {pit?.canGoUnderTrench && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">trench</span>}
        {notes.length > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-warning ml-auto">
            <MessageSquare size={12} /> {notes.length}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
          {stats && (
            <div className="flex flex-wrap gap-2 text-xs text-textSecondary">
              <span>Auto: {stats.avgAutoPoints.toFixed(1)}</span>
              <span>Teleop: {stats.avgTeleopPoints.toFixed(1)}</span>
              <span>AC: {stats.autoClimbRate !== undefined ? (stats.autoClimbRate * 100).toFixed(0) + '%' : '?'}</span>
              <span>Rel: {stats.lostConnectionRate !== undefined ? ((1 - stats.lostConnectionRate) * 100).toFixed(0) + '%' : '?'}</span>
            </div>
          )}
          {notes.slice(0, 3).map(note => (
            <div key={note.id} className="text-xs bg-background/50 rounded p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-medium text-textSecondary">{note.authorName}</span>
                {note.matchNumber && <span className="text-blueAlliance">Q{note.matchNumber}</span>}
              </div>
              <p className="text-textPrimary">{note.text}</p>
              {note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {note.tags.map(tag => (
                    <span key={tag} className={`px-1 py-0.5 rounded-full text-[10px] ${NINJA_TAG_COLORS[tag]}`}>
                      {NINJA_TAG_LABELS[tag]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {notes.length === 0 && <p className="text-xs text-textMuted italic">No scouting notes</p>}
        </div>
      )}
    </div>
  );
}

export default MatchSchedule;

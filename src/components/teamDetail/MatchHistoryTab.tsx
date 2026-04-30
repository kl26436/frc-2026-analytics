import { Play } from 'lucide-react';
import type { ScoutEntry } from '../../types/scouting';
import type { TBAMatch } from '../../types/tba';
import { estimateMatchPoints, parseClimbLevel } from '../../types/scouting';
import { getMatchVideoUrl } from '../../utils/tbaApi';
import DataSourceToggle from '../DataSourceToggle';

interface LiveMatchRow {
  entry: ScoutEntry;
  fuel: { auto: number; teleop: number; total: number };
  points: { autoPoints: number; teleopPoints: number; endgamePoints: number; total: number };
  climbLevel: number;
  actionFuel: { autoShots: number; teleopShots: number; totalPasses: number } | null;
}

interface MatchHistoryTabProps {
  teamNum: number;
  matchData: LiveMatchRow[];
  tbaMatches: TBAMatch[];
  preScoutByEvent: Array<{ eventKey: string; entries: ScoutEntry[] }>;
  preScoutTbaMatches: Map<string, TBAMatch>;
  onSelectMatch: (entry: ScoutEntry) => void;
  onSelectVideo: (selection: { matchNumber: number; videoUrl: string; eventKey?: string }) => void;
}

const climbLabel = (level: number) => ['None', 'L1', 'L2', 'L3'][level] ?? 'None';

function getStartZone(entry: ScoutEntry): number {
  for (let i = 1; i <= 6; i++) {
    if ((entry as unknown as Record<string, number>)[`prematch_AUTON_START_ZONE_${i}`] > 0) return i;
  }
  return 0;
}

export function MatchHistoryTab({
  teamNum,
  matchData,
  tbaMatches,
  preScoutByEvent,
  preScoutTbaMatches,
  onSelectMatch,
  onSelectVideo,
}: MatchHistoryTabProps) {
  const hasLive = matchData.length > 0;
  const hasPreScout = preScoutByEvent.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex justify-end">
        <DataSourceToggle />
      </div>

      {!hasLive && !hasPreScout && (
        <div className="bg-surface rounded-lg border border-border p-6 text-center text-textSecondary">
          No match data yet for team {teamNum}.
        </div>
      )}

      {hasLive && (
        <div className="bg-surface rounded-lg border border-border">
          <div className="p-6 border-b border-border flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Match History ({matchData.length} entries)</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-success/15 text-success uppercase tracking-wider">Live</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surfaceElevated border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Match</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Video</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Alliance</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Start</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Scored</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Auto Climb</th>
                  <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Mid Field</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Pts</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Scored</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Passes</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Pts</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Climb</th>
                  <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">End Pts</th>
                  <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Total Pts</th>
                  <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Flags</th>
                  <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matchData.map(({ entry, fuel, points, climbLevel: climb, actionFuel }, index) => {
                  const alliance = entry.configured_team.startsWith('red') ? 'red' : 'blue';
                  const tbaMatch = tbaMatches.find(
                    m => m.comp_level === 'qm' && m.match_number === entry.match_number
                  );
                  const videoUrl = tbaMatch ? getMatchVideoUrl(tbaMatch) : null;
                  const startZone = getStartZone(entry);
                  const autoScored = actionFuel ? actionFuel.autoShots : fuel.auto;
                  const teleopScored = actionFuel ? actionFuel.teleopShots : fuel.teleop;
                  const passes = actionFuel ? actionFuel.totalPasses : entry.auton_FUEL_PASS + entry.teleop_FUEL_PASS;

                  return (
                    <tr key={entry.id} className={`hover:bg-interactive transition-colors ${index % 2 === 0 ? 'bg-surfaceAlt' : ''}`}>
                      <td className="px-3 py-3 font-semibold">
                        <button
                          onClick={() => onSelectMatch(entry)}
                          className="text-blueAlliance hover:underline cursor-pointer"
                          title="View full scouting report"
                        >
                          Q{entry.match_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {videoUrl ? (
                          <button
                            onClick={() => onSelectVideo({ matchNumber: entry.match_number, videoUrl })}
                            className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                            title="Watch match video"
                          >
                            <Play size={16} fill="currentColor" />
                          </button>
                        ) : (
                          <span className="text-textMuted text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-3 py-1 rounded text-sm font-bold ${
                          alliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                        }`}>
                          {alliance.toUpperCase()}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-center text-textSecondary">
                        {startZone > 0 ? `Z${startZone}` : '-'}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{autoScored}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-center">
                        {entry.auton_AUTON_CLIMBED > 0 ? (
                          <span className="text-success font-semibold">Y</span>
                        ) : (
                          <span className="text-textMuted">-</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-center">
                        {entry.auton_went_to_neutral ? (
                          <span className="text-warning font-semibold">Y</span>
                        ) : (
                          <span className="text-textMuted">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{Math.round(points.autoPoints)}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{teleopScored}</td>
                      <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{passes > 0 ? passes : '-'}</td>
                      <td className="px-3 py-3 text-right font-semibold">{Math.round(points.teleopPoints)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={climb >= 2 ? 'font-semibold text-success' : climb === 1 ? 'font-semibold' : 'text-textMuted'}>
                          {climbLabel(climb)}
                        </span>
                        {entry.teleop_climb_failed && (
                          <span className="ml-1 text-danger text-xs">(failed)</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-right font-semibold">{points.endgamePoints}</td>
                      <td className="px-3 py-3 text-right font-bold">{Math.round(points.total)}</td>
                      <td className="px-3 py-3 text-center text-xs space-x-1">
                        {entry.lost_connection && <span className="text-danger">LOST</span>}
                        {entry.no_robot_on_field && <span className="text-danger">NO ROBOT</span>}
                        {entry.dedicated_passer && <span className="text-blueAlliance">PASSER</span>}
                        {entry.eff_rep_bulldozed_fuel && <span className="text-blueAlliance">BULLDOZE</span>}
                        {entry.auton_did_nothing && <span className="text-warning">MID AUTO</span>}
                      </td>
                      <td className="px-3 py-3 text-sm text-textSecondary max-w-[200px] truncate">
                        {entry.notes}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasPreScout && (() => {
        const allEntries = preScoutByEvent.flatMap(g => g.entries);
        const totalEntries = allEntries.length;
        const eventCount = preScoutByEvent.length;
        return (
          <div className="bg-surface rounded-lg border border-border border-l-4 border-l-warning">
            <div className="p-6 border-b border-border flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold">
                Pre-Scout History ({totalEntries} entries · {eventCount} event{eventCount === 1 ? '' : 's'})
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-warning/15 text-warning uppercase tracking-wider">Pre-Scout</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surfaceElevated border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Event</th>
                    <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Match</th>
                    <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Video</th>
                    <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Start</th>
                    <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Scored</th>
                    <th className="hidden md:table-cell px-3 py-3 text-center text-textSecondary text-sm font-semibold">Auto Climb</th>
                    <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Auto Pts</th>
                    <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Scored</th>
                    <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Passes</th>
                    <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Teleop Pts</th>
                    <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Climb</th>
                    <th className="hidden md:table-cell px-3 py-3 text-right text-textSecondary text-sm font-semibold">Endgame Pts</th>
                    <th className="px-3 py-3 text-right text-textSecondary text-sm font-semibold">Total Pts</th>
                    <th className="px-3 py-3 text-center text-textSecondary text-sm font-semibold">Flags</th>
                    <th className="px-3 py-3 text-left text-textSecondary text-sm font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allEntries.map((entry, idx) => {
                    const points = estimateMatchPoints(entry);
                    const climb = parseClimbLevel(entry.climb_level);
                    const startZone = getStartZone(entry);
                    const autoScored = entry.auton_FUEL_SCORE;
                    const teleopScored = entry.teleop_FUEL_SCORE;
                    const passes = entry.auton_FUEL_PASS + entry.teleop_FUEL_PASS;
                    const tbaMatch = preScoutTbaMatches.get(entry.match_key);
                    const videoUrl = tbaMatch ? getMatchVideoUrl(tbaMatch) : null;
                    const tbaPageUrl = `https://www.thebluealliance.com/match/${entry.match_key}`;
                    return (
                      <tr key={entry.id} className={`hover:bg-interactive transition-colors ${idx % 2 === 0 ? 'bg-surfaceAlt' : ''}`}>
                        <td className="px-3 py-3">
                          <span className="text-xs font-bold font-mono px-2 py-1 rounded bg-warning/15 text-warning uppercase tracking-wide">
                            {entry.event_key}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-semibold">Q{entry.match_number}</td>
                        <td className="px-3 py-3 text-center">
                          {videoUrl ? (
                            <button
                              onClick={() => onSelectVideo({ matchNumber: entry.match_number, videoUrl, eventKey: entry.event_key })}
                              className="p-1 text-danger hover:bg-danger/10 rounded transition-colors"
                              title="Watch match video"
                            >
                              <Play size={16} fill="currentColor" />
                            </button>
                          ) : (
                            <a
                              href={tbaPageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 inline-block text-textMuted hover:text-textSecondary hover:bg-surfaceElevated rounded transition-colors"
                              title="View on The Blue Alliance"
                            >
                              <Play size={16} />
                            </a>
                          )}
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 text-center text-textSecondary">
                          {startZone > 0 ? `Z${startZone}` : '-'}
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{autoScored}</td>
                        <td className="hidden md:table-cell px-3 py-3 text-center">
                          {entry.auton_AUTON_CLIMBED > 0 ? (
                            <span className="text-success font-semibold">Y</span>
                          ) : (
                            <span className="text-textMuted">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{Math.round(points.autoPoints)}</td>
                        <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{teleopScored}</td>
                        <td className="hidden md:table-cell px-3 py-3 text-right text-textSecondary">{passes > 0 ? passes : '-'}</td>
                        <td className="px-3 py-3 text-right font-semibold">{Math.round(points.teleopPoints)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={climb >= 2 ? 'font-semibold text-success' : climb === 1 ? 'font-semibold' : 'text-textMuted'}>
                            {climbLabel(climb)}
                          </span>
                          {entry.teleop_climb_failed && <span className="ml-1 text-danger text-xs">(failed)</span>}
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 text-right font-semibold">{points.endgamePoints}</td>
                        <td className="px-3 py-3 text-right font-bold">{Math.round(points.total)}</td>
                        <td className="px-3 py-3 text-center text-xs space-x-1">
                          {entry.played_defense && <span className="text-blueAlliance">DEF</span>}
                          {entry.eff_rep_bulldozed_fuel && <span className="text-blueAlliance">BULLDOZE</span>}
                          {entry.poor_fuel_scoring_accuracy && <span className="text-warning">POOR ACC</span>}
                          {entry.no_robot_on_field && <span className="text-danger">NO ROBOT</span>}
                          {entry.lost_connection && <span className="text-danger">LOST</span>}
                          {entry.auton_did_nothing && <span className="text-warning">MID AUTO</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-textSecondary max-w-[200px] truncate" title={entry.notes}>
                          {entry.notes}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default MatchHistoryTab;

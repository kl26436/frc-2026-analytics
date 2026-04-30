import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { AlertTriangle, CheckCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { parseClimbLevel, getAlliance, getStation } from '../types/scouting';
import type { PgTBAMatch } from '../types/scouting';

type ClimbComparisonRow = {
  matchNum: number;
  teamNumber: number;
  scoutLevel: number;
  tbaLevel: number;
  isMatch: boolean;
};

const card = 'bg-surface rounded-xl border border-border p-6 shadow-card';
const cardHeader = 'text-base font-bold flex items-center gap-2 mb-4';

function DataQuality() {
  const scoutEntries = useAnalyticsStore(state => state.scoutEntries);
  const pgTbaMatches = useAnalyticsStore(state => state.pgTbaMatches);
  const tbaData = useAnalyticsStore(state => state.tbaData);
  const fetchTBAData = useAnalyticsStore(state => state.fetchTBAData);
  const localOPR = useAnalyticsStore(state => state.localOPR);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);

  useEffect(() => {
    if (!tbaData) fetchTBAData();
  }, [tbaData, fetchTBAData]);

  const [climbMismatchOnly, setClimbMismatchOnly] = useState(true);

  // ── Climb Comparison Table ──
  const climbComparison = useMemo(() => {
    if (!pgTbaMatches.length || !scoutEntries.length) return [];

    const tbaByMatch = new Map<number, PgTBAMatch>();
    pgTbaMatches.forEach(m => {
      if (m.comp_level === 'qm') tbaByMatch.set(m.match_number, m);
    });

    const rows: ClimbComparisonRow[] = [];

    scoutEntries.forEach(e => {
      const alliance = getAlliance(e.configured_team);
      const station = getStation(e.configured_team);
      const tbaMatch = tbaByMatch.get(e.match_number);
      if (!tbaMatch) return;

      const tbaClimbField = `${alliance}_endGameTowerRobot${station}` as keyof PgTBAMatch;
      const tbaClimbStr = tbaMatch[tbaClimbField] as string | undefined;
      if (!tbaClimbStr) return;

      const tbaLevel = tbaClimbStr.includes('3') ? 3 : tbaClimbStr.includes('2') ? 2 : tbaClimbStr.includes('1') ? 1 : 0;
      const scoutLevel = parseClimbLevel(e.climb_level);

      rows.push({ matchNum: e.match_number, teamNumber: e.team_number, scoutLevel, tbaLevel, isMatch: scoutLevel === tbaLevel });
    });

    return rows.sort((a, b) => a.matchNum - b.matchNum);
  }, [scoutEntries, pgTbaMatches]);

  const displayedClimbRows = useMemo(() => {
    return climbMismatchOnly ? climbComparison.filter(r => !r.isMatch) : climbComparison;
  }, [climbComparison, climbMismatchOnly]);

  // ── Empty State ──
  if (scoutEntries.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <AlertTriangle className="text-warning" size={24} />
            Data Quality
          </h1>
          <p className="text-sm text-textSecondary mt-1">Cross-reference scouted data against TBA official results</p>
        </div>
        <div className={card}>
          <div className="text-center py-12">
            <AlertTriangle size={40} className="mx-auto text-textMuted mb-4" />
            <p className="text-lg font-semibold text-textPrimary">No Scout Data</p>
            <p className="text-sm text-textSecondary mt-1">Scout entries will appear here once synced.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <AlertTriangle className="text-warning" size={24} />
          Data Quality
        </h1>
        <p className="text-sm text-textSecondary mt-1">Cross-reference scouted data against TBA official results to find and fix errors</p>
      </div>

      {/* Rank Comparison — Scout Avg vs OPR */}
      {localOPR && localOPR.totalOpr.size > 0 && teamStatistics.length > 0 && (() => {
        // Build scouting rank (by avgTotalPoints desc)
        const scoutRanked = [...teamStatistics]
          .filter(t => t.matchesPlayed > 0)
          .sort((a, b) => b.avgTotalPoints - a.avgTotalPoints);
        const scoutRankMap = new Map<number, number>();
        scoutRanked.forEach((t, i) => scoutRankMap.set(t.teamNumber, i + 1));

        // Build OPR rank (by totalOpr desc)
        const oprEntries = [...localOPR.totalOpr.entries()].sort((a, b) => b[1] - a[1]);
        const oprRankMap = new Map<number, number>();
        oprEntries.forEach(([team], i) => oprRankMap.set(team, i + 1));

        // Build comparison rows
        const rows = scoutRanked
          .filter(t => oprRankMap.has(t.teamNumber))
          .map(t => {
            const sRank = scoutRankMap.get(t.teamNumber)!;
            const oRank = oprRankMap.get(t.teamNumber)!;
            return {
              teamNumber: t.teamNumber,
              teamName: t.teamName ?? '',
              scoutRank: sRank,
              oprRank: oRank,
              diff: sRank - oRank, // negative = scout ranks higher, positive = OPR ranks higher
              avgPts: t.avgTotalPoints,
              opr: localOPR.totalOpr.get(t.teamNumber) ?? 0,
            };
          });

        const outliers = rows.filter(r => Math.abs(r.diff) >= 5);
        const overRanked = outliers.filter(r => r.diff < 0).sort((a, b) => a.diff - b.diff);
        const underRanked = outliers.filter(r => r.diff > 0).sort((a, b) => b.diff - a.diff);

        return (
          <div className={card}>
            <h2 className={cardHeader}>
              <BarChart3 className="text-accent" size={18} />
              Rank Comparison: Scout Avg vs OPR
              <span className="text-xs text-textMuted font-normal ml-1">Teams where rank differs by 5+ spots</span>
            </h2>

            {outliers.length === 0 ? (
              <p className="text-center text-textMuted py-6 text-sm">All teams rank within 4 spots — no significant outliers</p>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex gap-3 text-xs">
                  <span className="px-2 py-1 rounded-full bg-success/15 text-success font-bold">
                    {rows.length - outliers.length} within ±4
                  </span>
                  <span className="px-2 py-1 rounded-full bg-warning/15 text-warning font-bold">
                    {outliers.filter(r => Math.abs(r.diff) < 10).length} off 5–9
                  </span>
                  <span className="px-2 py-1 rounded-full bg-danger/15 text-danger font-bold">
                    {outliers.filter(r => Math.abs(r.diff) >= 10).length} off 10+
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Over-ranked by scout (scout ranks higher than OPR thinks) */}
                  <div>
                    <h3 className="text-sm font-bold text-success mb-2">Scout Ranks Higher Than OPR</h3>
                    <p className="text-xs text-textMuted mb-2">These teams look better in scouting than OPR suggests</p>
                    {overRanked.length === 0 ? (
                      <p className="text-xs text-textMuted">None</p>
                    ) : (
                      <div className="space-y-1">
                        {overRanked.map(r => (
                          <div key={r.teamNumber} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                            Math.abs(r.diff) >= 10 ? 'bg-danger/10' : 'bg-warning/10'
                          }`}>
                            <div>
                              <Link to={`/teams/${r.teamNumber}`} className="font-bold hover:text-accent transition-colors">{r.teamNumber}</Link>
                              <span className="text-textMuted text-xs ml-1.5">{r.teamName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono">
                              <span>Scout <span className="font-bold">#{r.scoutRank}</span></span>
                              <span>OPR <span className="font-bold">#{r.oprRank}</span></span>
                              <span className={`font-bold ${Math.abs(r.diff) >= 10 ? 'text-danger' : 'text-warning'}`}>
                                {r.diff > 0 ? '+' : ''}{r.diff}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Under-ranked by scout (OPR ranks higher than scout thinks) */}
                  <div>
                    <h3 className="text-sm font-bold text-danger mb-2">OPR ranks higher than scout</h3>
                    <p className="text-xs text-textMuted mb-2">These teams look better in OPR than scouting suggests</p>
                    {underRanked.length === 0 ? (
                      <p className="text-xs text-textMuted">None</p>
                    ) : (
                      <div className="space-y-1">
                        {underRanked.map(r => (
                          <div key={r.teamNumber} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                            Math.abs(r.diff) >= 10 ? 'bg-danger/10' : 'bg-warning/10'
                          }`}>
                            <div>
                              <Link to={`/teams/${r.teamNumber}`} className="font-bold hover:text-accent transition-colors">{r.teamNumber}</Link>
                              <span className="text-textMuted text-xs ml-1.5">{r.teamName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono">
                              <span>Scout <span className="font-bold">#{r.scoutRank}</span></span>
                              <span>OPR <span className="font-bold">#{r.oprRank}</span></span>
                              <span className={`font-bold ${Math.abs(r.diff) >= 10 ? 'text-danger' : 'text-warning'}`}>
                                +{r.diff}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Full rank table */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-textSecondary hover:text-textPrimary transition-colors">
                    Show full rank table ({rows.length} teams)
                  </summary>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-textMuted">
                          <th className="text-left py-2 px-3 font-medium">Team</th>
                          <th className="text-center py-2 px-3 font-medium">Scout Rank</th>
                          <th className="text-center py-2 px-3 font-medium">Avg Pts</th>
                          <th className="text-center py-2 px-3 font-medium">OPR Rank</th>
                          <th className="text-center py-2 px-3 font-medium">OPR</th>
                          <th className="text-center py-2 px-3 font-medium">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const absDiff = Math.abs(r.diff);
                          const diffColor = absDiff >= 10 ? 'text-danger font-bold' : absDiff >= 5 ? 'text-warning font-bold' : 'text-textMuted';
                          return (
                            <tr key={r.teamNumber} className={`border-b border-border/50 ${
                              absDiff >= 10 ? 'bg-danger/5' : absDiff >= 5 ? 'bg-warning/5' : i % 2 === 0 ? 'bg-surfaceAlt' : ''
                            }`}>
                              <td className="py-2 px-3">
                                <Link to={`/teams/${r.teamNumber}`} className="font-bold hover:text-accent transition-colors">{r.teamNumber}</Link>
                                <span className="text-textMuted text-xs ml-1.5 hidden sm:inline">{r.teamName}</span>
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-semibold">#{r.scoutRank}</td>
                              <td className="py-2 px-3 text-center font-mono text-textSecondary">{r.avgPts.toFixed(1)}</td>
                              <td className="py-2 px-3 text-center font-mono font-semibold">#{r.oprRank}</td>
                              <td className="py-2 px-3 text-center font-mono text-textSecondary">{r.opr.toFixed(1)}</td>
                              <td className={`py-2 px-3 text-center font-mono ${diffColor}`}>
                                {r.diff > 0 ? '+' : ''}{r.diff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </div>
        );
      })()}

      {/* Climb Comparison Table */}
      <div className={card}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className={`${cardHeader} mb-0`}>
            <TrendingUp className="text-blueAlliance" size={18} />
            Climb Comparison
            <span className="text-xs text-textMuted font-normal ml-1">Scout climb level vs TBA endgame data</span>
          </h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={climbMismatchOnly}
              onChange={e => setClimbMismatchOnly(e.target.checked)}
              className="rounded border-border accent-danger"
            />
            <span className="text-textSecondary">Mismatches only</span>
            {climbMismatchOnly && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger">
                {climbComparison.filter(r => !r.isMatch).length}
              </span>
            )}
          </label>
        </div>

        {displayedClimbRows.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:-mx-6 mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-textMuted">
                  <th className="text-left py-2 px-4 font-medium">Match</th>
                  <th className="text-left py-2 px-3 font-medium">Team</th>
                  <th className="text-center py-2 px-3 font-medium">Scout Level</th>
                  <th className="text-center py-2 px-3 font-medium">TBA Level</th>
                  <th className="text-center py-2 px-3 font-medium">Match?</th>
                </tr>
              </thead>
              <tbody>
                {displayedClimbRows.map((row, i) => (
                  <tr
                    key={`${row.matchNum}_${row.teamNumber}`}
                    className={`border-b border-border/50 ${
                      !row.isMatch
                        ? 'bg-danger/5 hover:bg-danger/10'
                        : i % 2 === 0 ? 'bg-surfaceAlt hover:bg-surfaceElevated' : 'hover:bg-surfaceElevated'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold">Q{row.matchNum}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold">{row.teamNumber}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-warning/20 text-warning text-xs font-bold">L{row.scoutLevel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-blueAlliance/20 text-blueAlliance text-xs font-bold">L{row.tbaLevel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {row.isMatch ? (
                        <CheckCircle size={16} className="inline text-success" />
                      ) : (
                        <AlertTriangle size={16} className="inline text-danger" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-textMuted py-8 text-sm mt-4">
            {climbMismatchOnly ? 'No climb mismatches found' : 'No climb comparison data available'}
          </p>
        )}
      </div>

    </div>
  );
}

export default DataQuality;

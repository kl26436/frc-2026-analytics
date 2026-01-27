import { useState, useMemo } from 'react';
import { Swords, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import type { TeamStatistics } from '../types/scouting';

// ─── Interfaces ───────────────────────────────────────────────

interface TeamBreakdown {
  teamNumber: number;
  teamName?: string;
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  totalPoints: number;
  reliability: number;
  matchesPlayed: number;
}

interface AlliancePrediction {
  totalScore: number;
  autoScore: number;
  teleopScore: number;
  endgameScore: number;
  reliability: number;
  confidence: 'high' | 'medium' | 'low';
  teams: TeamBreakdown[];
}

interface MatchupResult {
  red: AlliancePrediction;
  blue: AlliancePrediction;
  scoreDiff: number;
  favoredAlliance: 'red' | 'blue' | 'even';
}

// ─── Prediction Logic ─────────────────────────────────────────

function predictAlliance(teamNumbers: number[], stats: TeamStatistics[]): AlliancePrediction {
  const teams: TeamBreakdown[] = teamNumbers.map(num => {
    const s = stats.find(t => t.teamNumber === num);
    if (!s) return { teamNumber: num, autoPoints: 0, teleopPoints: 0, endgamePoints: 0, totalPoints: 0, reliability: 0.5, matchesPlayed: 0 };

    const reliability = 1 - Math.min((s.diedRate + s.noShowRate) / 100, 0.5);
    return {
      teamNumber: num,
      teamName: s.teamName,
      autoPoints: s.avgAutoPoints * reliability,
      teleopPoints: s.avgTeleopPoints * reliability,
      endgamePoints: s.avgEndgamePoints * reliability,
      totalPoints: s.avgTotalPoints * reliability,
      reliability,
      matchesPlayed: s.matchesPlayed,
    };
  });

  const autoScore = teams.reduce((sum, t) => sum + t.autoPoints, 0);
  const teleopScore = teams.reduce((sum, t) => sum + t.teleopPoints, 0);
  const endgameScore = teams.reduce((sum, t) => sum + t.endgamePoints, 0);
  const totalScore = autoScore + teleopScore + endgameScore;
  const avgReliability = teams.length > 0 ? teams.reduce((sum, t) => sum + t.reliability, 0) / teams.length : 0;
  const minMatches = teams.length > 0 ? Math.min(...teams.map(t => t.matchesPlayed)) : 0;
  const confidence: 'high' | 'medium' | 'low' = minMatches >= 6 ? 'high' : minMatches >= 3 ? 'medium' : 'low';

  return { totalScore, autoScore, teleopScore, endgameScore, reliability: avgReliability, confidence, teams };
}

function computeMatchup(redTeams: number[], blueTeams: number[], stats: TeamStatistics[]): MatchupResult {
  const red = predictAlliance(redTeams, stats);
  const blue = predictAlliance(blueTeams, stats);
  const scoreDiff = Math.abs(red.totalScore - blue.totalScore);
  const favoredAlliance: 'red' | 'blue' | 'even' = scoreDiff < 1 ? 'even' : red.totalScore > blue.totalScore ? 'red' : 'blue';
  return { red, blue, scoreDiff, favoredAlliance };
}

// ─── Component ────────────────────────────────────────────────

type Mode = 'tba' | 'custom';

export default function AlliancePredictor() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);

  const alliances = tbaData?.alliances ?? [];
  const hasAlliances = alliances.length > 0;

  const [mode, setMode] = useState<Mode>(hasAlliances ? 'tba' : 'custom');
  const [redAllianceIdx, setRedAllianceIdx] = useState<number | null>(null);
  const [blueAllianceIdx, setBlueAllianceIdx] = useState<number | null>(null);

  // Custom mode inputs
  const [customRed, setCustomRed] = useState<string[]>(['', '', '']);
  const [customBlue, setCustomBlue] = useState<string[]>(['', '', '']);

  // Parse alliance team numbers from TBA data
  const allianceTeams = useMemo(() => {
    return alliances.map(a => a.picks.map(teamKeyToNumber));
  }, [alliances]);

  // Get team numbers for current selection
  const redTeams = useMemo<number[]>(() => {
    if (mode === 'tba' && redAllianceIdx !== null) {
      return allianceTeams[redAllianceIdx] ?? [];
    }
    return customRed.map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
  }, [mode, redAllianceIdx, allianceTeams, customRed]);

  const blueTeams = useMemo<number[]>(() => {
    if (mode === 'tba' && blueAllianceIdx !== null) {
      return allianceTeams[blueAllianceIdx] ?? [];
    }
    return customBlue.map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
  }, [mode, blueAllianceIdx, allianceTeams, customBlue]);

  const hasRedTeams = redTeams.length > 0;
  const hasBlueTeams = blueTeams.length > 0;
  const canPredict = hasRedTeams && hasBlueTeams;

  const matchup = useMemo<MatchupResult | null>(() => {
    if (!canPredict) return null;
    return computeMatchup(redTeams, blueTeams, teamStatistics);
  }, [canPredict, redTeams, blueTeams, teamStatistics]);

  // Quick matchups grid (all 8x8 when in TBA mode)
  const quickGrid = useMemo(() => {
    if (mode !== 'tba' || allianceTeams.length === 0) return null;
    const grid: MatchupResult[][] = [];
    for (let r = 0; r < allianceTeams.length; r++) {
      const row: MatchupResult[] = [];
      for (let b = 0; b < allianceTeams.length; b++) {
        row.push(computeMatchup(allianceTeams[r], allianceTeams[b], teamStatistics));
      }
      grid.push(row);
    }
    return grid;
  }, [mode, allianceTeams, teamStatistics]);

  const updateCustomTeam = (alliance: 'red' | 'blue', index: number, value: string) => {
    if (alliance === 'red') {
      const next = [...customRed];
      next[index] = value;
      setCustomRed(next);
    } else {
      const next = [...customBlue];
      next[index] = value;
      setCustomBlue(next);
    }
  };

  const confidenceColor = (c: 'high' | 'medium' | 'low') =>
    c === 'high' ? 'text-success' : c === 'medium' ? 'text-warning' : 'text-danger';

  const confidenceBg = (c: 'high' | 'medium' | 'low') =>
    c === 'high' ? 'bg-success/20 text-success' : c === 'medium' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger';

  const allianceLabel = (idx: number) => alliances[idx]?.name || `Alliance ${idx + 1}`;

  const allianceTeamsList = (idx: number) => {
    const teams = allianceTeams[idx];
    if (!teams) return '';
    return teams.join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Swords size={28} className="text-textSecondary" />
        <div>
          <h1 className="text-2xl font-bold">Alliance Matchup Predictor</h1>
          <p className="text-textSecondary text-sm">Predict scores for alliance matchups based on team statistics</p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('tba')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            mode === 'tba' ? 'bg-interactive text-textPrimary' : 'bg-surface text-textSecondary hover:bg-surfaceElevated'
          }`}
        >
          TBA Alliances
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            mode === 'custom' ? 'bg-interactive text-textPrimary' : 'bg-surface text-textSecondary hover:bg-surfaceElevated'
          }`}
        >
          Custom Matchup
        </button>
      </div>

      {/* Alliance Selection */}
      {mode === 'tba' ? (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          {!hasAlliances && (
            <div className="flex items-center gap-2 text-warning text-sm">
              <AlertTriangle size={16} />
              <span>No alliance data from TBA. Use Custom Matchup or load TBA data from the Event page.</span>
            </div>
          )}
          {hasAlliances && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Red Alliance Selector */}
              <div>
                <label className="block text-sm font-medium text-redAlliance mb-1">Red Alliance</label>
                <select
                  value={redAllianceIdx ?? ''}
                  onChange={e => setRedAllianceIdx(e.target.value === '' ? null : parseInt(e.target.value))}
                  className="w-full bg-surfaceElevated border border-border rounded px-3 py-2 text-textPrimary"
                >
                  <option value="">Select alliance...</option>
                  {alliances.map((_, i) => (
                    <option key={i} value={i}>
                      {allianceLabel(i)} — {allianceTeamsList(i)}
                    </option>
                  ))}
                </select>
                {redAllianceIdx !== null && (
                  <p className="text-xs text-textSecondary mt-1">Teams: {allianceTeamsList(redAllianceIdx)}</p>
                )}
              </div>
              {/* Blue Alliance Selector */}
              <div>
                <label className="block text-sm font-medium text-blueAlliance mb-1">Blue Alliance</label>
                <select
                  value={blueAllianceIdx ?? ''}
                  onChange={e => setBlueAllianceIdx(e.target.value === '' ? null : parseInt(e.target.value))}
                  className="w-full bg-surfaceElevated border border-border rounded px-3 py-2 text-textPrimary"
                >
                  <option value="">Select alliance...</option>
                  {alliances.map((_, i) => (
                    <option key={i} value={i}>
                      {allianceLabel(i)} — {allianceTeamsList(i)}
                    </option>
                  ))}
                </select>
                {blueAllianceIdx !== null && (
                  <p className="text-xs text-textSecondary mt-1">Teams: {allianceTeamsList(blueAllianceIdx)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Red custom inputs */}
            <div>
              <label className="block text-sm font-medium text-redAlliance mb-2">Red Alliance</label>
              <div className="flex gap-2">
                {customRed.map((val, i) => (
                  <input
                    key={i}
                    type="number"
                    placeholder={`Team ${i + 1}`}
                    value={val}
                    onChange={e => updateCustomTeam('red', i, e.target.value)}
                    className="w-full bg-surfaceElevated border border-border rounded px-3 py-2 text-textPrimary placeholder-textMuted"
                  />
                ))}
              </div>
            </div>
            {/* Blue custom inputs */}
            <div>
              <label className="block text-sm font-medium text-blueAlliance mb-2">Blue Alliance</label>
              <div className="flex gap-2">
                {customBlue.map((val, i) => (
                  <input
                    key={i}
                    type="number"
                    placeholder={`Team ${i + 1}`}
                    value={val}
                    onChange={e => updateCustomTeam('blue', i, e.target.value)}
                    className="w-full bg-surfaceElevated border border-border rounded px-3 py-2 text-textPrimary placeholder-textMuted"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No stats warning */}
      {teamStatistics.length === 0 && (
        <div className="flex items-center gap-2 text-warning text-sm bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
          <AlertTriangle size={16} />
          <span>No scouting data loaded. Predictions require team statistics to work.</span>
        </div>
      )}

      {/* Score Prediction Display */}
      {matchup && (
        <>
          {/* Scoreboard */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex flex-col items-center gap-4">
              {/* Main Score */}
              <div className="flex items-center gap-4 md:gap-8 w-full justify-center">
                <div className="text-center flex-1">
                  <p className="text-sm font-medium text-redAlliance mb-1">
                    {mode === 'tba' && redAllianceIdx !== null ? allianceLabel(redAllianceIdx) : 'Red Alliance'}
                  </p>
                  <p className="text-5xl md:text-6xl font-bold text-redAlliance">{matchup.red.totalScore.toFixed(1)}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${confidenceBg(matchup.red.confidence)}`}>
                      {matchup.red.confidence} confidence
                    </span>
                  </div>
                </div>
                <div className="text-textMuted text-2xl font-bold">vs</div>
                <div className="text-center flex-1">
                  <p className="text-sm font-medium text-blueAlliance mb-1">
                    {mode === 'tba' && blueAllianceIdx !== null ? allianceLabel(blueAllianceIdx) : 'Blue Alliance'}
                  </p>
                  <p className="text-5xl md:text-6xl font-bold text-blueAlliance">{matchup.blue.totalScore.toFixed(1)}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${confidenceBg(matchup.blue.confidence)}`}>
                      {matchup.blue.confidence} confidence
                    </span>
                  </div>
                </div>
              </div>

              {/* Favored Banner */}
              {matchup.favoredAlliance !== 'even' ? (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  matchup.favoredAlliance === 'red' ? 'bg-redAlliance/20 text-redAlliance' : 'bg-blueAlliance/20 text-blueAlliance'
                }`}>
                  <ArrowRight size={16} />
                  <span className="font-medium">
                    {matchup.favoredAlliance === 'red' ? 'Red' : 'Blue'} favored by {matchup.scoreDiff.toFixed(1)} points
                  </span>
                </div>
              ) : (
                <div className="px-4 py-2 rounded-lg bg-surfaceElevated text-textSecondary">
                  Even matchup (within 1 point)
                </div>
              )}
            </div>
          </div>

          {/* Phase Breakdown Table */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surfaceElevated">
                  <th className="px-4 py-3 text-left text-textSecondary font-medium">Phase</th>
                  <th className="px-4 py-3 text-right text-redAlliance font-medium">Red</th>
                  <th className="px-4 py-3 text-right text-blueAlliance font-medium">Blue</th>
                  <th className="px-4 py-3 text-right text-textSecondary font-medium">Advantage</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: 'Auto', red: matchup.red.autoScore, blue: matchup.blue.autoScore },
                  { label: 'Teleop', red: matchup.red.teleopScore, blue: matchup.blue.teleopScore },
                  { label: 'Endgame', red: matchup.red.endgameScore, blue: matchup.blue.endgameScore },
                ] as const).map(row => {
                  const diff = row.red - row.blue;
                  const advColor = Math.abs(diff) < 0.5 ? 'text-textMuted' : diff > 0 ? 'text-redAlliance' : 'text-blueAlliance';
                  const advText = Math.abs(diff) < 0.5 ? 'Even' : `${diff > 0 ? 'Red' : 'Blue'} +${Math.abs(diff).toFixed(1)}`;
                  return (
                    <tr key={row.label} className="border-t border-border">
                      <td className="px-4 py-3 text-textPrimary">{row.label}</td>
                      <td className="px-4 py-3 text-right text-redAlliance">{row.red.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-blueAlliance">{row.blue.toFixed(1)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${advColor}`}>{advText}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border bg-surfaceElevated">
                  <td className="px-4 py-3 font-bold text-textPrimary">TOTAL</td>
                  <td className="px-4 py-3 text-right font-bold text-redAlliance">{matchup.red.totalScore.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blueAlliance">{matchup.blue.totalScore.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    matchup.favoredAlliance === 'even' ? 'text-textMuted' : matchup.favoredAlliance === 'red' ? 'text-redAlliance' : 'text-blueAlliance'
                  }`}>
                    {matchup.favoredAlliance === 'even'
                      ? 'Even'
                      : `${matchup.favoredAlliance === 'red' ? 'Red' : 'Blue'} +${matchup.scoreDiff.toFixed(1)}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Per-Team Contribution Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Red Team Breakdown */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="bg-redAlliance/10 px-4 py-2 border-b border-border">
                <h3 className="font-medium text-redAlliance text-sm">Red Alliance Breakdown</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surfaceElevated">
                    <th className="px-3 py-2 text-left text-textSecondary">Team</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Auto</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Teleop</th>
                    <th className="px-3 py-2 text-right text-textSecondary">End</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Total</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Rel.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...matchup.red.teams].sort((a, b) => b.totalPoints - a.totalPoints).map(t => (
                    <tr key={t.teamNumber} className="border-t border-border">
                      <td className="px-3 py-2 text-textPrimary font-medium">{t.teamNumber}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.autoPoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.teleopPoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.endgamePoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textPrimary font-medium">{t.totalPoints.toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right ${confidenceColor(t.reliability >= 0.9 ? 'high' : t.reliability >= 0.75 ? 'medium' : 'low')}`}>
                        {(t.reliability * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Blue Team Breakdown */}
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="bg-blueAlliance/10 px-4 py-2 border-b border-border">
                <h3 className="font-medium text-blueAlliance text-sm">Blue Alliance Breakdown</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surfaceElevated">
                    <th className="px-3 py-2 text-left text-textSecondary">Team</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Auto</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Teleop</th>
                    <th className="px-3 py-2 text-right text-textSecondary">End</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Total</th>
                    <th className="px-3 py-2 text-right text-textSecondary">Rel.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...matchup.blue.teams].sort((a, b) => b.totalPoints - a.totalPoints).map(t => (
                    <tr key={t.teamNumber} className="border-t border-border">
                      <td className="px-3 py-2 text-textPrimary font-medium">{t.teamNumber}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.autoPoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.teleopPoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textSecondary">{t.endgamePoints.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-textPrimary font-medium">{t.totalPoints.toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right ${confidenceColor(t.reliability >= 0.9 ? 'high' : t.reliability >= 0.75 ? 'medium' : 'low')}`}>
                        {(t.reliability * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Quick Matchups Grid */}
      {quickGrid && quickGrid.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-medium text-textPrimary mb-3">Quick Matchups Grid</h3>
          <p className="text-xs text-textSecondary mb-3">Rows = Red, Columns = Blue. Click a cell to load that matchup.</p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-textMuted"></th>
                  {allianceTeams.map((_, bIdx) => (
                    <th key={bIdx} className="px-2 py-1 text-blueAlliance font-medium whitespace-nowrap">
                      A{bIdx + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quickGrid.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="px-2 py-1 text-redAlliance font-medium whitespace-nowrap">A{rIdx + 1}</td>
                    {row.map((cell, bIdx) => {
                      const isSelected = redAllianceIdx === rIdx && blueAllianceIdx === bIdx;
                      const bgColor = cell.favoredAlliance === 'even'
                        ? 'bg-surfaceElevated'
                        : cell.favoredAlliance === 'red'
                        ? 'bg-redAlliance/20'
                        : 'bg-blueAlliance/20';
                      const textColor = cell.favoredAlliance === 'even'
                        ? 'text-textMuted'
                        : cell.favoredAlliance === 'red'
                        ? 'text-redAlliance'
                        : 'text-blueAlliance';
                      return (
                        <td key={bIdx} className="px-1 py-1">
                          <button
                            onClick={() => { setRedAllianceIdx(rIdx); setBlueAllianceIdx(bIdx); }}
                            className={`w-14 h-10 rounded text-center font-medium transition-all ${bgColor} ${textColor} hover:ring-1 hover:ring-textSecondary ${
                              isSelected ? 'ring-2 ring-textPrimary' : ''
                            }`}
                          >
                            {cell.favoredAlliance === 'even'
                              ? '='
                              : `${cell.favoredAlliance === 'red' ? 'R' : 'B'}+${cell.scoreDiff.toFixed(0)}`}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!canPredict && (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-textSecondary">
          <Swords size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Select two alliances to predict a matchup</p>
          <p className="text-sm mt-1">
            {mode === 'tba'
              ? 'Choose a red and blue alliance from the dropdowns above'
              : 'Enter team numbers for both alliances above'}
          </p>
        </div>
      )}
    </div>
  );
}

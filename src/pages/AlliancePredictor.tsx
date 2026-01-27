import { useState, useMemo } from 'react';
import { Swords, AlertTriangle, ArrowRight, Trophy, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { computeMatchup, type MatchupResult } from '../utils/predictions';
import type { TBAMatch } from '../types/tba';

const OUR_TEAM = 148;

// ─── Component ────────────────────────────────────────────────

type Mode = 'quals' | 'playoffs' | 'custom';

export default function AlliancePredictor() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);

  const alliances = tbaData?.alliances ?? [];
  const matches = tbaData?.matches ?? [];
  const hasAlliances = alliances.length > 0;

  // Qual matches sorted by match number
  const qualMatches = useMemo(() => {
    return matches
      .filter(m => m.comp_level === 'qm')
      .sort((a, b) => a.match_number - b.match_number);
  }, [matches]);
  const hasQualMatches = qualMatches.length > 0;

  const defaultMode: Mode = hasQualMatches ? 'quals' : hasAlliances ? 'playoffs' : 'custom';
  const [mode, setMode] = useState<Mode>(defaultMode);

  // Playoffs state
  const [redAllianceIdx, setRedAllianceIdx] = useState<number | null>(null);
  const [blueAllianceIdx, setBlueAllianceIdx] = useState<number | null>(null);

  // Quals state
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [filter148, setFilter148] = useState(false);

  // Custom mode inputs
  const [customRed, setCustomRed] = useState<string[]>(['', '', '']);
  const [customBlue, setCustomBlue] = useState<string[]>(['', '', '']);

  // Parse alliance team numbers from TBA data
  const allianceTeams = useMemo(() => {
    return alliances.map(a => a.picks.map(teamKeyToNumber));
  }, [alliances]);

  // Get selected qual match
  const selectedMatch = useMemo<TBAMatch | null>(() => {
    if (!selectedMatchKey) return null;
    return qualMatches.find(m => m.key === selectedMatchKey) ?? null;
  }, [selectedMatchKey, qualMatches]);

  // Get team numbers for current selection
  const redTeams = useMemo<number[]>(() => {
    if (mode === 'playoffs' && redAllianceIdx !== null) {
      return allianceTeams[redAllianceIdx] ?? [];
    }
    if (mode === 'quals' && selectedMatch) {
      return selectedMatch.alliances.red.team_keys.map(teamKeyToNumber);
    }
    return customRed.map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
  }, [mode, redAllianceIdx, allianceTeams, selectedMatch, customRed]);

  const blueTeams = useMemo<number[]>(() => {
    if (mode === 'playoffs' && blueAllianceIdx !== null) {
      return allianceTeams[blueAllianceIdx] ?? [];
    }
    if (mode === 'quals' && selectedMatch) {
      return selectedMatch.alliances.blue.team_keys.map(teamKeyToNumber);
    }
    return customBlue.map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
  }, [mode, blueAllianceIdx, allianceTeams, selectedMatch, customBlue]);

  const hasRedTeams = redTeams.length > 0;
  const hasBlueTeams = blueTeams.length > 0;
  const canPredict = hasRedTeams && hasBlueTeams;

  // Check if selected qual match has been played
  const matchPlayed = selectedMatch && selectedMatch.alliances.red.score >= 0 && selectedMatch.alliances.blue.score >= 0;
  const actualRedScore = matchPlayed ? selectedMatch!.alliances.red.score : null;
  const actualBlueScore = matchPlayed ? selectedMatch!.alliances.blue.score : null;

  const matchup = useMemo<MatchupResult | null>(() => {
    if (!canPredict) return null;
    return computeMatchup(redTeams, blueTeams, teamStatistics);
  }, [canPredict, redTeams, blueTeams, teamStatistics]);

  // Quick matchups grid (all NxN when in playoffs mode)
  const quickGrid = useMemo(() => {
    if (mode !== 'playoffs' || allianceTeams.length === 0) return null;
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

  // Filtered qual matches (148 filter)
  const filteredQualMatches = useMemo(() => {
    if (!filter148) return qualMatches;
    return qualMatches.filter(m =>
      m.alliances.red.team_keys.includes(`frc${OUR_TEAM}`) ||
      m.alliances.blue.team_keys.includes(`frc${OUR_TEAM}`)
    );
  }, [qualMatches, filter148]);

  // Qual match predictions list
  const qualPredictions = useMemo(() => {
    if (mode !== 'quals') return null;
    return filteredQualMatches.map(m => {
      const rTeams = m.alliances.red.team_keys.map(teamKeyToNumber);
      const bTeams = m.alliances.blue.team_keys.map(teamKeyToNumber);
      const result = computeMatchup(rTeams, bTeams, teamStatistics);
      const played = m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
      return { match: m, result, played, actualRed: played ? m.alliances.red.score : null, actualBlue: played ? m.alliances.blue.score : null };
    });
  }, [mode, filteredQualMatches, teamStatistics]);

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

  const redLabel = mode === 'playoffs' && redAllianceIdx !== null
    ? allianceLabel(redAllianceIdx)
    : mode === 'quals' && selectedMatch
    ? `Red (Q${selectedMatch.match_number})`
    : 'Red Alliance';

  const blueLabel = mode === 'playoffs' && blueAllianceIdx !== null
    ? allianceLabel(blueAllianceIdx)
    : mode === 'quals' && selectedMatch
    ? `Blue (Q${selectedMatch.match_number})`
    : 'Blue Alliance';

  const formatProb = (p: number) => `${(p * 100).toFixed(0)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Swords size={28} className="text-textSecondary" />
        <div>
          <h1 className="text-2xl font-bold">Alliance Matchup Predictor</h1>
          <p className="text-textSecondary text-sm">Predict scores and ranking points for alliance matchups</p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('quals')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            mode === 'quals' ? 'bg-interactive text-textPrimary' : 'bg-surface text-textSecondary hover:bg-surfaceElevated'
          }`}
        >
          Qualifying
        </button>
        <button
          onClick={() => setMode('playoffs')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            mode === 'playoffs' ? 'bg-interactive text-textPrimary' : 'bg-surface text-textSecondary hover:bg-surfaceElevated'
          }`}
        >
          Playoffs
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            mode === 'custom' ? 'bg-interactive text-textPrimary' : 'bg-surface text-textSecondary hover:bg-surfaceElevated'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Quals Mode Selection */}
      {mode === 'quals' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          {!hasQualMatches && (
            <div className="flex items-center gap-2 text-warning text-sm">
              <AlertTriangle size={16} />
              <span>No qualification match data from TBA. Load TBA data from the Event page.</span>
            </div>
          )}
          {hasQualMatches && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-textSecondary">Select Match</label>
                <button
                  onClick={() => setFilter148(!filter148)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter148 ? 'bg-warning/20 text-warning' : 'bg-surfaceElevated text-textSecondary hover:bg-interactive'
                  }`}
                >
                  {OUR_TEAM} Only
                </button>
              </div>
              <select
                value={selectedMatchKey ?? ''}
                onChange={e => setSelectedMatchKey(e.target.value || null)}
                className="w-full bg-surfaceElevated border border-border rounded px-3 py-2 text-textPrimary"
              >
                <option value="">Select a qualification match...</option>
                {filteredQualMatches.map(m => {
                  const redNums = m.alliances.red.team_keys.map(teamKeyToNumber).join(', ');
                  const blueNums = m.alliances.blue.team_keys.map(teamKeyToNumber).join(', ');
                  const played = m.alliances.red.score >= 0;
                  return (
                    <option key={m.key} value={m.key}>
                      Q{m.match_number} — Red [{redNums}] vs Blue [{blueNums}]{played ? ` (${m.alliances.red.score}-${m.alliances.blue.score})` : ''}
                    </option>
                  );
                })}
              </select>
              {selectedMatch && (
                <div className="flex gap-4 mt-2 text-xs text-textSecondary">
                  <span className="text-redAlliance">Red: {redTeams.join(', ')}</span>
                  <span className="text-blueAlliance">Blue: {blueTeams.join(', ')}</span>
                  {matchPlayed && <span className="text-textMuted">Actual: {actualRedScore}-{actualBlueScore}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Playoffs Mode Selection */}
      {mode === 'playoffs' && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          {!hasAlliances && (
            <div className="flex items-center gap-2 text-warning text-sm">
              <AlertTriangle size={16} />
              <span>No alliance data from TBA. Use Custom mode or load TBA data from the Event page.</span>
            </div>
          )}
          {hasAlliances && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      )}

      {/* Custom Mode Selection */}
      {mode === 'custom' && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <p className="text-sm font-medium text-redAlliance mb-1">{redLabel}</p>
                  <p className="text-5xl md:text-6xl font-bold text-redAlliance">{matchup.red.totalScore.toFixed(1)}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${confidenceBg(matchup.red.confidence)}`}>
                      {matchup.red.confidence} confidence
                    </span>
                  </div>
                </div>
                <div className="text-textMuted text-2xl font-bold">vs</div>
                <div className="text-center flex-1">
                  <p className="text-sm font-medium text-blueAlliance mb-1">{blueLabel}</p>
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

              {/* Actual Score Comparison (quals with played matches) */}
              {matchPlayed && actualRedScore !== null && actualBlueScore !== null && (
                <div className="w-full bg-surfaceElevated rounded-lg p-3 mt-2">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CheckCircle size={14} className="text-success" />
                    <span className="text-xs font-medium text-textSecondary uppercase tracking-wider">Actual Result</span>
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <span className="text-2xl font-bold text-redAlliance">{actualRedScore}</span>
                    <span className="text-textMuted text-sm">vs</span>
                    <span className="text-2xl font-bold text-blueAlliance">{actualBlueScore}</span>
                  </div>
                  <div className="text-center mt-1">
                    {(() => {
                      const predictedCorrect = (matchup.favoredAlliance === 'red' && actualRedScore > actualBlueScore) ||
                        (matchup.favoredAlliance === 'blue' && actualBlueScore > actualRedScore) ||
                        (matchup.favoredAlliance === 'even' && actualRedScore === actualBlueScore);
                      return predictedCorrect ? (
                        <span className="text-xs text-success flex items-center justify-center gap-1">
                          <CheckCircle size={12} /> Prediction correct
                        </span>
                      ) : (
                        <span className="text-xs text-danger flex items-center justify-center gap-1">
                          <XCircle size={12} /> Prediction incorrect
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ranking Points Prediction */}
          {(mode === 'quals' || mode === 'custom') && (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="bg-surfaceElevated px-4 py-2 border-b border-border flex items-center gap-2">
                <Trophy size={16} className="text-warning" />
                <h3 className="font-medium text-textPrimary text-sm">Ranking Point Predictions</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                {/* Red RP */}
                <div className="p-4 space-y-2">
                  <h4 className="text-sm font-medium text-redAlliance">Red Alliance RP</h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Win Probability</span>
                      <span className={matchup.redRP.winProbability >= 0.5 ? 'text-success font-medium' : 'text-textPrimary'}>
                        {formatProb(matchup.redRP.winProbability)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Expected Win RP</span>
                      <span className="text-textPrimary">{matchup.redRP.expectedWinRP.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Climb Bonus Prob</span>
                      <span className="text-textPrimary">{formatProb(matchup.redRP.climbBonusProb)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Scoring Bonus Prob</span>
                      <span className="text-textPrimary">{formatProb(matchup.redRP.scoringBonusProb)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-border pt-1.5">
                      <span className="text-textPrimary font-medium">Expected Total RP</span>
                      <span className="text-warning font-bold">{matchup.redRP.expectedTotalRP.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Blue RP */}
                <div className="p-4 space-y-2">
                  <h4 className="text-sm font-medium text-blueAlliance">Blue Alliance RP</h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Win Probability</span>
                      <span className={matchup.blueRP.winProbability >= 0.5 ? 'text-success font-medium' : 'text-textPrimary'}>
                        {formatProb(matchup.blueRP.winProbability)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Expected Win RP</span>
                      <span className="text-textPrimary">{matchup.blueRP.expectedWinRP.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Climb Bonus Prob</span>
                      <span className="text-textPrimary">{formatProb(matchup.blueRP.climbBonusProb)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textSecondary">Scoring Bonus Prob</span>
                      <span className="text-textPrimary">{formatProb(matchup.blueRP.scoringBonusProb)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-border pt-1.5">
                      <span className="text-textPrimary font-medium">Expected Total RP</span>
                      <span className="text-warning font-bold">{matchup.blueRP.expectedTotalRP.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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

      {/* Qual Predictions List */}
      {mode === 'quals' && qualPredictions && qualPredictions.length > 0 && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="bg-surfaceElevated px-4 py-2 border-b border-border flex items-center gap-2">
            <TrendingUp size={16} className="text-textSecondary" />
            <h3 className="font-medium text-textPrimary text-sm">All Qualification Match Predictions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surfaceElevated">
                  <th className="px-3 py-2 text-left text-textSecondary">Match</th>
                  <th className="px-3 py-2 text-left text-textSecondary">Red Alliance</th>
                  <th className="px-3 py-2 text-right text-redAlliance">Pred.</th>
                  <th className="px-3 py-2 text-right text-blueAlliance">Pred.</th>
                  <th className="px-3 py-2 text-left text-textSecondary">Blue Alliance</th>
                  <th className="px-3 py-2 text-center text-textSecondary">Favored</th>
                  <th className="px-3 py-2 text-right text-textSecondary">Red RP</th>
                  <th className="px-3 py-2 text-right text-textSecondary">Blue RP</th>
                  {qualPredictions.some(p => p.played) && (
                    <>
                      <th className="px-3 py-2 text-right text-textMuted">Actual</th>
                      <th className="px-3 py-2 text-center text-textMuted">Result</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {qualPredictions.map(({ match, result, played, actualRed, actualBlue }) => {
                  const redNums = match.alliances.red.team_keys.map(teamKeyToNumber);
                  const blueNums = match.alliances.blue.team_keys.map(teamKeyToNumber);
                  const isSelected = match.key === selectedMatchKey;
                  const correctPrediction = played && (
                    (result.favoredAlliance === 'red' && actualRed! > actualBlue!) ||
                    (result.favoredAlliance === 'blue' && actualBlue! > actualRed!) ||
                    (result.favoredAlliance === 'even' && actualRed === actualBlue)
                  );
                  return (
                    <tr
                      key={match.key}
                      onClick={() => setSelectedMatchKey(match.key)}
                      className={`border-t border-border cursor-pointer transition-colors ${
                        isSelected ? 'bg-interactive' : 'hover:bg-surfaceElevated'
                      }`}
                    >
                      <td className="px-3 py-2 text-textPrimary font-medium">Q{match.match_number}</td>
                      <td className="px-3 py-2 text-redAlliance">{redNums.join(', ')}</td>
                      <td className="px-3 py-2 text-right text-redAlliance font-medium">{result.red.totalScore.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right text-blueAlliance font-medium">{result.blue.totalScore.toFixed(0)}</td>
                      <td className="px-3 py-2 text-blueAlliance">{blueNums.join(', ')}</td>
                      <td className={`px-3 py-2 text-center font-medium ${
                        result.favoredAlliance === 'even' ? 'text-textMuted' : result.favoredAlliance === 'red' ? 'text-redAlliance' : 'text-blueAlliance'
                      }`}>
                        {result.favoredAlliance === 'even' ? '=' : `${result.favoredAlliance === 'red' ? 'R' : 'B'}+${result.scoreDiff.toFixed(0)}`}
                      </td>
                      <td className="px-3 py-2 text-right text-warning">{result.redRP.expectedTotalRP.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-warning">{result.blueRP.expectedTotalRP.toFixed(1)}</td>
                      {qualPredictions.some(p => p.played) && (
                        <>
                          <td className="px-3 py-2 text-right text-textMuted">
                            {played ? `${actualRed}-${actualBlue}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {played ? (
                              correctPrediction
                                ? <CheckCircle size={14} className="inline text-success" />
                                : <XCircle size={14} className="inline text-danger" />
                            ) : <span className="text-textMuted">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Prediction accuracy summary */}
          {qualPredictions.some(p => p.played) && (() => {
            const played = qualPredictions.filter(p => p.played);
            const correct = played.filter(p =>
              (p.result.favoredAlliance === 'red' && p.actualRed! > p.actualBlue!) ||
              (p.result.favoredAlliance === 'blue' && p.actualBlue! > p.actualRed!) ||
              (p.result.favoredAlliance === 'even' && p.actualRed === p.actualBlue)
            );
            return (
              <div className="px-4 py-2 border-t border-border bg-surfaceElevated flex items-center gap-4 text-xs">
                <span className="text-textSecondary">Prediction Accuracy:</span>
                <span className="font-medium text-textPrimary">
                  {correct.length}/{played.length} correct ({played.length > 0 ? ((correct.length / played.length) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick Matchups Grid (Playoffs only) */}
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
          <p className="text-lg font-medium">Select a matchup to predict</p>
          <p className="text-sm mt-1">
            {mode === 'quals'
              ? 'Choose a qualification match from the dropdown above'
              : mode === 'playoffs'
              ? 'Choose a red and blue alliance from the dropdowns above'
              : 'Enter team numbers for both alliances above'}
          </p>
        </div>
      )}
    </div>
  );
}

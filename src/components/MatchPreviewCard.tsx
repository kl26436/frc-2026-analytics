import { Eye, Flag, ChevronDown, MessageSquare } from 'lucide-react';
import { teamKeyToNumber } from '../utils/tbaApi';
import type { TBAMatch } from '../types/tba';
import type { TeamStatistics } from '../types/scouting';
import type { TeamTrend } from '../utils/trendAnalysis';
import type { computeMatchup } from '../utils/predictions';
import SourceMixFooter from './SourceMixFooter';
import WatchForBullets from './WatchForBullets';
import TeamNumberLink from './TeamNumberLink';

type MatchPrediction = ReturnType<typeof computeMatchup>;

interface MatchPreviewCardProps {
  match: TBAMatch;
  prediction: MatchPrediction;
  homeTeam: number;
  matchLabel: string;
  teamStatistics: TeamStatistics[];
  teamTrends: TeamTrend[];
  /** When true, hide the phase breakdown table (less relevant in playoffs). */
  slim?: boolean;
}

const card = 'bg-surface rounded-xl border border-border p-4 md:p-6 shadow-card';
const cardHeader = 'text-sm md:text-base font-bold flex items-center gap-2 mb-3 md:mb-4';

export function MatchPreviewCard({
  match,
  prediction,
  homeTeam,
  matchLabel,
  teamStatistics,
  teamTrends,
  slim = false,
}: MatchPreviewCardProps) {
  const isCompleted = match.alliances.red.score >= 0;
  const isUpcoming = !isCompleted;
  const isRed = match.alliances.red.team_keys.includes(`frc${homeTeam}`);

  const red = prediction.red;
  const blue = prediction.blue;
  const redRP = prediction.redRP;
  const blueRP = prediction.blueRP;
  const scoreDiff = Math.abs(prediction.scoreDiff);
  const favored = prediction.favoredAlliance;
  const favoredLabel =
    favored === 'even'
      ? 'Even matchup'
      : `${favored === 'red' ? 'Red' : 'Blue'} favored by ${scoreDiff.toFixed(1)} pts`;
  const weFavored = (isRed && favored === 'red') || (!isRed && favored === 'blue');

  const redActual = match.alliances.red.score;
  const blueActual = match.alliances.blue.score;
  const ourActual = isRed ? redActual : blueActual;
  const theirActual = isRed ? blueActual : redActual;
  const won = isCompleted && ourActual > theirActual;
  const lost = isCompleted && ourActual < theirActual;
  const predCorrect =
    isCompleted &&
    (
      (weFavored && ourActual > theirActual) ||
      (!weFavored && favored === 'even') ||
      (!weFavored && ourActual < theirActual)
    );

  const phases = [
    { label: 'Auto', red: red.autoHubScore + red.autoTowerScore, blue: blue.autoHubScore + blue.autoTowerScore },
    { label: 'Teleop', red: red.teleopHubScore, blue: blue.teleopHubScore },
    { label: 'Endgame', red: red.endgameTowerScore, blue: blue.endgameTowerScore },
    { label: 'TOTAL', red: red.totalScore, blue: blue.totalScore },
  ];

  const redNums = match.alliances.red.team_keys.map(teamKeyToNumber);
  const blueNums = match.alliances.blue.team_keys.map(teamKeyToNumber);
  const isHomeRed = redNums.includes(homeTeam);
  const allyNums = isHomeRed ? redNums : blueNums;
  const oppNums = isHomeRed ? blueNums : redNums;

  const getTeamNotes = (nums: number[]) =>
    nums
      .filter(num => num !== homeTeam)
      .map(num => {
        const stats = teamStatistics.find(t => t.teamNumber === num);
        const notes = (stats?.notesList ?? []).filter(n => n.trim().length > 0);
        return { teamNumber: num, notes: notes.slice(-3) };
      })
      .filter(t => t.notes.length > 0);

  const allyNotes = getTeamNotes(allyNums);
  const oppNotes = getTeamNotes(oppNums);
  const hasNotes = allyNotes.length > 0 || oppNotes.length > 0;
  const totalNotes = [...allyNotes, ...oppNotes].reduce((sum, t) => sum + t.notes.length, 0);

  const renderTeamNotes = (teams: typeof allyNotes) =>
    teams.map(t => (
      <div key={t.teamNumber}>
        <TeamNumberLink team={t.teamNumber} className="text-xs" />
        <div className="mt-1 space-y-1">
          {t.notes.map((note, i) => (
            <p key={i} className="text-xs text-textSecondary bg-surfaceElevated rounded px-2.5 py-1.5 leading-relaxed">
              "{note}"
            </p>
          ))}
        </div>
      </div>
    ));

  return (
    <div className={card}>
      <h2 className={cardHeader}>
        {isUpcoming ? (
          <>
            <Eye className="text-warning" size={18} /> Next Match — {matchLabel}
          </>
        ) : (
          <>
            <Flag className={won ? 'text-success' : lost ? 'text-danger' : 'text-warning'} size={18} />{' '}
            Last Match — {matchLabel}
          </>
        )}
      </h2>

      {/* Big predicted scores */}
      <div className="bg-surfaceElevated rounded-lg p-4 md:p-5">
        <div className="flex items-center justify-between">
          <AllianceColumn
            label="Red"
            color="red"
            teamKeys={match.alliances.red.team_keys}
            homeTeam={homeTeam}
            score={red.totalScore}
            min={redRP.scorePercentiles.p10}
            max={redRP.scorePercentiles.p90}
            confidence={red.confidence}
          />
          <span className="text-textMuted text-lg font-semibold px-4">vs</span>
          <AllianceColumn
            label="Blue"
            color="blue"
            teamKeys={match.alliances.blue.team_keys}
            homeTeam={homeTeam}
            score={blue.totalScore}
            min={blueRP.scorePercentiles.p10}
            max={blueRP.scorePercentiles.p90}
            confidence={blue.confidence}
          />
        </div>
        <p
          className={`text-center mt-3 text-sm font-semibold ${
            favored === 'even' ? 'text-textMuted' : weFavored ? 'text-success' : 'text-danger'
          }`}
        >
          → {favoredLabel}
        </p>
      </div>

      {/* Actual result strip */}
      {isCompleted && (
        <div
          className={`mt-4 bg-surfaceElevated rounded-lg p-4 text-center border-l-4 ${
            won ? 'border-success' : lost ? 'border-danger' : 'border-warning'
          }`}
        >
          <p className="text-[10px] text-textSecondary uppercase tracking-widest mb-1">Actual Result</p>
          <p className="text-3xl font-black">
            <span className="text-redAlliance">{redActual}</span>
            <span className="text-textMuted mx-2 text-lg">vs</span>
            <span className="text-blueAlliance">{blueActual}</span>
          </p>
          <p className={`text-xs mt-1 font-semibold ${predCorrect ? 'text-success' : 'text-danger'}`}>
            {predCorrect ? '✓ Prediction correct' : '✗ Prediction wrong'}
          </p>
        </div>
      )}

      {/* Phase breakdown table — slim mode hides this (playoffs) */}
      {!slim && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surfaceElevated text-xs uppercase tracking-wider">
                <th className="text-left py-2.5 px-3 font-semibold text-textSecondary">Phase</th>
                <th className="text-center py-2.5 px-3 font-semibold text-redAlliance">Red</th>
                <th className="text-center py-2.5 px-3 font-semibold text-blueAlliance">Blue</th>
                <th className="text-right py-2.5 px-3 font-semibold text-textSecondary">Advantage</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p, index) => {
                const diff = p.red - p.blue;
                const advLabel = Math.abs(diff) < 0.5 ? 'Even' : `${diff > 0 ? 'Red' : 'Blue'} +${Math.abs(diff).toFixed(1)}`;
                const advColor = Math.abs(diff) < 0.5 ? 'text-textMuted' : diff > 0 ? 'text-redAlliance' : 'text-blueAlliance';
                const isTotal = p.label === 'TOTAL';
                return (
                  <tr
                    key={p.label}
                    className={`border-t border-border/50 ${isTotal ? 'bg-surfaceElevated font-bold' : index % 2 === 1 ? 'bg-surfaceAlt/50' : ''}`}
                  >
                    <td className="py-2 px-3 font-medium">{p.label}</td>
                    <td className="py-2 px-3 text-center text-redAlliance">{p.red.toFixed(1)}</td>
                    <td className="py-2 px-3 text-center text-blueAlliance">{p.blue.toFixed(1)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${advColor}`}>
                      {Math.abs(diff) >= 0.5 && <span className="text-[10px] mr-0.5">{diff > 0 ? '▲' : '▼'}</span>}
                      {advLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Watch For bullets — always visible (folded in from killed Phase 6) */}
      {isUpcoming && (
        <div className="mt-4">
          <WatchForBullets
            redTeams={redNums}
            blueTeams={blueNums}
            allStats={teamStatistics}
            allTrends={teamTrends}
          />
        </div>
      )}

      {/* Collapsible Details & Scout Notes */}
      <details className="mt-4 group/detail">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-textSecondary hover:text-textPrimary transition-colors">
          <ChevronDown size={14} className="transition-transform group-open/detail:rotate-180" />
          Details{hasNotes ? ` & Scout Notes (${totalNotes})` : ''}
        </summary>
        <div className="mt-3 space-y-4">
          {/* RP Predictions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {[
              { label: 'Red', color: 'text-redAlliance', rp: redRP },
              { label: 'Blue', color: 'text-blueAlliance', rp: blueRP },
            ].map(side => (
              <div key={side.label} className="bg-surfaceElevated rounded-lg p-3">
                <p className={`text-xs font-semibold ${side.color} mb-2`}>{side.label} RP</p>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: 'Win Probability', val: `${(side.rp.winProbability * 100).toFixed(0)}%` },
                    { label: 'Energized', val: `${(side.rp.energizedProb * 100).toFixed(0)}%` },
                    { label: 'Traversal', val: `${(side.rp.traversalProb * 100).toFixed(0)}%` },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between">
                      <span className="text-textMuted">{row.label}</span>
                      <span className="font-medium">{row.val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 border-t border-border/50 font-bold">
                    <span>Expected Total RP</span>
                    <span className="text-warning">{side.rp.expectedTotalRP.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Per-team breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {[
              { label: 'Red' as const, color: 'redAlliance', headerBg: 'bg-redAlliance/10', teams: red.teams },
              { label: 'Blue' as const, color: 'blueAlliance', headerBg: 'bg-blueAlliance/10', teams: blue.teams },
            ].map(side => (
              <div key={side.label} className="overflow-hidden rounded-lg border border-border">
                <div className={`${side.headerBg} px-3 py-1.5`}>
                  <p className={`text-xs font-semibold text-${side.color}`}>{side.label} Breakdown</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-textMuted bg-surfaceElevated">
                      <th className="text-left py-1 px-2 font-medium">Team</th>
                      <th className="text-center py-1 px-1 font-medium">Auto</th>
                      <th className="text-center py-1 px-1 font-medium">Tele</th>
                      <th className="text-center py-1 px-1 font-medium">End</th>
                      <th className="text-center py-1 px-1 font-medium">Total</th>
                      <th className="text-right py-1 px-2 font-medium">Rel.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {side.teams.map(t => (
                      <tr key={t.teamNumber} className="border-t border-border/30">
                        <td className="py-1 px-2">
                          <TeamNumberLink
                            team={t.teamNumber}
                            className={t.teamNumber === homeTeam ? 'text-warning' : ''}
                          />
                        </td>
                        <td className="py-1 px-1 text-center">{(t.autoHubPoints + t.autoTowerPoints).toFixed(1)}</td>
                        <td className="py-1 px-1 text-center">{t.teleopHubPoints.toFixed(1)}</td>
                        <td className="py-1 px-1 text-center">{(t.autoTowerPoints + t.endgameTowerPoints).toFixed(1)}</td>
                        <td className="py-1 px-1 text-center font-bold">{t.totalPoints.toFixed(1)}</td>
                        <td
                          className={`py-1 px-2 text-right font-medium ${
                            t.reliability >= 0.9 ? 'text-success' : t.reliability >= 0.7 ? 'text-warning' : 'text-danger'
                          }`}
                        >
                          {(t.reliability * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Scout notes */}
          {hasNotes && (
            <>
              <div className="border-t border-border/50" />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-textSecondary flex items-center gap-1.5">
                  <MessageSquare size={12} /> Scout Notes
                </p>
                {allyNotes.length > 0 && (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-success font-semibold">Alliance Partners</p>
                    {renderTeamNotes(allyNotes)}
                  </>
                )}
                {allyNotes.length > 0 && oppNotes.length > 0 && (
                  <div className="border-t border-border/30" />
                )}
                {oppNotes.length > 0 && (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-danger font-semibold">Opponents</p>
                    {renderTeamNotes(oppNotes)}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function AllianceColumn({
  label,
  color,
  teamKeys,
  homeTeam,
  score,
  min,
  max,
  confidence,
}: {
  label: 'Red' | 'Blue';
  color: 'red' | 'blue';
  teamKeys: readonly string[];
  homeTeam: number;
  score: number;
  min: number;
  max: number;
  confidence: 'high' | 'medium' | 'low';
}) {
  const colorClass = color === 'red' ? 'text-redAlliance' : 'text-blueAlliance';
  const subClass = color === 'red' ? 'text-redAlliance/70' : 'text-blueAlliance/70';
  const homeChipClass =
    color === 'red'
      ? 'bg-redAlliance/20 text-redAlliance ring-1 ring-redAlliance/50'
      : 'bg-blueAlliance/20 text-blueAlliance ring-1 ring-blueAlliance/50';
  const confidenceClass =
    confidence === 'high' ? 'bg-success/20 text-success'
    : confidence === 'medium' ? 'bg-warning/20 text-warning'
    : 'bg-danger/20 text-danger';
  return (
    <div className="text-center flex-1">
      <p className={`text-xs ${colorClass} font-semibold mb-1`}>{label}</p>
      <div className="flex justify-center gap-1 mb-2 flex-wrap">
        {teamKeys.map(k => {
          const num = teamKeyToNumber(k);
          return (
            <TeamNumberLink
              key={k}
              team={num}
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${
                num === homeTeam ? homeChipClass : 'bg-surface text-textSecondary'
              }`}
            />
          );
        })}
      </div>
      <p className={`text-3xl md:text-4xl font-black ${colorClass}`}>{score.toFixed(1)}</p>
      <p className={`mt-1 text-[11px] ${subClass}`}>
        Min: {min.toFixed(0)} – Max: {max.toFixed(0)}
      </p>
      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${confidenceClass}`}>
        {confidence} confidence
      </span>
      <SourceMixFooter teamNumbers={teamKeys.map(teamKeyToNumber)} color={color} className="mt-1" />
    </div>
  );
}

export default MatchPreviewCard;

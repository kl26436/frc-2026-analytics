import { Link } from 'react-router-dom';
import { Eye, Clock, ChevronRight } from 'lucide-react';
import SourceMixFooter from './SourceMixFooter';

export interface NextMatchHeroProps {
  matchKey: string;
  matchLabel: string;
  redTeams: number[];
  blueTeams: number[];
  homeTeam: number;
  prediction: { redScore: number; blueScore: number; redWinProb: number };
  redConfidence?: 'low' | 'medium' | 'high';
  blueConfidence?: 'low' | 'medium' | 'high';
  timeUntilStart?: string;
  matchesAway?: number | null;
  redAllianceNum?: number | null;
  blueAllianceNum?: number | null;
  showAllianceNumbers?: boolean;
}

function ConfidencePill({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cls =
    level === 'high'   ? 'bg-success/20 text-success'
    : level === 'medium' ? 'bg-warning/20 text-warning'
    :                      'bg-danger/20 text-danger';
  return <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{level} confidence</span>;
}

export default function NextMatchHero({
  matchKey,
  matchLabel,
  redTeams,
  blueTeams,
  homeTeam,
  prediction,
  redConfidence,
  blueConfidence,
  timeUntilStart,
  matchesAway,
  redAllianceNum,
  blueAllianceNum,
  showAllianceNumbers,
}: NextMatchHeroProps) {
  const homeOnRed = redTeams.includes(homeTeam);
  const homeOnBlue = blueTeams.includes(homeTeam);

  const winProbPct = Math.round(prediction.redWinProb * 100);
  const blueWinProbPct = 100 - winProbPct;
  const favoredAlliance = winProbPct > 55 ? 'red' : winProbPct < 45 ? 'blue' : 'even';
  const weFavored =
    favoredAlliance === 'even' ? null
    : (homeOnRed && favoredAlliance === 'red') || (homeOnBlue && favoredAlliance === 'blue');

  const scoreDiff = Math.abs(prediction.redScore - prediction.blueScore);

  // Border emphasis for the home side
  const redCardCls = homeOnRed ? 'border-warning border-2' : 'border-border';
  const blueCardCls = homeOnBlue ? 'border-warning border-2' : 'border-border';

  return (
    <div className="bg-surface rounded-xl border border-border p-4 md:p-6 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-4 flex-wrap gap-2">
        <h2 className="text-sm md:text-base font-bold flex items-center gap-2">
          <Eye className="text-warning" size={18} />
          Next Match — {matchLabel}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {timeUntilStart && (
            <span className="flex items-center gap-1 text-textSecondary">
              <Clock size={12} />
              {timeUntilStart}
            </span>
          )}
          {matchesAway !== undefined && matchesAway !== null && matchesAway > 0 && (
            <span className="text-textMuted">· {matchesAway} away</span>
          )}
          {matchesAway === 0 && (
            <span className="text-warning font-bold animate-pulse">ON DECK</span>
          )}
        </div>
      </div>

      {/* Alliance cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {/* Red */}
        <div className={`bg-surfaceElevated rounded-lg border ${redCardCls} p-3 md:p-4 text-center`}>
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <span className="text-xs text-redAlliance font-semibold">Red</span>
            {showAllianceNumbers && redAllianceNum && (
              <span className="text-[10px] bg-redAlliance/20 text-redAlliance font-bold px-1.5 py-0.5 rounded">A{redAllianceNum}</span>
            )}
          </div>
          <div className="flex justify-center gap-1 mb-2 flex-wrap">
            {redTeams.map(num => (
              <Link key={num} to={`/teams/${num}`}
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${
                  num === homeTeam ? 'bg-redAlliance/20 text-redAlliance ring-1 ring-redAlliance/50' : 'bg-surface text-textSecondary'
                }`}>
                {num}
              </Link>
            ))}
          </div>
          <p className="text-3xl md:text-4xl font-black text-redAlliance">{prediction.redScore.toFixed(0)}</p>
          <p className="text-xs text-redAlliance/70 mt-0.5">{winProbPct}% win prob</p>
          {redConfidence && <ConfidencePill level={redConfidence} />}
          <SourceMixFooter teamNumbers={redTeams} color="red" className="mt-1" />
        </div>

        {/* Blue */}
        <div className={`bg-surfaceElevated rounded-lg border ${blueCardCls} p-3 md:p-4 text-center`}>
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <span className="text-xs text-blueAlliance font-semibold">Blue</span>
            {showAllianceNumbers && blueAllianceNum && (
              <span className="text-[10px] bg-blueAlliance/20 text-blueAlliance font-bold px-1.5 py-0.5 rounded">A{blueAllianceNum}</span>
            )}
          </div>
          <div className="flex justify-center gap-1 mb-2 flex-wrap">
            {blueTeams.map(num => (
              <Link key={num} to={`/teams/${num}`}
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${
                  num === homeTeam ? 'bg-blueAlliance/20 text-blueAlliance ring-1 ring-blueAlliance/50' : 'bg-surface text-textSecondary'
                }`}>
                {num}
              </Link>
            ))}
          </div>
          <p className="text-3xl md:text-4xl font-black text-blueAlliance">{prediction.blueScore.toFixed(0)}</p>
          <p className="text-xs text-blueAlliance/70 mt-0.5">{blueWinProbPct}% win prob</p>
          {blueConfidence && <ConfidencePill level={blueConfidence} />}
          <SourceMixFooter teamNumbers={blueTeams} color="blue" className="mt-1" />
        </div>
      </div>

      {/* Favored summary */}
      <p className={`text-center mt-3 text-sm font-semibold ${
        favoredAlliance === 'even' ? 'text-textMuted' : weFavored ? 'text-success' : 'text-danger'
      }`}>
        {favoredAlliance === 'even'
          ? 'Even matchup'
          : `${favoredAlliance === 'red' ? 'Red' : 'Blue'} favored by ${scoreDiff.toFixed(1)} pts`}
      </p>

      {/* View details link */}
      <Link
        to={`/predict?match=${matchKey}`}
        className="mt-3 flex items-center justify-center gap-1.5 text-xs text-textSecondary hover:text-textPrimary transition-colors"
      >
        View prediction details
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}

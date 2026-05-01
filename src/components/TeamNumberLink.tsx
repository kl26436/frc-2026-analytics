import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useWatchlistStore } from '../store/useWatchlistStore';
import {
  characterizeTeam,
  computeMetricRank,
} from '../utils/strategicInsights';
import Sparkline from './Sparkline';
import RankBadge from './RankBadge';

interface TeamNumberLinkProps {
  team: number;
  /** Visual children — defaults to the team number. */
  children?: React.ReactNode;
  /** Extra classes for the inner span/link. */
  className?: string;
  /** Disable the popover (e.g. inside dense lists where it would conflict). */
  noPopover?: boolean;
  /** Custom navigate-to URL. Defaults to `/teams/{team}`. */
  to?: string;
}

const HOVER_DELAY_MS = 200;
const POPOVER_W = 280;
const POPOVER_H = 170;

export function TeamNumberLink({
  team,
  children,
  className,
  noPopover,
  to,
}: TeamNumberLinkProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const teamTrends = useAnalyticsStore(s => s.teamTrends);
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const isPinned = useWatchlistStore(s => s.isPinned);
  const togglePin = useWatchlistStore(s => s.togglePin);

  const stats = useMemo(
    () => teamStatistics.find(t => t.teamNumber === team),
    [teamStatistics, team],
  );
  const trend = useMemo(
    () => teamTrends.find(t => t.teamNumber === team),
    [teamTrends, team],
  );
  const nickname = useMemo(
    () =>
      tbaData?.teams?.find(t => t.team_number === team)?.nickname ??
      stats?.teamName ??
      undefined,
    [tbaData, stats, team],
  );

  const characterization = useMemo(() => {
    if (!stats || teamStatistics.length === 0) return '';
    return characterizeTeam(stats, trend, { allStats: teamStatistics });
  }, [stats, trend, teamStatistics]);

  const totalPointsRank = useMemo(() => {
    if (!stats || teamStatistics.length === 0) return null;
    return computeMetricRank(stats.avgTotalPoints, teamStatistics.map(s => s.avgTotalPoints));
  }, [stats, teamStatistics]);

  const sparkData = useMemo(
    () => trend?.matchResults.map(m => m.total) ?? [],
    [trend],
  );

  const cancelTimers = () => {
    if (showTimer.current) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const computeCoords = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const margin = 8;
    let left = rect.left;
    if (left + POPOVER_W > window.innerWidth - margin) {
      left = window.innerWidth - POPOVER_W - margin;
    }
    if (left < margin) left = margin;
    let top = rect.bottom + 6;
    if (top + POPOVER_H > window.innerHeight - margin) {
      top = rect.top - POPOVER_H - 6;
    }
    if (top < margin) top = margin;
    return { left, top };
  }, []);

  const onEnter = () => {
    if (noPopover) return;
    cancelTimers();
    showTimer.current = window.setTimeout(() => {
      setCoords(computeCoords());
      setOpen(true);
    }, HOVER_DELAY_MS);
  };

  const onLeave = () => {
    cancelTimers();
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, 100);
  };

  useEffect(() => () => cancelTimers(), []);

  const linkClass = `font-semibold hover:underline ${className ?? ''}`;
  const target = to ?? `/teams/${team}`;

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="inline-block"
    >
      <Link to={target} onClick={e => e.stopPropagation()} className={linkClass}>
        {children ?? team}
      </Link>

      {open && coords && (
        <div
          role="tooltip"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            width: POPOVER_W,
          }}
          className="z-[90] bg-surface border border-border rounded-lg shadow-xl p-3 text-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={target}
              className="font-bold text-textPrimary hover:underline"
              onClick={e => e.stopPropagation()}
            >
              {team}
            </Link>
            {nickname && (
              <span className="text-xs text-textMuted truncate flex-1">{nickname}</span>
            )}
            <button
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                togglePin(team);
              }}
              className={`p-1 rounded transition-colors ${
                isPinned(team) ? 'text-warning' : 'text-textMuted hover:text-warning'
              }`}
              title={isPinned(team) ? 'Unpin' : 'Pin'}
              aria-label={isPinned(team) ? `Unpin ${team}` : `Pin ${team}`}
            >
              <Star size={14} fill={isPinned(team) ? 'currentColor' : 'none'} />
            </button>
          </div>

          {stats ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-textMuted">Avg score</p>
                  <p className="text-lg font-bold leading-none">
                    {stats.avgTotalPoints.toFixed(0)}
                  </p>
                </div>
                {totalPointsRank && (
                  <RankBadge
                    rank={totalPointsRank.rank}
                    total={totalPointsRank.total}
                    percentile={totalPointsRank.percentile}
                  />
                )}
                {sparkData.length > 0 && (
                  <Sparkline data={sparkData.slice(-8)} width={70} height={20} />
                )}
              </div>
              {characterization && (
                <p className="text-xs text-textSecondary line-clamp-2">{characterization}</p>
              )}
              <p className="text-[10px] text-textMuted mt-1">
                {stats.matchesPlayed} match{stats.matchesPlayed === 1 ? '' : 'es'} played
              </p>
            </>
          ) : (
            <p className="text-xs text-textMuted">No scouting data yet for {team}.</p>
          )}
        </div>
      )}
    </span>
  );
}

export default TeamNumberLink;

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
import { computeRobotFuelFromActions, getAlliance } from '../types/scouting';
import type { ScoutAction } from '../types/scouting';
import { formatDuration } from '../utils/formatting';

// Read CSS design tokens for SVG attributes (which can't use var())
const getCssHsl = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ── Field image coordinate mapping (from 2026-rebuilt.json) ──
// Image: 4196x2035 px, field-corners: top-left (245,118) to bottom-right (3942,1914)
const FIELD_IMG_TL = { x: 245, y: 118 };
const FIELD_IMG_BR = { x: 3942, y: 1914 };
const FIELD_IMG_W = FIELD_IMG_BR.x - FIELD_IMG_TL.x; // 3697
const FIELD_IMG_H = FIELD_IMG_BR.y - FIELD_IMG_TL.y; // 1796
const IMG_FULL_W = 4196;
const IMG_FULL_H = 2035;
const SVG_ASPECT = FIELD_IMG_W / FIELD_IMG_H; // ~2.06

// Scout tablet coordinate range — derived from 2026-rebuilt.json field-size
// (54.269 x 26.474 feet) and a consistent ~14.91 px/foot scale factor.
// Verified via data: red/blue scoring peaks are symmetric about field center with these values.
const SCOUT_MAX_X = 809;
const SCOUT_MAX_Y = 395;

// Map scout tablet (x,y) → field image pixels.
// Scout tablets show the field flipped horizontally vs the field image
// (Red on left in tablet, but Red structures are on the RIGHT in the image).
// X is inverted; Y is not. Coordinates map to the field-corner area.
const scoutToField = (sx: number, sy: number) => ({
  x: FIELD_IMG_BR.x - (sx / SCOUT_MAX_X) * FIELD_IMG_W,
  y: FIELD_IMG_TL.y + (sy / SCOUT_MAX_Y) * FIELD_IMG_H,
});

type TimelineAction = {
  action: ScoutAction;
  teamNumber: number;
  alliance: 'red' | 'blue';
  phase: 'auto' | 'teleop';
  relativeTime: number; // seconds from match start
  // Attribution: what this action means in context
  label: string; // e.g., "FUEL_SCORE (8 balls)" or "+5"
  isFuelEvent: boolean; // FUEL_SCORE or FUEL_PASS
  ballCount: number; // for FUEL events: total balls from preceding multipliers
};

const card = 'bg-surface rounded-xl border border-border p-6 shadow-card';

function MatchReplay() {
  const { matchNumber: matchNumStr } = useParams<{ matchNumber: string }>();
  const matchNumber = parseInt(matchNumStr || '1');
  const navigate = useNavigate();

  const scoutActions = useAnalyticsStore(s => s.scoutActions);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const pgTbaMatches = useAnalyticsStore(s => s.pgTbaMatches);

  // ── Playback State ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── Available matches (union of TBA + scout data) ──
  const availableMatches = useMemo(() => {
    const fromTba = pgTbaMatches.filter(m => m.comp_level === 'qm').map(m => m.match_number);
    const fromScout = scoutEntries.map(e => e.match_number);
    return [...new Set([...fromTba, ...fromScout])].sort((a, b) => a - b);
  }, [pgTbaMatches, scoutEntries]);

  const prevMatch = availableMatches[availableMatches.indexOf(matchNumber) - 1] ?? null;
  const nextMatch = availableMatches[availableMatches.indexOf(matchNumber) + 1] ?? null;

  // ── Reset playback when match changes ──
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [matchNumber]);

  // ── Find TBA match data ──
  const tbaMatch = useMemo(() => {
    return pgTbaMatches.find(m => m.match_number === matchNumber && m.comp_level === 'qm') ?? null;
  }, [pgTbaMatches, matchNumber]);

  // ── Find scout entries for this match ──
  const matchEntries = useMemo(() => {
    return scoutEntries.filter(e => e.match_number === matchNumber);
  }, [scoutEntries, matchNumber]);

  // ── Build team → alliance mapping from entries ──
  const teamAlliances = useMemo(() => {
    const map = new Map<number, 'red' | 'blue'>();
    matchEntries.forEach(e => map.set(e.team_number, getAlliance(e.configured_team)));
    // Also use TBA data as fallback
    if (tbaMatch) {
      tbaMatch.red_teams.forEach(t => { const n = parseInt(t.replace('frc', '')); if (n) map.set(n, 'red'); });
      tbaMatch.blue_teams.forEach(t => { const n = parseInt(t.replace('frc', '')); if (n) map.set(n, 'blue'); });
    }
    return map;
  }, [matchEntries, tbaMatch]);

  // ── Get all robot actions for this match ──
  const matchActions = useMemo(() => {
    return scoutActions.filter(a => a.match_number === matchNumber);
  }, [scoutActions, matchNumber]);

  // ── Build unified timeline: merge all robots' actions, sorted by timestamp ──
  const timeline = useMemo(() => {
    const items: TimelineAction[] = [];

    for (const robot of matchActions) {
      const alliance = teamAlliances.get(robot.team_number) ?? 'red';

      const processPhase = (actions: ScoutAction[], phase: 'auto' | 'teleop') => {
        let pendingMultiplier = 0;
        for (const action of actions) {
          if (action.type.startsWith('SCORE_PLUS_')) {
            const val = parseInt(action.type.replace('SCORE_PLUS_', ''), 10) || 1;
            pendingMultiplier += val;
            items.push({
              action, teamNumber: robot.team_number, alliance, phase,
              relativeTime: 0, // computed below
              label: `+${val}`,
              isFuelEvent: false,
              ballCount: 0,
            });
          } else if (action.type === 'FUEL_SCORE' || action.type === 'FUEL_PASS') {
            const balls = pendingMultiplier > 0 ? pendingMultiplier : 1;
            const typeLabel = action.type === 'FUEL_SCORE' ? 'SCORED' : 'PASSED';
            items.push({
              action, teamNumber: robot.team_number, alliance, phase,
              relativeTime: 0,
              label: `${typeLabel} ${balls} ball${balls !== 1 ? 's' : ''}`,
              isFuelEvent: true,
              ballCount: balls,
            });
            pendingMultiplier = 0;
          } else if (action.type === 'AUTON_CLIMBED') {
            items.push({
              action, teamNumber: robot.team_number, alliance, phase,
              relativeTime: 0,
              label: 'AUTO CLIMB',
              isFuelEvent: false,
              ballCount: 0,
            });
          }
        }
      };

      processPhase(robot.auto, 'auto');
      processPhase(robot.teleop, 'teleop');
    }

    // Normalize timestamps per-robot to eliminate tablet clock drift.
    // Each robot's actions are relative to THEIR first action, not a global baseline.
    // Auto actions start at 0, teleop actions start at ~18s (auto period length).
    const AUTO_DURATION = 18; // seconds — auto period + transition buffer
    const MATCH_DURATION = 160; // seconds — hard cap (15s auto + 3s transition + 135s teleop + buffer)
    const robotBaseTs = new Map<number, { auto: number; teleop: number }>();
    for (const robot of matchActions) {
      const autoTs = robot.auto.length > 0 ? robot.auto[0].time_stamp : Infinity;
      const teleopTs = robot.teleop.length > 0 ? robot.teleop[0].time_stamp : Infinity;
      robotBaseTs.set(robot.team_number, { auto: autoTs, teleop: teleopTs });
    }

    items.forEach(item => {
      const base = robotBaseTs.get(item.teamNumber);
      if (!base) { item.relativeTime = 0; return; }
      if (item.phase === 'auto') {
        item.relativeTime = Math.min(item.action.time_stamp - base.auto, AUTO_DURATION);
      } else {
        item.relativeTime = Math.min(
          AUTO_DURATION + (item.action.time_stamp - base.teleop),
          MATCH_DURATION
        );
      }
    });

    // Sort by normalized relative time
    items.sort((a, b) => a.relativeTime - b.relativeTime);

    return items;
  }, [matchActions, teamAlliances]);

  const maxTime = useMemo(() => {
    if (timeline.length === 0) return 0;
    return Math.min(timeline[timeline.length - 1].relativeTime + 2, 162); // pad 2s, cap at match length
  }, [timeline]);

  // ── Per-robot fuel summaries ──
  const robotSummaries = useMemo(() => {
    return matchActions.map(robot => {
      const alliance = teamAlliances.get(robot.team_number) ?? 'red';
      const fuel = computeRobotFuelFromActions(robot);
      const entry = matchEntries.find(e => e.team_number === robot.team_number);
      return { ...fuel, teamNumber: robot.team_number, alliance, isDedicatedPasser: entry?.dedicated_passer ?? false };
    }).sort((a, b) => {
      if (a.alliance !== b.alliance) return a.alliance === 'red' ? -1 : 1;
      return b.totalMoved - a.totalMoved;
    });
  }, [matchActions, teamAlliances, matchEntries]);

  // ── Playback loop ──
  const tick = useCallback(() => {
    const now = performance.now();
    const dt = (now - lastTickRef.current) / 1000 * speed;
    lastTickRef.current = now;
    setCurrentTime(prev => {
      const next = prev + dt;
      if (next >= maxTime) {
        setIsPlaying(false);
        return maxTime;
      }
      return next;
    });
    animFrameRef.current = requestAnimationFrame(tick);
  }, [speed, maxTime]);

  useEffect(() => {
    if (isPlaying) {
      lastTickRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, tick]);

  // ── Filtered timeline for the feed (must match what's rendered) ──
  const feedTimeline = useMemo(() => {
    return timeline.filter(t => t.isFuelEvent || t.action.type === 'AUTON_CLIMBED');
  }, [timeline]);

  // ── Auto-scroll action feed (scroll container only, not the page) ──
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    // Find active index in the *feed* timeline (matches rendered children)
    let activeIdx = -1;
    for (let i = 0; i < feedTimeline.length; i++) {
      if (feedTimeline[i].relativeTime <= currentTime) activeIdx = i;
      else break;
    }
    if (activeIdx < 0) return;
    const el = container.children[activeIdx] as HTMLElement;
    if (!el) return;
    // Scroll only the feed container, not the whole page
    const elTop = el.offsetTop - container.offsetTop;
    const elBot = elTop + el.offsetHeight;
    const scrollTop = container.scrollTop;
    const viewH = container.clientHeight;
    if (elTop < scrollTop) {
      container.scrollTop = elTop;
    } else if (elBot > scrollTop + viewH) {
      container.scrollTop = elBot - viewH;
    }
  }, [currentTime, feedTimeline]);

  // ── Visible actions on field (all actions up to currentTime) ──
  const visibleActions = useMemo(() => {
    return timeline.filter(t => t.isFuelEvent && t.relativeTime <= currentTime);
  }, [timeline, currentTime]);

  // ── Current action index for feed highlighting ──
  const currentActionIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].relativeTime <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [timeline, currentTime]);


  const stepForward = () => {
    const next = timeline.find(t => t.isFuelEvent && t.relativeTime > currentTime);
    if (next) setCurrentTime(next.relativeTime);
  };

  const stepBack = () => {
    const prev = [...timeline].reverse().find(t => t.isFuelEvent && t.relativeTime < currentTime - 0.5);
    if (prev) setCurrentTime(prev.relativeTime);
    else setCurrentTime(0);
  };

  // ── Dot color helpers (use CSS tokens for SVG fills) ──
  const dotColor = (item: TimelineAction, isCurrent: boolean) => {
    const opacity = isCurrent ? 1 : 0.4;
    if (item.action.type === 'FUEL_SCORE') return `hsl(${getCssHsl('--success')} / ${opacity})`;
    if (item.action.type === 'FUEL_PASS') return `hsl(${getCssHsl('--warning')} / ${opacity})`;
    return `hsl(${getCssHsl('--blue-alliance')} / ${opacity})`;
  };

  const allianceColor = (a: 'red' | 'blue') => a === 'red' ? 'text-redAlliance' : 'text-blueAlliance';

  const matchHeader = (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surfaceElevated transition-colors">
        <ChevronLeft size={20} />
      </button>
      <h1 className="text-2xl font-bold">Match Replay</h1>
      <div className="flex items-center gap-1">
        <button
          onClick={() => prevMatch !== null && navigate(`/replay/${prevMatch}`)}
          disabled={prevMatch === null}
          className="p-1.5 rounded-lg hover:bg-surfaceElevated transition-colors disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <select
          value={matchNumber}
          onChange={e => navigate(`/replay/${e.target.value}`)}
          className="px-3 py-1.5 bg-surfaceElevated border border-border rounded-lg text-sm font-semibold focus:outline-none focus:border-success"
        >
          {availableMatches.length > 0
            ? availableMatches.map(n => <option key={n} value={n}>Q{n}</option>)
            : <option value={matchNumber}>Q{matchNumber}</option>
          }
        </select>
        <button
          onClick={() => nextMatch !== null && navigate(`/replay/${nextMatch}`)}
          disabled={nextMatch === null}
          className="p-1.5 rounded-lg hover:bg-surfaceElevated transition-colors disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {tbaMatch && (
        <p className="text-sm text-textSecondary">
          <span className="text-redAlliance font-semibold">{tbaMatch.red_teams.map(t => t.replace('frc', '')).join(', ')}</span>
          <span className="mx-2 font-bold">{tbaMatch.red_score} – {tbaMatch.blue_score}</span>
          <span className="text-blueAlliance font-semibold">{tbaMatch.blue_teams.map(t => t.replace('frc', '')).join(', ')}</span>
        </p>
      )}
    </div>
  );

  // ── Empty state ──
  if (matchActions.length === 0) {
    return (
      <div className="space-y-6">
        {matchHeader}
        <div className={card}>
          <div className="text-center py-12">
            <p className="text-lg font-semibold text-textPrimary">No Action Data</p>
            <p className="text-sm text-textSecondary mt-1">
              No timestamped action data available for this match. Trigger a sync from the Admin page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {matchHeader}

      {/* Field + Controls */}
      <div className={card}>
        {/* SVG Field with real field image */}
        <div className="w-full" style={{ aspectRatio: `${SVG_ASPECT}` }}>
          <svg
            viewBox={`${FIELD_IMG_TL.x} ${FIELD_IMG_TL.y} ${FIELD_IMG_W} ${FIELD_IMG_H}`}
            className="w-full h-full rounded-lg border border-border"
          >
            {/* Field background image */}
            <image
              href={`${import.meta.env.BASE_URL}2026-field.png`}
              x={0} y={0}
              width={IMG_FULL_W} height={IMG_FULL_H}
            />

            {/* Action dots — mapped from scout coords to field image coords */}
            {visibleActions.map((item, i) => {
              const isCurrent = i === visibleActions.length - 1 && Math.abs(item.relativeTime - currentTime) < 2;
              if (item.action.x === 0 && item.action.y === 0) return null;
              const { x, y } = scoutToField(item.action.x, item.action.y);
              return (
                <g key={i}>
                  <circle
                    cx={x} cy={y}
                    r={isCurrent ? 44 : 28}
                    fill={dotColor(item, isCurrent)}
                    stroke={isCurrent ? '#fff' : 'none'}
                    strokeWidth={isCurrent ? 6 : 0}
                  />
                  {isCurrent && (
                    <text x={x} y={y - 55} textAnchor="middle" fill="#fff" fontSize="40" fontWeight="bold"
                      stroke="#000" strokeWidth="3" paintOrder="stroke">
                      {item.teamNumber} · {item.ballCount}
                    </text>
                  )}
                  {!isCurrent && (
                    <text x={x} y={y + 10} textAnchor="middle" fill="#fff" fontSize="26" opacity={0.7}
                      stroke="#000" strokeWidth="2" paintOrder="stroke">
                      {item.teamNumber}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-1">
            <button onClick={stepBack} className="p-2 rounded-lg hover:bg-surfaceElevated transition-colors" title="Previous event">
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => {
                if (currentTime >= maxTime) setCurrentTime(0);
                setIsPlaying(!isPlaying);
              }}
              className="p-2 rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button onClick={stepForward} className="p-2 rounded-lg hover:bg-surfaceElevated transition-colors" title="Next event">
              <SkipForward size={18} />
            </button>
          </div>

          {/* Scrubber */}
          <input
            type="range"
            min={0}
            max={maxTime}
            step={0.1}
            value={currentTime}
            onChange={e => { setCurrentTime(parseFloat(e.target.value)); setIsPlaying(false); }}
            className="flex-1 accent-success h-2"
          />

          <span className="text-sm font-mono text-textSecondary w-16 text-right">
            {formatDuration(currentTime)}
          </span>

          {/* Speed controls */}
          <div className="flex items-center gap-1 text-xs">
            {[1, 2, 4].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded ${speed === s ? 'bg-success/20 text-success font-bold' : 'text-textMuted hover:text-textPrimary'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 text-xs text-textMuted">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-success inline-block" /> Score</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-warning inline-block" /> Pass</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blueAlliance inline-block" /> Climb</span>
        </div>
      </div>

      {/* Action Feed + Robot Summaries side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Feed */}
        <div className={`${card} lg:col-span-2`}>
          <h2 className="text-base font-bold mb-3">Action Feed</h2>
          <div ref={feedRef} className="max-h-[400px] overflow-y-auto space-y-0.5">
            {feedTimeline.map((item, i) => {
              const globalIdx = timeline.indexOf(item);
              const isActive = globalIdx <= currentActionIdx && globalIdx >= currentActionIdx - 2;
              const isCurrent = globalIdx === currentActionIdx;
              return (
                <div
                  key={i}
                  onClick={() => { setCurrentTime(item.relativeTime); setIsPlaying(false); }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    isCurrent ? 'bg-success/15 ring-1 ring-success/30' :
                    isActive ? 'bg-surfaceElevated' : 'hover:bg-surfaceElevated'
                  }`}
                >
                  <span className="font-mono text-textMuted w-12 text-right text-xs">{formatDuration(item.relativeTime)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    item.phase === 'auto' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                  }`}>
                    {item.phase}
                  </span>
                  <span className={`font-bold w-12 text-right ${allianceColor(item.alliance)}`}>
                    {item.teamNumber}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    item.action.type === 'FUEL_SCORE' ? 'bg-success/20 text-success' :
                    item.action.type === 'FUEL_PASS' ? 'bg-warning/20 text-warning' :
                    'bg-blueAlliance/20 text-blueAlliance'
                  }`}>
                    {item.label}
                  </span>
                  {item.action.x > 0 && (
                    <span className="text-[10px] text-textMuted ml-auto">
                      ({Math.round(item.action.x)}, {Math.round(item.action.y)})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-Robot Summary Cards */}
        <div className={card}>
          <h2 className="text-base font-bold mb-3">Robot Summaries</h2>
          <div className="space-y-3">
            {robotSummaries.map(r => (
              <div key={r.teamNumber} className={`rounded-lg border p-3 ${
                r.alliance === 'red' ? 'border-redAlliance/30 bg-redAlliance/5' : 'border-blueAlliance/30 bg-blueAlliance/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <Link to={`/teams/${r.teamNumber}`} className={`font-bold text-lg hover:underline ${allianceColor(r.alliance)}`}>
                    {r.teamNumber}
                  </Link>
                  {r.isDedicatedPasser && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning">PASSER</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-textMuted">Moved</p>
                    <p className="text-lg font-bold">{r.totalMoved}</p>
                  </div>
                  <div>
                    <p className="text-textMuted">Shots</p>
                    <p className="text-lg font-bold text-success">{r.totalShots}</p>
                  </div>
                  <div>
                    <p className="text-textMuted">Passes</p>
                    <p className="text-lg font-bold text-warning">{r.totalPasses}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[10px] mt-2 pt-2 border-t border-border/30">
                  <div>
                    <span className="text-textMuted">Auto: </span>
                    <span className="font-semibold">{r.autoShots}s / {r.autoPasses}p</span>
                  </div>
                  <div>
                    <span className="text-textMuted">Teleop: </span>
                    <span className="font-semibold">{r.teleopShots}s / {r.teleopPasses}p</span>
                  </div>
                </div>
              </div>
            ))}
            {robotSummaries.length === 0 && (
              <p className="text-sm text-textMuted text-center py-4">No action data for this match</p>
            )}
          </div>

          {/* Alliance totals vs FMS */}
          {tbaMatch && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-2">vs FMS</h3>
              {(['red', 'blue'] as const).map(alliance => {
                const allianceRobots = robotSummaries.filter(r => r.alliance === alliance);
                const totalShots = allianceRobots.reduce((s, r) => s + r.totalShots, 0);
                const totalPasses = allianceRobots.reduce((s, r) => s + r.totalPasses, 0);
                const fmsScored = alliance === 'red' ? tbaMatch.red_hubScore?.totalCount ?? 0 : tbaMatch.blue_hubScore?.totalCount ?? 0;
                const efficiency = totalShots > 0 ? Math.round((fmsScored / totalShots) * 100) : 0;
                return (
                  <div key={alliance} className="flex items-center justify-between text-sm py-1.5">
                    <span className={`font-bold uppercase ${allianceColor(alliance)}`}>{alliance}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-textSecondary">{totalShots} shots, {totalPasses} passes</span>
                      <span className="text-textMuted">→</span>
                      <span className="font-bold">{fmsScored} scored</span>
                      <span className={`font-bold ${efficiency >= 70 ? 'text-success' : efficiency >= 40 ? 'text-warning' : 'text-danger'}`}>
                        {efficiency}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MatchReplay;

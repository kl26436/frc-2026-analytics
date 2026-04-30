import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { estimateMatchFuel, estimateMatchPoints, parseClimbLevel } from '../types/scouting';
import type { ScoutEntry } from '../types/scouting';
import { TrendingUp, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

type Metric = 'totalPoints' | 'fuelScored' | 'climbRate' | 'accuracy';

const METRIC_OPTIONS: { value: Metric; label: string; unit: string }[] = [
  { value: 'totalPoints', label: 'Total points / match', unit: 'pts' },
  { value: 'fuelScored', label: 'Fuel scored / match', unit: 'balls' },
  { value: 'climbRate', label: 'Climb success rate', unit: '%' },
  { value: 'accuracy', label: 'Scoring accuracy rate', unit: '%' },
];

function metricValue(entries: ScoutEntry[], metric: Metric): number {
  if (entries.length === 0) return 0;
  switch (metric) {
    case 'totalPoints': {
      const sum = entries.reduce((s, e) => s + estimateMatchPoints(e).total, 0);
      return sum / entries.length;
    }
    case 'fuelScored': {
      const sum = entries.reduce((s, e) => {
        const f = estimateMatchFuel(e);
        return s + f.auto + f.teleop;
      }, 0);
      return sum / entries.length;
    }
    case 'climbRate': {
      const climbed = entries.filter(e => parseClimbLevel(e.climb_level) > 0).length;
      return (climbed / entries.length) * 100;
    }
    case 'accuracy': {
      // Inverse of poor_fuel_scoring_accuracy flag rate
      const accurate = entries.filter(e => !e.poor_fuel_scoring_accuracy).length;
      return (accurate / entries.length) * 100;
    }
  }
}

interface ComparisonRow {
  team_number: number;
  team_name: string;
  preScoutValue: number;
  preScoutMatches: number;
  preScoutOriginEvents: string[];
  liveValue: number;
  liveMatches: number;
  delta: number; // signed % change ((live - preScout) / preScout); 0 when preScout=0
  flag: 'over' | 'under' | 'normal';
}

export default function PerformanceComparison() {
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const preScoutEntries = useAnalyticsStore(s => s.preScoutEntries);
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);

  const [metric, setMetric] = useState<Metric>('totalPoints');
  const [onlyLargeDelta, setOnlyLargeDelta] = useState(false);
  const [sortKey, setSortKey] = useState<'delta' | 'team'>('delta');

  const teamNameMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of teamStatistics) m.set(t.teamNumber, t.teamName ?? '');
    for (const t of tbaData?.teams ?? []) {
      if (!m.has(t.team_number) && t.nickname) m.set(t.team_number, t.nickname);
    }
    return m;
  }, [teamStatistics, tbaData]);

  const rows = useMemo<ComparisonRow[]>(() => {
    // Filter pre-scout to active event roster
    const rosterTeams = new Set((tbaData?.teams ?? []).map(t => t.team_number));
    const preScoutInRoster = rosterTeams.size > 0
      ? preScoutEntries.filter(e => rosterTeams.has(e.team_number))
      : preScoutEntries;

    // Group both sources by team
    const liveByTeam = new Map<number, ScoutEntry[]>();
    for (const e of scoutEntries) {
      if (!liveByTeam.has(e.team_number)) liveByTeam.set(e.team_number, []);
      liveByTeam.get(e.team_number)!.push(e);
    }
    const preByTeam = new Map<number, ScoutEntry[]>();
    for (const e of preScoutInRoster) {
      if (!preByTeam.has(e.team_number)) preByTeam.set(e.team_number, []);
      preByTeam.get(e.team_number)!.push(e);
    }

    // Only teams with BOTH live and pre-scout entries can be compared
    const rows: ComparisonRow[] = [];
    for (const [teamNum, preEntries] of preByTeam) {
      const liveEntries = liveByTeam.get(teamNum) ?? [];
      if (liveEntries.length === 0) continue;
      const preValue = metricValue(preEntries, metric);
      const liveValue = metricValue(liveEntries, metric);
      const delta = preValue !== 0 ? (liveValue - preValue) / preValue : 0;
      const flag: ComparisonRow['flag'] =
        Math.abs(delta) < 0.15 ? 'normal' : delta > 0 ? 'over' : 'under';
      const originEvents = Array.from(new Set(preEntries.map(e => e.event_key))).sort();
      rows.push({
        team_number: teamNum,
        team_name: teamNameMap.get(teamNum) ?? '',
        preScoutValue: preValue,
        preScoutMatches: preEntries.length,
        preScoutOriginEvents: originEvents,
        liveValue,
        liveMatches: liveEntries.length,
        delta,
        flag,
      });
    }

    return rows;
  }, [scoutEntries, preScoutEntries, tbaData, metric, teamNameMap]);

  const filteredSorted = useMemo(() => {
    const list = onlyLargeDelta ? rows.filter(r => Math.abs(r.delta) >= 0.15) : rows;
    return [...list].sort((a, b) => {
      if (sortKey === 'team') return a.team_number - b.team_number;
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
  }, [rows, onlyLargeDelta, sortKey]);

  const metricMeta = METRIC_OPTIONS.find(m => m.value === metric)!;

  const formatValue = (v: number) =>
    metric === 'climbRate' || metric === 'accuracy' ? `${v.toFixed(0)}%` : v.toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <TrendingUp size={24} />
          Performance vs Pre-Scout
        </h1>
        <p className="text-textSecondary text-sm mt-1">
          Side-by-side: how each team's actual Newton matches compare to their pre-scout numbers.
          Flags any team where the metric has shifted by more than 15%.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-lg border border-border p-4 flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-textSecondary mb-1">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className="px-3 py-1.5 bg-card border border-border rounded text-sm"
          >
            {METRIC_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-textSecondary mb-1">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as 'delta' | 'team')}
            className="px-3 py-1.5 bg-card border border-border rounded text-sm"
          >
            <option value="delta">|Δ%| (largest first)</option>
            <option value="team">Team number</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={onlyLargeDelta}
            onChange={(e) => setOnlyLargeDelta(e.target.checked)}
          />
          Show only |Δ| ≥ 15%
        </label>
      </div>

      {/* Empty states */}
      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-textSecondary">
          <AlertTriangle size={32} className="mx-auto mb-3 text-textMuted" />
          <p className="text-base font-medium">No teams with both live and pre-scout data yet</p>
          <p className="text-sm mt-1">
            Teams need at least one live match AND one pre-scout match to compare. Check back after qual matches play.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surfaceElevated">
                <tr>
                  <th className="px-3 py-3 text-left text-textSecondary font-semibold">Team</th>
                  <th className="px-3 py-3 text-left text-textSecondary font-semibold hidden md:table-cell">Name</th>
                  <th className="px-3 py-3 text-right text-textSecondary font-semibold">Pre-scout</th>
                  <th className="px-3 py-3 text-right text-textSecondary font-semibold">Newton (live)</th>
                  <th className="px-3 py-3 text-right text-textSecondary font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSorted.map(r => (
                  <tr
                    key={r.team_number}
                    className={`hover:bg-interactive ${
                      r.flag === 'over' ? 'bg-success/5' : r.flag === 'under' ? 'bg-danger/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold">
                      <Link to={`/teams/${r.team_number}`} className="text-blueAlliance hover:underline">
                        {r.team_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-textSecondary hidden md:table-cell">{r.team_name}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono">{formatValue(r.preScoutValue)} <span className="text-textMuted text-xs">{metricMeta.unit}</span></div>
                      <div className="text-xs text-textMuted">
                        {r.preScoutMatches}m · {r.preScoutOriginEvents.join(', ')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono">{formatValue(r.liveValue)} <span className="text-textMuted text-xs">{metricMeta.unit}</span></div>
                      <div className="text-xs text-textMuted">{r.liveMatches}m</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <span className={`inline-flex items-center gap-1 ${
                        r.flag === 'over' ? 'text-success' : r.flag === 'under' ? 'text-danger' : 'text-textMuted'
                      }`}>
                        {r.flag === 'over' && <ArrowUp size={14} />}
                        {r.flag === 'under' && <ArrowDown size={14} />}
                        {r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(1)}%
                        {r.flag !== 'normal' && <AlertTriangle size={12} className="ml-0.5" />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-surfaceElevated text-xs text-textMuted border-t border-border">
            Showing {filteredSorted.length} of {rows.length} teams · {rows.filter(r => r.flag !== 'normal').length} flagged ≥15%
          </div>
        </div>
      )}
    </div>
  );
}

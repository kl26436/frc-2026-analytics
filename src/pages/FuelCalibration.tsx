import { useState, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import type { AttributionModelConfig } from '../store/useAnalyticsStore';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_BETA } from '../utils/fuelAttribution';
import {
  Shield, FlaskConical, ChevronDown, ArrowUpDown, Copy, Check,
  BarChart3, Table2, Bot, Wifi, WifiOff,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceDot, Cell,
} from 'recharts';
import { computeModelComparison } from '../utils/modelComparison';
import { buildCalibrationPrompt } from '../utils/calibrationPrompt';
import type { RobotMatchFuel } from '../utils/fuelAttribution';
import type { ModelResult } from '../utils/modelComparison';

// ── Types ────────────────────────────────────────────────────────────────────

type TabId = 'matches' | 'modelFit' | 'ai';
type MatchSortField = 'matchNum' | 'spread' | 'delta';

interface AttentionFlag {
  label: string;
  color: 'warning' | 'danger'; // warning = yellow, danger = red
}

interface AllianceRow {
  key: string; // "matchNum_alliance"
  matchNumber: number;
  alliance: 'red' | 'blue';
  robots: RobotMatchFuel[];
  scoutShots: number;
  fmsTotal: number;
  delta: number; // fmsTotal - scoutShots
  efficiency: number; // fmsTotal / scoutShots
  // Model-dependent (changes when active model switches)
  attribution: { teamNumber: number; scored: number }[]; // per-robot, sorted desc
  spreadRatio: number; // max attributed / min attributed (higher = more uneven)
  flags: AttentionFlag[]; // calibration-relevant anomalies
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAllianceRows(matchFuel: RobotMatchFuel[]): AllianceRow[] {
  const groups = new Map<string, RobotMatchFuel[]>();
  for (const row of matchFuel) {
    const key = `${row.matchNumber}_${row.alliance}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, robots]) => {
    const scoutShots = robots.reduce((s, r) => s + r.shots, 0);
    const fmsTotal = robots[0].fmsAllianceTotal;
    const sorted = robots.sort((a, b) => b.shotsScored - a.shotsScored);
    const attribution = sorted.map(r => ({ teamNumber: r.teamNumber, scored: r.shotsScored }));
    const activeScores = sorted.filter(r => !r.isZeroWeight).map(r => r.shotsScored);
    const maxScore = activeScores.length > 0 ? Math.max(...activeScores) : 0;
    const minScore = activeScores.length > 0 ? Math.min(...activeScores) : 0;
    const efficiency = scoutShots > 0 ? fmsTotal / scoutShots : 0;
    const spreadRatio = minScore > 0 ? maxScore / minScore : 0;

    // Build attention flags — things worth investigating
    const flags: AttentionFlag[] = [];
    if (efficiency > 1.3) flags.push({ label: `${(efficiency * 100).toFixed(0)}% eff`, color: 'danger' });
    else if (efficiency > 1.1) flags.push({ label: `${(efficiency * 100).toFixed(0)}% eff`, color: 'warning' });
    else if (efficiency < 0.5 && scoutShots > 5) flags.push({ label: `${(efficiency * 100).toFixed(0)}% eff`, color: 'danger' });
    if (spreadRatio > 5) flags.push({ label: `${spreadRatio.toFixed(1)}x spread`, color: 'danger' });
    else if (spreadRatio > 3) flags.push({ label: `${spreadRatio.toFixed(1)}x spread`, color: 'warning' });

    return {
      key,
      matchNumber: robots[0].matchNumber,
      alliance: robots[0].alliance,
      robots: sorted,
      scoutShots,
      fmsTotal,
      delta: fmsTotal - scoutShots,
      efficiency,
      attribution,
      spreadRatio,
      flags,
    };
  });
}

function pct(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FuelCalibration() {
  const { isAdmin } = useAuth();
  const matchFuelAttribution = useAnalyticsStore(s => s.matchFuelAttribution);
  const teamFuelStats = useAnalyticsStore(s => s.teamFuelStats);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const attributionModel = useAnalyticsStore(s => s.attributionModel);
  const setAttributionModel = useAnalyticsStore(s => s.setAttributionModel);

  const [activeTab, setActiveTab] = useState<TabId>('matches');
  const [sortField, setSortField] = useState<MatchSortField>('matchNum');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>('power_0.7');
  const [copied, setCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);

  // Admin gate
  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
        <p className="text-textSecondary">Only admins can access fuel calibration tools.</p>
      </div>
    );
  }

  // ── Computed Data ──────────────────────────────────────────────────────────

  const allianceRows = useMemo(
    () => buildAllianceRows(matchFuelAttribution),
    [matchFuelAttribution],
  );

  const modelComparison = useMemo(
    () => computeModelComparison(matchFuelAttribution),
    [matchFuelAttribution],
  );

  const prompt = useMemo(
    () => buildCalibrationPrompt(matchFuelAttribution, teamFuelStats, modelComparison, eventCode),
    [matchFuelAttribution, teamFuelStats, modelComparison, eventCode],
  );

  // ── Sort & Filter ──────────────────────────────────────────────────────────

  const sortedRows = useMemo(() => {
    let rows = showFlaggedOnly ? allianceRows.filter(r => r.flags.length > 0) : allianceRows;
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'matchNum': cmp = a.matchNumber - b.matchNumber || a.alliance.localeCompare(b.alliance); break;
        case 'spread': cmp = a.spreadRatio - b.spreadRatio; break;
        case 'delta': cmp = Math.abs(b.delta) - Math.abs(a.delta); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [allianceRows, sortField, sortDir, showFlaggedOnly]);

  const toggleSort = (field: MatchSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── No Data State ──────────────────────────────────────────────────────────

  if (matchFuelAttribution.length === 0) {
    return (
      <div className="text-center py-16">
        <FlaskConical size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">No Attribution Data</h2>
        <p className="text-textSecondary">Waiting for scout entries and TBA match data to compute fuel attribution.</p>
      </div>
    );
  }

  // ── Chart Data ─────────────────────────────────────────────────────────────

  const chartData = modelComparison.models
    .filter(m => m.variant.isActive)
    .map(m => ({
      label: m.variant.label,
      avgCV: +(m.avgCV * 100).toFixed(1),
      isCurrent: m.variant.isCurrent,
      family: m.variant.family,
    }));

  const currentPoint = chartData.find(d => d.isCurrent);

  const selectedModel = modelComparison.models.find(m => m.variant.id === selectedModelId);
  const teamAccuracyData = selectedModel
    ? selectedModel.perTeamStats
        .filter(t => t.totalShots > 0)
        .sort((a, b) => b.accuracy - a.accuracy)
        .map(t => ({
          team: String(t.teamNumber),
          accuracy: +(t.accuracy * 100).toFixed(1),
          hasActionData: matchFuelAttribution.some(
            r => r.teamNumber === t.teamNumber && r.hasActionData
          ),
        }))
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical size={24} />
            Fuel Calibration
          </h1>
          <p className="text-sm text-textSecondary mt-1">
            {modelComparison.totalMatches} matches &middot; {modelComparison.totalRobots} robot entries &middot; {pct(modelComparison.actionDataPct)} action data
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {([
            { id: 'matches' as TabId, icon: Table2, label: 'Matches' },
            { id: 'modelFit' as TabId, icon: BarChart3, label: 'Model Fit' },
            { id: 'ai' as TabId, icon: Bot, label: 'AI Analysis' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded transition-colors text-sm ${
                activeTab === tab.id
                  ? 'bg-interactive text-textPrimary'
                  : 'text-textSecondary hover:bg-surfaceElevated'
              }`}
            >
              <tab.icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Model Selector */}
      <ActiveModelSelector
        attributionModel={attributionModel}
        setAttributionModel={setAttributionModel}
      />

      {/* Tab Content */}
      {activeTab === 'matches' && (
        <MatchesTab
          rows={sortedRows}
          sortField={sortField}
          sortDir={sortDir}
          toggleSort={toggleSort}
          expandedRows={expandedRows}
          toggleExpand={toggleExpand}
          showFlaggedOnly={showFlaggedOnly}
          setShowFlaggedOnly={setShowFlaggedOnly}
        />
      )}

      {activeTab === 'modelFit' && (
        <ModelFitTab
          modelComparison={modelComparison}
          chartData={chartData}
          currentPoint={currentPoint}
          teamAccuracyData={teamAccuracyData}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
        />
      )}

      {activeTab === 'ai' && (
        <AIAnalysisTab
          prompt={prompt}
          copied={copied}
          copyPrompt={copyPrompt}
          promptExpanded={promptExpanded}
          setPromptExpanded={setPromptExpanded}
        />
      )}
    </div>
  );
}

// ── Tab 1: Matches ───────────────────────────────────────────────────────────

function MatchesTab({
  rows, sortField, sortDir, toggleSort, expandedRows, toggleExpand,
  showFlaggedOnly, setShowFlaggedOnly,
}: {
  rows: AllianceRow[];
  sortField: MatchSortField;
  sortDir: 'asc' | 'desc';
  toggleSort: (field: MatchSortField) => void;
  expandedRows: Set<string>;
  toggleExpand: (key: string) => void;
  showFlaggedOnly: boolean;
  setShowFlaggedOnly: (v: boolean) => void;
}) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Table2 size={20} />
          Match Attribution
        </h2>
        <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
          <input
            type="checkbox"
            checked={showFlaggedOnly}
            onChange={e => setShowFlaggedOnly(e.target.checked)}
            className="rounded"
          />
          Flagged only
        </label>
      </div>

      <div className="overflow-x-auto -mx-4 md:-mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-textMuted">
              <th className="py-2 px-3 w-6"></th>
              <SortHeader label="Match" field="matchNum" current={sortField} dir={sortDir} onSort={toggleSort} />
              <th className="text-center py-2 px-3 font-medium">Alliance</th>
              <th className="text-right py-2 px-3 font-medium">Scout Shots</th>
              <th className="text-right py-2 px-3 font-medium">FMS Scored</th>
              <th className="text-left py-2 px-3 font-medium">Attribution</th>
              <SortHeader label="Spread" field="spread" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Delta" field="delta" current={sortField} dir={sortDir} onSort={toggleSort} align="right" />
              <th className="text-left py-2 px-3 font-medium">Attention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <MatchRow
                key={row.key}
                row={row}
                isExpanded={expandedRows.has(row.key)}
                isStriped={i % 2 === 0}
                toggleExpand={toggleExpand}
              />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-center text-textMuted py-8">No matches match the current filters.</p>
      )}
    </div>
  );
}

function SortHeader({ label, field, current, dir, onSort, align = 'left' }: {
  label: string; field: MatchSortField; current: MatchSortField;
  dir: 'asc' | 'desc'; onSort: (f: MatchSortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = current === field;
  return (
    <th
      className={`py-2 px-3 font-medium cursor-pointer hover:text-textPrimary transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={isActive ? 'text-textPrimary' : 'opacity-30'} />
        {isActive && <span className="text-[10px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function MatchRow({ row, isExpanded, isStriped, toggleExpand }: {
  row: AllianceRow; isExpanded: boolean; isStriped: boolean;
  toggleExpand: (key: string) => void;
}) {
  const bgClass = isStriped ? 'bg-surfaceAlt' : '';
  return (
    <>
      <tr
        className={`border-b border-border/50 cursor-pointer hover:bg-surfaceElevated ${bgClass}`}
        onClick={() => toggleExpand(row.key)}
      >
        <td className="py-2.5 pl-4 pr-1">
          <ChevronDown size={12} className={`transition-transform text-textMuted ${isExpanded ? 'rotate-180' : ''}`} />
        </td>
        <td className="py-2.5 px-3 font-medium">Q{row.matchNumber}</td>
        <td className="py-2.5 px-3 text-center">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            row.alliance === 'red' ? 'bg-danger/20 text-danger' : 'bg-blue-500/20 text-blue-400'
          }`}>
            {row.alliance.toUpperCase()}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right">{row.scoutShots}</td>
        <td className="py-2.5 px-3 text-right font-medium">{row.fmsTotal}</td>
        <td className="py-2.5 px-3 text-left">
          <span className="text-xs font-mono">
            {row.attribution.map((a, i) => (
              <span key={a.teamNumber}>
                {i > 0 && <span className="text-textMuted"> / </span>}
                <span className="text-textSecondary">{a.teamNumber}:</span>
                <span className="font-medium">{a.scored.toFixed(1)}</span>
              </span>
            ))}
          </span>
        </td>
        <td className={`py-2.5 px-3 text-right font-medium ${
          row.spreadRatio > 3 ? 'text-warning' : row.spreadRatio > 5 ? 'text-danger' : ''
        }`}>
          {row.spreadRatio > 0 ? `${row.spreadRatio.toFixed(1)}x` : '—'}
        </td>
        <td className="py-2.5 px-3 text-right">
          <span className={row.delta > 0 ? 'text-success' : row.delta < 0 ? 'text-danger' : ''}>
            {row.delta > 0 ? '+' : ''}{row.delta}
          </span>
        </td>
        <td className="py-2.5 px-3">
          {row.flags.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {row.flags.map(f => (
                <span key={f.label} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  f.color === 'danger' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
                }`}>
                  {f.label}
                </span>
              ))}
            </div>
          ) : null}
        </td>
      </tr>
      {isExpanded && (
        <tr className={bgClass}>
          <td colSpan={10} className="px-4 pb-3">
            <div className="bg-card rounded-lg border border-border/50 p-3 mt-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-textMuted border-b border-border/30">
                    <th className="text-left py-1 px-2">Team</th>
                    <th className="text-right py-1 px-2">Shots</th>
                    <th className="text-right py-1 px-2">Attributed</th>
                    <th className="text-right py-1 px-2">Accuracy</th>
                    <th className="text-right py-1 px-2">Passes</th>
                    <th className="text-center py-1 px-2">Data</th>
                    <th className="text-left py-1 px-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {row.robots.map(robot => (
                    <tr key={robot.teamNumber} className="border-b border-border/20">
                      <td className="py-1.5 px-2 font-medium">{robot.teamNumber}</td>
                      <td className="py-1.5 px-2 text-right">{robot.shots}</td>
                      <td className="py-1.5 px-2 text-right font-medium">{robot.shotsScored.toFixed(1)}</td>
                      <td className={`py-1.5 px-2 text-right ${
                        robot.scoringAccuracy > 1 ? 'text-warning' :
                        robot.scoringAccuracy < 0.3 && robot.shots > 5 ? 'text-danger' : ''
                      }`}>
                        {robot.shots > 0 ? pct(robot.scoringAccuracy) : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-textMuted">{robot.passes}</td>
                      <td className="py-1.5 px-2 text-center">
                        {robot.hasActionData ? (
                          <Wifi size={12} className="inline text-success" />
                        ) : (
                          <WifiOff size={12} className="inline text-warning" />
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <RobotFlags robot={robot} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RobotFlags({ robot }: { robot: RobotMatchFuel }) {
  const flags: JSX.Element[] = [];
  if (robot.isRealNoShow) flags.push(
    <span key="ns" className="px-1.5 py-0.5 bg-danger/20 text-danger rounded text-[10px] font-semibold">NO-SHOW</span>
  );
  if (robot.noShowMislabeled) flags.push(
    <span key="nsm" className="px-1.5 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-semibold">NO-SHOW?</span>
  );
  if (robot.isLostConnection) flags.push(
    <span key="lc" className="px-1.5 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-semibold">LOST CONN</span>
  );
  if (robot.isBulldozedOnly) flags.push(
    <span key="bz" className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-semibold">BULLDOZED</span>
  );
  if (robot.isDedicatedPasser) flags.push(
    <span key="dp" className="px-1.5 py-0.5 bg-success/20 text-success rounded text-[10px] font-semibold">PASSER</span>
  );
  return <div className="flex gap-1 flex-wrap">{flags}</div>;
}

// ── Tab 2: Model Fit ─────────────────────────────────────────────────────────

function ModelFitTab({
  modelComparison, chartData, currentPoint, teamAccuracyData,
  selectedModelId, setSelectedModelId,
}: {
  modelComparison: ReturnType<typeof computeModelComparison>;
  chartData: { label: string; avgCV: number; isCurrent: boolean; family: string }[];
  currentPoint: { label: string; avgCV: number } | undefined;
  teamAccuracyData: { team: string; accuracy: number; hasActionData: boolean }[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
}) {
  // Find best model (lowest CV)
  const activeModels = modelComparison.models.filter(m => m.variant.isActive && m.avgCV > 0);
  const bestModel = activeModels.length > 0
    ? activeModels.reduce((best, m) => m.avgCV < best.avgCV ? m : best)
    : null;

  // Summary stats (from current model)
  const currentModel = modelComparison.models.find(m => m.variant.isCurrent);
  const totalShots = currentModel?.perTeamStats.reduce((s, t) => s + t.totalShots, 0) ?? 0;
  const totalScored = currentModel?.perTeamStats.reduce((s, t) => s + t.totalScored, 0) ?? 0;
  const overallAccuracy = totalShots > 0 ? totalScored / totalShots : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Matches" value={String(modelComparison.totalMatches)} />
        <StatCard label="Overall Accuracy" value={pct(overallAccuracy)} />
        <StatCard label="Action Data" value={pct(modelComparison.actionDataPct)} />
        <StatCard
          label="Best Model"
          value={bestModel?.variant.label ?? '—'}
          highlight={bestModel && !bestModel.variant.isCurrent}
        />
      </div>

      {/* Model Comparison Chart */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <BarChart3 size={20} />
          Model Comparison — Average CV (lower is better)
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'hsl(0 0% 64%)', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: 'hsl(0 0% 64%)', fontSize: 12 }}
                label={{ value: 'Avg CV (%)', angle: -90, position: 'insideLeft', fill: 'hsl(0 0% 55%)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(0 0% 7%)',
                  border: '1px solid hsl(0 0% 20%)',
                  borderRadius: '8px',
                  color: 'hsl(0 0% 100%)',
                }}
                formatter={(value: number) => [`${value}%`, 'Avg CV']}
              />
              <Line
                type="monotone"
                dataKey="avgCV"
                stroke="hsl(142 71% 45%)"
                strokeWidth={2}
                dot={(props: { cx: number; cy: number; payload: typeof chartData[number] }) => {
                  const { cx, cy, payload } = props;
                  if (payload.isCurrent) {
                    return (
                      <circle
                        key="current"
                        cx={cx} cy={cy} r={6}
                        fill="hsl(0 84% 60%)"
                        stroke="hsl(0 0% 100%)"
                        strokeWidth={2}
                      />
                    );
                  }
                  return <circle key={payload.label} cx={cx} cy={cy} r={3} fill="hsl(142 71% 45%)" />;
                }}
              />
              {currentPoint && (
                <ReferenceDot
                  x={currentPoint.label}
                  y={currentPoint.avgCV}
                  r={0}
                  label={{
                    value: `Current (${currentPoint.avgCV}%)`,
                    position: 'top',
                    fill: 'hsl(0 84% 60%)',
                    fontSize: 11,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Team Accuracy */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Per-Team Scoring Accuracy</h2>
          <select
            value={selectedModelId}
            onChange={e => setSelectedModelId(e.target.value)}
            className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:border-success"
          >
            {modelComparison.models
              .filter(m => m.variant.isActive)
              .map(m => (
                <option key={m.variant.id} value={m.variant.id}>
                  {m.variant.label} {m.variant.isCurrent ? '(current)' : ''}
                </option>
              ))}
          </select>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamAccuracyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis dataKey="team" tick={{ fill: 'hsl(0 0% 64%)', fontSize: 11 }} />
              <YAxis
                tick={{ fill: 'hsl(0 0% 64%)', fontSize: 12 }}
                label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', fill: 'hsl(0 0% 55%)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(0 0% 7%)',
                  border: '1px solid hsl(0 0% 20%)',
                  borderRadius: '8px',
                  color: 'hsl(0 0% 100%)',
                }}
                formatter={(value: number) => [`${value}%`, 'Accuracy']}
              />
              <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                {teamAccuracyData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.hasActionData ? 'hsl(142 71% 45%)' : 'hsl(48 96% 47%)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-textMuted">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(142 71% 45%)' }}></span>
            Action data
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: 'hsl(48 96% 47%)' }}></span>
            Summary fallback
          </span>
        </div>
      </div>

      {/* Model Detail Table */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-4">All Models — Detail</h2>
        <div className="overflow-x-auto -mx-4 md:-mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-textMuted">
                <th className="text-left py-2 px-3 font-medium">Model</th>
                <th className="text-right py-2 px-3 font-medium">Avg CV</th>
                <th className="text-right py-2 px-3 font-medium">Mean Abs Error</th>
                <th className="text-center py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {modelComparison.models.map((m, i) => (
                <ModelDetailRow key={m.variant.id} model={m} isStriped={i % 2 === 0} bestCV={bestModel?.avgCV} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-card rounded-lg p-3 border ${highlight ? 'border-warning' : 'border-border'}`}>
      <p className="text-xs text-textMuted mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}

function ModelDetailRow({ model, isStriped, bestCV }: { model: ModelResult; isStriped: boolean; bestCV?: number }) {
  const isBest = bestCV !== undefined && model.avgCV === bestCV && model.variant.isActive;
  return (
    <tr className={`border-b border-border/50 ${isStriped ? 'bg-surfaceAlt' : ''} ${model.variant.isCurrent ? 'bg-interactive/30' : ''}`}>
      <td className="py-2 px-3">
        <span className="font-medium">{model.variant.label}</span>
        {model.variant.isCurrent && (
          <span className="ml-2 px-1.5 py-0.5 bg-danger/20 text-danger rounded text-[10px] font-semibold">CURRENT</span>
        )}
        {isBest && (
          <span className="ml-2 px-1.5 py-0.5 bg-success/20 text-success rounded text-[10px] font-semibold">BEST</span>
        )}
      </td>
      <td className={`py-2 px-3 text-right font-medium ${!model.variant.isActive ? 'text-textMuted' : ''}`}>
        {model.variant.isActive ? `${(model.avgCV * 100).toFixed(1)}%` : '—'}
      </td>
      <td className={`py-2 px-3 text-right ${!model.variant.isActive ? 'text-textMuted' : ''}`}>
        {model.variant.isActive ? model.meanAbsError.toFixed(1) : '—'}
      </td>
      <td className="py-2 px-3 text-center">
        {!model.variant.isActive ? (
          <span className="text-xs text-textMuted">Needs more data</span>
        ) : (
          <span className="text-xs text-success">Active</span>
        )}
      </td>
    </tr>
  );
}

// ── Active Model Selector ────────────────────────────────────────────────────

const MODEL_OPTIONS: { label: string; family: AttributionModelConfig['family']; beta?: number }[] = [
  { label: 'Power β=0.5', family: 'power', beta: 0.5 },
  { label: 'Power β=0.6', family: 'power', beta: 0.6 },
  { label: 'Power β=0.7 (default)', family: 'power', beta: 0.7 },
  { label: 'Power β=0.8', family: 'power', beta: 0.8 },
  { label: 'Power β=0.9', family: 'power', beta: 0.9 },
  { label: 'Linear (β=1.0)', family: 'power', beta: 1.0 },
  { label: 'Log Curve', family: 'log' },
  { label: 'Equal Distribution', family: 'equal' },
  { label: 'Rank-Based', family: 'rank' },
];

function modelConfigToKey(config: AttributionModelConfig): string {
  return config.family === 'power' ? `power_${config.beta}` : config.family;
}

function keyToModelConfig(key: string): AttributionModelConfig {
  if (key.startsWith('power_')) {
    return { family: 'power', beta: parseFloat(key.replace('power_', '')) };
  }
  return { family: key as AttributionModelConfig['family'], beta: DEFAULT_BETA };
}

function ActiveModelSelector({ attributionModel, setAttributionModel }: {
  attributionModel: AttributionModelConfig;
  setAttributionModel: (config: AttributionModelConfig) => void;
}) {
  const currentKey = modelConfigToKey(attributionModel);
  const isDefault = attributionModel.family === 'power' && attributionModel.beta === DEFAULT_BETA;

  return (
    <div className={`bg-surface rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
      isDefault ? 'border-border' : 'border-warning'
    }`}>
      <div className="flex-1">
        <p className="text-sm font-medium flex items-center gap-2">
          Active Model
          {!isDefault && (
            <span className="px-1.5 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-semibold">CHANGED</span>
          )}
        </p>
        <p className="text-xs text-textMuted mt-0.5">
          Changing this recalculates all attribution data and predictions instantly.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={currentKey}
          onChange={e => setAttributionModel(keyToModelConfig(e.target.value))}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:border-success"
        >
          {MODEL_OPTIONS.map(opt => {
            const key = opt.family === 'power' ? `power_${opt.beta}` : opt.family;
            return <option key={key} value={key}>{opt.label}</option>;
          })}
        </select>
        {!isDefault && (
          <button
            onClick={() => setAttributionModel({ family: 'power', beta: DEFAULT_BETA })}
            className="px-3 py-2 text-xs text-textSecondary hover:text-textPrimary bg-surfaceElevated rounded-lg transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab 3: AI Analysis ───────────────────────────────────────────────────────

function AIAnalysisTab({
  prompt, copied, copyPrompt, promptExpanded, setPromptExpanded,
}: {
  prompt: string;
  copied: boolean;
  copyPrompt: () => void;
  promptExpanded: boolean;
  setPromptExpanded: (v: boolean) => void;
}) {
  const previewLines = prompt.split('\n').slice(0, 12).join('\n');

  return (
    <div className="space-y-6">
      {/* Copy Prompt Section */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-2">
          <Bot size={20} />
          AI-Assisted Analysis
        </h2>
        <p className="text-sm text-textSecondary mb-4">
          Copy the analysis prompt below and paste it into Claude.ai or ChatGPT. It includes all your
          attribution data, model comparison results, and specific analysis questions.
        </p>

        <button
          onClick={copyPrompt}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            copied
              ? 'bg-success text-background'
              : 'bg-success/20 text-success hover:bg-success/30'
          }`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied to clipboard!' : 'Copy Analysis Prompt'}
        </button>

        {/* Prompt Preview */}
        <div className="mt-4">
          <button
            onClick={() => setPromptExpanded(!promptExpanded)}
            className="flex items-center gap-1 text-sm text-textSecondary hover:text-textPrimary transition-colors"
          >
            <ChevronDown size={14} className={`transition-transform ${promptExpanded ? 'rotate-180' : ''}`} />
            {promptExpanded ? 'Hide' : 'Show'} prompt preview
          </button>
          <div className={`mt-2 bg-card rounded-lg border border-border p-3 text-xs font-mono text-textSecondary whitespace-pre-wrap overflow-x-auto ${
            promptExpanded ? 'max-h-[600px] overflow-y-auto' : 'max-h-48 overflow-hidden'
          }`}>
            {promptExpanded ? prompt : previewLines + '\n...'}
          </div>
          <p className="text-xs text-textMuted mt-1">{prompt.length.toLocaleString()} characters</p>
        </div>
      </div>

      {/* Claude API Section (deferred) */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6 opacity-50">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-2">
          <Bot size={20} />
          Inline Claude API
        </h2>
        <p className="text-sm text-textSecondary">
          Coming soon — direct in-app analysis via Claude API. Requires a Firebase Cloud Function proxy
          to handle CORS. For now, use the copy prompt button above.
        </p>
      </div>
    </div>
  );
}

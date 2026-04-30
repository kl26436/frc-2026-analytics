import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TeamStatistics } from '../../types/scouting';
import type { DefenseImpact, FailureSlice, MetricRank } from '../../utils/strategicInsights';
import FailureModeChart from '../FailureModeChart';
import AutoConsistencyChart from '../AutoConsistencyChart';
import ClimbMatrix from '../ClimbMatrix';
import RankBadge from '../RankBadge';
import PartnerComparisonCard from '../PartnerComparisonCard';
import DefenseEffectivenessCard from '../DefenseEffectivenessCard';

interface MatchPoint {
  match: string;
  total: number;
  auto: number;
  teleop: number;
}

interface ChartColors {
  grid: string;
  axis: string;
  tick: string;
  success: string;
  warning: string;
  blue: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipLabel: string;
}

interface PerformanceTabProps {
  teamNum: number;
  teamStats: TeamStatistics;
  teamStatistics: TeamStatistics[];
  trendChartData: MatchPoint[];
  failureSlices: FailureSlice[];
  perMatchAuto: Array<{ matchNumber: number; autoPoints: number }>;
  perMatchClimb: Array<{ matchNumber: number; climbLevel: number; failed?: boolean }>;
  autoPointsRank: MetricRank;
  chartColors: ChartColors;
  nextMatchPartners: { matchLabel: string; partners: number[] } | null;
  defenseRate: number;
  defenseImpact: DefenseImpact;
}

export function PerformanceTab({
  teamNum,
  teamStats,
  teamStatistics,
  trendChartData,
  failureSlices,
  perMatchAuto,
  perMatchClimb,
  autoPointsRank,
  chartColors: cc,
  nextMatchPartners,
  defenseRate,
  defenseImpact,
}: PerformanceTabProps) {
  const n = teamStats.matchesPlayed;
  const [scoutingTotalsOpen, setScoutingTotalsOpen] = useState(false);

  // Partner + defense cards render even on low-data teams since their value
  // comes from match-prep / per-match info, not from the focused team's stats.
  const matchPrepCards = (
    <>
      {nextMatchPartners && (
        <PartnerComparisonCard
          homeTeam={teamNum}
          matchLabel={nextMatchPartners.matchLabel}
          partners={nextMatchPartners.partners}
          allStats={teamStatistics}
        />
      )}
      {defenseRate > 0.2 && (
        <DefenseEffectivenessCard
          teamNumber={teamNum}
          impact={defenseImpact}
          defenseRate={defenseRate}
        />
      )}
    </>
  );

  if (n < 3) {
    return (
      <div className="space-y-4 md:space-y-6">
        {matchPrepCards}
        <div className="bg-surface rounded-lg border border-border p-6 text-center">
          <p className="text-textSecondary">
            Performance analytics need at least 3 matches. Check back after a few rounds.
          </p>
          <p className="text-textMuted text-xs mt-2">
            {n === 0 ? 'No matches played yet.' : `${n} match${n === 1 ? '' : 'es'} played so far.`}
          </p>
        </div>
      </div>
    );
  }

  // Auto chart needs at least 5 matches to be readable; otherwise show a stat line.
  const showAutoChart = perMatchAuto.length >= 5;

  return (
    <div className="space-y-4 md:space-y-6">
      {matchPrepCards}

      {/* Match performance trend (line chart) */}
      {trendChartData.length >= 2 && (
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h2 className="text-xl font-bold mb-4">Match Performance Trend</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                <XAxis dataKey="match" stroke={cc.axis} tick={{ fill: cc.tick, fontSize: 12 }} />
                <YAxis stroke={cc.axis} tick={{ fill: cc.tick, fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: cc.tooltipBg,
                    border: `1px solid ${cc.tooltipBorder}`,
                    borderRadius: '8px',
                    color: cc.tooltipText,
                  }}
                  labelStyle={{ color: cc.tooltipLabel }}
                />
                <Line type="monotone" dataKey="total" stroke={cc.success} strokeWidth={2} dot={{ fill: cc.success, r: 4 }} name="Total Points" />
                <Line type="monotone" dataKey="auto" stroke={cc.warning} strokeWidth={1.5} dot={{ fill: cc.warning, r: 3 }} name="Auto" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="teleop" stroke={cc.blue} strokeWidth={1.5} dot={{ fill: cc.blue, r: 3 }} name="Teleop" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 2-column stable grid: failure modes + auto consistency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {failureSlices.length > 0 ? (
          <FailureModeChart slices={failureSlices} matchesPlayed={n} />
        ) : (
          <div /> /* keep 2-col grid stable */
        )}
        {showAutoChart ? (
          <AutoConsistencyChart perMatchAuto={perMatchAuto} />
        ) : (
          <div className="bg-surface rounded-lg border border-border p-4 md:p-5 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-textSecondary">Avg auto:</span>
            <span className="text-lg font-bold">{teamStats.avgAutoPoints.toFixed(1)}</span>
            <RankBadge
              rank={autoPointsRank.rank}
              total={autoPointsRank.total}
              percentile={autoPointsRank.percentile}
            />
            <span className="text-xs text-textMuted">({n} matches)</span>
          </div>
        )}
      </div>

      {/* Climb matrix — full-width below; auto-hides when no climbs */}
      {perMatchClimb.length > 0 && (
        <ClimbMatrix perMatchClimb={perMatchClimb} />
      )}

      {/* Derived statistics grid (existing 4-card layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Auto Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Calculated averages</p>
          <div className="space-y-3">
            <Row label="Avg Auto Fuel Estimate" value={teamStats.avgAutoFuelEstimate.toFixed(1)} />
            <Row label="Avg Auto Points" value={teamStats.avgAutoPoints.toFixed(1)} />
            <Row label="Auto Climb" value={`${teamStats.autoClimbCount}/${n} (${teamStats.autoClimbRate.toFixed(0)}%)`} />
            <Row
              label="Mid Field Auto"
              value={`${teamStats.centerFieldAutoCount}/${n} (${((teamStats.centerFieldAutoCount / n) * 100).toFixed(0)}%)`}
              valueClass={teamStats.centerFieldAutoCount > 0 ? 'text-success' : ''}
            />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Teleop Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Calculated averages</p>
          <div className="space-y-3">
            <Row label="Avg Teleop Fuel Estimate" value={teamStats.avgTeleopFuelEstimate.toFixed(1)} />
            <Row label="Avg Teleop Points" value={teamStats.avgTeleopPoints.toFixed(1)} />
            <Row label="Avg Passes" value={teamStats.avgTotalPass.toFixed(1)} />
            <Row label="Dedicated Passer" value={`${teamStats.dedicatedPasserCount}/${n} (${teamStats.dedicatedPasserRate.toFixed(0)}%)`} />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Endgame Performance</h3>
          <p className="text-xs text-textSecondary mb-4">Climb distribution</p>
          <div className="space-y-3">
            <Row label="No Climb" value={`${teamStats.climbNoneCount}/${n} (${teamStats.climbNoneRate.toFixed(0)}%)`} />
            <Row label="Level 1" value={`${teamStats.level1ClimbCount}/${n} (${teamStats.level1ClimbRate.toFixed(0)}%)`} />
            <Row label="Level 2" value={`${teamStats.level2ClimbCount}/${n} (${teamStats.level2ClimbRate.toFixed(0)}%)`} />
            <Row label="Level 3" value={`${teamStats.level3ClimbCount}/${n} (${teamStats.level3ClimbRate.toFixed(0)}%)`} />
            <Row
              label="Climb Failed"
              value={`${teamStats.climbFailedCount}/${n} (${teamStats.climbFailedRate.toFixed(0)}%)`}
              valueClass={teamStats.climbFailedCount > 0 ? 'text-danger' : ''}
            />
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg border border-border">
          <h3 className="text-lg font-bold mb-1">Reliability &amp; quality</h3>
          <p className="text-xs text-textSecondary mb-4">Flag counts</p>
          <div className="space-y-3">
            <Row
              label="Overall Unreliability"
              labelClass="font-medium"
              value={`${teamStats.unreliableMatchCount}/${n} (${teamStats.overallUnreliabilityRate.toFixed(0)}%)`}
              valueClass={`font-bold ${teamStats.overallUnreliabilityRate > 0 ? 'text-danger' : 'text-success'}`}
            />
            <Row
              label="↳ Lost Connection"
              labelClass="pl-3"
              value={`${teamStats.lostConnectionCount}/${n} (${teamStats.lostConnectionRate.toFixed(0)}%)`}
              valueClass={teamStats.lostConnectionCount > 0 ? 'text-danger' : ''}
            />
            <Row
              label="↳ No Robot on Field"
              labelClass="pl-3"
              value={`${teamStats.noRobotCount}/${n} (${teamStats.noRobotRate.toFixed(0)}%)`}
              valueClass={teamStats.noRobotCount > 0 ? 'text-danger' : ''}
            />
            <Row
              label="Bulldozed Fuel"
              value={`${teamStats.bulldozedFuelCount}/${n} (${teamStats.bulldozedFuelRate.toFixed(0)}%)`}
              valueClass={teamStats.bulldozedFuelCount > 0 ? 'text-blueAlliance' : ''}
            />
            <Row
              label="Poor Accuracy Flag"
              value={`${teamStats.poorAccuracyCount}/${n} (${teamStats.poorAccuracyRate.toFixed(0)}%)`}
              valueClass={teamStats.poorAccuracyCount > 0 ? 'text-warning' : ''}
            />
          </div>
        </div>
      </div>

      {/* Scouting totals — collapsed by default */}
      <div className="bg-surface rounded-lg border border-border">
        <button
          onClick={() => setScoutingTotalsOpen(o => !o)}
          className="w-full p-6 flex items-center justify-between hover:bg-interactive transition-colors rounded-lg"
        >
          <div className="text-left">
            <h2 className="text-xl font-bold">Scouting Totals</h2>
            <p className="text-xs text-textSecondary mt-1">Raw counts from {n} scouted matches</p>
          </div>
          {scoutingTotalsOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        {scoutingTotalsOpen && (
          <div className="p-6 pt-0 space-y-5 border-t border-border">
            <Section title="Endgame Climb">
              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'None', count: teamStats.climbNoneCount, color: 'text-textMuted' },
                  { label: 'L1', count: teamStats.level1ClimbCount, color: '' },
                  { label: 'L2', count: teamStats.level2ClimbCount, color: 'text-blueAlliance' },
                  { label: 'L3', count: teamStats.level3ClimbCount, color: 'text-success' },
                  { label: 'Failed', count: teamStats.climbFailedCount, color: 'text-danger' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="bg-surfaceElevated rounded-lg px-4 py-2 text-center min-w-[60px]">
                    <p className="text-xs text-textSecondary">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{count}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Autonomous">
              <TotalsRow items={[
                { label: 'Auto Climb', value: `${teamStats.autoClimbCount}/${n}` },
                { label: 'Mid Field Auto', value: `${teamStats.centerFieldAutoCount}/${n}`, color: teamStats.centerFieldAutoCount > 0 ? 'text-success' : '' },
                { label: 'Passer', value: `${teamStats.dedicatedPasserCount}/${n}` },
              ]} />
            </Section>

            <Section title="Fuel Scoring">
              <TotalsRow items={[
                { label: 'Auto Fuel', value: `${teamStats.totalAutoFuelEstimate.toFixed(0)} total (${teamStats.avgAutoFuelEstimate.toFixed(1)} avg)` },
                { label: 'Teleop Fuel', value: `${teamStats.totalTeleopFuelEstimate.toFixed(0)} total (${teamStats.avgTeleopFuelEstimate.toFixed(1)} avg)` },
                { label: 'Passes', value: `${(teamStats.totalAutoFuelPass + teamStats.totalTeleopFuelPass).toFixed(0)} total (${teamStats.avgTotalPass.toFixed(1)} avg)` },
              ]} />
            </Section>

            <Section title="Bonus Buckets (Total Counts)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <BucketsCard
                  title="Auto"
                  buckets={[
                    { label: '+1', val: teamStats.totalAutoPlus1 },
                    { label: '+2', val: teamStats.totalAutoPlus2 },
                    { label: '+3', val: teamStats.totalAutoPlus3 },
                    { label: '+5', val: teamStats.totalAutoPlus5 },
                    { label: '+10', val: teamStats.totalAutoPlus10 },
                    { label: '+20', val: teamStats.totalAutoPlus20 },
                  ]}
                />
                <BucketsCard
                  title="Teleop"
                  buckets={[
                    { label: '+1', val: teamStats.totalTeleopPlus1 },
                    { label: '+2', val: teamStats.totalTeleopPlus2 },
                    { label: '+3', val: teamStats.totalTeleopPlus3 },
                    { label: '+5', val: teamStats.totalTeleopPlus5 },
                    { label: '+10', val: teamStats.totalTeleopPlus10 },
                    { label: '+20', val: teamStats.totalTeleopPlus20 },
                  ]}
                />
              </div>
            </Section>

            <Section title="Flags">
              <TotalsRow items={[
                { label: 'Lost Conn', value: `${teamStats.lostConnectionCount}/${n}`, color: teamStats.lostConnectionCount > 0 ? 'text-danger' : '' },
                { label: 'No Robot', value: `${teamStats.noRobotCount}/${n}`, color: teamStats.noRobotCount > 0 ? 'text-danger' : '' },
                { label: 'Bulldozed', value: `${teamStats.bulldozedFuelCount}/${n}`, color: teamStats.bulldozedFuelCount > 0 ? 'text-blueAlliance' : '' },
                { label: 'Poor Accuracy', value: `${teamStats.poorAccuracyCount}/${n}`, color: teamStats.poorAccuracyCount > 0 ? 'text-warning' : '' },
                { label: '2nd Review', value: `${teamStats.secondReviewCount}/${n}`, color: teamStats.secondReviewCount > 0 ? 'text-danger' : '' },
              ]} />
            </Section>

            <Section title="Start Zones">
              <div className="flex flex-wrap gap-3">
                {teamStats.startZoneCounts.map((count, i) => (
                  <div key={i} className="bg-surfaceElevated rounded-lg px-4 py-2 text-center min-w-[50px]">
                    <p className="text-xs text-textSecondary">Z{i + 1}</p>
                    <p className={`text-lg font-bold ${count > 0 ? '' : 'text-textMuted'}`}>{count}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  labelClass,
  valueClass,
}: {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className={`text-textSecondary ${labelClass ?? ''}`}>{label}</span>
      <span className={`font-semibold ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-textSecondary mb-2">{title}</h3>
      {children}
    </div>
  );
}

function TotalsRow({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(({ label, value, color }) => (
        <span key={label} className="text-sm">
          <span className="text-textSecondary">{label}:</span>{' '}
          <span className={`font-semibold ${color || ''}`}>{value}</span>
        </span>
      ))}
    </div>
  );
}

function BucketsCard({ title, buckets }: { title: string; buckets: { label: string; val: number }[] }) {
  return (
    <div className="bg-surfaceElevated rounded p-3">
      <p className="text-xs text-textSecondary mb-2">{title}</p>
      <div className="flex gap-4 text-center">
        {buckets.map(b => (
          <div key={b.label}>
            <p className="text-xs text-textMuted">{b.label}</p>
            <p className="font-bold">{b.val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PerformanceTab;

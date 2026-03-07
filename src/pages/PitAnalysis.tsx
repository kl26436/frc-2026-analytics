import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { ChevronDown, ChevronRight, ClipboardCheck, Users } from 'lucide-react';
import type { PitScoutEntry } from '../types/pitScouting';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DRIVE_LABELS: Record<string, string> = {
  swerve: 'Swerve',
  tank: 'Tank',
  mecanum: 'Mecanum',
  other: 'Other',
};

const CLIMB_LABELS: Record<string, string> = {
  level3: 'Level 3',
  level2: 'Level 2',
  level1: 'Level 1',
  none: 'None',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  '1stYear': '1st Year',
  '2ndYear': '2nd Year',
  '3plusYears': '3+ Years',
};

const LANGUAGE_LABELS: Record<string, string> = {
  java: 'Java',
  cpp: 'C++',
  python: 'Python',
  labview: 'LabVIEW',
  other: 'Other',
};

const VIBE_LABELS: Record<string, string> = {
  good: 'Good',
  bad: 'Bad',
};

const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  driveCoach: 'Drive Coach',
  humanPlayer: 'Human Player',
};

// ── Collapsible Section ──────────────────────────────────────────────────────

interface CategoryGroup {
  label: string;
  teams: { teamNumber: number; teamName: string }[];
  color?: string;
}

function AnalysisSection({
  title,
  icon,
  groups,
  total,
}: {
  title: string;
  icon?: React.ReactNode;
  groups: CategoryGroup[];
  total: number;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-card">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-bold flex items-center gap-2">
          {icon}
          {title}
          <span className="text-textMuted font-normal text-sm ml-auto">{total} scouted</span>
        </h2>
      </div>
      <div className="divide-y divide-border">
        {groups.map(group => {
          const isExpanded = expandedGroup === group.label;
          const pct = total > 0 ? Math.round((group.teams.length / total) * 100) : 0;
          return (
            <div key={group.label}>
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-interactive transition-colors text-left"
              >
                {isExpanded ? <ChevronDown size={16} className="text-textMuted shrink-0" /> : <ChevronRight size={16} className="text-textMuted shrink-0" />}
                <span className="font-semibold">{group.label}</span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-textSecondary text-sm">{pct}%</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-sm font-bold ${group.color || 'bg-info/20 text-info'}`}>
                    {group.teams.length}
                  </span>
                </span>
              </button>
              {isExpanded && group.teams.length > 0 && (
                <div className="px-5 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {group.teams
                      .sort((a, b) => a.teamNumber - b.teamNumber)
                      .map(t => (
                        <Link
                          key={t.teamNumber}
                          to={`/teams/${t.teamNumber}`}
                          className="px-3 py-1.5 bg-surfaceElevated hover:bg-interactive rounded-lg text-sm font-mono border border-border transition-colors"
                        >
                          {t.teamNumber}
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Group builder ────────────────────────────────────────────────────────────

function groupBy(
  entries: PitScoutEntry[],
  keyFn: (e: PitScoutEntry) => string | null,
  labelMap: Record<string, string>,
  orderedKeys?: string[],
): CategoryGroup[] {
  const buckets = new Map<string, { teamNumber: number; teamName: string }[]>();

  for (const e of entries) {
    const key = keyFn(e) ?? 'Unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ teamNumber: e.teamNumber, teamName: e.teamName });
  }

  const keys = orderedKeys
    ? [...orderedKeys, ...Array.from(buckets.keys()).filter(k => !orderedKeys.includes(k))]
    : Array.from(buckets.keys());

  return keys
    .filter(k => buckets.has(k))
    .map(k => ({
      label: labelMap[k] || k,
      teams: buckets.get(k)!,
    }));
}

function booleanGroup(
  entries: PitScoutEntry[],
  keyFn: (e: PitScoutEntry) => boolean,
  yesLabel: string,
  noLabel: string,
): CategoryGroup[] {
  const yes: { teamNumber: number; teamName: string }[] = [];
  const no: { teamNumber: number; teamName: string }[] = [];
  for (const e of entries) {
    const t = { teamNumber: e.teamNumber, teamName: e.teamName };
    if (keyFn(e)) yes.push(t);
    else no.push(t);
  }
  return [
    { label: yesLabel, teams: yes, color: 'bg-success/20 text-success' },
    { label: noLabel, teams: no, color: 'bg-danger/20 text-danger' },
  ];
}

// ── Main Page ────────────────────────────────────────────────────────────────

function PitAnalysis() {
  const entries = usePitScoutStore(s => s.entries);
  const tbaData = useAnalyticsStore(s => s.tbaData);

  const totalTeams = tbaData?.teams?.length ?? 0;
  const total = entries.length;

  const driveGroups = useMemo(
    () => groupBy(entries, e => e.driveType, DRIVE_LABELS, ['swerve', 'tank', 'mecanum', 'other']),
    [entries],
  );

  const climbGroups = useMemo(
    () => groupBy(entries, e => e.climbLevel, CLIMB_LABELS, ['level3', 'level2', 'level1', 'none']),
    [entries],
  );

  const languageGroups = useMemo(
    () => groupBy(entries, e => e.programmingLanguage, LANGUAGE_LABELS, ['java', 'cpp', 'python', 'labview', 'other']),
    [entries],
  );

  const experienceGroups = useMemo(
    () => groupBy(entries, e => e.driverExperience, EXPERIENCE_LABELS, ['3plusYears', '2ndYear', '1stYear']),
    [entries],
  );

  const vibeGroups = useMemo(
    () => groupBy(entries, e => e.vibeCheck, VIBE_LABELS, ['good', 'bad']),
    [entries],
  );

  const rotateGroups = useMemo(
    () => booleanGroup(entries, e => e.rotatesDriveTeam, 'Rotates Drivers', 'Does Not Rotate'),
    [entries],
  );

  const trenchGroups = useMemo(
    () => booleanGroup(entries, e => e.canGoUnderTrench, 'Can Go Under Trench', 'Cannot Go Under Trench'),
    [entries],
  );

  // Rotating roles breakdown
  const roleGroups = useMemo(() => {
    const rotating = entries.filter(e => e.rotatesDriveTeam);
    if (rotating.length === 0) return [];
    return Object.entries(ROLE_LABELS).map(([key, label]) => ({
      label,
      teams: rotating
        .filter(e => e.rotatingRoles?.includes(key as never))
        .map(e => ({ teamNumber: e.teamNumber, teamName: e.teamName })),
    }));
  }, [entries]);

  if (total === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center space-y-4">
        <ClipboardCheck size={48} className="text-textMuted mx-auto" />
        <h1 className="text-2xl font-bold">Pit Analysis</h1>
        <p className="text-textSecondary">No pit scouting data yet. Start scouting teams to see analysis here.</p>
        <Link to="/pit-scouting" className="inline-block px-4 py-2 bg-primary text-white rounded-lg">
          Go to Pit Scouting
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck size={24} />
          Pit Analysis
        </h1>
        <div className="flex items-center gap-2 text-sm text-textSecondary">
          <Users size={16} />
          {total} / {totalTeams > 0 ? totalTeams : '?'} teams scouted
        </div>
      </div>

      {/* Progress bar */}
      {totalTeams > 0 && (
        <div className="bg-surface rounded-xl border border-border p-4 shadow-card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-textSecondary">Scouting Progress</span>
            <span className="font-semibold">{Math.round((total / totalTeams) * 100)}%</span>
          </div>
          <div className="h-3 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.min((total / totalTeams) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <AnalysisSection title="Drive Train" groups={driveGroups} total={total} />
        <AnalysisSection title="Climb Level" groups={climbGroups} total={total} />
        <AnalysisSection title="Vibe Check" groups={vibeGroups} total={total} />
        <AnalysisSection title="Driver Experience" groups={experienceGroups} total={total} />
        <AnalysisSection title="Rotates Drivers" groups={rotateGroups} total={total} />
        <AnalysisSection title="Programming Language" groups={languageGroups} total={total} />
        <AnalysisSection title="Trench Capability" groups={trenchGroups} total={total} />
        {roleGroups.length > 0 && (
          <AnalysisSection
            title="Rotating Roles"
            groups={roleGroups}
            total={entries.filter(e => e.rotatesDriveTeam).length}
          />
        )}
      </div>
    </div>
  );
}

export default PitAnalysis;

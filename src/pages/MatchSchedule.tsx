import { useCallback } from 'react';
import { Printer } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { matchLabel } from '../utils/formatting';
import { useWatchSchedule } from '../hooks/useWatchSchedule';
import type { WatchEntry } from '../hooks/useWatchSchedule';
import type { PitScoutEntry } from '../types/pitScouting';

function MatchSchedule() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const pitEntries = usePitScoutStore(s => s.entries);

  const watchSchedule = useWatchSchedule();

  const getDriveType = useCallback(
    (teamNumber: number) => pitEntries.find(e => e.teamNumber === teamNumber)?.driveType || null,
    [pitEntries]
  );

  const printMatchPrep = useCallback(() => {
    const body = buildWatchHTML(watchSchedule, pitEntries, eventCode);
    const html = `<!DOCTYPE html>
<html><head><title>Watch Schedule - ${eventCode}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 16px; font-size: 11px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; font-size: 10px; }
  th { background: #222; color: #fff; }
  tr:nth-child(even) { background: #f5f5f5; }
  .red { color: #c0392b; font-weight: 700; }
  .blue { color: #2980b9; font-weight: 700; }
  .drive { font-size: 8px; color: #555; margin-left: 2px; }
  .prep { font-weight: 700; color: #b57d00; }
  @media print { body { padding: 8px; } }
</style></head>
<body>${body}</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }, [watchSchedule, pitEntries, eventCode]);

  if (!tbaData?.matches?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Match Prep</h1>
        <p className="text-textSecondary">No match schedule loaded. Set up your event and load TBA data first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Match Prep</h1>
        <button
          onClick={printMatchPrep}
          className="flex items-center gap-1.5 bg-surfaceElevated border border-border rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-interactive transition-colors"
        >
          <Printer size={14} />
          Export PDF
        </button>
      </div>

      <WatchScheduleTable watchSchedule={watchSchedule} getDriveType={getDriveType} />
    </div>
  );
}

// ─── Shared Watch Schedule Table ─────────────────────────────────────────────

export interface WatchScheduleTableProps {
  watchSchedule: WatchEntry[];
  getDriveType: (teamNumber: number) => string | null;
  /** If provided, only show rows where at least one team is assigned to this ninja email */
  filterNinjaEmail?: string;
  /** Map of teamNumber → { ninjaName, ninjaEmail } */
  ninjaByTeam?: Map<number, { ninjaName: string; ninjaEmail: string }>;
}

export function WatchScheduleTable({ watchSchedule, getDriveType, filterNinjaEmail, ninjaByTeam }: WatchScheduleTableProps) {
  const filteredSchedule = filterNinjaEmail
    ? watchSchedule.filter(({ teamsToWatch }) =>
        teamsToWatch.some(tw => ninjaByTeam?.get(tw.teamNumber)?.ninjaEmail === filterNinjaEmail)
      )
    : watchSchedule;

  if (filteredSchedule.length === 0) {
    return <p className="text-textSecondary text-sm py-4 text-center">No prior matches to watch yet.</p>;
  }

  const showNinjaCols = !!ninjaByTeam;

  return (
    <div className="space-y-0">
      {/* Column headers */}
      <div className={`grid gap-2 px-3 py-1.5 text-[10px] font-bold text-textMuted uppercase tracking-wide border-b border-border ${showNinjaCols ? 'grid-cols-[50px_70px_1fr_1fr]' : 'grid-cols-[50px_70px_1fr_1fr]'}`}>
        <span>Match</span>
        <span>Prep For</span>
        <span>Partners</span>
        <span>Opponents</span>
      </div>

      {filteredSchedule.map(({ match: m, teamsToWatch }) => {
        const played = m.alliances.red.score >= 0;
        const redSet = new Set(m.alliances.red.team_keys.map(teamKeyToNumber));
        const partnerTeams = teamsToWatch.filter(tw => tw.role === 'partner');
        const opponentTeams = teamsToWatch.filter(tw => tw.role === 'opponent');

        // Group prep-for labels with spacing if multiple
        const prepLabels = [...new Set(teamsToWatch.map(tw => tw.forMatch))];

        const renderTeam = (tw: typeof teamsToWatch[0], i: number) => {
          const onRed = redSet.has(tw.teamNumber);
          const drive = getDriveType(tw.teamNumber);
          const ninja = ninjaByTeam?.get(tw.teamNumber);
          const isHighlighted = filterNinjaEmail && ninja?.ninjaEmail === filterNinjaEmail;
          return (
            <span key={`${tw.teamNumber}-${i}`} className={`inline-flex items-center gap-1 ${isHighlighted ? 'ring-1 ring-warning/50 rounded px-0.5' : ''}`}>
              <span className={`font-bold font-mono ${onRed ? 'text-redAlliance' : 'text-blueAlliance'}`}>
                {tw.teamNumber}
              </span>
              {drive && (
                <span className={`text-[9px] px-1 py-0 rounded ${onRed ? 'bg-redAlliance/10 text-redAlliance' : 'bg-blueAlliance/10 text-blueAlliance'}`}>
                  {drive}
                </span>
              )}
              {ninja && (
                <span className="text-[9px] px-1 py-0 rounded bg-warning/10 text-warning font-semibold">
                  {ninja.ninjaName.split(' ')[0]}
                </span>
              )}
            </span>
          );
        };

        return (
          <div
            key={m.key}
            className={`grid grid-cols-[50px_70px_1fr_1fr] gap-2 items-start px-3 py-2 border-b border-border/50 text-xs ${played ? 'opacity-50' : ''}`}
          >
            <span className={`font-bold pt-0.5 ${played ? 'text-textMuted' : 'text-textPrimary'}`}>
              {matchLabel(m)}
            </span>

            <div className="flex flex-col gap-0.5 pt-0.5">
              {prepLabels.map((fm, idx) => (
                <span key={fm}>
                  <span className="font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">{fm}</span>
                  {idx < prepLabels.length - 1 && <span className="block h-1" />}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {partnerTeams.map(renderTeam)}
              {partnerTeams.length === 0 && <span className="text-textMuted">—</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {opponentTeams.map(renderTeam)}
              {opponentTeams.length === 0 && <span className="text-textMuted">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PDF HTML Builder ────────────────────────────────────────────────────────

function buildWatchHTML(
  watchSchedule: WatchEntry[],
  pitEntries: PitScoutEntry[],
  eventCode: string
): string {
  const getDrive = (n: number) => pitEntries.find(e => e.teamNumber === n)?.driveType || '';

  let html = `<h1>Watch Schedule &mdash; ${eventCode}</h1>`;
  html += `<table><thead><tr><th>Match</th><th>Prep For</th><th>Partners</th><th>Opponents</th></tr></thead><tbody>`;

  for (const { match: m, teamsToWatch } of watchSchedule) {
    const redSet = new Set(m.alliances.red.team_keys.map(teamKeyToNumber));
    const partners = teamsToWatch.filter(tw => tw.role === 'partner');
    const opponents = teamsToWatch.filter(tw => tw.role === 'opponent');

    const formatTeams = (teams: typeof teamsToWatch) => {
      if (teams.length === 0) return '&mdash;';
      return teams.map(tw => {
        const drive = getDrive(tw.teamNumber);
        const cls = redSet.has(tw.teamNumber) ? 'red' : 'blue';
        return `<strong class="${cls}">${tw.teamNumber}</strong>${drive ? `<span class="drive">${drive}</span>` : ''}`;
      }).join('&nbsp;&nbsp; ');
    };

    const prepFor = [...new Set(teamsToWatch.map(tw => tw.forMatch))].join(', ');
    html += `<tr><td><strong>${matchLabel(m)}</strong></td><td class="prep">${prepFor}</td><td>${formatTeams(partners)}</td><td>${formatTeams(opponents)}</td></tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

export default MatchSchedule;

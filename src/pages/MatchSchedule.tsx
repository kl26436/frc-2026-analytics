import { useEffect, useMemo, useCallback } from 'react';
import { Printer } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import type { TBAMatch } from '../types/tba';
import type { PitScoutEntry } from '../types/pitScouting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMP_ORDER: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

function matchSortKey(m: TBAMatch): number {
  return (COMP_ORDER[m.comp_level] ?? 0) * 1000 + m.match_number;
}

function matchLabel(m: TBAMatch): string {
  if (m.comp_level === 'qm') return `Q${m.match_number}`;
  return `${m.comp_level.toUpperCase()}${m.set_number}-${m.match_number}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

function MatchSchedule() {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const homeTeamNumber = useAnalyticsStore(s => s.homeTeamNumber);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const pitEntries = usePitScoutStore(s => s.entries);

  const homeKey = `frc${homeTeamNumber}`;

  // All matches sorted
  const allMatches = useMemo(() => {
    if (!tbaData?.matches) return [];
    return [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));
  }, [tbaData]);

  // Home team's matches
  const homeMatches = useMemo(() => {
    return allMatches.filter(
      m => m.alliances.red.team_keys.includes(homeKey) || m.alliances.blue.team_keys.includes(homeKey)
    );
  }, [allMatches, homeKey]);

  // For a team, find their immediately prior match before a given match
  const getTeamPriorMatch = useCallback(
    (teamNumber: number, beforeMatch: TBAMatch): TBAMatch | null => {
      const teamKey = `frc${teamNumber}`;
      const beforeSK = matchSortKey(beforeMatch);
      for (let i = allMatches.length - 1; i >= 0; i--) {
        const m = allMatches[i];
        if (matchSortKey(m) >= beforeSK) continue;
        const teams = [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys];
        if (teams.includes(teamKey)) return m;
      }
      return null;
    },
    [allMatches]
  );

  // Watch schedule: only prior matches for partners/opponents
  const watchSchedule = useMemo(() => {
    if (homeMatches.length === 0) return [];

    const priorMatchMap: Map<string, { teamNumber: number; role: 'partner' | 'opponent'; forMatch: string; forMatchKey: string }[]> = new Map();

    for (const hm of homeMatches) {
      const homeOnRed = hm.alliances.red.team_keys.includes(homeKey);
      const partnerKeys = (homeOnRed ? hm.alliances.red.team_keys : hm.alliances.blue.team_keys).filter(tk => tk !== homeKey);
      const opponentKeys = homeOnRed ? hm.alliances.blue.team_keys : hm.alliances.red.team_keys;

      const addPrior = (teamKey: string, role: 'partner' | 'opponent') => {
        const num = teamKeyToNumber(teamKey);
        const prior = getTeamPriorMatch(num, hm);
        if (!prior) return;
        if (!priorMatchMap.has(prior.key)) priorMatchMap.set(prior.key, []);
        priorMatchMap.get(prior.key)!.push({ teamNumber: num, role, forMatch: matchLabel(hm), forMatchKey: hm.key });
      };

      for (const tk of partnerKeys) addPrior(tk, 'partner');
      for (const tk of opponentKeys) addPrior(tk, 'opponent');
    }

    const schedule: {
      match: TBAMatch;
      teamsToWatch: { teamNumber: number; role: 'partner' | 'opponent'; forMatch: string }[];
    }[] = [];

    for (const m of allMatches) {
      const entries = priorMatchMap.get(m.key);
      if (!entries) continue;
      const seen = new Set<string>();
      const deduped = entries.filter(e => {
        const key = `${e.teamNumber}-${e.forMatchKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      schedule.push({ match: m, teamsToWatch: deduped });
    }

    return schedule;
  }, [allMatches, homeMatches, homeKey, getTeamPriorMatch]);

  // Drive type lookup
  const getDriveType = useCallback(
    (teamNumber: number) => pitEntries.find(e => e.teamNumber === teamNumber)?.driveType || null,
    [pitEntries]
  );

  // ─── PDF Export ──────────────────────────────────────────────────────────────

  const printMatchPrep = useCallback(() => {
    const body = buildWatchHTML(watchSchedule, pitEntries, eventCode);

    const html = `<!DOCTYPE html>
<html><head><title>Match Prep - ${eventCode}</title>
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
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }, [watchSchedule, pitEntries, eventCode]);

  // ─── Render ──────────────────────────────────────────────────────────────────

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
      {/* Header */}
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

      {/* Watch Schedule */}
      <div className="space-y-0">
        {watchSchedule.length === 0 && (
          <p className="text-textSecondary text-sm py-4 text-center">No prior matches to watch yet.</p>
        )}
        {/* Column headers */}
        {watchSchedule.length > 0 && (
          <div className="grid grid-cols-[50px_70px_1fr_1fr] gap-2 px-3 py-1.5 text-[10px] font-bold text-textMuted uppercase tracking-wide border-b border-border">
            <span>Match</span>
            <span>Prep for</span>
            <span>Partners</span>
            <span>Opponents</span>
          </div>
        )}
        {watchSchedule.map(({ match: m, teamsToWatch }) => {
          const played = m.alliances.red.score >= 0;
          const redSet = new Set(m.alliances.red.team_keys.map(teamKeyToNumber));
          const partnerTeams = teamsToWatch.filter(tw => tw.role === 'partner');
          const opponentTeams = teamsToWatch.filter(tw => tw.role === 'opponent');

          const renderTeam = (tw: typeof teamsToWatch[0], i: number) => {
            const onRed = redSet.has(tw.teamNumber);
            const drive = getDriveType(tw.teamNumber);
            return (
              <span key={`${tw.teamNumber}-${i}`} className="inline-flex items-center gap-1">
                <span className={`font-bold font-mono ${onRed ? 'text-redAlliance' : 'text-blueAlliance'}`}>
                  {tw.teamNumber}
                </span>
                {drive && (
                  <span className={`text-[9px] px-1 py-0 rounded ${onRed ? 'bg-redAlliance/10 text-redAlliance' : 'bg-blueAlliance/10 text-blueAlliance'}`}>
                    {drive}
                  </span>
                )}
              </span>
            );
          };

          return (
            <div key={m.key} className={`grid grid-cols-[50px_70px_1fr_1fr] gap-2 items-center px-3 py-2 border-b border-border/50 text-xs ${played ? 'opacity-50' : ''}`}>
              <span className={`font-bold ${played ? 'text-textMuted' : 'text-textPrimary'}`}>
                {matchLabel(m)}
              </span>

              <div className="flex flex-wrap gap-1">
                {[...new Set(teamsToWatch.map(tw => tw.forMatch))].map(fm => (
                  <span key={fm} className="font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded">{fm}</span>
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
    </div>
  );
}

// ─── PDF HTML Builder ────────────────────────────────────────────────────────

function buildWatchHTML(
  watchSchedule: { match: TBAMatch; teamsToWatch: { teamNumber: number; role: 'partner' | 'opponent'; forMatch: string }[] }[],
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

    html += `<tr>`;
    html += `<td><strong>${matchLabel(m)}</strong></td>`;
    html += `<td class="prep">${prepFor}</td>`;
    html += `<td>${formatTeams(partners)}</td>`;
    html += `<td>${formatTeams(opponents)}</td>`;
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

export default MatchSchedule;

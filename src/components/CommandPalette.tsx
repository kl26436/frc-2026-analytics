import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, Hash, Calendar, ArrowRight } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { matchLabel, matchSortKey } from '../utils/formatting';
import { TOP_LEVEL, MORE_GROUPS } from '../hooks/useNavStructure';
import type { NavItem } from '../hooks/useNavStructure';

type ResultKind = 'team' | 'match' | 'page';

interface Result {
  kind: ResultKind;
  to: string;
  label: string;
  subLabel?: string;
  icon: React.ElementType;
  pinned?: boolean;
  /** Internal score used for sorting. Higher = better. */
  score: number;
}

const MAX_RESULTS = 30;

function fuzzyScore(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 1;
  if (h === n) return 1000;
  if (h.startsWith(n)) return 500;
  const idx = h.indexOf(n);
  if (idx === -1) return 0;
  // Earlier match = higher score
  return 100 - idx;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const pinnedTeams = useWatchlistStore(s => s.pinnedTeams);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Reset query/highlight when opening, focus input
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightedIndex(0);
      // Defer focus until after render
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Build searchable indexes
  const teamIndex = useMemo(() => {
    const fromStats = teamStatistics.map(s => ({
      number: s.teamNumber,
      nickname: s.teamName ?? '',
    }));
    const fromTba = (tbaData?.teams ?? []).map(t => ({
      number: t.team_number,
      nickname: t.nickname,
    }));
    // Merge — prefer TBA nickname when present
    const map = new Map<number, { number: number; nickname: string }>();
    for (const t of fromStats) map.set(t.number, t);
    for (const t of fromTba) {
      if (t.nickname) map.set(t.number, t);
      else if (!map.has(t.number)) map.set(t.number, t);
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [teamStatistics, tbaData]);

  const matchIndex = useMemo(() => {
    if (!tbaData?.matches) return [];
    return [...tbaData.matches]
      .sort((a, b) => matchSortKey(a) - matchSortKey(b))
      .map(m => ({
        key: m.key,
        label: matchLabel(m),
        teams: [
          ...m.alliances.red.team_keys.map(teamKeyToNumber),
          ...m.alliances.blue.team_keys.map(teamKeyToNumber),
        ],
        completed: m.alliances.red.score >= 0,
        matchNumber: m.match_number,
      }));
  }, [tbaData?.matches]);

  const pageIndex = useMemo<NavItem[]>(
    () => [...TOP_LEVEL, ...MORE_GROUPS.flatMap(g => g.items)].filter(p => !p.external),
    [],
  );

  // Build filtered + ranked results
  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    const all: Result[] = [];

    if (q.length === 0) {
      // Show pinned teams, then top pages — keeps the palette useful as a launcher
      for (const num of pinnedTeams) {
        const team = teamIndex.find(t => t.number === num);
        all.push({
          kind: 'team',
          to: `/teams/${num}`,
          label: String(num),
          subLabel: team?.nickname || undefined,
          icon: Star,
          pinned: true,
          score: 1000,
        });
      }
      for (const p of pageIndex.slice(0, 8)) {
        all.push({ kind: 'page', to: p.to, label: p.label, icon: p.icon, score: 100 });
      }
      return all.slice(0, MAX_RESULTS);
    }

    // Teams
    for (const t of teamIndex) {
      const numScore = fuzzyScore(String(t.number), q);
      const nickScore = t.nickname ? fuzzyScore(t.nickname, q) : 0;
      const score = Math.max(numScore, nickScore);
      if (score > 0) {
        const isPinned = pinnedTeams.includes(t.number);
        all.push({
          kind: 'team',
          to: `/teams/${t.number}`,
          label: String(t.number),
          subLabel: t.nickname || undefined,
          icon: isPinned ? Star : Hash,
          pinned: isPinned,
          score: score + (isPinned ? 200 : 0),
        });
      }
    }

    // Matches
    for (const m of matchIndex) {
      const labelScore = fuzzyScore(m.label, q);
      // also match if query is a team number that's in this match
      const teamScore = m.teams.some(t => String(t) === q) ? 400 : 0;
      const score = Math.max(labelScore, teamScore);
      if (score > 0) {
        all.push({
          kind: 'match',
          to: `/replay/${m.matchNumber}`,
          label: m.label,
          subLabel: m.completed ? 'Completed' : 'Upcoming',
          icon: Calendar,
          score,
        });
      }
    }

    // Pages
    for (const p of pageIndex) {
      const score = fuzzyScore(p.label, q);
      if (score > 0) {
        all.push({
          kind: 'page',
          to: p.to,
          label: p.label,
          icon: p.icon,
          score: score - 50, // slight de-priority vs teams
        });
      }
    }

    return all.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  }, [query, teamIndex, matchIndex, pageIndex, pinnedTeams]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [results.length, query]);

  const navigateTo = useCallback(
    (to: string) => {
      setOpen(false);
      navigate(to);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[highlightedIndex];
      if (r) navigateTo(r.to);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-20 px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-xl shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search size={16} className="text-textMuted" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search teams, matches, pages…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder-textMuted"
          />
          <kbd className="text-[10px] text-textMuted bg-surfaceElevated px-1.5 py-0.5 rounded border border-border">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-textMuted">No results</p>
          ) : (
            <ul role="listbox">
              {results.map((r, i) => {
                const Icon = r.icon;
                const active = i === highlightedIndex;
                return (
                  <li key={`${r.kind}-${r.to}-${i}`}>
                    <button
                      onClick={() => navigateTo(r.to)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        active ? 'bg-blueAlliance/15 text-textPrimary' : 'hover:bg-surfaceElevated'
                      }`}
                    >
                      <Icon
                        size={14}
                        className={r.pinned ? 'text-warning' : active ? 'text-blueAlliance' : 'text-textMuted'}
                        fill={r.pinned ? 'currentColor' : 'none'}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.label}
                          {r.subLabel && (
                            <span className="ml-2 text-textMuted text-xs font-normal">{r.subLabel}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] text-textMuted uppercase tracking-wider">{r.kind}</span>
                      {active && <ArrowRight size={12} className="text-blueAlliance" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-surfaceAlt text-[10px] text-textMuted">
          <span className="flex items-center gap-2">
            <kbd className="bg-surfaceElevated px-1 py-0.5 rounded border border-border">↑↓</kbd>
            navigate
            <kbd className="bg-surfaceElevated px-1 py-0.5 rounded border border-border">⏎</kbd>
            select
          </span>
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;

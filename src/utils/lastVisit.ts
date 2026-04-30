import type { TBAMatch } from '../types/tba';

const STORAGE_KEY = 'frc-last-visit';

export interface VisitSnapshot {
  timestamp: number;
  homeRank: number | null;
  matchesPlayedCount: number;
  topTeamNumbers: number[]; // top-5 by total points
}

export interface AppSnapshot {
  homeRank: number | null;
  matchesPlayedCount: number;
  topTeamNumbers: number[];
  matches: TBAMatch[]; // for notable-match diffing
  homeTeamNumber?: number;
}

export interface VisitDiff {
  matchesPlayed: number; // since last visit
  homeRankDelta: number; // negative = improved
  newTopTeams: number[]; // teams that newly entered top-5
  fellOutOfTop: number[]; // teams that fell out of top-5
  notableMatches: TBAMatch[]; // matches with home or with surprises since last visit
  minutesSinceLastVisit: number;
}

export function getLastVisitSnapshot(): VisitSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitSnapshot;
    if (typeof parsed?.timestamp !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recordVisit(snapshot: Omit<AppSnapshot, 'matches'>): void {
  try {
    const next: VisitSnapshot = {
      timestamp: Date.now(),
      homeRank: snapshot.homeRank,
      matchesPlayedCount: snapshot.matchesPlayedCount,
      topTeamNumbers: snapshot.topTeamNumbers.slice(0, 5),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — fail silently
  }
}

export function diffSinceLastVisit(current: AppSnapshot): VisitDiff | null {
  const prev = getLastVisitSnapshot();
  if (!prev) return null;

  const matchesPlayed = Math.max(0, current.matchesPlayedCount - prev.matchesPlayedCount);
  const homeRankDelta =
    current.homeRank != null && prev.homeRank != null
      ? current.homeRank - prev.homeRank
      : 0;

  const prevTop = new Set(prev.topTeamNumbers);
  const currentTop = new Set(current.topTeamNumbers.slice(0, 5));
  const newTopTeams = [...currentTop].filter(n => !prevTop.has(n));
  const fellOutOfTop = [...prevTop].filter(n => !currentTop.has(n));

  const notableMatches = current.matches.filter(m => {
    if (!m.actual_time) return false;
    if (m.actual_time * 1000 < prev.timestamp) return false;
    const home = current.homeTeamNumber;
    if (home != null) {
      const homeKey = `frc${home}`;
      if (m.alliances.red.team_keys.includes(homeKey)) return true;
      if (m.alliances.blue.team_keys.includes(homeKey)) return true;
    }
    // Big upsets: score margin > 30 with the lower-ranked alliance winning is hard to detect
    // here without ranks-per-alliance, so for now flag only home-team matches.
    return false;
  });

  return {
    matchesPlayed,
    homeRankDelta,
    newTopTeams,
    fellOutOfTop,
    notableMatches,
    minutesSinceLastVisit: (Date.now() - prev.timestamp) / 60_000,
  };
}

export function clearLastVisit(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

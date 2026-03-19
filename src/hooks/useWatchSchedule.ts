import { useMemo, useCallback } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { teamKeyToNumber } from '../utils/tbaApi';
import { matchLabel, matchSortKey } from '../utils/formatting';
import type { TBAMatch } from '../types/tba';

export interface WatchTeam {
  teamNumber: number;
  role: 'partner' | 'opponent';
  forMatch: string;
  forMatchKey: string;
}

export interface WatchEntry {
  match: TBAMatch;
  teamsToWatch: WatchTeam[];
}

export function useWatchSchedule(): WatchEntry[] {
  const tbaData = useAnalyticsStore(s => s.tbaData);
  const homeTeamNumber = useAnalyticsStore(s => s.homeTeamNumber);
  const homeKey = `frc${homeTeamNumber}`;

  const allMatches = useMemo(() => {
    if (!tbaData?.matches) return [];
    return [...tbaData.matches].sort((a, b) => matchSortKey(a) - matchSortKey(b));
  }, [tbaData]);

  const homeMatches = useMemo(
    () => allMatches.filter(
      m => m.alliances.red.team_keys.includes(homeKey) || m.alliances.blue.team_keys.includes(homeKey)
    ),
    [allMatches, homeKey]
  );

  const getTeamPriorMatch = useCallback(
    (teamNumber: number, beforeMatch: TBAMatch): TBAMatch | null => {
      const teamKey = `frc${teamNumber}`;
      const beforeSK = matchSortKey(beforeMatch);
      for (let i = allMatches.length - 1; i >= 0; i--) {
        const m = allMatches[i];
        if (matchSortKey(m) >= beforeSK) continue;
        if ([...m.alliances.red.team_keys, ...m.alliances.blue.team_keys].includes(teamKey)) return m;
      }
      return null;
    },
    [allMatches]
  );

  return useMemo(() => {
    if (homeMatches.length === 0) return [];

    const priorMatchMap = new Map<string, WatchTeam[]>();

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

    const schedule: WatchEntry[] = [];
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
}

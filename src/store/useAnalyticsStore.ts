import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { ScoutEntry, TeamStatistics, PgTBAMatch, SyncMeta, RobotActions } from '../types/scouting';
import type { TBAEventData } from '../types/tba';
import { calculateAllTeamStatistics } from '../utils/statistics';
import { computeMatchFuelAttribution, aggregateTeamFuel } from '../utils/fuelAttribution';
import type { RobotMatchFuel, TeamFuelStats } from '../utils/fuelAttribution';
import { getAllEventData } from '../utils/tbaApi';

interface AnalyticsState {
  // ── Scout data ──
  scoutEntries: ScoutEntry[];
  teamStatistics: TeamStatistics[];
  pgTbaMatches: PgTBAMatch[];
  scoutActions: RobotActions[];
  matchFuelAttribution: RobotMatchFuel[];
  teamFuelStats: TeamFuelStats[];
  syncMeta: SyncMeta | null;
  dataLoading: boolean;
  dataError: string | null;

  // ── TBA data ──
  tbaApiKey: string;
  tbaData: TBAEventData | null;
  tbaLoading: boolean;
  tbaError: string | null;
  autoRefreshEnabled: boolean;

  // ── UI state ──
  selectedTeams: number[];
  eventCode: string;
  homeTeamNumber: number;

  // ── Actions ──
  subscribeToData: (eventKey: string) => void;
  unsubscribeFromData: () => void;
  calculateRealStats: () => void;
  calculateFuelAttribution: () => void;
  toggleTeamSelection: (teamNumber: number) => void;
  clearTeamSelection: () => void;
  setEventCode: (code: string) => void;
  setHomeTeamNumber: (n: number) => void;
  setTBAApiKey: (key: string) => void;
  fetchTBAData: (eventCode?: string) => Promise<TBAEventData | null>;
  setAutoRefresh: (enabled: boolean) => void;
  clearTBAData: () => void;
  triggerSync: (eventKey: string) => Promise<SyncMeta>;
}

// Store unsubscribe functions outside the store to avoid serialization issues
let _unsubScout: (() => void) | null = null;
let _unsubSyncMeta: (() => void) | null = null;
let _unsubTbaMatches: (() => void) | null = null;
let _unsubActions: (() => void) | null = null;
let _subscribedEventKey: string | null = null;

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      scoutEntries: [],
      teamStatistics: [],
      pgTbaMatches: [],
      scoutActions: [],
      matchFuelAttribution: [],
      teamFuelStats: [],
      syncMeta: null,
      dataLoading: false,
      dataError: null,
      selectedTeams: [],
      eventCode: '2026week0',
      homeTeamNumber: 148,
      tbaApiKey: '',
      tbaData: null,
      tbaLoading: false,
      tbaError: null,
      autoRefreshEnabled: false,

      // ── Real Data Subscriptions ──────────────────────────────────────

      subscribeToData: (eventKey: string) => {
        // Don't re-subscribe if already listening to this event
        if (_subscribedEventKey === eventKey && _unsubScout) return;

        // Clean up previous listeners
        get().unsubscribeFromData();

        // Clear stale data immediately so old event data doesn't flash
        _subscribedEventKey = eventKey;
        set({
          dataLoading: true,
          dataError: null,
          scoutEntries: [],
          teamStatistics: [],
          pgTbaMatches: [],
          scoutActions: [],
          matchFuelAttribution: [],
          teamFuelStats: [],
        });

        // 1. Subscribe to scout entries: scoutData/{eventKey}/entries
        const entriesRef = collection(db, 'scoutData', eventKey, 'entries');
        _unsubScout = onSnapshot(
          entriesRef,
          (snapshot) => {
            const entries: ScoutEntry[] = snapshot.docs.map(d => ({
              ...d.data(),
              id: d.id,
            })) as ScoutEntry[];
            set({ scoutEntries: entries, dataLoading: false, dataError: null });
            get().calculateRealStats();
          },
          (error) => {
            console.error('Scout data listener error:', error);
            set({ dataError: error.message, dataLoading: false });
          }
        );

        // 2. Subscribe to sync metadata: config/syncMeta
        const syncMetaRef = doc(db, 'config', 'syncMeta');
        _unsubSyncMeta = onSnapshot(
          syncMetaRef,
          (snapshot) => {
            if (snapshot.exists()) {
              set({ syncMeta: snapshot.data() as SyncMeta });
            }
          },
          (error) => {
            console.error('SyncMeta listener error:', error);
          }
        );

        // 3. Subscribe to TBA matches: tbaData/{eventKey}/matches
        const matchesRef = collection(db, 'tbaData', eventKey, 'matches');
        _unsubTbaMatches = onSnapshot(
          matchesRef,
          (snapshot) => {
            const matches: PgTBAMatch[] = snapshot.docs.map(d => d.data()) as PgTBAMatch[];
            set({ pgTbaMatches: matches });
            get().calculateFuelAttribution();
          },
          (error) => {
            console.error('TBA matches listener error:', error);
          }
        );

        // 4. Subscribe to scout actions: scoutActions/{eventKey}/actions
        const actionsRef = collection(db, 'scoutActions', eventKey, 'actions');
        _unsubActions = onSnapshot(
          actionsRef,
          (snapshot) => {
            const actions: RobotActions[] = snapshot.docs.map(d => d.data()) as RobotActions[];
            set({ scoutActions: actions });
            get().calculateFuelAttribution();
          },
          (error) => {
            console.error('Scout actions listener error:', error);
          }
        );
      },

      unsubscribeFromData: () => {
        if (_unsubScout) { _unsubScout(); _unsubScout = null; }
        if (_unsubSyncMeta) { _unsubSyncMeta(); _unsubSyncMeta = null; }
        if (_unsubTbaMatches) { _unsubTbaMatches(); _unsubTbaMatches = null; }
        if (_unsubActions) { _unsubActions(); _unsubActions = null; }
        _subscribedEventKey = null;
      },

      calculateRealStats: () => {
        const { scoutEntries } = get();
        const teamStatistics = calculateAllTeamStatistics(scoutEntries);
        set({ teamStatistics });
        get().calculateFuelAttribution();
      },

      calculateFuelAttribution: () => {
        const { scoutEntries, scoutActions, pgTbaMatches } = get();
        if (scoutEntries.length === 0 || pgTbaMatches.length === 0) return;
        const matchFuelAttribution = computeMatchFuelAttribution(scoutEntries, scoutActions, pgTbaMatches);
        const teamFuelStats = aggregateTeamFuel(matchFuelAttribution);
        set({ matchFuelAttribution, teamFuelStats });
        // TODO: remove debug logs after validation
        console.table(teamFuelStats.map(t => ({
          team: t.teamNumber,
          matches: t.matchesPlayed,
          avgScored: Math.round(t.avgShotsScored * 10) / 10,
          avgShots: Math.round(t.avgShots * 10) / 10,
          avgPasses: Math.round(t.avgPasses * 10) / 10,
          avgMoved: Math.round(t.avgMoved * 10) / 10,
          accuracy: `${Math.round(t.scoringAccuracy * 100)}%`,
          passerMatches: t.dedicatedPasserMatches || '',
          actionData: `${t.actionDataMatches}/${t.matchesPlayed}`,
        })));
        console.log(`[FuelAttribution] ${matchFuelAttribution.length} match rows, ${teamFuelStats.length} teams`);
      },

      // ── Team Selection ─────────────────────────────────────────────

      toggleTeamSelection: (teamNumber: number) => {
        const { selectedTeams } = get();
        if (selectedTeams.includes(teamNumber)) {
          set({ selectedTeams: selectedTeams.filter(t => t !== teamNumber) });
        } else {
          set({ selectedTeams: [...selectedTeams, teamNumber] });
        }
      },

      clearTeamSelection: () => {
        set({ selectedTeams: [] });
      },

      // ── Event Config ───────────────────────────────────────────────

      setEventCode: (code: string) => {
        const prev = get().eventCode;
        if (prev && prev !== code) {
          // Event changed — clear all stale data so old event doesn't bleed through
          set({
            eventCode: code,
            tbaData: null,
            tbaError: null,
            scoutEntries: [],
            teamStatistics: [],
            pgTbaMatches: [],
            scoutActions: [],
            matchFuelAttribution: [],
            teamFuelStats: [],
            syncMeta: null,
            selectedTeams: [],
          });
        } else {
          set({ eventCode: code });
        }
      },

      setHomeTeamNumber: (n: number) => {
        set({ homeTeamNumber: n });
      },

      setTBAApiKey: (key: string) => {
        set({ tbaApiKey: key });
      },

      // ── TBA Data ───────────────────────────────────────────────────

      fetchTBAData: async (eventCodeOverride?: string) => {
        const code = eventCodeOverride || get().eventCode;
        set({ tbaLoading: true, tbaError: null });
        try {
          const data = await getAllEventData(code);
          set({ tbaData: data, tbaLoading: false });
          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch TBA data';
          set({ tbaError: message, tbaLoading: false });
          return null;
        }
      },

      setAutoRefresh: (enabled: boolean) => {
        set({ autoRefreshEnabled: enabled });
      },

      clearTBAData: () => {
        set({ tbaData: null, tbaError: null });
      },

      triggerSync: async (eventKey: string) => {
        const syncFn = httpsCallable<{ eventKey: string }, SyncMeta>(functions, 'syncScoutData');
        const result = await syncFn({ eventKey });
        return result.data;
      },
    }),
    {
      name: 'frc-analytics-storage',
      version: 3,
      migrate: () => ({}),
      partialize: (state) => ({
        eventCode: state.eventCode,
        homeTeamNumber: state.homeTeamNumber,
        selectedTeams: state.selectedTeams,
        tbaApiKey: state.tbaApiKey,
        tbaData: state.tbaData,
        autoRefreshEnabled: state.autoRefreshEnabled,
      }),
    }
  )
);

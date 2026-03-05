import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../lib/firebase';
import type { ScoutEntry, TeamStatistics, PgTBAMatch, SyncMeta, RobotActions, ExcludedEntry } from '../types/scouting';
import type { TBAEventData } from '../types/tba';
import { calculateAllTeamStatistics, calculateTeamStatistics } from '../utils/statistics';
import { computeMatchFuelAttribution, aggregateTeamFuel, DEFAULT_BETA } from '../utils/fuelAttribution';
import type { RobotMatchFuel, TeamFuelStats, AttributionFn } from '../utils/fuelAttribution';
import { logCurveAttribution, equalAttribution, rankBasedAttribution } from '../utils/modelComparison';
import { buildPredictionInputs } from '../utils/predictions';
import type { PredictionTeamInput } from '../utils/predictions';
import { computeAllTeamTrends } from '../utils/trendAnalysis';
import type { TeamTrend } from '../utils/trendAnalysis';
import { getAllEventData, getEventOPRs } from '../utils/tbaApi';
import { computeOPR } from '../utils/opr';
import type { OPRResults } from '../utils/opr';
import type { TBAOPRs } from '../types/tba';

export interface AttributionModelConfig {
  family: 'power' | 'log' | 'equal' | 'rank';
  beta: number; // only used for power family
}

interface AnalyticsState {
  // ── Scout data ──
  scoutEntries: ScoutEntry[];
  excludedEntries: ExcludedEntry[];
  teamStatistics: TeamStatistics[];
  pgTbaMatches: PgTBAMatch[];
  scoutActions: RobotActions[];
  matchFuelAttribution: RobotMatchFuel[];
  teamFuelStats: TeamFuelStats[];
  predictionInputs: PredictionTeamInput[];
  teamTrends: TeamTrend[];
  syncMeta: SyncMeta | null;
  dataLoading: boolean;
  dataError: string | null;

  // ── TBA data ──
  tbaApiKey: string;
  tbaData: TBAEventData | null;
  tbaOPRs: TBAOPRs | null;
  localOPR: OPRResults | null;
  tbaLoading: boolean;
  tbaError: string | null;
  autoRefreshEnabled: boolean;

  // ── UI state ──
  selectedTeams: number[];
  eventCode: string;
  homeTeamNumber: number;
  attributionModel: AttributionModelConfig;

  // ── Actions ──
  subscribeToData: (eventKey: string) => void;
  unsubscribeFromData: () => void;
  calculateRealStats: () => void;
  calculateFuelAttribution: () => void;
  calculatePredictionInputs: () => void;
  toggleTeamSelection: (teamNumber: number) => void;
  clearTeamSelection: () => void;
  setEventCode: (code: string) => void;
  setHomeTeamNumber: (n: number) => void;
  setTBAApiKey: (key: string) => void;
  fetchTBAData: (eventCode?: string) => Promise<TBAEventData | null>;
  fetchTBAOPRs: (eventCode?: string) => Promise<void>;
  calculateLocalOPR: () => void;
  setAutoRefresh: (enabled: boolean) => void;
  clearTBAData: () => void;
  triggerSync: (eventKey: string) => Promise<SyncMeta>;
  toggleExcludeEntry: (matchNumber: number, teamNumber: number) => Promise<void>;
  setAttributionModel: (config: AttributionModelConfig) => void;
}

// Store unsubscribe functions outside the store to avoid serialization issues
let _unsubScout: (() => void) | null = null;
let _unsubSyncMeta: (() => void) | null = null;
let _unsubTbaMatches: (() => void) | null = null;
let _unsubActions: (() => void) | null = null;
let _unsubExcluded: (() => void) | null = null;
let _unsubAttrModel: (() => void) | null = null;
let _subscribedEventKey: string | null = null;

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      scoutEntries: [],
      excludedEntries: [],
      teamStatistics: [],
      pgTbaMatches: [],
      scoutActions: [],
      matchFuelAttribution: [],
      teamFuelStats: [],
      predictionInputs: [],
      teamTrends: [],
      syncMeta: null,
      dataLoading: false,
      dataError: null,
      selectedTeams: [],
      eventCode: '2026week0',
      homeTeamNumber: 148,
      attributionModel: { family: 'power', beta: DEFAULT_BETA },
      tbaApiKey: '',
      tbaData: null,
      tbaOPRs: null,
      localOPR: null,
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
          excludedEntries: [],
          teamStatistics: [],
          pgTbaMatches: [],
          scoutActions: [],
          matchFuelAttribution: [],
          teamFuelStats: [],
          predictionInputs: [],
          teamTrends: [],
          localOPR: null,
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
          () => {}
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
          () => {}
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
          () => {}
        );

        // 5. Subscribe to excluded entries: excludedEntries/{eventKey}/excluded
        const excludedRef = collection(db, 'excludedEntries', eventKey, 'excluded');
        _unsubExcluded = onSnapshot(
          excludedRef,
          (snapshot) => {
            const excluded: ExcludedEntry[] = snapshot.docs.map(d => d.data() as ExcludedEntry);
            set({ excludedEntries: excluded });
            get().calculateRealStats();
          },
          () => {}
        );

        // 6. Subscribe to shared attribution model: config/attributionModel
        const attrModelRef = doc(db, 'config', 'attributionModel');
        _unsubAttrModel = onSnapshot(
          attrModelRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as AttributionModelConfig;
              const current = get().attributionModel;
              // Only update if different to avoid loops
              if (data.family !== current.family || data.beta !== current.beta) {
                set({ attributionModel: data });
                get().calculateFuelAttribution();
              }
            }
          },
          () => {}
        );
      },

      unsubscribeFromData: () => {
        if (_unsubScout) { _unsubScout(); _unsubScout = null; }
        if (_unsubSyncMeta) { _unsubSyncMeta(); _unsubSyncMeta = null; }
        if (_unsubTbaMatches) { _unsubTbaMatches(); _unsubTbaMatches = null; }
        if (_unsubActions) { _unsubActions(); _unsubActions = null; }
        if (_unsubExcluded) { _unsubExcluded(); _unsubExcluded = null; }
        if (_unsubAttrModel) { _unsubAttrModel(); _unsubAttrModel = null; }
        _subscribedEventKey = null;
      },

      calculateRealStats: () => {
        const { scoutEntries, excludedEntries, tbaData } = get();
        const excludedSet = new Set(excludedEntries.map(e => `${e.matchNumber}_${e.teamNumber}`));
        const filteredEntries = scoutEntries.filter(e => !excludedSet.has(`${e.match_number}_${e.team_number}`));
        const teamNamesMap = new Map<number, string>(
          tbaData?.teams?.map(t => [t.team_number, t.nickname]) ?? []
        );
        const teamStatistics = calculateAllTeamStatistics(filteredEntries, teamNamesMap.size > 0 ? teamNamesMap : undefined);

        // Include TBA teams that have no scout entries yet (new event)
        if (tbaData?.teams) {
          const scoutedTeams = new Set(teamStatistics.map(t => t.teamNumber));
          for (const tbaTeam of tbaData.teams) {
            if (!scoutedTeams.has(tbaTeam.team_number)) {
              teamStatistics.push(
                calculateTeamStatistics(tbaTeam.team_number, [], tbaTeam.nickname)
              );
            }
          }
        }

        const teamTrends = computeAllTeamTrends(filteredEntries);
        set({ teamStatistics, teamTrends });
        get().calculateFuelAttribution();
      },

      calculateFuelAttribution: () => {
        const { scoutEntries, excludedEntries, scoutActions, pgTbaMatches, attributionModel } = get();
        const excludedSet = new Set(excludedEntries.map(e => `${e.matchNumber}_${e.teamNumber}`));
        const filteredEntries = scoutEntries.filter(e => !excludedSet.has(`${e.match_number}_${e.team_number}`));
        if (filteredEntries.length === 0 || pgTbaMatches.length === 0) {
          // No FMS data yet — still build prediction inputs from scout-only
          get().calculatePredictionInputs();
          return;
        }

        // Build attribution function from selected model config
        let attribFn: AttributionFn | undefined;
        switch (attributionModel.family) {
          case 'log':
            attribFn = logCurveAttribution;
            break;
          case 'equal':
            attribFn = (shots, total) => equalAttribution(shots, total, shots.map(s => s === 0));
            break;
          case 'rank':
            attribFn = (shots, total) => rankBasedAttribution(shots, total, shots.map(s => s === 0));
            break;
          case 'power':
          default:
            // Use beta param — undefined attribFn falls back to powerCurveAttribution(beta)
            break;
        }

        const matchFuelAttribution = computeMatchFuelAttribution(
          filteredEntries, scoutActions, pgTbaMatches, attributionModel.beta, attribFn
        );
        const teamFuelStats = aggregateTeamFuel(matchFuelAttribution);
        set({ matchFuelAttribution, teamFuelStats });
        get().calculateLocalOPR();
        get().calculatePredictionInputs();
      },

      calculatePredictionInputs: () => {
        const { teamStatistics, teamFuelStats } = get();
        if (teamStatistics.length === 0) return;
        const predictionInputs = buildPredictionInputs(teamStatistics, teamFuelStats);
        set({ predictionInputs });
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
            tbaOPRs: null,
            localOPR: null,
            tbaError: null,
            scoutEntries: [],
            excludedEntries: [],
            teamStatistics: [],
            pgTbaMatches: [],
            scoutActions: [],
            matchFuelAttribution: [],
            teamFuelStats: [],
            predictionInputs: [],
            teamTrends: [],
            syncMeta: null,
            selectedTeams: [],
          });

          // Clear other stores' localStorage to prevent stale data on hydration.
          // The in-memory state will be refreshed by their own Firestore listeners
          // or page-level useEffect hooks when they re-subscribe with the new event code.
          try {
            localStorage.removeItem('frc-picklist-storage');
            localStorage.removeItem('pit-scout-storage');
            localStorage.removeItem('ninja-store');
          } catch {
            // localStorage may be unavailable (private browsing, etc.)
          }

          // Clear in-memory state of other stores (lazy import to avoid circular deps)
          import('./usePickListStore').then(m => m.usePickListStore.getState().clearPickList());
          import('./usePitScoutStore').then(m => m.usePitScoutStore.setState({ entries: [] }));
          import('./useNinjaStore').then(m => m.useNinjaStore.setState({ assignments: {}, notes: [] }));
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
          const [data] = await Promise.all([
            getAllEventData(code),
            get().fetchTBAOPRs(code),
          ]);
          set({ tbaData: data, tbaLoading: false });
          get().calculateRealStats(); // Re-run so team names from TBA propagate to statistics
          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch TBA data';
          set({ tbaError: message, tbaLoading: false });
          return null;
        }
      },

      fetchTBAOPRs: async (eventCodeOverride?: string) => {
        const code = eventCodeOverride || get().eventCode;
        try {
          const oprs = await getEventOPRs(code, get().tbaApiKey || undefined);
          set({ tbaOPRs: oprs });
        } catch {
          // OPRs may not be available yet (no matches played) — fail silently
          set({ tbaOPRs: null });
        }
      },

      calculateLocalOPR: () => {
        const { pgTbaMatches } = get();
        if (pgTbaMatches.length === 0) {
          set({ localOPR: null });
          return;
        }
        const results = computeOPR(pgTbaMatches);
        set({ localOPR: results });
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

      toggleExcludeEntry: async (matchNumber: number, teamNumber: number) => {
        const { excludedEntries, eventCode } = get();
        const docId = `${matchNumber}_${teamNumber}`;
        const docRef = doc(db, 'excludedEntries', eventCode, 'excluded', docId);
        const existing = excludedEntries.find(
          e => e.matchNumber === matchNumber && e.teamNumber === teamNumber
        );
        if (existing) {
          await deleteDoc(docRef);
        } else {
          await setDoc(docRef, {
            matchNumber,
            teamNumber,
            excludedAt: new Date().toISOString(),
            excludedBy: auth.currentUser?.email ?? 'unknown',
          });
        }
      },

      setAttributionModel: (config: AttributionModelConfig) => {
        set({ attributionModel: config });
        get().calculateFuelAttribution();
        // Persist to Firestore so all users share the same model
        const attrModelRef = doc(db, 'config', 'attributionModel');
        setDoc(attrModelRef, { family: config.family, beta: config.beta }).catch(() => {});
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
        attributionModel: state.attributionModel,
      }),
    }
  )
);

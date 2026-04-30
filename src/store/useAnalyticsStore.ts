import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../lib/firebase';
import type { ScoutEntry, TeamStatistics, PgTBAMatch, SyncMeta, RobotActions, ExcludedEntry, RobotPicture } from '../types/scouting';
import type { TBAEventData } from '../types/tba';
import { calculateAllTeamStatistics, calculateTeamStatistics } from '../utils/statistics';
import { computeMatchFuelAttribution, aggregateTeamFuel, DEFAULT_BETA } from '../utils/fuelAttribution';
import type { RobotMatchFuel, TeamFuelStats, AttributionFn } from '../utils/fuelAttribution';
import { logCurveAttribution, equalAttribution, rankBasedAttribution, reattributeWithBayesian } from '../utils/modelComparison';
import { buildCrossEventPriors } from '../utils/crossEventPriors';
import type { CrossEventPriors } from '../utils/crossEventPriors';
import { buildPredictionInputs } from '../utils/predictions';
import type { PredictionTeamInput } from '../utils/predictions';
import { computeAllTeamTrends } from '../utils/trendAnalysis';
import type { TeamTrend } from '../utils/trendAnalysis';
import { getAllEventData, getEventOPRs } from '../utils/tbaApi';
import { computeOPR } from '../utils/opr';
import type { OPRResults } from '../utils/opr';
import type { TBAOPRs } from '../types/tba';

export interface AttributionModelConfig {
  family: 'power' | 'log' | 'equal' | 'rank' | 'bayesian';
  beta: number; // only used for power family
}

export type PredictionMode = 'live-only' | 'pre-scout-only' | 'blended' | 'smart-fallback';

interface AnalyticsState {
  // ── Scout data ──
  scoutEntries: ScoutEntry[];
  preScoutEntries: ScoutEntry[];
  excludedEntries: ExcludedEntry[];
  teamStatistics: TeamStatistics[];
  // Live-only stats — always computed from scout entries with NO pre-scout mixed in.
  // Used by every page where viewers must see identical numbers regardless of their
  // personal pre-scout toggle (picklist, alliance selection, dashboard, etc.).
  // teamStatistics above respects the user's pre-scout mode and is consumed only
  // where pre-scout is appropriate: predictions, team list page, team details page.
  liveOnlyTeamStatistics: TeamStatistics[];
  pgTbaMatches: PgTBAMatch[];
  scoutActions: RobotActions[];
  matchFuelAttribution: RobotMatchFuel[];
  teamFuelStats: TeamFuelStats[];
  predictionInputs: PredictionTeamInput[];
  teamTrends: TeamTrend[];
  robotPictures: RobotPicture[];
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
  // ── UI state ──
  selectedTeams: number[];
  eventCode: string;
  homeTeamNumber: number;
  attributionModel: AttributionModelConfig;
  // ── Cross-event priors (Bayesian) ──
  priorEventKeys: string[];
  crossEventPriors: CrossEventPriors | null;
  crossEventPriorsLoading: boolean;

  // ── Pre-scout config ──
  usePreScout: boolean;
  predictionMode: PredictionMode;
  smartFallbackThreshold: number;

  // ── Actions ──
  subscribeToData: (eventKey: string) => void;
  unsubscribeFromData: () => void;
  subscribeToPreScoutData: () => void;
  unsubscribeFromPreScoutData: () => void;
  setUsePreScout: (on: boolean) => void;
  setPredictionMode: (mode: PredictionMode) => void;
  setSmartFallbackThreshold: (n: number) => void;
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
  clearTBAData: () => void;
  triggerSync: (eventKey: string) => Promise<SyncMeta>;
  toggleExcludeEntry: (matchNumber: number, teamNumber: number) => Promise<void>;
  setAttributionModel: (config: AttributionModelConfig) => void;
  setPriorEventKeys: (keys: string[]) => void;
  loadCrossEventPriors: () => Promise<void>;
}

// Store unsubscribe functions outside the store to avoid serialization issues
let _unsubScout: (() => void) | null = null;
let _unsubSyncMeta: (() => void) | null = null;
let _unsubTbaMatches: (() => void) | null = null;
let _unsubActions: (() => void) | null = null;
let _unsubExcluded: (() => void) | null = null;
let _unsubAttrModel: (() => void) | null = null;
let _unsubPictures: (() => void) | null = null;
let _unsubPriorKeys: (() => void) | null = null;
let _unsubPreScout: (() => void) | null = null;
let _subscribedEventKey: string | null = null;

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      scoutEntries: [],
      preScoutEntries: [],
      excludedEntries: [],
      teamStatistics: [],
      liveOnlyTeamStatistics: [],
      pgTbaMatches: [],
      scoutActions: [],
      matchFuelAttribution: [],
      teamFuelStats: [],
      predictionInputs: [],
      teamTrends: [],
      robotPictures: [],
      syncMeta: null,
      dataLoading: false,
      dataError: null,
      selectedTeams: [],
      eventCode: '2026week0',
      homeTeamNumber: 148,
      attributionModel: { family: 'power', beta: DEFAULT_BETA },
      priorEventKeys: [],
      crossEventPriors: null,
      crossEventPriorsLoading: false,
      tbaApiKey: '',
      tbaData: null,
      tbaOPRs: null,
      localOPR: null,
      tbaLoading: false,
      tbaError: null,
      // Default: live-only so team totals/metrics aren't tainted by pre-scout out of the box.
      // Users can flip to 'pre-scout-only' via the in-page toggle, or pick blended modes
      // ('smart-fallback' / 'blended') in Admin Settings as advanced options.
      usePreScout: true,
      predictionMode: 'live-only',
      smartFallbackThreshold: 3,
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
          liveOnlyTeamStatistics: [],
          pgTbaMatches: [],
          scoutActions: [],
          matchFuelAttribution: [],
          teamFuelStats: [],
          predictionInputs: [],
          teamTrends: [],
          robotPictures: [],
          localOPR: null,
        });

        // 1. Subscribe to scout entries: scoutData/{eventKey}/entries
        const entriesRef = collection(db, 'scoutData', eventKey, 'entries');
        _unsubScout = onSnapshot(
          entriesRef,
          (snapshot) => {
            const entries: ScoutEntry[] = snapshot.docs.map(d => {
              const raw = d.data();
              return {
                ...raw,
                id: d.id,
                // Ensure all SCORE_PLUS fields default to 0 (old docs may lack newer fields)
                auton_SCORE_PLUS_1: raw.auton_SCORE_PLUS_1 || 0,
                auton_SCORE_PLUS_2: raw.auton_SCORE_PLUS_2 || 0,
                auton_SCORE_PLUS_3: raw.auton_SCORE_PLUS_3 || 0,
                auton_SCORE_PLUS_5: raw.auton_SCORE_PLUS_5 || 0,
                auton_SCORE_PLUS_10: raw.auton_SCORE_PLUS_10 || 0,
                auton_SCORE_PLUS_20: raw.auton_SCORE_PLUS_20 || 0,
                teleop_SCORE_PLUS_1: raw.teleop_SCORE_PLUS_1 || 0,
                teleop_SCORE_PLUS_2: raw.teleop_SCORE_PLUS_2 || 0,
                teleop_SCORE_PLUS_3: raw.teleop_SCORE_PLUS_3 || 0,
                teleop_SCORE_PLUS_5: raw.teleop_SCORE_PLUS_5 || 0,
                teleop_SCORE_PLUS_10: raw.teleop_SCORE_PLUS_10 || 0,
                teleop_SCORE_PLUS_20: raw.teleop_SCORE_PLUS_20 || 0,
              } as ScoutEntry;
            });
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

        // 6. Subscribe to robot pictures: robotPictures/2026/pictures
        const picturesRef = collection(db, 'robotPictures', '2026', 'pictures');
        _unsubPictures = onSnapshot(
          picturesRef,
          (snapshot) => {
            const pics: RobotPicture[] = snapshot.docs.map(d => d.data() as RobotPicture);
            set({ robotPictures: pics });
          },
          () => {}
        );

        // 7. Subscribe to shared attribution model: config/attributionModel
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

        // 8. Subscribe to prior event keys: config/priorEventKeys
        const priorKeysRef = doc(db, 'config', 'priorEventKeys');
        _unsubPriorKeys = onSnapshot(
          priorKeysRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as { keys: string[] };
              const current = get().priorEventKeys;
              if (JSON.stringify(data.keys) !== JSON.stringify(current)) {
                set({ priorEventKeys: data.keys, crossEventPriors: null });
                // Auto-load priors if Bayesian is active
                if (get().attributionModel.family === 'bayesian') {
                  get().loadCrossEventPriors();
                }
              }
            }
          },
          () => {}
        );

        // 9. Subscribe to pre-scout entries (flat collection, filtered to roster at calc time)
        get().subscribeToPreScoutData();
      },

      unsubscribeFromData: () => {
        if (_unsubScout) { _unsubScout(); _unsubScout = null; }
        if (_unsubSyncMeta) { _unsubSyncMeta(); _unsubSyncMeta = null; }
        if (_unsubTbaMatches) { _unsubTbaMatches(); _unsubTbaMatches = null; }
        if (_unsubActions) { _unsubActions(); _unsubActions = null; }
        if (_unsubExcluded) { _unsubExcluded(); _unsubExcluded = null; }
        if (_unsubPictures) { _unsubPictures(); _unsubPictures = null; }
        if (_unsubAttrModel) { _unsubAttrModel(); _unsubAttrModel = null; }
        if (_unsubPriorKeys) { _unsubPriorKeys(); _unsubPriorKeys = null; }
        get().unsubscribeFromPreScoutData();
        _subscribedEventKey = null;
      },

      // ── Pre-Scout Subscription ─────────────────────────────────────

      subscribeToPreScoutData: () => {
        // Tear down any prior listener (idempotent — safe to call repeatedly)
        if (_unsubPreScout) { _unsubPreScout(); _unsubPreScout = null; }

        const ref = collection(db, 'preScoutEntries');
        _unsubPreScout = onSnapshot(
          ref,
          (snapshot) => {
            const entries: ScoutEntry[] = snapshot.docs.map(d => {
              const raw = d.data();
              return {
                ...raw,
                id: d.id,
                _source: raw._source || 'pre-scout',
                // Defensive: ensure all SCORE_PLUS fields are numeric (older docs may lack them)
                auton_SCORE_PLUS_1: raw.auton_SCORE_PLUS_1 || 0,
                auton_SCORE_PLUS_2: raw.auton_SCORE_PLUS_2 || 0,
                auton_SCORE_PLUS_3: raw.auton_SCORE_PLUS_3 || 0,
                auton_SCORE_PLUS_5: raw.auton_SCORE_PLUS_5 || 0,
                auton_SCORE_PLUS_10: raw.auton_SCORE_PLUS_10 || 0,
                auton_SCORE_PLUS_20: raw.auton_SCORE_PLUS_20 || 0,
                teleop_SCORE_PLUS_1: raw.teleop_SCORE_PLUS_1 || 0,
                teleop_SCORE_PLUS_2: raw.teleop_SCORE_PLUS_2 || 0,
                teleop_SCORE_PLUS_3: raw.teleop_SCORE_PLUS_3 || 0,
                teleop_SCORE_PLUS_5: raw.teleop_SCORE_PLUS_5 || 0,
                teleop_SCORE_PLUS_10: raw.teleop_SCORE_PLUS_10 || 0,
                teleop_SCORE_PLUS_20: raw.teleop_SCORE_PLUS_20 || 0,
              } as ScoutEntry;
            });
            // Roster filter happens in calculateRealStats so it stays in sync
            // when tbaData arrives later or changes.
            set({ preScoutEntries: entries });
            get().calculateRealStats();
          },
          (error) => {
            console.warn('[preScoutEntries] subscription error:', error.message);
          }
        );
      },

      unsubscribeFromPreScoutData: () => {
        if (_unsubPreScout) { _unsubPreScout(); _unsubPreScout = null; }
        set({ preScoutEntries: [] });
      },

      setUsePreScout: (on) => {
        set({ usePreScout: on });
        get().calculateRealStats();
      },

      setPredictionMode: (mode) => {
        set({ predictionMode: mode });
        get().calculateRealStats();
      },

      setSmartFallbackThreshold: (n) => {
        const clamped = Math.max(1, Math.min(20, Math.round(n)));
        set({ smartFallbackThreshold: clamped });
        get().calculateRealStats();
      },

      calculateRealStats: () => {
        const {
          scoutEntries,
          preScoutEntries,
          excludedEntries,
          tbaData,
          usePreScout,
          predictionMode,
          smartFallbackThreshold,
        } = get();

        const excludedSet = new Set(excludedEntries.map(e => `${e.matchNumber}_${e.teamNumber}`));
        const liveFiltered = scoutEntries.filter(e => !excludedSet.has(`${e.match_number}_${e.team_number}`));

        // Roster filter for pre-scout: drop entries for teams not at the active event.
        // If TBA hasn't loaded yet, keep everything — this re-runs when fetchTBAData
        // sets tbaData, so the filter eventually applies.
        const rosterTeams = new Set((tbaData?.teams ?? []).map(t => t.team_number));
        const preScoutInRoster = rosterTeams.size > 0
          ? preScoutEntries.filter(e => rosterTeams.has(e.team_number))
          : preScoutEntries;
        const preScoutFiltered = preScoutInRoster.filter(e => !excludedSet.has(`${e.match_number}_${e.team_number}`));

        // Combine entries based on prediction mode
        let entriesForStats: ScoutEntry[];
        if (!usePreScout || predictionMode === 'live-only') {
          entriesForStats = liveFiltered;
        } else if (predictionMode === 'pre-scout-only') {
          entriesForStats = preScoutFiltered;
        } else if (predictionMode === 'blended') {
          entriesForStats = [...liveFiltered, ...preScoutFiltered];
        } else {
          // smart-fallback: live for teams with >= threshold matches; otherwise live + pre-scout
          const liveCountByTeam = new Map<number, number>();
          for (const e of liveFiltered) {
            liveCountByTeam.set(e.team_number, (liveCountByTeam.get(e.team_number) ?? 0) + 1);
          }
          const teamsWithEnoughLive = new Set<number>();
          for (const [team, count] of liveCountByTeam) {
            if (count >= smartFallbackThreshold) teamsWithEnoughLive.add(team);
          }
          const merged: ScoutEntry[] = [...liveFiltered];
          for (const e of preScoutFiltered) {
            if (!teamsWithEnoughLive.has(e.team_number)) merged.push(e);
          }
          entriesForStats = merged;
        }

        const teamNamesMap = new Map<number, string>(
          tbaData?.teams?.map(t => [t.team_number, t.nickname]) ?? []
        );
        const teamStatistics = calculateAllTeamStatistics(entriesForStats, teamNamesMap.size > 0 ? teamNamesMap : undefined);

        // Live-only stats: always derived from live scout entries, ignoring pre-scout
        // and the user's predictionMode. Used by every page where viewers must see
        // identical numbers regardless of personal toggles.
        const liveOnlyTeamStatistics = calculateAllTeamStatistics(
          liveFiltered,
          teamNamesMap.size > 0 ? teamNamesMap : undefined,
        );

        // Include TBA teams that have no entries yet (new event, no live OR pre-scout data)
        if (tbaData?.teams) {
          const scoutedTeams = new Set(teamStatistics.map(t => t.teamNumber));
          const liveScoutedTeams = new Set(liveOnlyTeamStatistics.map(t => t.teamNumber));
          for (const tbaTeam of tbaData.teams) {
            if (!scoutedTeams.has(tbaTeam.team_number)) {
              teamStatistics.push(
                calculateTeamStatistics(tbaTeam.team_number, [], tbaTeam.nickname)
              );
            }
            if (!liveScoutedTeams.has(tbaTeam.team_number)) {
              liveOnlyTeamStatistics.push(
                calculateTeamStatistics(tbaTeam.team_number, [], tbaTeam.nickname)
              );
            }
          }
        }

        const teamTrends = computeAllTeamTrends(entriesForStats);
        set({ teamStatistics, liveOnlyTeamStatistics, teamTrends });

        // In pre-scout-only mode, the user wants pre-scout values to drive
        // predictions verbatim. calculateFuelAttribution would otherwise re-merge
        // live FMS-attributed values into teamStatistics for any team that has
        // live FMS data, making predictions look like a blend. Clear FMS-derived
        // state and skip attribution so the scout-only fallback path in
        // buildPredictionInputs uses the pre-scout-derived teamStatistics.
        if (usePreScout && predictionMode === 'pre-scout-only') {
          set({ matchFuelAttribution: [], teamFuelStats: [] });
          get().calculatePredictionInputs();
          return;
        }

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
        const isBayesian = attributionModel.family === 'bayesian';
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
          case 'bayesian':
            // Bayesian runs in two passes: first power curve for initial data, then sequential Bayesian
            break;
          case 'power':
          default:
            // Use beta param — undefined attribFn falls back to powerCurveAttribution(beta)
            break;
        }

        // First pass: always compute with power curve (or selected fn) to get base data
        let matchFuelAttribution = computeMatchFuelAttribution(
          filteredEntries, scoutActions, pgTbaMatches, attributionModel.beta, attribFn
        );

        // Second pass for Bayesian: re-attribute using sequential priors
        // Cross-event priors give teams from prior events informed attribution
        // starting from match 1, instead of falling back to power curve.
        if (isBayesian) {
          const xPriors = get().crossEventPriors ?? undefined;
          matchFuelAttribution = reattributeWithBayesian(matchFuelAttribution, xPriors);
        }

        const teamFuelStats = aggregateTeamFuel(matchFuelAttribution);

        // Merge FMS-attributed point averages into teamStatistics so all pages
        // show consistent numbers (FMS-attributed when available, scout fallback)
        const fuelMap = new Map(teamFuelStats.map(f => [f.teamNumber, f]));
        const mergeFuel = (ts: TeamStatistics): TeamStatistics => {
          const fuel = fuelMap.get(ts.teamNumber);
          if (!fuel) return ts;
          return {
            ...ts,
            avgAutoPoints: fuel.avgAutoPointsScored + fuel.avgAutoTowerPoints,
            avgTeleopPoints: fuel.avgTeleopPointsScored,
            avgEndgamePoints: fuel.avgEndgameTowerPoints,
            avgTotalPoints: fuel.avgTotalPointsScored,
          };
        };
        const teamStatistics = get().teamStatistics.map(mergeFuel);
        const liveOnlyTeamStatistics = get().liveOnlyTeamStatistics.map(mergeFuel);

        set({ matchFuelAttribution, teamFuelStats, teamStatistics, liveOnlyTeamStatistics });
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
          // 1. Unsubscribe from old event listeners FIRST (synchronous)
          get().unsubscribeFromData();

          // 2. Clear all stale data so old event doesn't bleed through
          set({
            eventCode: code,
            tbaData: null,
            tbaOPRs: null,
            localOPR: null,
            tbaError: null,
            scoutEntries: [],
            preScoutEntries: [],
            excludedEntries: [],
            teamStatistics: [],
            liveOnlyTeamStatistics: [],
            pgTbaMatches: [],
            scoutActions: [],
            matchFuelAttribution: [],
            teamFuelStats: [],
            predictionInputs: [],
            teamTrends: [],
            robotPictures: [],
            syncMeta: null,
            selectedTeams: [],
          });

          // 3. Clear other stores' localStorage to prevent stale data on hydration.
          try {
            localStorage.removeItem('frc-picklist-storage');
            localStorage.removeItem('pit-scout-storage');
            localStorage.removeItem('ninja-store');
          } catch {
            // localStorage may be unavailable (private browsing, etc.)
          }

          // 4. Clear in-memory state of other stores (lazy import to avoid circular deps)
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
          // Discard stale results if the event code changed while we were fetching
          if (get().eventCode !== code) return null;
          set({ tbaData: data, tbaLoading: false });
          get().calculateRealStats(); // Re-run so team names from TBA propagate to statistics
          return data;
        } catch (error) {
          if (get().eventCode !== code) return null; // stale error, ignore
          const message = error instanceof Error ? error.message : 'Failed to fetch TBA data';
          set({ tbaError: message, tbaLoading: false });
          return null;
        }
      },

      fetchTBAOPRs: async (eventCodeOverride?: string) => {
        const code = eventCodeOverride || get().eventCode;
        try {
          const oprs = await getEventOPRs(code, get().tbaApiKey || undefined);
          if (get().eventCode !== code) return; // stale, discard
          set({ tbaOPRs: oprs });
        } catch {
          if (get().eventCode !== code) return;
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
        // Auto-load cross-event priors when switching to Bayesian
        if (config.family === 'bayesian' && !get().crossEventPriors && get().priorEventKeys.length > 0) {
          get().loadCrossEventPriors();
        } else {
          get().calculateFuelAttribution();
        }
        // Persist to Firestore so all users share the same model
        const attrModelRef = doc(db, 'config', 'attributionModel');
        setDoc(attrModelRef, { family: config.family, beta: config.beta }).catch(() => {});
      },

      setPriorEventKeys: (keys: string[]) => {
        set({ priorEventKeys: keys, crossEventPriors: null });
        // Persist to Firestore so all users share the same config
        const priorKeysRef = doc(db, 'config', 'priorEventKeys');
        setDoc(priorKeysRef, { keys }).catch(() => {});
        // Reload priors if Bayesian is active
        if (get().attributionModel.family === 'bayesian') {
          get().loadCrossEventPriors();
        }
      },

      loadCrossEventPriors: async () => {
        const { priorEventKeys } = get();
        if (priorEventKeys.length === 0) {
          set({ crossEventPriors: null, crossEventPriorsLoading: false });
          get().calculateFuelAttribution();
          return;
        }

        set({ crossEventPriorsLoading: true });
        try {
          const priors = await buildCrossEventPriors(priorEventKeys);
          set({ crossEventPriors: priors, crossEventPriorsLoading: false });
          // Recalculate with the new priors
          get().calculateFuelAttribution();
        } catch (err) {
          console.error('[loadCrossEventPriors] Failed:', err);
          set({ crossEventPriorsLoading: false });
          get().calculateFuelAttribution();
        }
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
        attributionModel: state.attributionModel,
        priorEventKeys: state.priorEventKeys,
        usePreScout: state.usePreScout,
        predictionMode: state.predictionMode,
        smartFallbackThreshold: state.smartFallbackThreshold,
        // NOTE: tbaData intentionally NOT persisted — always fetched fresh from
        // TBA API to prevent stale event data surviving across event resets.
        // preScoutEntries also not persisted — they come from Firestore on subscribe.
      }),
    }
  )
);

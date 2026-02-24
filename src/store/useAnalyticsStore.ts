import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { RealScoutEntry, RealTeamStatistics, PgTBAMatch, SyncMeta } from '../types/scoutingReal';
import type { TBAEventData } from '../types/tba';
import { calculateAllRealTeamStatistics } from '../utils/realStatistics';
import { getAllEventData } from '../utils/tbaApi';

interface AnalyticsState {
  // ── Scout data ──
  realScoutEntries: RealScoutEntry[];
  realTeamStatistics: RealTeamStatistics[];
  pgTbaMatches: PgTBAMatch[];
  syncMeta: SyncMeta | null;
  realDataLoading: boolean;
  realDataError: string | null;

  // ── TBA data ──
  tbaData: TBAEventData | null;
  tbaLoading: boolean;
  tbaError: string | null;
  autoRefreshEnabled: boolean;

  // ── UI state ──
  selectedTeams: number[];
  eventCode: string;
  homeTeamNumber: number;

  // ── Actions ──
  subscribeToRealData: (eventKey: string) => void;
  unsubscribeFromRealData: () => void;
  calculateRealStats: () => void;
  toggleTeamSelection: (teamNumber: number) => void;
  clearTeamSelection: () => void;
  setEventCode: (code: string) => void;
  setHomeTeamNumber: (n: number) => void;
  fetchTBAData: (eventCode?: string) => Promise<TBAEventData | null>;
  setAutoRefresh: (enabled: boolean) => void;
  clearTBAData: () => void;
  triggerSync: (eventKey: string) => Promise<SyncMeta>;
}

// Store unsubscribe functions outside the store to avoid serialization issues
let _unsubScout: (() => void) | null = null;
let _unsubSyncMeta: (() => void) | null = null;
let _unsubTbaMatches: (() => void) | null = null;
let _subscribedEventKey: string | null = null;

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      realScoutEntries: [],
      realTeamStatistics: [],
      pgTbaMatches: [],
      syncMeta: null,
      realDataLoading: false,
      realDataError: null,
      selectedTeams: [],
      eventCode: '2026week0',
      homeTeamNumber: 148,
      tbaData: null,
      tbaLoading: false,
      tbaError: null,
      autoRefreshEnabled: false,

      // ── Real Data Subscriptions ──────────────────────────────────────

      subscribeToRealData: (eventKey: string) => {
        // Don't re-subscribe if already listening to this event
        if (_subscribedEventKey === eventKey && _unsubScout) return;

        // Clean up previous listeners
        get().unsubscribeFromRealData();

        // Clear stale data immediately so old event data doesn't flash
        _subscribedEventKey = eventKey;
        set({
          realDataLoading: true,
          realDataError: null,
          realScoutEntries: [],
          realTeamStatistics: [],
          pgTbaMatches: [],
        });

        // 1. Subscribe to scout entries: scoutData/{eventKey}/entries
        const entriesRef = collection(db, 'scoutData', eventKey, 'entries');
        _unsubScout = onSnapshot(
          entriesRef,
          (snapshot) => {
            const entries: RealScoutEntry[] = snapshot.docs.map(d => ({
              ...d.data(),
              id: d.id,
            })) as RealScoutEntry[];
            set({ realScoutEntries: entries, realDataLoading: false, realDataError: null });
            get().calculateRealStats();
          },
          (error) => {
            console.error('Scout data listener error:', error);
            set({ realDataError: error.message, realDataLoading: false });
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
          },
          (error) => {
            console.error('TBA matches listener error:', error);
          }
        );
      },

      unsubscribeFromRealData: () => {
        if (_unsubScout) { _unsubScout(); _unsubScout = null; }
        if (_unsubSyncMeta) { _unsubSyncMeta(); _unsubSyncMeta = null; }
        if (_unsubTbaMatches) { _unsubTbaMatches(); _unsubTbaMatches = null; }
        _subscribedEventKey = null;
      },

      calculateRealStats: () => {
        const { realScoutEntries } = get();
        const realTeamStatistics = calculateAllRealTeamStatistics(realScoutEntries);
        set({ realTeamStatistics });
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
            realScoutEntries: [],
            realTeamStatistics: [],
            pgTbaMatches: [],
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
        tbaData: state.tbaData,
        autoRefreshEnabled: state.autoRefreshEnabled,
      }),
    }
  )
);

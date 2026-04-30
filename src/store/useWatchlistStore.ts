import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

// Cross-app pinned-teams watchlist. Distinct from usePickListStore's
// `onWatchlist` flag, which is the picklist's final-morning staging area.

interface WatchlistState {
  pinnedTeams: number[]; // ordered, most-recent-first

  pinTeam: (n: number) => void;
  unpinTeam: (n: number) => void;
  togglePin: (n: number) => void;
  isPinned: (n: number) => boolean;
  reorder: (from: number, to: number) => void;

  subscribeToWatchlist: () => void;
  unsubscribeFromWatchlist: () => void;
}

let unsubscribe: Unsubscribe | null = null;

async function writeRemote(pinnedTeams: number[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'userPrefs', uid), { pinnedTeams }, { merge: true });
  } catch {
    // offline or rules error — local state persists via Zustand persist middleware
  }
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      pinnedTeams: [],

      pinTeam: (n) => {
        const { pinnedTeams } = get();
        if (pinnedTeams.includes(n)) return;
        const next = [n, ...pinnedTeams];
        set({ pinnedTeams: next });
        void writeRemote(next);
      },

      unpinTeam: (n) => {
        const { pinnedTeams } = get();
        if (!pinnedTeams.includes(n)) return;
        const next = pinnedTeams.filter(t => t !== n);
        set({ pinnedTeams: next });
        void writeRemote(next);
      },

      togglePin: (n) => {
        const { pinnedTeams, pinTeam, unpinTeam } = get();
        if (pinnedTeams.includes(n)) unpinTeam(n);
        else pinTeam(n);
      },

      isPinned: (n) => get().pinnedTeams.includes(n),

      reorder: (from, to) => {
        const { pinnedTeams } = get();
        if (from < 0 || from >= pinnedTeams.length) return;
        if (to < 0 || to >= pinnedTeams.length) return;
        if (from === to) return;
        const next = [...pinnedTeams];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        set({ pinnedTeams: next });
        void writeRemote(next);
      },

      subscribeToWatchlist: () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        if (unsubscribe) unsubscribe();
        unsubscribe = onSnapshot(
          doc(db, 'userPrefs', uid),
          (snap) => {
            if (!snap.exists()) return;
            const remote = (snap.data().pinnedTeams ?? []) as number[];
            // Trust remote as source of truth — mirror to local state.
            set({ pinnedTeams: remote });
          },
          () => {
            // listener error — keep local state
          }
        );
      },

      unsubscribeFromWatchlist: () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      },
    }),
    {
      name: 'frc-watchlist-storage',
      partialize: (state) => ({ pinnedTeams: state.pinnedTeams }),
    }
  )
);

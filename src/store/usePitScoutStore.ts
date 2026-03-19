import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import type { PitScoutEntry } from '../types/pitScouting';
import { normalizePitScoutEntry } from '../types/pitScouting';

interface PitScoutState {
  entries: PitScoutEntry[];
  offlineQueue: PitScoutEntry[];
  loading: boolean;
  error: string | null;
  lastScoutName: string;

  // Actions
  setLastScoutName: (name: string) => void;
  addEntry: (entry: Omit<PitScoutEntry, 'id' | 'timestamp'>) => Promise<string>;
  updateEntry: (id: string, updates: Partial<PitScoutEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  uploadPhoto: (teamNumber: number, eventCode: string, file: File) => Promise<{ url: string; path: string }>;
  deletePhoto: (path: string) => Promise<void>;
  loadEntriesFromFirestore: (eventCode: string) => Promise<void>;
  getEntryByTeam: (teamNumber: number) => PitScoutEntry | undefined;
  syncOfflineQueue: () => Promise<void>;
}

export const usePitScoutStore = create<PitScoutState>()(
  persist(
    (set, get) => ({
      entries: [],
      offlineQueue: [],
      loading: false,
      error: null,
      lastScoutName: '',

      setLastScoutName: (name) => set({ lastScoutName: name }),

      addEntry: async (entryData) => {
        set({ loading: true, error: null });

        const id = `${entryData.eventCode}-${entryData.teamNumber}`;
        const primary = entryData.photos?.find(p => p.isPrimary) ?? entryData.photos?.[0];
        const entry: PitScoutEntry = {
          ...entryData,
          id,
          timestamp: new Date().toISOString(),
          photoUrl: primary?.url ?? null,
          photoPath: primary?.path ?? null,
        };

        // Always save locally first so the scout doesn't lose work
        set(state => ({
          entries: [...state.entries.filter(e => e.id !== id), entry],
        }));

        // Skip Firestore entirely if offline — avoids hung promises and console spam
        if (!navigator.onLine) {
          set(state => ({
            offlineQueue: [...state.offlineQueue.filter(e => e.id !== id), entry],
            loading: false,
          }));
          return id;
        }

        try {
          const docRef = doc(db, 'pitScouting', id);
          await setDoc(docRef, entry);

          // Remove from offline queue if it was previously queued
          set(state => ({
            offlineQueue: state.offlineQueue.filter(e => e.id !== id),
            loading: false,
          }));
        } catch (err) {
          // May have gone offline during the write
          if (!navigator.onLine) {
            set(state => ({
              offlineQueue: [...state.offlineQueue.filter(e => e.id !== id), entry],
              loading: false,
            }));
          } else {
            const message = err instanceof Error ? err.message : 'Failed to save pit scout entry';
            set({ error: message, loading: false });
            throw err;
          }
        }

        return id;
      },

      updateEntry: async (id, updates) => {
        set({ loading: true, error: null });
        try {
          const entry = get().entries.find(e => e.id === id);
          if (!entry) throw new Error('Entry not found');

          const updatedEntry = { ...entry, ...updates };

          // Save locally first
          set(state => ({
            entries: state.entries.map(e => e.id === id ? updatedEntry : e),
          }));

          if (!navigator.onLine) {
            set(state => ({
              offlineQueue: [...state.offlineQueue.filter(e => e.id !== id), updatedEntry],
              loading: false,
            }));
            return;
          }

          try {
            const docRef = doc(db, 'pitScouting', id);
            await setDoc(docRef, updatedEntry);

            set(state => ({
              offlineQueue: state.offlineQueue.filter(e => e.id !== id),
              loading: false,
            }));
          } catch (innerErr) {
            if (!navigator.onLine) {
              set(state => ({
                offlineQueue: [...state.offlineQueue.filter(e => e.id !== id), updatedEntry],
                loading: false,
              }));
            } else {
              throw innerErr;
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to update entry';
          set({ error: message, loading: false });
          throw err;
        }
      },

      deleteEntry: async (id) => {
        set({ loading: true, error: null });
        try {
          const entry = get().entries.find(e => e.id === id);

          // Delete all photos
          if (entry?.photos?.length) {
            await Promise.all(entry.photos.map(p => get().deletePhoto(p.path)));
          } else if (entry?.photoPath) {
            await get().deletePhoto(entry.photoPath);
          }

          // Delete from Firestore
          const docRef = doc(db, 'pitScouting', id);
          await deleteDoc(docRef);

          // Update local state
          set(state => ({
            entries: state.entries.filter(e => e.id !== id),
            offlineQueue: state.offlineQueue.filter(e => e.id !== id),
            loading: false,
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to delete entry';
          set({ error: message, loading: false });
          throw err;
        }
      },

      uploadPhoto: async (teamNumber, eventCode, file) => {
        const path = `pitPhotos/${eventCode}/${teamNumber}_${Date.now()}.${file.name.split('.').pop()}`;
        const storageRef = ref(storage, path);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        return { url, path };
      },

      deletePhoto: async (path) => {
        try {
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
        } catch {
          // photo may already be deleted — ignore
        }
      },

      loadEntriesFromFirestore: async (eventCode) => {
        set({ loading: true, error: null });
        try {
          const q = query(collection(db, 'pitScouting'), where('eventCode', '==', eventCode));
          const snapshot = await getDocs(q);

          const firestoreEntries: PitScoutEntry[] = snapshot.docs.map(d => normalizePitScoutEntry(d.data() as Record<string, unknown>));

          // Merge: queued entries win over Firestore (they're newer/unsynced)
          const { offlineQueue } = get();
          const queuedById = new Map(offlineQueue.map(e => [e.id, e]));
          // For entries in both Firestore and queue, use the queued version
          const merged = firestoreEntries.map(e => queuedById.get(e.id) ?? e);
          // Add queued entries not yet in Firestore (new teams scouted offline)
          const newOffline = offlineQueue.filter(e => !firestoreEntries.some(f => f.id === e.id));

          set({ entries: [...merged, ...newOffline], loading: false });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load entries';
          set({ error: message, loading: false });
          throw err;
        }
      },

      getEntryByTeam: (teamNumber) => {
        return get().entries.find(e => e.teamNumber === teamNumber);
      },

      syncOfflineQueue: async () => {
        const { offlineQueue } = get();
        if (offlineQueue.length === 0) return;

        const failed: PitScoutEntry[] = [];
        for (const entry of offlineQueue) {
          try {
            const docRef = doc(db, 'pitScouting', entry.id);
            await setDoc(docRef, entry);
          } catch {
            failed.push(entry);
          }
        }
        set({ offlineQueue: failed });
      },
    }),
    {
      name: 'pit-scout-storage',
      partialize: (state) => ({
        entries: state.entries,
        lastScoutName: state.lastScoutName,
        offlineQueue: state.offlineQueue,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PitScoutState> | undefined;
        return {
          ...current,
          ...p,
          entries: (p?.entries ?? []).map(e => normalizePitScoutEntry(e as unknown as Record<string, unknown>)),
          offlineQueue: (p?.offlineQueue ?? []).map(e => normalizePitScoutEntry(e as unknown as Record<string, unknown>)),
        };
      },
    }
  )
);

// Auto-sync when the browser comes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    usePitScoutStore.getState().syncOfflineQueue();
  });
}

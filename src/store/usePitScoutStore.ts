import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import type { PitScoutEntry } from '../types/pitScouting';

interface PitScoutState {
  entries: PitScoutEntry[];
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
}

export const usePitScoutStore = create<PitScoutState>()(
  persist(
    (set, get) => ({
      entries: [],
      loading: false,
      error: null,
      lastScoutName: '',

      setLastScoutName: (name) => set({ lastScoutName: name }),

      addEntry: async (entryData) => {
        set({ loading: true, error: null });
        try {
          const id = `${entryData.eventCode}-${entryData.teamNumber}`;
          const entry: PitScoutEntry = {
            ...entryData,
            id,
            timestamp: new Date().toISOString(),
          };

          // Save to Firestore
          const docRef = doc(db, 'pitScouting', id);
          await setDoc(docRef, entry);

          // Update local state
          set(state => ({
            entries: [...state.entries.filter(e => e.id !== id), entry],
            loading: false,
          }));

          return id;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save pit scout entry';
          set({ error: message, loading: false });
          throw err;
        }
      },

      updateEntry: async (id, updates) => {
        set({ loading: true, error: null });
        try {
          const entry = get().entries.find(e => e.id === id);
          if (!entry) throw new Error('Entry not found');

          const updatedEntry = { ...entry, ...updates };

          // Save to Firestore
          const docRef = doc(db, 'pitScouting', id);
          await setDoc(docRef, updatedEntry);

          // Update local state
          set(state => ({
            entries: state.entries.map(e => e.id === id ? updatedEntry : e),
            loading: false,
          }));
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

          // Delete photo if exists
          if (entry?.photoPath) {
            await get().deletePhoto(entry.photoPath);
          }

          // Delete from Firestore
          const docRef = doc(db, 'pitScouting', id);
          await deleteDoc(docRef);

          // Update local state
          set(state => ({
            entries: state.entries.filter(e => e.id !== id),
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
        } catch (err) {
          console.warn('Failed to delete photo:', err);
        }
      },

      loadEntriesFromFirestore: async (eventCode) => {
        set({ loading: true, error: null });
        try {
          const q = query(collection(db, 'pitScouting'), where('eventCode', '==', eventCode));
          const snapshot = await getDocs(q);

          const entries: PitScoutEntry[] = snapshot.docs.map(doc => doc.data() as PitScoutEntry);

          set({ entries, loading: false });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load entries';
          set({ error: message, loading: false });
          throw err;
        }
      },

      getEntryByTeam: (teamNumber) => {
        return get().entries.find(e => e.teamNumber === teamNumber);
      },
    }),
    {
      name: 'pit-scout-storage',
      partialize: (state) => ({
        entries: state.entries,
        lastScoutName: state.lastScoutName,
      }),
    }
  )
);

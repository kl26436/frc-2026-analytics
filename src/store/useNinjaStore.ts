import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { NinjaAssignment, NinjaNote, NinjaAssignmentsDoc } from '../types/ninja';

interface NinjaState {
  assignments: Record<string, NinjaAssignment>; // keyed by team number string
  notes: NinjaNote[];
  loading: boolean;
  error: string | null;

  // Subscriptions
  _notesUnsubscribe: (() => void) | null;
  _assignmentsUnsubscribe: (() => void) | null;

  // Assignment actions (admin only)
  subscribeToAssignments: (eventCode: string) => void;
  setAssignment: (eventCode: string, teamNumber: number, ninjaEmail: string, ninjaName: string, assignedBy: string) => Promise<void>;
  removeAssignment: (eventCode: string, teamNumber: number) => Promise<void>;

  // Note actions
  subscribeToNotes: (eventCode: string) => void;
  addNote: (eventCode: string, note: Omit<NinjaNote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateNote: (eventCode: string, noteId: string, updates: Partial<Pick<NinjaNote, 'text' | 'tags' | 'matchNumber' | 'photos'>>) => Promise<void>;
  deleteNote: (eventCode: string, noteId: string) => Promise<void>;

  // Photo actions
  uploadNinjaPhoto: (teamNumber: number, eventCode: string, file: File) => Promise<{ url: string; path: string }>;
  deleteNinjaPhoto: (path: string) => Promise<void>;

  // Cleanup
  unsubscribeAll: () => void;
}

export const useNinjaStore = create<NinjaState>()(
  persist(
    (set, get) => ({
      assignments: {},
      notes: [],
      loading: false,
      error: null,
      _notesUnsubscribe: null,
      _assignmentsUnsubscribe: null,

      subscribeToAssignments: (eventCode) => {
        // Clean up previous listener
        get()._assignmentsUnsubscribe?.();

        const docRef = doc(db, 'ninjaAssignments', eventCode);
        const unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as NinjaAssignmentsDoc;
              set({ assignments: data.assignments ?? {} });
            } else {
              set({ assignments: {} });
            }
          },
          (err) => {
            console.error('Ninja assignments listener error:', err);
            set({ error: err.message });
          }
        );

        set({ _assignmentsUnsubscribe: unsubscribe });
      },

      setAssignment: async (eventCode, teamNumber, ninjaEmail, ninjaName, assignedBy) => {
        const docRef = doc(db, 'ninjaAssignments', eventCode);
        const assignment: NinjaAssignment = {
          ninjaEmail,
          ninjaName,
          assignedAt: new Date().toISOString(),
          assignedBy,
        };

        // Get current doc or create new
        const snap = await getDoc(docRef);
        const current = snap.exists() ? (snap.data() as NinjaAssignmentsDoc).assignments : {};

        await setDoc(docRef, {
          assignments: { ...current, [String(teamNumber)]: assignment },
        });
      },

      removeAssignment: async (eventCode, teamNumber) => {
        const docRef = doc(db, 'ninjaAssignments', eventCode);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;

        const current = { ...(snap.data() as NinjaAssignmentsDoc).assignments };
        delete current[String(teamNumber)];
        await setDoc(docRef, { assignments: current });
      },

      subscribeToNotes: (eventCode) => {
        // Clean up previous listener
        get()._notesUnsubscribe?.();

        const notesRef = collection(db, 'ninjaNotes', eventCode, 'notes');
        const q = query(notesRef);
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const notes: NinjaNote[] = snapshot.docs.map(d => ({
              ...(d.data() as Omit<NinjaNote, 'id'>),
              id: d.id,
            }));
            // Sort newest first
            notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            set({ notes });
          },
          (err) => {
            console.error('Ninja notes listener error:', err);
            set({ error: err.message });
          }
        );

        set({ _notesUnsubscribe: unsubscribe });
      },

      addNote: async (eventCode, noteData) => {
        const notesRef = collection(db, 'ninjaNotes', eventCode, 'notes');
        const now = new Date().toISOString();
        const docData = {
          ...noteData,
          createdAt: now,
          updatedAt: now,
        };
        const docRef = await addDoc(notesRef, docData);
        return docRef.id;
      },

      updateNote: async (eventCode, noteId, updates) => {
        const noteRef = doc(db, 'ninjaNotes', eventCode, 'notes', noteId);
        await updateDoc(noteRef, {
          ...updates,
          updatedAt: new Date().toISOString(),
        });
      },

      deleteNote: async (eventCode, noteId) => {
        // Delete associated photos first
        const note = get().notes.find(n => n.id === noteId);
        if (note?.photos?.length) {
          await Promise.all(note.photos.map(p => get().deleteNinjaPhoto(p.path)));
        }
        const noteRef = doc(db, 'ninjaNotes', eventCode, 'notes', noteId);
        await deleteDoc(noteRef);
      },

      uploadNinjaPhoto: async (teamNumber, eventCode, file) => {
        const path = `ninjaPhotos/${eventCode}/${teamNumber}_${Date.now()}.${file.name.split('.').pop()}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        return { url, path };
      },

      deleteNinjaPhoto: async (path) => {
        try {
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
        } catch {
          // photo may already be deleted
        }
      },

      unsubscribeAll: () => {
        get()._notesUnsubscribe?.();
        get()._assignmentsUnsubscribe?.();
        set({ _notesUnsubscribe: null, _assignmentsUnsubscribe: null });
      },
    }),
    {
      name: 'ninja-store',
      partialize: (state) => ({
        assignments: state.assignments,
      }),
    }
  )
);

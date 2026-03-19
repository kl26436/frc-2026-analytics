import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { NinjaAssignment, NinjaNote, NinjaAssignmentsDoc } from '../types/ninja';

interface OfflineNoteOp {
  type: 'add' | 'update' | 'delete';
  eventCode: string;
  note: NinjaNote;
}

interface NinjaState {
  assignments: Record<string, NinjaAssignment>; // keyed by team number string
  notes: NinjaNote[];
  notesQueue: OfflineNoteOp[];
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

  // Sync
  syncNotesQueue: () => Promise<void>;

  // Cleanup
  unsubscribeAll: () => void;
}

export const useNinjaStore = create<NinjaState>()(
  persist(
    (set, get) => ({
      assignments: {},
      notes: [],
      notesQueue: [],
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
            const serverNotes: NinjaNote[] = snapshot.docs.map(d => ({
              ...(d.data() as Omit<NinjaNote, 'id'>),
              id: d.id,
            }));

            // Preserve locally-queued notes (temp IDs) not yet in Firestore
            const { notesQueue } = get();
            const queuedAdds = notesQueue
              .filter(op => op.type === 'add')
              .map(op => op.note);
            const serverIds = new Set(serverNotes.map(n => n.id));
            const localOnly = queuedAdds.filter(n => !serverIds.has(n.id));

            const merged = [...serverNotes, ...localOnly];
            merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            set({ notes: merged });
          },
          (err) => {
            console.error('Ninja notes listener error:', err);
            set({ error: err.message });
          }
        );

        set({ _notesUnsubscribe: unsubscribe });
      },

      addNote: async (eventCode, noteData) => {
        const now = new Date().toISOString();

        // Generate a temp local ID; replaced with real Firestore ID on sync
        const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const note: NinjaNote = { ...noteData, id: tempId, createdAt: now, updatedAt: now };

        // Always show locally immediately
        set(state => ({
          notes: [note, ...state.notes],
        }));

        if (!navigator.onLine) {
          set(state => ({
            notesQueue: [...state.notesQueue, { type: 'add', eventCode, note }],
          }));
          return tempId;
        }

        try {
          const notesRef = collection(db, 'ninjaNotes', eventCode, 'notes');
          const { id: _tempId, ...docData } = note;
          const docRef = await addDoc(notesRef, docData);

          // Replace temp note with real Firestore ID in state
          set(state => ({
            notes: state.notes.map(n => n.id === tempId ? { ...note, id: docRef.id } : n),
          }));

          return docRef.id;
        } catch {
          // Went offline during the write — queue it
          set(state => ({
            notesQueue: [...state.notesQueue, { type: 'add', eventCode, note }],
          }));
          return tempId;
        }
      },

      updateNote: async (eventCode, noteId, updates) => {
        const now = new Date().toISOString();
        const existing = get().notes.find(n => n.id === noteId);
        if (!existing) return;

        const updatedNote: NinjaNote = { ...existing, ...updates, updatedAt: now };
        const isTemp = noteId.startsWith('offline_');

        // Update local state immediately
        set(state => ({
          notes: state.notes.map(n => n.id === noteId ? updatedNote : n),
        }));

        if (isTemp || !navigator.onLine) {
          // For temp notes: update the queued add op
          // For online→offline: add an update op
          set(state => ({
            notesQueue: isTemp
              ? state.notesQueue.map(op =>
                  op.type === 'add' && op.note.id === noteId ? { ...op, note: updatedNote } : op
                )
              : [...state.notesQueue, { type: 'update', eventCode, note: updatedNote }],
          }));
          return;
        }

        try {
          const noteRef = doc(db, 'ninjaNotes', eventCode, 'notes', noteId);
          await updateDoc(noteRef, { ...updates, updatedAt: now });
        } catch {
          if (!navigator.onLine) {
            set(state => ({
              notesQueue: [...state.notesQueue, { type: 'update', eventCode, note: updatedNote }],
            }));
          }
        }
      },

      deleteNote: async (eventCode, noteId) => {
        const note = get().notes.find(n => n.id === noteId);
        const isTemp = noteId.startsWith('offline_');

        // Remove from local state immediately
        set(state => ({
          notes: state.notes.filter(n => n.id !== noteId),
        }));

        if (isTemp) {
          // Never reached Firestore — just remove the queued add op
          set(state => ({
            notesQueue: state.notesQueue.filter(op => !(op.type === 'add' && op.note.id === noteId)),
          }));
          return;
        }

        if (!navigator.onLine) {
          if (note) {
            set(state => ({
              notesQueue: [...state.notesQueue, { type: 'delete', eventCode, note }],
            }));
          }
          return;
        }

        try {
          if (note?.photos?.length) {
            await Promise.all(note.photos.map(p => get().deleteNinjaPhoto(p.path)));
          }
          const noteRef = doc(db, 'ninjaNotes', eventCode, 'notes', noteId);
          await deleteDoc(noteRef);
        } catch {
          if (!navigator.onLine && note) {
            set(state => ({
              notesQueue: [...state.notesQueue, { type: 'delete', eventCode, note }],
            }));
          }
        }
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

      syncNotesQueue: async () => {
        const { notesQueue } = get();
        if (notesQueue.length === 0) return;

        const failed: OfflineNoteOp[] = [];
        for (const op of notesQueue) {
          try {
            const notesRef = collection(db, 'ninjaNotes', op.eventCode, 'notes');
            if (op.type === 'add') {
              const { id: tempId, ...docData } = op.note;
              const docRef = await addDoc(notesRef, docData);
              // Replace temp ID with real Firestore ID in local state
              set(state => ({
                notes: state.notes.map(n => n.id === tempId ? { ...op.note, id: docRef.id } : n),
              }));
            } else if (op.type === 'update') {
              const noteRef = doc(db, 'ninjaNotes', op.eventCode, 'notes', op.note.id);
              await updateDoc(noteRef, {
                text: op.note.text,
                tags: op.note.tags,
                matchNumber: op.note.matchNumber,
                photos: op.note.photos,
                updatedAt: op.note.updatedAt,
              });
            } else if (op.type === 'delete') {
              if (op.note.photos?.length) {
                await Promise.all(op.note.photos.map(p => get().deleteNinjaPhoto(p.path)));
              }
              const noteRef = doc(db, 'ninjaNotes', op.eventCode, 'notes', op.note.id);
              await deleteDoc(noteRef);
            }
          } catch {
            failed.push(op);
          }
        }
        set({ notesQueue: failed });
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
        notes: state.notes,
        notesQueue: state.notesQueue,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<NinjaState> | undefined;
        return {
          ...current,
          ...p,
          notesQueue: p?.notesQueue ?? [],
        };
      },
    }
  )
);

// Auto-sync when browser comes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useNinjaStore.getState().syncNotesQueue();
  });
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc, setDoc, updateDoc, onSnapshot,
  collection, query, where, getDocs, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AllianceSelectionSession,
  SelectionTeam,
  Alliance,
  ChatMessage,
  SessionRole,
  SessionStatus,
  SelectionTeamStatus
} from '../types/allianceSelection';
import type { PickListTeam } from '../types/pickList';

// Generate a 6-char session code (excludes I, O, 0, 1 to avoid confusion)
function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Build the selection team list from pick list teams + all event teams
// Shows ALL teams ranked: tier1 -> tier2 -> tier3 -> tier4 -> unranked
function buildSelectionTeams(pickListTeams: PickListTeam[], allEventTeamNumbers: number[]): SelectionTeam[] {
  const tier1 = pickListTeams
    .filter(t => t.tier === 'tier1')
    .sort((a, b) => a.rank - b.rank);
  const tier2 = pickListTeams
    .filter(t => t.tier === 'tier2')
    .sort((a, b) => a.rank - b.rank);
  const tier3 = pickListTeams
    .filter(t => t.tier === 'tier3')
    .sort((a, b) => a.rank - b.rank);
  const tier4 = pickListTeams
    .filter(t => t.tier === 'tier4')
    .sort((a, b) => a.rank - b.rank);

  // Get team numbers in pick list
  const pickListTeamNumbers = new Set(pickListTeams.map(t => t.teamNumber));

  // Find teams not in pick list at all (unranked)
  const unrankedTeamNumbers = allEventTeamNumbers
    .filter(num => !pickListTeamNumbers.has(num))
    .sort((a, b) => a - b);

  let globalRank = 1;
  const result: SelectionTeam[] = [];

  // Add ALL pick list teams in order: tier1, tier2, tier3, tier4
  for (const team of [...tier1, ...tier2, ...tier3, ...tier4]) {
    result.push({
      teamNumber: team.teamNumber,
      originalTier: team.tier as 'tier1' | 'tier2' | 'tier3' | 'tier4',
      originalRank: team.rank,
      globalRank: globalRank++,
      status: 'available',
      pickedByAlliance: null,
      notes: team.notes,
      tags: team.tags,
      flagged: team.flagged,
    });
  }

  // Add unranked teams (not in any pick list tier)
  let unrankedRank = 1;
  for (const teamNumber of unrankedTeamNumbers) {
    result.push({
      teamNumber,
      originalTier: 'unranked',
      originalRank: unrankedRank++,
      globalRank: globalRank++,
      status: 'available',
      pickedByAlliance: null,
      notes: '',
      tags: [],
      flagged: false,
    });
  }

  return result;
}

// Initialize 8 empty alliances
function buildEmptyAlliances(): Alliance[] {
  return Array.from({ length: 8 }, (_, i) => ({
    number: i + 1,
    captain: null,
    firstPick: null,
    secondPick: null,
    backupPick: null,
  }));
}

// Convert Firestore doc data to local session type
function docToSession(docId: string, data: Record<string, unknown>): AllianceSelectionSession {
  // Handle backwards compatibility: old sessions use 'admin' role, new use 'host'
  const participants = (data.participants ?? {}) as Record<string, { displayName: string; teamNumber?: number; role: string; joinedAt: string }>;
  const migratedParticipants: AllianceSelectionSession['participants'] = {};
  for (const [uid, p] of Object.entries(participants)) {
    migratedParticipants[uid] = {
      ...p,
      role: (p.role === 'admin' ? 'host' : p.role) as SessionRole,
    };
  }

  return {
    sessionId: docId,
    sessionCode: data.sessionCode as string,
    eventKey: data.eventKey as string,
    createdBy: data.createdBy as string,
    hostUid: (data.hostUid ?? data.createdBy) as string,
    createdAt: (data.createdAt as Timestamp)?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    participants: migratedParticipants,
    editorUids: (data.editorUids ?? []) as string[],
    teams: (data.teams ?? []) as SelectionTeam[],
    alliances: (data.alliances ?? []) as Alliance[],
    status: (data.status ?? 'active') as SessionStatus,
    messages: (data.messages ?? []) as ChatMessage[],
    lastUpdatedBy: (data.lastUpdatedBy ?? '') as string,
  };
}

interface CreateSessionParams {
  eventKey: string;
  teams: PickListTeam[];
  allEventTeamNumbers: number[];
  displayName: string;
  teamNumber?: number;
}

interface JoinSessionResult {
  sessionId: string;
}

export function useAllianceSession(userId: string | null) {
  const [session, setSession] = useState<AllianceSelectionSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Derive the current user's role
  const myRole: SessionRole | null = (() => {
    if (!session || !userId) return null;
    const participant = session.participants[userId];
    return participant?.role ?? null;
  })();

  const isHost = myRole === 'host';
  const isEditor = myRole === 'host' || myRole === 'editor';

  // Clean up listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Start listening to a session document
  const startListening = useCallback((sessionId: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const sessionRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSession(docToSession(snapshot.id, snapshot.data()));
        } else {
          setSession(null);
          setError('Session not found');
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    unsubscribeRef.current = unsubscribe;
  }, []);

  // Create a new session
  const createSession = useCallback(async (params: CreateSessionParams): Promise<{ sessionCode: string; sessionId: string }> => {
    if (!userId) throw new Error('Must be signed in to create a session');

    setLoading(true);
    setError(null);

    try {
      let sessionCode = generateSessionCode();
      let attempts = 0;
      while (attempts < 5) {
        const q = query(collection(db, 'sessions'), where('sessionCode', '==', sessionCode));
        const existing = await getDocs(q);
        if (existing.empty) break;
        sessionCode = generateSessionCode();
        attempts++;
      }

      const sessionRef = doc(collection(db, 'sessions'));
      const teams = buildSelectionTeams(params.teams, params.allEventTeamNumbers);
      const alliances = buildEmptyAlliances();

      const participant: Record<string, unknown> = {
        displayName: params.displayName,
        role: 'host',
        joinedAt: new Date().toISOString(),
      };
      if (params.teamNumber) {
        participant.teamNumber = params.teamNumber;
      }

      const sessionData = {
        sessionCode,
        eventKey: params.eventKey,
        createdBy: userId,
        hostUid: userId,
        createdAt: Timestamp.now(),
        status: 'active',
        editorUids: [],
        participants: {
          [userId]: participant,
        },
        teams,
        alliances,
        messages: [],
        lastUpdatedBy: userId,
      };

      await setDoc(sessionRef, sessionData);
      startListening(sessionRef.id);

      return { sessionCode, sessionId: sessionRef.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      setLoading(false);
      throw err;
    }
  }, [userId, startListening]);

  // Join an existing session by code
  const joinSession = useCallback(async (sessionCode: string, displayName: string, teamNumber?: number): Promise<JoinSessionResult | null> => {
    if (!userId) throw new Error('Must be signed in to join a session');

    setLoading(true);
    setError(null);

    try {
      const q = query(collection(db, 'sessions'), where('sessionCode', '==', sessionCode.toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Session not found. Check the code and try again.');
        setLoading(false);
        return null;
      }

      const sessionDoc = snapshot.docs[0];
      const sessionRef = doc(db, 'sessions', sessionDoc.id);

      const participant: Record<string, unknown> = {
        displayName,
        role: 'viewer',
        joinedAt: new Date().toISOString(),
      };
      if (teamNumber) {
        participant.teamNumber = teamNumber;
      }

      await updateDoc(sessionRef, {
        [`participants.${userId}`]: participant,
        lastUpdatedBy: userId,
      });

      startListening(sessionDoc.id);
      return { sessionId: sessionDoc.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join session';
      setError(message);
      setLoading(false);
      return null;
    }
  }, [userId, startListening]);

  // Leave the current session
  const leaveSession = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setSession(null);
    setError(null);
  }, []);

  // Helper: update the session doc
  const updateSession = useCallback(async (updates: Record<string, unknown>) => {
    if (!session || !userId) return;
    const sessionRef = doc(db, 'sessions', session.sessionId);
    await updateDoc(sessionRef, {
      ...updates,
      lastUpdatedBy: userId,
    });
  }, [session, userId]);

  // Mark a team as picked by an alliance
  const markTeamPicked = useCallback(async (teamNumber: number, allianceNumber: number) => {
    if (!session || !isEditor) return;

    const teams = session.teams.map(t =>
      t.teamNumber === teamNumber
        ? { ...t, status: 'picked' as SelectionTeamStatus, pickedByAlliance: allianceNumber }
        : t
    );

    const alliances = session.alliances.map(a => {
      if (a.number !== allianceNumber) return a;
      if (!a.captain) return { ...a, captain: teamNumber };
      if (!a.firstPick) return { ...a, firstPick: teamNumber };
      if (!a.secondPick) return { ...a, secondPick: teamNumber };
      if (!a.backupPick) return { ...a, backupPick: teamNumber };
      return a;
    });

    await updateSession({ teams, alliances });
  }, [session, isEditor, updateSession]);

  // Mark a team as declined (unavailable)
  const markTeamDeclined = useCallback(async (teamNumber: number) => {
    if (!session || !isEditor) return;

    const teams = session.teams.map(t =>
      t.teamNumber === teamNumber
        ? { ...t, status: 'declined' as SelectionTeamStatus }
        : t
    );

    await updateSession({ teams });
  }, [session, isEditor, updateSession]);

  // Undo a team's picked/declined status
  const undoTeamStatus = useCallback(async (teamNumber: number) => {
    if (!session || !isEditor) return;

    const teams = session.teams.map(t =>
      t.teamNumber === teamNumber
        ? { ...t, status: 'available' as SelectionTeamStatus, pickedByAlliance: null }
        : t
    );

    const alliances = session.alliances.map(a => {
      if (a.captain === teamNumber) return { ...a, captain: null };
      if (a.firstPick === teamNumber) return { ...a, firstPick: null };
      if (a.secondPick === teamNumber) return { ...a, secondPick: null };
      if (a.backupPick === teamNumber) return { ...a, backupPick: null };
      return a;
    });

    await updateSession({ teams, alliances });
  }, [session, isEditor, updateSession]);

  // Set session status (host only)
  const setSessionStatus = useCallback(async (status: SessionStatus) => {
    if (!session || !isHost) return;
    await updateSession({ status });
  }, [session, isHost, updateSession]);

  // Promote a viewer to editor (host only)
  const promoteToEditor = useCallback(async (uid: string) => {
    if (!session || !isHost) return;

    const participant = session.participants[uid];
    if (!participant || participant.role === 'host') return;

    await updateSession({
      [`participants.${uid}.role`]: 'editor',
      editorUids: [...session.editorUids, uid],
    });
  }, [session, isHost, updateSession]);

  // Demote an editor to viewer (host only)
  const demoteToViewer = useCallback(async (uid: string) => {
    if (!session || !isHost) return;

    const participant = session.participants[uid];
    if (!participant || participant.role === 'host') return;

    await updateSession({
      [`participants.${uid}.role`]: 'viewer',
      editorUids: session.editorUids.filter(id => id !== uid),
    });
  }, [session, isHost, updateSession]);

  // Transfer host to another participant (host only)
  const transferHost = useCallback(async (newHostUid: string) => {
    if (!session || !isHost || !userId) return;

    const newHostParticipant = session.participants[newHostUid];
    if (!newHostParticipant) return;

    // Build updated participants: old host becomes editor, new host becomes host
    const newParticipants = { ...session.participants };
    newParticipants[userId] = { ...newParticipants[userId], role: 'editor' };
    newParticipants[newHostUid] = { ...newParticipants[newHostUid], role: 'host' };

    await updateSession({
      hostUid: newHostUid,
      participants: newParticipants,
    });
  }, [session, isHost, userId, updateSession]);

  // Remove a participant (host only)
  const removeParticipant = useCallback(async (uid: string) => {
    if (!session || !isHost || uid === userId) return;

    const newParticipants = { ...session.participants };
    delete newParticipants[uid];

    await updateSession({
      participants: newParticipants,
      editorUids: session.editorUids.filter(id => id !== uid),
    });
  }, [session, isHost, userId, updateSession]);

  // Send a chat message (any participant)
  const sendMessage = useCallback(async (text: string) => {
    if (!session || !userId) return;

    const participant = session.participants[userId];
    if (!participant) return;

    const message: ChatMessage = {
      id: `${userId}-${Date.now()}`,
      uid: userId,
      displayName: participant.displayName,
      teamNumber: participant.teamNumber,
      text,
      timestamp: new Date().toISOString(),
    };

    const messages = [...session.messages, message].slice(-100);
    await updateSession({ messages });
  }, [session, userId, updateSession]);

  return {
    session,
    loading,
    error,
    myRole,
    isHost,
    isEditor,
    createSession,
    joinSession,
    leaveSession,
    markTeamPicked,
    markTeamDeclined,
    undoTeamStatus,
    setSessionStatus,
    promoteToEditor,
    demoteToViewer,
    transferHost,
    removeParticipant,
    sendMessage,
    startListening,
  };
}

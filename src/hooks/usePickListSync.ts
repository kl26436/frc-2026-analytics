import { useState, useEffect, useCallback, useRef } from 'react';
import {
  doc, setDoc, updateDoc, onSnapshot, addDoc, deleteDoc,
  collection, query, where, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { PickList, PickListTeam, PickListConfig, FilterConfig, LiveComment, LiveSuggestion, LiveLockStatus } from '../types/pickList';
import type { TBAEventRankings } from '../types/tba';

const LOCK_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function tsToIso(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

function docToLiveList(data: Record<string, unknown>): { list: PickList; lockStatus: LiveLockStatus | null; snapshotTakenAt: string | null; snapshotTakenBy: string | null; pendingControlFor: string | null; liveFilterConfigs: FilterConfig[] | null } {
  const raw = data.lockedBy as Record<string, unknown> | null | undefined;
  const lockStatus: LiveLockStatus | null = raw
    ? { uid: String(raw.uid), email: String(raw.email), displayName: String(raw.displayName), lockedAt: tsToIso(raw.lockedAt) }
    : null;

  return {
    list: {
      config: data.config as PickList['config'],
      teams: (data.teams ?? []) as PickListTeam[],
    },
    lockStatus,
    snapshotTakenAt: data.snapshotTakenAt ? tsToIso(data.snapshotTakenAt) : null,
    snapshotTakenBy: data.snapshotTakenBy ? String(data.snapshotTakenBy) : null,
    pendingControlFor: data.pendingControlFor ? String(data.pendingControlFor) : null,
    liveFilterConfigs: data.filterConfigs ? (data.filterConfigs as FilterConfig[]) : null,
  };
}

export function usePickListSync(
  eventKey: string | null,
  uid: string | null,
  userEmail: string | null,
  displayName: string | null,
  isAdmin: boolean,
) {
  const [liveList, setLiveList] = useState<PickList | null>(null);
  const [lockStatus, setLockStatus] = useState<LiveLockStatus | null>(null);
  const [snapshotTakenAt, setSnapshotTakenAt] = useState<string | null>(null);
  const [snapshotTakenBy, setSnapshotTakenBy] = useState<string | null>(null);
  const [pendingControlFor, setPendingControlFor] = useState<string | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);
  const [liveFilterConfigs, setLiveFilterConfigs] = useState<FilterConfig[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exists, setExists] = useState(false); // whether Firestore doc exists

  const unsubListRef = useRef<(() => void) | null>(null);
  const unsubCommentsRef = useRef<(() => void) | null>(null);
  const unsubSuggestionsRef = useRef<(() => void) | null>(null);

  // ── Subscribe when eventKey changes ──────────────────────────────────────
  useEffect(() => {
    // Clean up previous subscriptions
    unsubListRef.current?.();
    unsubCommentsRef.current?.();
    unsubSuggestionsRef.current?.();
    setLiveList(null);
    setLockStatus(null);
    setPendingControlFor(null);
    setLiveFilterConfigs(null);
    setComments([]);
    setSuggestions([]);
    setExists(false);

    if (!eventKey || !uid) return;

    setSyncing(true);

    // Main doc
    const listRef = doc(db, 'pick-lists', eventKey);
    unsubListRef.current = onSnapshot(listRef, (snap) => {
      if (snap.exists()) {
        const { list, lockStatus: ls, snapshotTakenAt: sta, snapshotTakenBy: stb, pendingControlFor: pcf, liveFilterConfigs: lfc } = docToLiveList(snap.data() as Record<string, unknown>);
        setLiveList(list);
        setLockStatus(ls);
        setSnapshotTakenAt(sta);
        setSnapshotTakenBy(stb);
        setPendingControlFor(pcf);
        setLiveFilterConfigs(lfc);
        setExists(true);
      } else {
        setLiveList(null);
        setLockStatus(null);
        setPendingControlFor(null);
        setLiveFilterConfigs(null);
        setExists(false);
      }
      setSyncing(false);
    }, () => setSyncing(false));

    // Comments subcollection
    const commentsRef = collection(db, 'pick-lists', eventKey, 'comments');
    unsubCommentsRef.current = onSnapshot(commentsRef, (snap) => {
      const items: LiveComment[] = snap.docs.map(d => ({
        id: d.id,
        teamNumber: d.data().teamNumber as number,
        uid: d.data().uid as string,
        email: d.data().email as string,
        displayName: d.data().displayName as string,
        text: d.data().text as string,
        ts: tsToIso(d.data().ts),
      }));
      setComments(items);
    });

    // Suggestions subcollection — only pending
    const suggestionsRef = query(
      collection(db, 'pick-lists', eventKey, 'suggestions'),
      where('status', '==', 'pending'),
    );
    unsubSuggestionsRef.current = onSnapshot(suggestionsRef, (snap) => {
      const items: LiveSuggestion[] = snap.docs.map(d => ({
        id: d.id,
        teamNumber: d.data().teamNumber as number,
        uid: d.data().uid as string,
        displayName: d.data().displayName as string,
        suggestedTier: d.data().suggestedTier as LiveSuggestion['suggestedTier'],
        reason: d.data().reason as string,
        votes: (d.data().votes ?? []) as string[],
        ts: tsToIso(d.data().ts),
        status: d.data().status as LiveSuggestion['status'],
      }));
      setSuggestions(items);
    });

    return () => {
      unsubListRef.current?.();
      unsubCommentsRef.current?.();
      unsubSuggestionsRef.current?.();
    };
  }, [eventKey, uid]);

  // ── Lock helpers ──────────────────────────────────────────────────────────
  const isLockHolder = !!uid && lockStatus?.uid === uid;
  const isLockStale = !!lockStatus && (Date.now() - new Date(lockStatus.lockedAt).getTime()) > LOCK_EXPIRY_MS;
  const canEdit = isAdmin && (isLockHolder || isLockStale || lockStatus === null);

  // ── Admin actions ─────────────────────────────────────────────────────────

  const takeControl = useCallback(async () => {
    if (!eventKey || !uid || !isAdmin) return;
    const listRef = doc(db, 'pick-lists', eventKey);
    await updateDoc(listRef, {
      lockedBy: { uid, email: userEmail ?? '', displayName: displayName ?? userEmail ?? '', lockedAt: serverTimestamp() },
    });
  }, [eventKey, uid, isAdmin, userEmail, displayName]);

  const releaseControl = useCallback(async () => {
    if (!eventKey || !isLockHolder) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), { lockedBy: null });
  }, [eventKey, isLockHolder]);

  const pushTeams = useCallback(async (teams: PickListTeam[]) => {
    if (!eventKey || !canEdit) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), {
      teams,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail ?? '',
    });
  }, [eventKey, canEdit, userEmail]);

  const initializeLiveList = useCallback(async (
    localPickList: PickList,
    rankings: TBAEventRankings | null,
    fetchedTeams: { teamNumber: number }[],
  ) => {
    if (!eventKey || !uid || !isAdmin) return;

    // Build initial teams from rankings snapshot
    const rankingMap = new Map<number, number>();
    rankings?.rankings.forEach(r => {
      const num = parseInt(r.team_key.replace('frc', ''));
      rankingMap.set(num, r.rank);
    });

    // Preserve tier1 from personal list, rebuild tier2/3 from snapshot rankings
    const tier1Teams = localPickList.teams.filter(t => t.tier === 'tier1');
    const tier1Numbers = new Set(tier1Teams.map(t => t.teamNumber));

    const rankedNums = rankings?.rankings
      .map(r => parseInt(r.team_key.replace('frc', '')))
      .filter(n => !tier1Numbers.has(n)) ?? [];

    const allEventNums = fetchedTeams.map(t => t.teamNumber).filter(n => !tier1Numbers.has(n));
    const unrankedNums = allEventNums.filter(n => !rankedNums.includes(n));

    const tier2Teams: PickListTeam[] = rankedNums.slice(0, 12).map((num, i) => {
      const existing = localPickList.teams.find(t => t.teamNumber === num);
      const r = rankings?.rankings.find(r => parseInt(r.team_key.replace('frc', '')) === num);
      return {
        teamNumber: num,
        tier: 'tier2',
        rank: i + 1,
        notes: existing?.notes ?? (r ? `Event Rank ${r.rank} · ${r.record.wins}W/${r.record.losses}L` : ''),
        isPicked: false,
        tags: existing?.tags ?? [],
        flagged: existing?.flagged ?? false,
        onWatchlist: false,
      };
    });

    const tier3Teams: PickListTeam[] = rankedNums.slice(12).map((num, i) => {
      const existing = localPickList.teams.find(t => t.teamNumber === num);
      const r = rankings?.rankings.find(r => parseInt(r.team_key.replace('frc', '')) === num);
      return {
        teamNumber: num,
        tier: 'tier3',
        rank: i + 1,
        notes: existing?.notes ?? (r ? `Event Rank ${r.rank} · ${r.record.wins}W/${r.record.losses}L` : ''),
        isPicked: false,
        tags: existing?.tags ?? [],
        flagged: existing?.flagged ?? false,
        onWatchlist: false,
      };
    });

    const tier4Teams: PickListTeam[] = unrankedNums.map((num, i) => ({
      teamNumber: num,
      tier: 'tier4',
      rank: i + 1,
      notes: '',
      isPicked: false,
      tags: [],
      flagged: false,
      onWatchlist: false,
    }));

    const teams = [...tier1Teams, ...tier2Teams, ...tier3Teams, ...tier4Teams];

    await setDoc(doc(db, 'pick-lists', eventKey), {
      eventKey,
      config: localPickList.config,
      teams,
      rankingsSnapshot: rankings ?? null,
      snapshotTakenAt: serverTimestamp(),
      snapshotTakenBy: userEmail ?? '',
      lockedBy: { uid, email: userEmail ?? '', displayName: displayName ?? userEmail ?? '', lockedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
      updatedBy: userEmail ?? '',
    });
  }, [eventKey, uid, isAdmin, userEmail, displayName]);

  const pushConfig = useCallback(async (config: PickListConfig) => {
    if (!eventKey || !isAdmin) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), {
      config,
      updatedAt: serverTimestamp(),
      updatedBy: userEmail ?? '',
    });
  }, [eventKey, isAdmin, userEmail]);

  const deleteLiveList = useCallback(async () => {
    if (!eventKey || !isAdmin) return;
    await deleteDoc(doc(db, 'pick-lists', eventKey));
  }, [eventKey, isAdmin]);

  const passControl = useCallback(async (targetEmail: string, _targetDisplayName: string) => {
    if (!eventKey || !isAdmin) return;
    // Release lock and write pendingControlFor so the target user can claim it
    await updateDoc(doc(db, 'pick-lists', eventKey), {
      lockedBy: null,
      pendingControlFor: targetEmail.toLowerCase().trim(),
    });
  }, [eventKey, isAdmin]);

  const claimPendingControl = useCallback(async () => {
    if (!eventKey || !uid) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), {
      lockedBy: { uid, email: userEmail ?? '', displayName: displayName ?? userEmail ?? '', lockedAt: serverTimestamp() },
      pendingControlFor: null,
    });
  }, [eventKey, uid, userEmail, displayName]);

  const acceptSuggestion = useCallback(async (suggestionId: string, teams: PickListTeam[]) => {
    if (!eventKey || !canEdit) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), { teams, updatedAt: serverTimestamp(), updatedBy: userEmail ?? '' });
    await updateDoc(doc(db, 'pick-lists', eventKey, 'suggestions', suggestionId), { status: 'accepted' });
  }, [eventKey, canEdit, userEmail]);

  const dismissSuggestion = useCallback(async (suggestionId: string) => {
    if (!eventKey) return;
    await updateDoc(doc(db, 'pick-lists', eventKey, 'suggestions', suggestionId), { status: 'dismissed' });
  }, [eventKey]);

  // ── All-user actions ──────────────────────────────────────────────────────

  const addComment = useCallback(async (teamNumber: number, text: string) => {
    if (!eventKey || !uid || !text.trim()) return;
    await addDoc(collection(db, 'pick-lists', eventKey, 'comments'), {
      teamNumber,
      uid,
      email: userEmail ?? '',
      displayName: displayName ?? userEmail ?? '',
      text: text.trim(),
      ts: serverTimestamp(),
    });
  }, [eventKey, uid, userEmail, displayName]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!eventKey) return;
    await deleteDoc(doc(db, 'pick-lists', eventKey, 'comments', commentId));
  }, [eventKey]);

  const addSuggestion = useCallback(async (teamNumber: number, suggestedTier: LiveSuggestion['suggestedTier'], reason: string) => {
    if (!eventKey || !uid) return;
    await addDoc(collection(db, 'pick-lists', eventKey, 'suggestions'), {
      teamNumber,
      uid,
      displayName: displayName ?? userEmail ?? '',
      suggestedTier,
      reason: reason.trim(),
      votes: [],
      ts: serverTimestamp(),
      status: 'pending',
    });
  }, [eventKey, uid, displayName, userEmail]);

  const pushLiveFilterConfigs = useCallback(async (configs: FilterConfig[]) => {
    if (!eventKey) return;
    await updateDoc(doc(db, 'pick-lists', eventKey), { filterConfigs: configs });
  }, [eventKey]);

  const voteSuggestion = useCallback(async (suggestionId: string) => {
    if (!eventKey || !uid) return;
    await updateDoc(doc(db, 'pick-lists', eventKey, 'suggestions', suggestionId), {
      votes: arrayUnion(uid),
    });
  }, [eventKey, uid]);

  return {
    liveList,
    lockStatus,
    snapshotTakenAt,
    snapshotTakenBy,
    pendingControlFor,
    liveFilterConfigs,
    comments,
    suggestions,
    syncing,
    exists,
    // Lock helpers
    isLockHolder,
    isLockStale,
    canEdit,
    // Admin actions
    takeControl,
    releaseControl,
    pushTeams,
    pushConfig,
    initializeLiveList,
    acceptSuggestion,
    dismissSuggestion,
    deleteLiveList,
    passControl,
    claimPendingControl,
    // Filter sync
    pushLiveFilterConfigs,
    // All-user actions
    addComment,
    deleteComment,
    addSuggestion,
    voteSuggestion,
  };
}

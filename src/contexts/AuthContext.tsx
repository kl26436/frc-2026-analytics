import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import type { User } from 'firebase/auth';

interface AccessConfig {
  allowedEmails: string[];
  adminEmails: string[];
}

export interface EventConfig {
  eventCode: string;
  homeTeamNumber: number;
  updatedBy?: string;
  updatedAt?: string;
  autoSyncEnabled?: boolean;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  displayName: string;
  photoURL: string | null;
}

export interface LiveSession {
  sessionCode: string;
  sessionId: string;
  createdBy: string;
  createdByName: string;
  startedAt: string;
}

export interface AccessRequest {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  photoURL: string | null;
  requestedAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAllowed: boolean;
  isAdmin: boolean;
  accessConfig: AccessConfig | null;
  accessRequests: AccessRequest[];
  hasRequestedAccess: boolean;
  liveSession: LiveSession | null;
  eventConfig: EventConfig | null;
  userProfiles: Record<string, UserProfile>;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  requestAccess: (firstName: string, lastName: string) => Promise<void>;
  approveRequest: (email: string) => Promise<void>;
  denyRequest: (email: string) => Promise<void>;
  addAllowedEmail: (email: string) => Promise<void>;
  removeAllowedEmail: (email: string) => Promise<void>;
  addAdminEmail: (email: string) => Promise<void>;
  removeAdminEmail: (email: string) => Promise<void>;
  setLiveSession: (session: LiveSession) => Promise<void>;
  clearLiveSession: () => Promise<void>;
  setEventConfig: (config: EventConfig) => Promise<void>;
  setUserProfile: (email: string, profile: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, error: authError, signInWithGoogle, signOut } = useFirebaseAuth();
  const [accessConfig, setAccessConfig] = useState<AccessConfig | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [liveSession, setLiveSessionState] = useState<LiveSession | null>(null);
  const [eventConfig, setEventConfigState] = useState<EventConfig | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});

  const uid = user?.uid;

  // Listen to access config
  useEffect(() => {
    if (!uid) { setAccessConfig(null); return; }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'access'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setAccessConfig({
            allowedEmails: (data.allowedEmails ?? []) as string[],
            adminEmails: (data.adminEmails ?? []) as string[],
          });
        } else {
          setAccessConfig({ allowedEmails: [], adminEmails: [] });
        }
      },
      () => setAccessConfig({ allowedEmails: [], adminEmails: [] })
    );
    return unsubscribe;
  }, [uid]);

  // Listen to access requests
  useEffect(() => {
    if (!uid) { setAccessRequests([]); return; }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'accessRequests'),
      (snapshot) => {
        setAccessRequests(snapshot.exists() ? (snapshot.data().requests ?? []) as AccessRequest[] : []);
      },
      () => setAccessRequests([])
    );
    return unsubscribe;
  }, [uid]);

  // Listen to live session broadcast
  useEffect(() => {
    if (!uid) { setLiveSessionState(null); return; }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'liveSession'),
      (snapshot) => {
        setLiveSessionState(snapshot.exists() ? snapshot.data() as LiveSession : null);
      },
      () => setLiveSessionState(null)
    );
    return unsubscribe;
  }, [uid]);

  // Listen to event config (active event + home team, set by admins)
  useEffect(() => {
    if (!uid) { setEventConfigState(null); return; }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'eventConfig'),
      (snapshot) => {
        setEventConfigState(snapshot.exists() ? snapshot.data() as EventConfig : null);
      },
      () => setEventConfigState(null)
    );
    return unsubscribe;
  }, [uid]);

  // Listen to user profiles (names + avatars for approved users)
  useEffect(() => {
    if (!uid) { setUserProfiles({}); return; }
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'userProfiles'),
      (snapshot) => {
        setUserProfiles(snapshot.exists() ? (snapshot.data().profiles ?? {}) as Record<string, UserProfile> : {});
      },
      () => setUserProfiles({})
    );
    return unsubscribe;
  }, [uid]);

  const userEmail = user?.email?.toLowerCase() ?? null;
  const isAuthenticated = !!user && !user.isAnonymous;
  const isAllowed = isAuthenticated && !!userEmail && !!accessConfig && (
    accessConfig.allowedEmails.map(e => e.toLowerCase()).includes(userEmail) ||
    accessConfig.adminEmails.map(e => e.toLowerCase()).includes(userEmail)
  );
  const isAdmin = isAuthenticated && !!userEmail && !!accessConfig &&
    accessConfig.adminEmails.map(e => e.toLowerCase()).includes(userEmail);

  const hasRequestedAccess = isAuthenticated && !!userEmail &&
    accessRequests.some(r => r.email.toLowerCase() === userEmail);

  const loading = authLoading || (!!user && accessConfig === null);

  // Bootstrap: first user to sign in becomes admin
  useEffect(() => {
    if (!user || !userEmail || !accessConfig || loading) return;
    if (accessConfig.allowedEmails.length === 0 && accessConfig.adminEmails.length === 0 && !user.isAnonymous) {
      const configRef = doc(db, 'config', 'access');
      getDoc(configRef).then((snap) => {
        if (!snap.exists()) {
          setDoc(configRef, {
            allowedEmails: [userEmail],
            adminEmails: [userEmail],
          });
        }
      });
    }
  }, [user, userEmail, accessConfig, loading]);

  // Upsert user profile on sign-in (for approved users)
  useEffect(() => {
    if (!user || !userEmail || !isAllowed) return;
    const displayName = user.displayName ?? '';
    const spaceIdx = displayName.indexOf(' ');
    const firstName = spaceIdx > 0 ? displayName.slice(0, spaceIdx) : displayName;
    const lastName = spaceIdx > 0 ? displayName.slice(spaceIdx + 1) : '';
    const profile: UserProfile = {
      firstName,
      lastName,
      displayName,
      photoURL: user.photoURL,
    };
    const profilesRef = doc(db, 'config', 'userProfiles');
    // Merge so we don't overwrite other users' profiles
    setDoc(profilesRef, { profiles: { [userEmail]: profile } }, { merge: true }).catch(() => {});
  }, [user, userEmail, isAllowed]);

  const configRef = doc(db, 'config', 'access');

  const requestAccess = async (firstName: string, lastName: string) => {
    if (!user || !userEmail) return;
    if (accessRequests.some(r => r.email.toLowerCase() === userEmail)) return;
    const newRequest: AccessRequest = {
      email: userEmail,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      photoURL: user.photoURL,
      requestedAt: new Date().toISOString(),
    };
    const requestsRef = doc(db, 'config', 'accessRequests');
    await setDoc(requestsRef, { requests: [...accessRequests, newRequest] });
  };

  const approveRequest = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    await addAllowedEmail(normalized);
    // Copy profile from request to userProfiles
    const request = accessRequests.find(r => r.email.toLowerCase() === normalized);
    if (request) {
      const profile: UserProfile = {
        firstName: request.firstName,
        lastName: request.lastName,
        displayName: request.displayName,
        photoURL: request.photoURL,
      };
      await setDoc(doc(db, 'config', 'userProfiles'), { profiles: { [normalized]: profile } }, { merge: true });
    }
    const requestsRef = doc(db, 'config', 'accessRequests');
    await setDoc(requestsRef, {
      requests: accessRequests.filter(r => r.email.toLowerCase() !== normalized),
    });
  };

  const denyRequest = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    const requestsRef = doc(db, 'config', 'accessRequests');
    await setDoc(requestsRef, {
      requests: accessRequests.filter(r => r.email.toLowerCase() !== normalized),
    });
  };

  const addAllowedEmail = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    await updateDoc(configRef, { allowedEmails: arrayUnion(normalized) });
  };

  const removeAllowedEmail = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    await updateDoc(configRef, { allowedEmails: arrayRemove(normalized) });
  };

  const addAdminEmail = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    await updateDoc(configRef, {
      allowedEmails: arrayUnion(normalized),
      adminEmails: arrayUnion(normalized),
    });
  };

  const removeAdminEmail = async (email: string) => {
    if (!accessConfig || accessConfig.adminEmails.length <= 1) return;
    const normalized = email.toLowerCase().trim();
    await updateDoc(configRef, { adminEmails: arrayRemove(normalized) });
  };

  const setLiveSession = async (session: LiveSession) => {
    await setDoc(doc(db, 'config', 'liveSession'), session);
  };

  const clearLiveSession = async () => {
    await deleteDoc(doc(db, 'config', 'liveSession'));
  };

  const setEventConfig = async (config: EventConfig) => {
    await setDoc(doc(db, 'config', 'eventConfig'), {
      ...config,
      updatedBy: userEmail ?? 'unknown',
      updatedAt: new Date().toISOString(),
    });
  };

  const setUserProfile = async (email: string, profile: Partial<UserProfile>) => {
    const normalized = email.toLowerCase().trim();
    const existing = userProfiles[normalized] ?? { firstName: '', lastName: '', displayName: '', photoURL: null };
    const merged: UserProfile = {
      ...existing,
      ...profile,
      displayName: profile.displayName ?? `${profile.firstName ?? existing.firstName} ${profile.lastName ?? existing.lastName}`.trim(),
    };
    await setDoc(doc(db, 'config', 'userProfiles'), { profiles: { [normalized]: merged } }, { merge: true });
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error: authError,
      isAuthenticated,
      isAllowed,
      isAdmin,
      accessConfig,
      accessRequests,
      hasRequestedAccess,
      liveSession,
      eventConfig,
      userProfiles,
      signInWithGoogle,
      signOut,
      requestAccess,
      approveRequest,
      denyRequest,
      addAllowedEmail,
      removeAllowedEmail,
      addAdminEmail,
      removeAdminEmail,
      setLiveSession,
      clearLiveSession,
      setEventConfig,
      setUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

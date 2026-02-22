import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import type { User } from 'firebase/auth';

interface AccessConfig {
  allowedEmails: string[];
  adminEmails: string[];
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, error: authError, signInWithGoogle, signOut } = useFirebaseAuth();
  const [accessConfig, setAccessConfig] = useState<AccessConfig | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [liveSession, setLiveSessionState] = useState<LiveSession | null>(null);

  // Listen to the access config document — restart when auth changes
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) {
      setAccessConfig(null);
      return;
    }

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
      () => {
        setAccessConfig({ allowedEmails: [], adminEmails: [] });
      }
    );
    return unsubscribe;
  }, [uid]);

  // Listen to access requests — restart when auth changes
  useEffect(() => {
    if (!uid) {
      setAccessRequests([]);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'config', 'accessRequests'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setAccessRequests((data.requests ?? []) as AccessRequest[]);
        } else {
          setAccessRequests([]);
        }
      },
      () => {
        setAccessRequests([]);
      }
    );
    return unsubscribe;
  }, [uid]);

  // Listen to live session broadcast — restart when auth changes
  useEffect(() => {
    if (!uid) {
      setLiveSessionState(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'config', 'liveSession'),
      (snapshot) => {
        if (snapshot.exists()) {
          setLiveSessionState(snapshot.data() as LiveSession);
        } else {
          setLiveSessionState(null);
        }
      },
      () => {
        setLiveSessionState(null);
      }
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

  // Stay in loading state while user is authenticated but config hasn't loaded yet
  // (covers the gap between sign-in and config listener starting)
  const loading = authLoading || (!!user && accessConfig === null);

  // Bootstrap: if no config exists and user signs in, create it with them as admin
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

  const configRef = doc(db, 'config', 'access');

  const requestAccess = async (firstName: string, lastName: string) => {
    if (!user || !userEmail) return;
    // Don't re-request
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
    await setDoc(requestsRef, {
      requests: [...accessRequests, newRequest],
    });
  };

  const approveRequest = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    // Add to allowed list (atomic)
    await addAllowedEmail(normalized);
    // Remove from requests
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
    await updateDoc(configRef, {
      allowedEmails: arrayUnion(normalized),
    });
  };

  const removeAllowedEmail = async (email: string) => {
    const normalized = email.toLowerCase().trim();
    await updateDoc(configRef, {
      allowedEmails: arrayRemove(normalized),
    });
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
    await updateDoc(configRef, {
      adminEmails: arrayRemove(normalized),
    });
  };

  const setLiveSession = async (session: LiveSession) => {
    await setDoc(doc(db, 'config', 'liveSession'), session);
  };

  const clearLiveSession = async () => {
    await deleteDoc(doc(db, 'config', 'liveSession'));
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

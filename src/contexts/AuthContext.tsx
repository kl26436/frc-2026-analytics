import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import type { User } from 'firebase/auth';

interface AccessConfig {
  allowedEmails: string[];
  adminEmails: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAllowed: boolean;
  isAdmin: boolean;
  accessConfig: AccessConfig | null;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  // Admin functions
  addAllowedEmail: (email: string) => Promise<void>;
  removeAllowedEmail: (email: string) => Promise<void>;
  addAdminEmail: (email: string) => Promise<void>;
  removeAdminEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, error: authError, signInWithGoogle, signOut } = useFirebaseAuth();
  const [accessConfig, setAccessConfig] = useState<AccessConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Listen to the access config document
  useEffect(() => {
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
          // No config yet — will be bootstrapped when first admin signs in
          setAccessConfig({ allowedEmails: [], adminEmails: [] });
        }
        setConfigLoading(false);
      },
      () => {
        // If we can't read the config (permissions), set empty
        setAccessConfig({ allowedEmails: [], adminEmails: [] });
        setConfigLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const userEmail = user?.email?.toLowerCase() ?? null;
  const isAuthenticated = !!user && !user.isAnonymous;
  const isAllowed = isAuthenticated && !!userEmail && !!accessConfig && (
    accessConfig.allowedEmails.map(e => e.toLowerCase()).includes(userEmail) ||
    accessConfig.adminEmails.map(e => e.toLowerCase()).includes(userEmail)
  );
  const isAdmin = isAuthenticated && !!userEmail && !!accessConfig &&
    accessConfig.adminEmails.map(e => e.toLowerCase()).includes(userEmail);

  const loading = authLoading || configLoading;

  // Bootstrap: if no config exists and user signs in, create it with them as admin
  useEffect(() => {
    if (!user || !userEmail || !accessConfig || loading) return;
    if (accessConfig.allowedEmails.length === 0 && accessConfig.adminEmails.length === 0 && !user.isAnonymous) {
      // First authenticated user becomes admin
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

  const updateConfig = async (updates: Partial<AccessConfig>) => {
    const configRef = doc(db, 'config', 'access');
    const current = accessConfig ?? { allowedEmails: [], adminEmails: [] };
    await setDoc(configRef, { ...current, ...updates });
  };

  const addAllowedEmail = async (email: string) => {
    if (!accessConfig) return;
    const normalized = email.toLowerCase().trim();
    if (accessConfig.allowedEmails.map(e => e.toLowerCase()).includes(normalized)) return;
    await updateConfig({ allowedEmails: [...accessConfig.allowedEmails, normalized] });
  };

  const removeAllowedEmail = async (email: string) => {
    if (!accessConfig) return;
    const normalized = email.toLowerCase().trim();
    await updateConfig({
      allowedEmails: accessConfig.allowedEmails.filter(e => e.toLowerCase() !== normalized),
    });
  };

  const addAdminEmail = async (email: string) => {
    if (!accessConfig) return;
    const normalized = email.toLowerCase().trim();
    // Also add to allowed if not already there
    const newAllowed = accessConfig.allowedEmails.map(e => e.toLowerCase()).includes(normalized)
      ? accessConfig.allowedEmails
      : [...accessConfig.allowedEmails, normalized];
    const newAdmins = accessConfig.adminEmails.map(e => e.toLowerCase()).includes(normalized)
      ? accessConfig.adminEmails
      : [...accessConfig.adminEmails, normalized];
    await updateConfig({ allowedEmails: newAllowed, adminEmails: newAdmins });
  };

  const removeAdminEmail = async (email: string) => {
    if (!accessConfig) return;
    const normalized = email.toLowerCase().trim();
    // Don't allow removing the last admin
    if (accessConfig.adminEmails.length <= 1) return;
    await updateConfig({
      adminEmails: accessConfig.adminEmails.filter(e => e.toLowerCase() !== normalized),
    });
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
      signInWithGoogle,
      signOut,
      addAllowedEmail,
      removeAllowedEmail,
      addAdminEmail,
      removeAdminEmail,
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

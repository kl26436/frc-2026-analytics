import { useState, useEffect, useCallback } from 'react';
import {
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const googleProvider = new GoogleAuthProvider();

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    // Check for redirect result on page load
    getRedirectResult(auth).catch(() => {
      // Redirect result errors are handled by onAuthStateChanged
    });

    return unsubscribe;
  }, []);

  // Anonymous sign-in (for alliance selection guest access)
  const signIn = useCallback(async (): Promise<User | null> => {
    try {
      setError(null);
      const result = await signInAnonymously(auth);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
      return null;
    }
  }, []);

  // Google sign-in — tries popup first, falls back to redirect if popup is blocked
  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    try {
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      // If popup was blocked or closed, fall back to redirect
      if (firebaseErr.code === 'auth/popup-blocked' || firebaseErr.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return null;
        } catch {
          // Redirect failed too — show error
        }
      }
      const message = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(message);
      return null;
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign out';
      setError(message);
    }
  }, []);

  return { user, loading, error, signIn, signInWithGoogle, signOut };
}

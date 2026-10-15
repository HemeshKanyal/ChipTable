"use client";

import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { configErrorMessage } from "@/lib/firebase/config";
import { upsertUserProfile } from "@/lib/firebase/users";

export type AuthStatus =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; user: User }
  | { kind: "configError"; message: string };

interface AuthContextValue {
  status: AuthStatus;
  signingIn: boolean;
  /** Latest sign-in or profile-sync error, shown to the user until dismissed. */
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Errors that mean "the user changed their mind", not something to report.
const SILENT_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);
// The popup can't open here (blocked, or an in-app browser); fall back to a full-page redirect.
const REDIRECT_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

function describeError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/network-request-failed":
        return "Couldn't reach the sign-in server. Check your connection (or that the emulators are running).";
      case "auth/unauthorized-domain":
        return "This domain isn't authorised for sign-in. Add it in Firebase Console → Authentication → Settings.";
      case "permission-denied":
        return "Signed in, but your profile couldn't be saved (permission denied).";
      case "unavailable":
        return "Signed in, but the database is unreachable right now.";
      default:
        return `Something went wrong (${err.code}).`;
    }
  }
  return "Something went wrong. Please try again.";
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: "loading" });
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configErrorMessage) return;
    const { auth, db } = getFirebase();

    getRedirectResult(auth).catch((err) => setError(describeError(err)));

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setStatus({ kind: "signedOut" });
        return;
      }
      setStatus({ kind: "signedIn", user });
      upsertUserProfile(db, user).catch((err) => {
        console.error("Failed to sync user profile", err);
        setError(describeError(err));
      });
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { auth } = getFirebase();
    setError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider());
    } catch (err) {
      if (err instanceof FirebaseError && REDIRECT_CODES.has(err.code)) {
        await signInWithRedirect(auth, googleProvider());
        return;
      }
      if (!(err instanceof FirebaseError && SILENT_CODES.has(err.code))) {
        setError(describeError(err));
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebase().auth);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      status: configErrorMessage
        ? ({ kind: "configError", message: configErrorMessage } as const)
        : status,
      signingIn,
      error,
      clearError,
      signInWithGoogle,
      signOut,
    }),
    [status, signingIn, error, clearError, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For screens that only render once signed in (inside <AuthGate>). */
export function useSignedInUser(): User {
  const { status } = useAuth();
  if (status.kind !== "signedIn") throw new Error("useSignedInUser called while signed out");
  return status.user;
}

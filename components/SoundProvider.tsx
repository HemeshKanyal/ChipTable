"use client";

import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getFirebase } from "@/lib/firebase/client";
import { playSound, unlockAudioOnFirstGesture, type SoundName } from "@/lib/sound";
import type { UserProfile } from "@/lib/types";

interface SoundContextValue {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  play: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);
const LOCAL_KEY = "chiptable:muted";

// The mute switch as a tiny external store: read from localStorage on first use, so it applies
// before the profile loads, and rendered as "on" on the server.
const listeners = new Set<() => void>();
let mutedValue: boolean | null = null;

function getMuted(): boolean {
  if (mutedValue === null) {
    try {
      mutedValue = localStorage.getItem(LOCAL_KEY) === "1";
    } catch {
      mutedValue = false;
    }
  }
  return mutedValue;
}

function setMutedValue(m: boolean) {
  if (m === mutedValue) return;
  mutedValue = m;
  try {
    localStorage.setItem(LOCAL_KEY, m ? "1" : "0");
  } catch {
    // Storage blocked: the profile still has it.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Table sounds plus the mute switch. The choice is saved on the user's profile (so it follows
 * them to other devices) and mirrored locally.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const uid = status.kind === "signedIn" ? status.user.uid : null;
  const muted = useSyncExternalStore(subscribe, getMuted, () => false);

  useEffect(() => unlockAudioOnFirstGesture(), []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(getFirebase().db, "users", uid), (snap) => {
      const m = (snap.data() as UserProfile | undefined)?.muted;
      if (typeof m === "boolean") setMutedValue(m);
    });
  }, [uid]);

  const setMuted = useCallback(
    (m: boolean) => {
      setMutedValue(m);
      if (uid) updateDoc(doc(getFirebase().db, "users", uid), { muted: m }).catch((err) => console.error("mute", err));
    },
    [uid],
  );

  const play = useCallback((name: SoundName) => {
    if (!getMuted()) playSound(name);
  }, []);

  const value = useMemo(() => ({ muted, setMuted, play }), [muted, setMuted, play]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside <SoundProvider>");
  return ctx;
}

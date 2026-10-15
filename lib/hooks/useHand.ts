"use client";

import { onSnapshot, type DocumentReference, type Firestore } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { handRef, voteRef } from "@/lib/firebase/paths";
import type { HandDoc, VoteDoc } from "@/lib/types";

export type Hand = HandDoc & { id: string };
export type Vote = VoteDoc & { id: string };

/** Live doc identified by `key`; `ref` builds it. Null while loading or when key is null. */
function useLiveDoc<T>(key: string | null, ref: (db: Firestore) => DocumentReference): T | null {
  const [state, setState] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      ref(getFirebase().db),
      (snap) =>
        setState({
          key,
          value: snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: "estimate" }) } as T) : null,
        }),
      () => setState({ key, value: null }),
    );
    // `ref` is rebuilt every render; `key` identifies the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Never hand back the previous document's data while the next one loads.
  return state && state.key === key ? state.value : null;
}

export function useHand(roomId: string, handId: string | null): Hand | null {
  return useLiveDoc<Hand>(handId && `${roomId}/hands/${handId}`, (db) => handRef(db, roomId, handId!));
}

export function useVote(roomId: string, voteId: string | null): Vote | null {
  return useLiveDoc<Vote>(voteId && `${roomId}/votes/${voteId}`, (db) => voteRef(db, roomId, voteId!));
}

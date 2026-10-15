"use client";

import { onSnapshot, type DocumentReference, type Firestore } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
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

/**
 * Live votes for the given ids (a wallet hand has one; a guided showdown one per contested pot).
 * Index-aligned with `ids`; null while loading and for null ids.
 */
export function useVotes(roomId: string, ids: (string | null)[]): (Vote | null)[] {
  const key = `${roomId}/${ids.join(",")}`;
  const [state, setState] = useState<{ key: string; votes: Record<string, Vote | null> } | null>(null);
  useEffect(() => {
    const live = key.slice(roomId.length + 1).split(",").filter(Boolean);
    const { db } = getFirebase();
    const put = (id: string, vote: Vote | null) =>
      setState((s) => ({ key, votes: { ...(s?.key === key ? s.votes : {}), [id]: vote } }));
    const unsubs = live.map((id) =>
      onSnapshot(
        voteRef(db, roomId, id),
        (snap) =>
          put(id, snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: "estimate" }) } as Vote) : null),
        () => put(id, null),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key, roomId]);
  return useMemo(
    () => ids.map((id) => (id && state?.key === key ? (state.votes[id] ?? null) : null)),
    // `ids` is rebuilt every render; `key` identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, state],
  );
}

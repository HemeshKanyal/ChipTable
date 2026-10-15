"use client";

import { onSnapshot, query, where, type Firestore, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { handsCol, requestsCol, seasonsCol, voteRef } from "@/lib/firebase/paths";
import type { HandRecord, RebuyRecord } from "@/lib/stats/history";
import type { ResetVoteDoc, SeasonDoc } from "@/lib/types";

/** Live query results; null while loading. `key` identifies the query (null = none). */
function useLiveQuery<T>(key: string | null, build: (db: Firestore) => Query): T[] | null {
  const [state, setState] = useState<{ key: string; rows: T[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      build(getFirebase().db),
      (snap) =>
        setState({ key, rows: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as T) }),
      (err) => {
        console.error(key, err);
        setState({ key, rows: [] });
      },
    );
    // `build` is rebuilt every render; `key` identifies the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state && state.key === key ? state.rows : null;
}

/** Rebuy requests waiting for the host (or for you to cancel). */
export function usePendingRebuys(roomId: string): RebuyRecord[] {
  return (
    useLiveQuery<RebuyRecord>(`${roomId}/requests/pending`, (db) =>
      query(requestsCol(db, roomId), where("status", "==", "pending")),
    ) ?? []
  );
}

/** Every hand of a season (sorted by number). */
export function useSeasonHands(roomId: string, seasonId: string): HandRecord[] | null {
  const rows = useLiveQuery<HandRecord>(`${roomId}/hands/${seasonId}`, (db) =>
    query(handsCol(db, roomId), where("seasonId", "==", seasonId)),
  );
  return rows && [...rows].sort((a, b) => a.number - b.number);
}

/** Every rebuy request of a season. */
export function useSeasonRebuys(roomId: string, seasonId: string): RebuyRecord[] | null {
  return useLiveQuery<RebuyRecord>(`${roomId}/requests/${seasonId}`, (db) =>
    query(requestsCol(db, roomId), where("seasonId", "==", seasonId)),
  );
}

export type Season = SeasonDoc & { id: string };

/** Archived (finished) seasons, newest first. */
export function useArchivedSeasons(roomId: string): Season[] | null {
  const rows = useLiveQuery<Season>(`${roomId}/seasons`, (db) => query(seasonsCol(db, roomId)));
  return rows && [...rows].sort((a, b) => b.number - a.number);
}

export type ResetVote = ResetVoteDoc & { id: string };

export function useResetVote(roomId: string, voteId: string | null): ResetVote | null {
  const [state, setState] = useState<{ key: string; vote: ResetVote | null } | null>(null);
  const key = voteId && `${roomId}/votes/${voteId}`;
  useEffect(() => {
    if (!key || !voteId) return;
    return onSnapshot(
      voteRef(getFirebase().db, roomId, voteId),
      (snap) =>
        setState({
          key,
          vote: snap.exists() ? ({ id: snap.id, ...snap.data({ serverTimestamps: "estimate" }) } as ResetVote) : null,
        }),
      () => setState({ key, vote: null }),
    );
  }, [key, roomId, voteId]);
  return state && state.key === key ? state.vote : null;
}

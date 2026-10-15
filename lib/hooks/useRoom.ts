"use client";

import { FirebaseError } from "firebase/app";
import { onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { playersCol, roomRef } from "@/lib/firebase/paths";
import type { PlayerDoc, RoomDoc } from "@/lib/types";

export type Room = RoomDoc & { id: string };

export type RoomState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; room: Room; players: PlayerDoc[] };

/** Live room doc + players. Key the calling component by roomId. */
export function useRoom(roomId: string): RoomState {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<PlayerDoc[] | null>(null);
  const [failure, setFailure] = useState<RoomState | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    const onError = (err: unknown) => {
      if (err instanceof FirebaseError && err.code === "permission-denied") setFailure({ kind: "forbidden" });
      else setFailure({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load the room." });
    };

    const unsubRoom = onSnapshot(
      roomRef(db, roomId),
      (snap) => {
        if (!snap.exists()) return setFailure({ kind: "forbidden" });
        setRoom({ id: snap.id, ...(snap.data({ serverTimestamps: "estimate" }) as RoomDoc) });
      },
      onError,
    );
    const unsubPlayers = onSnapshot(
      playersCol(db, roomId),
      (snap) => setPlayers(snap.docs.map((d) => d.data({ serverTimestamps: "estimate" }) as PlayerDoc)),
      onError,
    );
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId]);

  if (failure) return failure;
  if (!room || !players) return { kind: "loading" };
  return { kind: "ready", room, players };
}

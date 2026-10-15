"use client";

import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { myRoomsCol, roomRef } from "@/lib/firebase/paths";
import type { MyRoomEntry, RoomDoc } from "@/lib/types";

export type MyRoomsState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; entries: MyRoomEntry[] };

export function useMyRooms(uid: string): MyRoomsState {
  const [state, setState] = useState<MyRoomsState>({ kind: "loading" });
  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(
      query(myRoomsCol(db, uid), orderBy("lastVisitedAt", "desc"), limit(50)),
      (snap) =>
        setState({
          kind: "ready",
          entries: snap.docs.map((d) => d.data({ serverTimestamps: "estimate" }) as MyRoomEntry),
        }),
      (err) => setState({ kind: "error", message: err.message }),
    );
  }, [uid]);
  return state;
}

/** One room's live doc, for a My Rooms row. `undefined` while loading, `null` if unavailable. */
export function useRoomSummary(roomId: string): RoomDoc | null | undefined {
  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);
  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(
      roomRef(db, roomId),
      (snap) => setRoom(snap.exists() ? (snap.data({ serverTimestamps: "estimate" }) as RoomDoc) : null),
      () => setRoom(null),
    );
  }, [roomId]);
  return room;
}

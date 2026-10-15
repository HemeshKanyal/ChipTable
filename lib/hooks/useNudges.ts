"use client";

import { onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { nudgesCol } from "@/lib/firebase/paths";
import type { NudgeDoc } from "@/lib/types";

export interface Nudge {
  from: string;
  preset: number;
  at: number;
}

/** Calls `onNudge` for every nudge aimed at `uid` from now on (not ones sent before we arrived). */
export function useNudges(roomId: string, uid: string, onNudge: (nudge: Nudge) => void) {
  const handler = useRef(onNudge);
  useEffect(() => {
    handler.current = onNudge;
  });

  useEffect(() => {
    const since = Date.now();
    const seen = new Map<string, number>();
    const q = query(nudgesCol(getFirebase().db, roomId), where("to", "==", uid));
    return onSnapshot(
      q,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === "removed") continue;
          const data = change.doc.data({ serverTimestamps: "estimate" }) as NudgeDoc;
          const at = data.at?.toMillis() ?? Date.now();
          const from = change.doc.id;
          // Senders overwrite one doc, so only react when its time moves on. Allow a little clock skew.
          if (at < since - 5_000 || seen.get(from) === at) continue;
          seen.set(from, at);
          handler.current({ from, preset: data.preset, at });
        }
      },
      (err) => console.error("nudges", err),
    );
  }, [roomId, uid]);
}

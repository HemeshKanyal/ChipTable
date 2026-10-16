"use client";

import { useEffect, useRef } from "react";
import { useSound } from "@/components/SoundProvider";
import { vibrate } from "@/lib/sound";
import type { Hand } from "./useHand";

/**
 * Sounds and buzzes for what happens at the table: a chip clack for every bet, a fanfare when a
 * pot is paid, and a chime plus vibration when it becomes your turn. Only for changes we watch
 * happen, never on arrival.
 */
export function useHandSounds(hand: Hand | null, myUid: string) {
  const { play } = useSound();
  const seen = useRef<{ id: string; events: number; status: string; toAct: string | null } | null>(null);

  useEffect(() => {
    if (!hand) return;
    const events = hand.mode === "wallet" ? hand.actions : hand.engine.log;
    const toAct = hand.mode === "guided" && hand.status === "betting" ? hand.toActUid : null;
    const prev = seen.current;
    seen.current = { id: hand.id, events: events.length, status: hand.status, toAct };
    if (!prev) return;

    const fresh = prev.id !== hand.id;
    const newEvents = events.slice(fresh ? 0 : prev.events);
    if (newEvents.some((e) => e.amount > 0)) play("chip");

    if (!fresh && prev.status !== "complete" && hand.status === "complete") {
      play("win");
      if ((hand.result?.payouts[myUid] ?? 0) > 0) vibrate([60, 40, 60]);
    }
    if (toAct === myUid && (fresh || prev.toAct !== myUid)) {
      // Let the chip clack land first.
      setTimeout(() => play("turn"), 250);
      vibrate(200);
    }
  }, [hand, myUid, play]);
}

"use client";

import { useEffect, useRef } from "react";
import { getFirebase } from "@/lib/firebase/client";
import { heartbeat, markVisited, setHost } from "@/lib/firebase/rooms";
import { HEARTBEAT_MS, hostIsAway, pickNextHost, type PresencePlayer } from "@/lib/room/seating";

/**
 * Sends a heartbeat every 30s, plus one whenever the page becomes visible again. Hidden tabs
 * keep beating where the browser allows it (desktop throttles to ~1/min; a locked phone stops),
 * so putting your phone face-down for a minute doesn't cost you the host role.
 */
export function usePresence(roomId: string, uid: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const { db } = getFirebase();
    const beat = () => {
      heartbeat(db, roomId, uid).catch(() => {});
    };
    const onVisible = () => document.visibilityState === "visible" && beat();
    beat();
    void markVisited(db, uid, roomId);
    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId, uid, enabled]);
}

/**
 * If the host has left or gone quiet for 2+ minutes, the next online player clockwise
 * claims hosting. Only that player acts, so clients don't race each other.
 */
export function useHostWatch(
  roomId: string,
  hostUid: string,
  maxPlayers: number,
  players: PresencePlayer[],
  myUid: string,
  now: number,
) {
  const inFlight = useRef(false);
  useEffect(() => {
    if (inFlight.current) return;
    const host = players.find((p) => p.uid === hostUid);
    if (!hostIsAway(host, now)) return;
    if (pickNextHost(players, hostUid, maxPlayers, now, { requireOnline: true }) !== myUid) return;
    inFlight.current = true;
    setHost(getFirebase().db, roomId, myUid, myUid)
      .catch(() => {}) // Lost a race or the rules disagree on timing; we'll retry next tick.
      .finally(() => {
        inFlight.current = false;
      });
  }, [roomId, hostUid, maxPlayers, players, myUid, now]);
}

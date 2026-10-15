"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CrownIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import { isOnline } from "@/lib/room/seating";
import { formatRelative } from "@/lib/time";
import type { PlayerDoc } from "@/lib/types";

interface PlayersSheetProps {
  open: boolean;
  onClose: () => void;
  players: PlayerDoc[];
  hostUid: string;
  myUid: string;
  now: number;
  onMakeHost: (uid: string) => Promise<unknown>;
  onKick: (uid: string) => Promise<unknown>;
}

export function PlayersSheet({ open, onClose, players, hostUid, myUid, now, onMakeHost, onKick }: PlayersSheetProps) {
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const iAmHost = hostUid === myUid;

  const atTable = players
    .filter((p) => p.status !== "left")
    .sort((a, b) => (a.seatIndex ?? 99) - (b.seatIndex ?? 99));
  const away = players.filter((p) => p.status === "left").sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function run(uid: string, action: (uid: string) => Promise<unknown>) {
    setBusy(uid);
    try {
      await action(uid);
    } finally {
      setBusy(null);
      setConfirmKick(null);
    }
  }

  const row = (p: PlayerDoc) => {
    const lastSeen = p.lastSeen?.toMillis() ?? null;
    const online = isOnline(lastSeen, now);
    const isMe = p.uid === myUid;
    const status =
      p.status === "left" ? "Away" : `Seat ${(p.seatIndex ?? 0) + 1}${p.status === "sittingOut" ? " · Sitting out" : ""}`;
    const seen = online ? "online" : lastSeen ? `seen ${formatRelative(lastSeen, now)}` : "offline";

    return (
      <li key={p.uid} className="flex flex-col gap-2 border-b gold-hairline py-3 last:border-b-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={p.displayName} photoURL={p.photoURL} size={40} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-felt-900 ${online ? "bg-success" : "bg-ivory/30"}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-semibold">
              {p.uid === hostUid && <CrownIcon size={14} />}
              <span className="truncate">{p.displayName}</span>
              {isMe && <span className="text-xs font-normal text-ivory-muted">(you)</span>}
            </p>
            <p className="truncate text-xs text-ivory-muted">
              {status} · {seen}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-gold-300 tabular-nums">{formatChips(p.stack)}</span>
        </div>

        {iAmHost && !isMe && (
          <div className="flex gap-2 pl-[3.25rem]">
            {p.status !== "left" && (
              <button
                type="button"
                disabled={busy === p.uid}
                onClick={() => run(p.uid, onMakeHost)}
                className="h-8 rounded-lg border gold-hairline px-3 text-xs font-semibold text-gold-200 hover:bg-gold-400/10 disabled:opacity-50"
              >
                Make host
              </button>
            )}
            {p.status !== "left" &&
              (confirmKick === p.uid ? (
                <button
                  type="button"
                  disabled={busy === p.uid}
                  onClick={() => run(p.uid, onKick)}
                  className="h-8 rounded-lg bg-danger px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Tap again to remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmKick(p.uid)}
                  className="h-8 rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger hover:bg-danger/10"
                >
                  Remove from table
                </button>
              ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Players">
      <h3 className="mb-1 font-sans text-xs font-semibold uppercase tracking-wider text-gold-300/80">
        At the table · {atTable.length}
      </h3>
      <ul>{atTable.map(row)}</ul>
      {away.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 font-sans text-xs font-semibold uppercase tracking-wider text-gold-300/80">
            Away · {away.length}
          </h3>
          <ul>{away.map(row)}</ul>
        </>
      )}
      {iAmHost && (
        <p className="mt-4 text-xs text-ivory-muted">
          Removed players keep their chips and can rejoin with the code.
        </p>
      )}
    </BottomSheet>
  );
}

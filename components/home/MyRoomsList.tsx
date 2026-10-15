"use client";

import Link from "next/link";
import { CrownIcon, ChevronRightIcon, LockIcon } from "@/components/ui/icons";
import { useMyRooms, useRoomSummary } from "@/lib/hooks/useMyRooms";
import { useNow } from "@/lib/hooks/useNow";
import { formatRelative } from "@/lib/time";
import type { MyRoomEntry } from "@/lib/types";

export function MyRoomsList({ uid }: { uid: string }) {
  const state = useMyRooms(uid);
  const now = useNow(60_000);

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-felt-900/50" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return <p className="text-sm text-danger">Couldn&apos;t load your rooms: {state.message}</p>;
  }
  if (state.entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed gold-hairline bg-felt-900/40 px-6 py-10 text-center">
        <span className="text-2xl text-gold-500/70" aria-hidden>
          ♠
        </span>
        <p className="font-semibold">No rooms yet</p>
        <p className="max-w-xs text-sm text-ivory-muted">
          Create one above, or open a join link from a friend. Your tables will wait for you here.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {state.entries.map((entry) => (
        <RoomRow key={entry.roomId} entry={entry} uid={uid} now={now} />
      ))}
    </ul>
  );
}

function RoomRow({ entry, uid, now }: { entry: MyRoomEntry; uid: string; now: number }) {
  const room = useRoomSummary(entry.roomId);
  if (room === null) return null;
  const seated = room ? Object.keys(room.seats).length : 0;

  return (
    <li>
      <Link
        href={`/room/${entry.roomId}`}
        className="flex items-center gap-3 rounded-2xl border gold-hairline bg-felt-900/60 px-4 py-3 transition hover:bg-felt-800/70 active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {room?.hostUid === uid && <CrownIcon size={14} />}
            <p className="truncate font-semibold text-ivory">{room?.name ?? "…"}</p>
            {room?.hasPassword && <LockIcon size={12} className="shrink-0 text-ivory-muted" />}
          </div>
          {room && (
            <p className="mt-0.5 truncate text-xs text-ivory-muted tabular-nums">
              {room.settings.mode === "guided" ? "Guided" : "Wallet"} · {room.settings.sb}/{room.settings.bb} ·{" "}
              {seated}/{room.settings.maxPlayers} seated
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-ivory-muted/80">
          {entry.lastVisitedAt ? formatRelative(entry.lastVisitedAt.toMillis(), now) : ""}
        </span>
        <ChevronRightIcon size={16} className="shrink-0 text-ivory-muted/60" />
      </Link>
    </li>
  );
}

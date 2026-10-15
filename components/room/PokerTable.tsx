"use client";

import { isOnline, seatLayout } from "@/lib/room/seating";
import type { Room } from "@/lib/hooks/useRoom";
import type { PlayerDoc } from "@/lib/types";
import { Seat } from "./Seat";

interface PokerTableProps {
  room: Room;
  players: PlayerDoc[];
  myUid: string;
  now: number;
  onSit: (seatIndex: number) => void;
}

/** Oval felt table with seats around the rail. The viewer's seat is always at the bottom. */
export function PokerTable({ room, players, myUid, now, onSit }: PokerTableProps) {
  const max = room.settings.maxPlayers;
  const byUid = new Map(players.map((p) => [p.uid, p]));
  const me = byUid.get(myUid);
  const mySeat = me?.seatIndex != null && room.seats[String(me.seatIndex)] === myUid ? me.seatIndex : null;
  const layout = seatLayout(max, mySeat ?? 0);

  return (
    <div
      className="relative mx-auto aspect-[3/4] w-full"
      style={{ maxWidth: "min(100%, calc((100dvh - 19rem) * 0.75), 26rem)" }}
    >
      {/* Rail + felt */}
      <div className="rail absolute inset-[8%_9%] rounded-[50%] p-[4.5%]">
        <div className="felt relative h-full w-full overflow-hidden rounded-[50%] shadow-[inset_0_4px_24px_rgb(0_0_0/0.65)]">
          <div className="absolute inset-[6%] rounded-[50%] border border-gold-400/15" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="font-serif text-lg font-bold leading-tight text-gold-300/35">{room.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ivory/30 tabular-nums">
              Blinds {room.settings.sb}/{room.settings.bb}
            </p>
          </div>
        </div>
      </div>

      {layout.map(({ seatIndex, x, y }) => {
        const uid = room.seats[String(seatIndex)];
        const player = uid ? (byUid.get(uid) ?? null) : null;
        const isMe = uid === myUid;
        return (
          <div
            key={seatIndex}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isMe ? 2 : 1 }}
          >
            <Seat
              seatIndex={seatIndex}
              player={player}
              isMe={isMe}
              isHost={uid === room.hostUid}
              online={player ? isOnline(player.lastSeen?.toMillis() ?? null, now) : false}
              onSit={!uid ? () => onSit(seatIndex) : undefined}
              sitLabel={mySeat === null ? "Sit" : "Move"}
            />
          </div>
        );
      })}
    </div>
  );
}

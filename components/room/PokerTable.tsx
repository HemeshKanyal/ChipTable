"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo } from "react";
import { Chip } from "@/components/ui/Chip";
import { ChipPile } from "@/components/ui/ChipPile";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { breakdownChips, formatChips } from "@/lib/chips";
import type { HandState } from "@/lib/engine";
import { describeAction, streetBanner } from "@/lib/hand/guided";
import type { Hand } from "@/lib/hooks/useHand";
import type { Room } from "@/lib/hooks/useRoom";
import { isOnline, seatLayout } from "@/lib/room/seating";
import type { GuidedHandDoc, PlayerDoc } from "@/lib/types";
import { ChipFlights, betSpot, type Point } from "./ChipFlights";
import { Seat } from "./Seat";

interface PokerTableProps {
  room: Room;
  players: PlayerDoc[];
  myUid: string;
  now: number;
  /** The current hand, or the last finished one. */
  hand: Hand | null;
  onSit: (seatIndex: number) => void;
  /** Screen height kept free for the header and the controls below, so the table never hides behind them. */
  reserveRem?: number;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const CENTER: Point = { x: 50, y: 50 };

/** Oval felt table with seats around the rail. The viewer's seat is always at the bottom. */
export function PokerTable({ room, players, myUid, now, hand, onSit, reserveRem = 19 }: PokerTableProps) {
  const max = room.settings.maxPlayers;
  const byUid = useMemo(() => new Map(players.map((p) => [p.uid, p])), [players]);
  const me = byUid.get(myUid);
  const mySeat = me?.seatIndex != null && room.seats[String(me.seatIndex)] === myUid ? me.seatIndex : null;
  const layout = useMemo(() => seatLayout(max, mySeat ?? 0), [max, mySeat]);
  const live = !!hand && room.currentHandId === hand.id;
  // The engine state of a guided hand in progress.
  const engine = live && hand.mode === "guided" ? hand.engine : null;

  const seatOf = useCallback(
    (uid: string): Point | null => {
      const entry = Object.entries(room.seats).find(([, u]) => u === uid);
      const pos = entry ? layout[Number(entry[0])] : undefined;
      return pos ? { x: pos.x, y: pos.y } : null;
    },
    [room.seats, layout],
  );

  // Chips in front of each seat: this street's bets in guided mode, everything put in for wallet.
  const bets: [string, number][] = !live
    ? []
    : engine
      ? engine.players.map((p) => [p.uid, p.committed])
      : Object.entries(hand.contributions);

  const button = hand && layout[hand.buttonSeat];
  const buttonPos = button && lerp(button, CENTER, 0.3);
  const banner = engine ? streetBanner(engine) : null;

  return (
    <div
      className="relative mx-auto aspect-[3/4] w-full"
      style={{ maxWidth: `min(100%, calc((100dvh - ${reserveRem}rem) * 0.75), 26rem)` }}
    >
      {/* Rail + felt */}
      <div className="rail absolute inset-[8%_9%] rounded-[50%] p-[4.5%]">
        <div className="felt relative h-full w-full overflow-hidden rounded-[50%] shadow-[inset_0_4px_24px_rgb(0_0_0/0.65)]">
          <div className="absolute inset-[6%] rounded-[50%] border border-gold-400/15" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <TableCenter room={room} hand={hand} live={live} byUid={byUid} myUid={myUid} />
          </div>
        </div>
      </div>

      {/* Bets in front of each seat */}
      <AnimatePresence>
        {bets.map(([uid, amount]) => {
          const seat = seatOf(uid);
          if (!seat || amount <= 0) return null;
          const at = betSpot(seat);
          return (
            <motion.div
              key={uid}
              className="absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-felt-950/75 py-0.5 pl-0.5 pr-2 shadow"
              style={{ left: `${at.x}%`, top: `${at.y}%` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              // A street's bets sweep into the pot when it closes.
              exit={{ left: "50%", top: "50%", scale: 0.4, opacity: 0, transition: { duration: 0.45 } }}
              aria-label={`${byUid.get(uid)?.displayName ?? "Player"} has ${amount} in`}
            >
              <Chip value={breakdownChips(amount)[0].denomination.value} size={18} plain />
              <span className="text-[11px] font-bold text-ivory tabular-nums">{formatChips(amount)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Dealer button */}
      {buttonPos && (
        <motion.div
          layout
          className="absolute z-[6] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/30 bg-ivory text-[11px] font-extrabold text-felt-950 shadow-md"
          style={{ left: `${buttonPos.x + (buttonPos.x > 50 ? -7 : 7)}%`, top: `${buttonPos.y}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          title="Dealer button"
        >
          D
        </motion.div>
      )}

      {layout.map(({ seatIndex, x, y }) => {
        const uid = room.seats[String(seatIndex)];
        const player = uid ? (byUid.get(uid) ?? null) : null;
        const isMe = uid === myUid;
        const inHand = engine && uid ? engine.players.find((p) => p.uid === uid) : undefined;
        return (
          <div
            key={seatIndex}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%`, zIndex: isMe ? 8 : 7 }}
          >
            <Seat
              seatIndex={seatIndex}
              player={player}
              isMe={isMe}
              isHost={uid === room.hostUid}
              online={player ? isOnline(player.lastSeen?.toMillis() ?? null, now) : false}
              onSit={!uid ? () => onSit(seatIndex) : undefined}
              sitLabel={mySeat === null ? "Sit" : "Move"}
              stack={inHand?.stack}
              handState={inHand?.folded ? "folded" : inHand?.allIn ? "allIn" : null}
              turn={!!engine && engine.phase === "betting" && engine.toAct === uid}
              blind={inHand ? blindOf(engine!, inHand.seat) : null}
            />
          </div>
        );
      })}

      <ChipFlights hand={hand} seatOf={seatOf} />

      {/* "Deal the FLOP": big, so whoever's dealing can't miss it */}
      <AnimatePresence>
        {banner?.dealerCue && (
          <motion.div
            key={`${banner.title}-${hand?.id}`}
            className="pointer-events-none absolute inset-x-[16%] top-[19%] z-[9] flex flex-col items-center rounded-2xl border border-gold-400/70 bg-felt-950/90 px-3 py-2 text-center shadow-gold-glow"
            initial={{ opacity: 0, scale: 0.7, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            role="status"
          >
            <span className="font-serif text-xl font-bold leading-tight text-gold-200">{banner.title}</span>
            <span className="text-xs text-ivory-muted">{banner.detail}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function blindOf(state: HandState, seat: number): "SB" | "BB" | null {
  if (seat === state.bbSeat) return "BB";
  if (seat === state.sbSeat) return "SB";
  return null;
}

interface TableCenterProps {
  room: Room;
  hand: Hand | null;
  live: boolean;
  byUid: Map<string, PlayerDoc>;
  myUid: string;
}

function TableCenter({ room, hand, live, byUid, myUid }: TableCenterProps) {
  const name = (uid: string) => (uid === myUid ? "You" : (byUid.get(uid)?.displayName.split(" ")[0] ?? "Someone"));

  if (hand && live) {
    if (hand.mode === "guided") return <GuidedCenter hand={hand} name={name} />;
    const recent = hand.actions.slice(-3).reverse();
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-300/70">
          {hand.status === "voting" ? "Voting" : `Hand #${hand.number}`} · Pot
        </p>
        <RollingNumber value={hand.pot} className="text-gold text-3xl font-bold tabular-nums" />
        <div className="mt-1 flex h-9 items-end justify-center">
          {hand.pot > 0 && <ChipPile amount={hand.pot} size={20} maxPerStack={5} />}
        </div>
        <Feed lines={recent.map((a, i) => ({ key: hand.actions.length - i, who: name(a.uid), what: `+${formatChips(a.amount)}` }))} />
      </>
    );
  }

  if (hand?.result) {
    const { winners, payouts, decidedBy, pots } = hand.result;
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-300/60">Hand #{hand.number}</p>
        {decidedBy === "cancelled" ? (
          <p className="mt-1 text-sm text-ivory-muted">Called off. Chips returned.</p>
        ) : pots && pots.length > 1 ? (
          // Side pots: who took each one (they aren't a split).
          <motion.ul initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-1 flex flex-col gap-0.5">
            {pots.map((pot, i) => (
              <li key={i} className="text-sm leading-tight tabular-nums">
                <span className="text-ivory-muted">{i === 0 ? "Main" : `Side ${i}`}:</span>{" "}
                <span className="font-serif font-bold text-gold-200">{pot.winners.map(name).join(" & ")}</span>{" "}
                <span className="text-ivory-muted">{formatChips(pot.amount)}</span>
              </li>
            ))}
          </motion.ul>
        ) : (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-1">
            <p className="font-serif text-lg font-bold leading-tight text-gold-200">
              {winners.map(name).join(" & ")} {winners.length === 1 && winners[0] === myUid ? "win" : winners.length > 1 ? "split" : "wins"}
            </p>
            <p className="text-sm text-ivory-muted tabular-nums">
              {winners.map((w) => formatChips(payouts[w] ?? 0)).join(" + ")}
            </p>
            {decidedBy === "fold" && <p className="mt-0.5 text-[11px] text-ivory-muted/70">Everyone else folded</p>}
          </motion.div>
        )}
        <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-ivory/30 tabular-nums">
          Blinds {room.settings.sb}/{room.settings.bb}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="font-serif text-lg font-bold leading-tight text-gold-300/35">{room.name}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ivory/30 tabular-nums">
        Blinds {room.settings.sb}/{room.settings.bb}
      </p>
    </>
  );
}

const STREET_LABEL = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River" } as const;

function GuidedCenter({ hand, name }: { hand: GuidedHandDoc; name: (uid: string) => string }) {
  const { engine, pots } = hand;
  // Chips already gathered in the middle (this street's bets sit in front of the seats).
  const collected = engine.players.reduce((n, p) => n + p.totalIn - p.committed, 0);
  const stage =
    hand.status === "voting" ? "Voting" : hand.status === "showdown" ? "Showdown" : STREET_LABEL[hand.street];
  const recent = engine.log.slice(-3).reverse();

  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-300/70">
        #{hand.number} · {stage}
      </p>
      <RollingNumber value={hand.pot} className="text-gold text-3xl font-bold tabular-nums" />
      <div className="mt-1 flex h-8 items-end justify-center">
        {collected > 0 && <ChipPile amount={collected} size={18} maxPerStack={5} />}
      </div>
      {pots.length > 1 && (
        <div className="mt-1 flex flex-wrap justify-center gap-1" aria-label="Pots">
          {pots.map((pot, i) => (
            <span
              key={i}
              className="rounded-full bg-felt-950/70 px-2 py-0.5 text-[10px] font-semibold text-ivory tabular-nums"
              title={`Can win it: ${pot.eligible.map(name).join(", ")}`}
            >
              {i === 0 ? "Main" : `Side ${i}`} {formatChips(pot.amount)}
            </span>
          ))}
        </div>
      )}
      <Feed
        lines={recent.map((e, i) => ({ key: engine.log.length - i, who: name(e.uid), what: describeAction(e) }))}
        short={pots.length > 1}
      />
    </>
  );
}

function Feed({ lines, short = false }: { lines: { key: number; who: string; what: string }[]; short?: boolean }) {
  return (
    <ul
      className={`mt-2 flex flex-col items-center gap-0.5 overflow-hidden ${short ? "h-9" : "h-14"}`}
      aria-label="Recent moves"
    >
      <AnimatePresence initial={false}>
        {lines.slice(0, short ? 2 : 3).map((l, i) => (
          <motion.li
            key={l.key}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1 - i * 0.3, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-ivory tabular-nums"
          >
            <span className="font-semibold">{l.who}</span>{" "}
            {/* "You raise", not "You raises". */}
            <span className="text-gold-300">{l.who === "You" ? l.what.replace(/^(\w+)s\b/, "$1") : l.what}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

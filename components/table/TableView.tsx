"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { PokerTable } from "@/components/room/PokerTable";
import { useSound } from "@/components/SoundProvider";
import { Avatar } from "@/components/ui/Avatar";
import { SoundOffIcon, SoundOnIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import { describeAction, streetBanner } from "@/lib/hand/guided";
import { useHand, useVotes } from "@/lib/hooks/useHand";
import { useHandSounds } from "@/lib/hooks/useHandSounds";
import { useNow } from "@/lib/hooks/useNow";
import { useRoom, type Room } from "@/lib/hooks/useRoom";
import { voteIsDecided } from "@/lib/vote/tally";
import type { PlayerDoc } from "@/lib/types";

/**
 * Big-screen, read-only view for a laptop or tablet in the middle of the table: every seat, the
 * pots, the street banner and the animations. Any room member can open it; it never acts.
 */
export function TableView({ roomId }: { roomId: string }) {
  const state = useRoom(roomId);
  switch (state.kind) {
    case "loading":
      return <LoadingScreen label="Setting up the table…" />;
    case "forbidden":
    case "error":
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-bold">Can&apos;t show this table</h1>
          <p className="text-sm text-ivory-muted">
            {state.kind === "error" ? state.message : "Join the room with its code first, then open the Table View."}
          </p>
          <Link href="/" className="text-sm font-semibold text-gold-300">
            Back home
          </Link>
        </main>
      );
    case "ready":
      return <Board room={state.room} players={state.players} />;
  }
}

const TABLE_REM = 24;
const REM = 16;

/** How much to scale the table so it fills the space left by the header and side panel. */
function computeZoom(): number {
  const wide = window.innerWidth >= 1024;
  const width = window.innerWidth - (wide ? 20 * REM + 5 * REM : 2 * REM);
  const height = window.innerHeight - (wide ? 8 * REM : 6 * REM);
  const table = TABLE_REM * REM;
  return Math.max(0.8, Math.min(2.4, width / table, height / (table * (4 / 3))));
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function Board({ room, players }: { room: Room; players: PlayerDoc[] }) {
  const now = useNow(10_000);
  const zoom = useSyncExternalStore(subscribeResize, computeZoom, () => 1);
  const { muted, setMuted } = useSound();
  const hand = useHand(room.id, room.currentHandId ?? room.lastHandId ?? null);
  const live = hand && room.currentHandId === hand.id ? hand : null;
  // No seat of its own: sounds for bets and wins, never a "your turn" chime.
  useHandSounds(hand, "");

  const voteIds = live?.status === "voting" ? (live.mode === "wallet" ? [live.voteId] : live.voteIds) : [];
  const votes = useVotes(room.id, voteIds).filter((v) => v?.status === "open");
  const byUid = useMemo(() => new Map(players.map((p) => [p.uid, p])), [players]);
  const name = (uid: string) => byUid.get(uid)?.displayName.split(" ")[0] ?? "Someone";

  const banner = live?.mode === "guided" ? streetBanner(live.engine) : null;
  let status: string;
  if (!live) status = hand?.result ? "Between hands" : "Waiting for the first hand";
  else if (live.status === "voting") {
    const decided = votes.every((v) => v && voteIsDecided(v.openedAt?.toMillis() ?? now, v.ballots, v.voterUids, now));
    status = decided ? "Votes are in: the host is confirming" : "The table is voting on the winner";
  } else if (live.mode === "guided" && live.status === "betting" && live.toActUid) {
    status = `${name(live.toActUid)} to act`;
  } else if (banner) status = `${banner.title}: ${banner.detail}`;
  else status = "Chips going in";

  const feed =
    live?.mode === "guided"
      ? live.engine.log.slice(-8).reverse().map((e) => `${name(e.uid)} ${describeAction(e)}`)
      : live?.mode === "wallet"
        ? live.actions.slice(-8).reverse().map((a) => `${name(a.uid)} +${formatChips(a.amount)}`)
        : [];
  // During a guided hand the live stacks are in the engine; saved stacks settle when it ends.
  const stackOf = (p: PlayerDoc) =>
    (live?.mode === "guided" ? live.engine.players.find((e) => e.uid === p.uid)?.stack : undefined) ?? p.stack;
  const standings = players
    .filter((p) => p.status !== "left")
    .map((p) => ({ ...p, stack: stackOf(p) }))
    .sort((a, b) => b.stack - a.stack)
    .slice(0, 6);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-4 border-b gold-hairline bg-felt-950/70 px-6 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-2xl font-bold">{room.name}</h1>
          <p className="text-sm text-ivory-muted tabular-nums">
            {room.settings.mode === "guided" ? "Guided" : "Wallet"} · Blinds {room.settings.sb}/{room.settings.bb}
            {live ? ` · Hand #${live.number}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ivory-muted">Join with code</p>
          <p className="font-mono text-2xl font-bold tracking-[0.25em] text-gold-200">{room.code}</p>
        </div>
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ivory-muted hover:bg-white/5 hover:text-ivory"
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_20rem] lg:p-6">
        <main className="flex items-center justify-center overflow-hidden">
          {/* A phone-sized table scaled up as a whole, so seats and labels grow with it. */}
          <div style={{ zoom }}>
            <PokerTable room={room} players={players} myUid="" now={now} hand={hand} fixedRem={TABLE_REM} />
          </div>
        </main>

        <aside className="flex flex-col gap-4">
          <Panel title="Now">
            <p className="font-serif text-xl font-bold leading-snug text-gold-200">{status}</p>
            {live && (
              <p className="mt-1 text-sm text-ivory-muted tabular-nums">
                Pot <span className="font-semibold text-ivory">{formatChips(live.pot)}</span>
              </p>
            )}
            {live?.mode === "guided" && live.pots.length > 1 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
                {live.pots.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-ivory-muted">{i === 0 ? "Main pot" : `Side pot ${i}`}</span>
                    <span>
                      {formatChips(p.amount)} <span className="text-xs text-ivory-muted">({p.eligible.map(name).join(", ")})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {votes.map(
              (v) =>
                v && (
                  <p key={v.id} className="mt-2 text-sm text-ivory-muted tabular-nums">
                    {voteIds.length > 1 ? (v.potIndex === 0 ? "Main pot: " : `Side pot ${v.potIndex}: `) : ""}
                    {Object.keys(v.ballots).length} of {v.voterUids.length} voted
                  </p>
                ),
            )}
          </Panel>

          {feed.length > 0 && (
            <Panel title="Recent moves">
              <ol className="flex flex-col gap-1 text-sm">
                {feed.map((line, i) => (
                  <li key={`${feed.length}-${i}`} className={i === 0 ? "font-semibold" : "text-ivory-muted"}>
                    {line}
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel title="Stacks">
            <ol className="flex flex-col gap-2">
              {standings.map((p) => (
                <li key={p.uid} className="flex items-center gap-2 text-sm">
                  <Avatar name={p.displayName} photoURL={p.photoURL} size={28} />
                  <span className="flex-1 truncate">{p.displayName}</span>
                  <span className="font-semibold text-gold-200 tabular-nums">{formatChips(p.stack)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border gold-hairline bg-felt-900/70 p-4">
      <h2 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-gold-300/80">{title}</h2>
      {children}
    </section>
  );
}

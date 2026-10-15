"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { Avatar } from "@/components/ui/Avatar";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import { useArchivedSeasons, useSeasonHands, useSeasonRebuys } from "@/lib/hooks/useHistory";
import { useRoom, type Room } from "@/lib/hooks/useRoom";
import { leaderboard, sessions, type HandRecord, type RebuyRecord, type StandingInput } from "@/lib/stats/history";
import { seasonNumber } from "@/lib/vote/reset";
import type { PlayerDoc } from "@/lib/types";
import { Empty, HandList, Net } from "./HandHistory";
import { StackChart, seriesColor } from "./StackChart";

export function HistoryScreen({ roomId }: { roomId: string }) {
  const state = useRoom(roomId);
  switch (state.kind) {
    case "loading":
      return <LoadingScreen label="Digging out the records…" />;
    case "forbidden":
    case "error":
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-bold">Can&apos;t open this history</h1>
          <p className="text-sm text-ivory-muted">
            {state.kind === "error" ? state.message : "Only players in this room can see it."}
          </p>
          <Link href="/" className="text-sm font-semibold text-gold-300">
            Back home
          </Link>
        </main>
      );
    case "ready":
      return <HistoryView room={state.room} players={state.players} />;
  }
}

type Tab = "leaderboard" | "sessions" | "hands";

function HistoryView({ room, players }: { room: Room; players: PlayerDoc[] }) {
  const seasonsDocs = useArchivedSeasons(room.id);
  const archived = useMemo(() => seasonsDocs ?? [], [seasonsDocs]);
  const [picked, setPicked] = useState<string | null>(null);
  const seasonId = picked ?? room.seasonId;
  const season = archived.find((s) => s.id === seasonId) ?? null;
  const isCurrent = seasonId === room.seasonId;
  const [tab, setTab] = useState<Tab>("leaderboard");

  const hands = useSeasonHands(room.id, seasonId);
  const rebuys = useSeasonRebuys(room.id, seasonId);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of archived) for (const [uid, f] of Object.entries(s.finalStacks)) m.set(uid, f.displayName);
    for (const p of players) m.set(p.uid, p.displayName);
    return m;
  }, [archived, players]);
  const name = (uid: string) => names.get(uid)?.split(" ")[0] ?? "Someone";

  const startingStack = season?.startingStack ?? room.settings.startingStack;
  const people: StandingInput[] = isCurrent
    ? players.map((p) => ({ uid: p.uid, name: p.displayName, stack: p.stack, rebuys: p.totalRebuys, active: p.status !== "left" }))
    : Object.entries(season?.finalStacks ?? {}).map(([uid, f]) => ({
        uid,
        name: f.displayName,
        stack: f.stack,
        rebuys: f.totalRebuys,
        active: false,
      }));

  const seasonIds = [room.seasonId, ...archived.map((s) => s.id).filter((id) => id !== room.seasonId)];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b gold-hairline bg-felt-950/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-2 px-2">
          <Link
            href={`/room/${room.id}`}
            aria-label="Back to the table"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ivory-muted hover:bg-white/5 hover:text-ivory"
          >
            <ArrowLeftIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">History</h1>
            <p className="truncate text-xs text-ivory-muted">{room.name}</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-lg px-4 pb-2">
          {seasonIds.length > 1 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto" role="group" aria-label="Season">
              {seasonIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPicked(id)}
                  aria-pressed={id === seasonId}
                  className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold ${
                    id === seasonId ? "border-gold-400 bg-gold-400/15 text-gold-200" : "gold-hairline text-ivory-muted"
                  }`}
                >
                  Season {seasonNumber(id)}
                  {id === room.seasonId ? " · now" : ""}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 rounded-xl bg-felt-950/60 p-1" role="tablist">
            {(["leaderboard", "sessions", "hands"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`h-8 rounded-lg text-xs font-semibold capitalize ${
                  tab === t ? "bg-felt-700 text-ivory shadow" : "text-ivory-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {!isCurrent && season && (
          <p className="mb-3 text-xs text-ivory-muted">
            Season {season.number}: {season.startedAt.toDate().toLocaleDateString()} –{" "}
            {season.endedAt.toDate().toLocaleDateString()}. Final stacks before the reset.
          </p>
        )}
        {!hands || !rebuys ? (
          <Empty>Loading…</Empty>
        ) : tab === "leaderboard" ? (
          <Leaderboard people={people} hands={hands} startingStack={startingStack} players={players} />
        ) : tab === "sessions" ? (
          <Sessions hands={hands} rebuys={rebuys} name={name} />
        ) : (
          <HandList hands={hands} name={name} />
        )}
      </main>
    </div>
  );
}

interface LeaderboardProps {
  people: StandingInput[];
  hands: HandRecord[];
  startingStack: number;
  players: PlayerDoc[];
}

function Leaderboard({ people, hands, startingStack, players }: LeaderboardProps) {
  const rows = leaderboard(people, hands, startingStack);
  const photo = (uid: string) => players.find((p) => p.uid === uid)?.photoURL ?? null;
  if (!rows.length) return <Empty>Nobody has played yet.</Empty>;
  return (
    <>
      <ol className="flex flex-col">
        {rows.map((r, i) => (
          <li key={r.uid} className="flex items-center gap-3 border-b gold-hairline py-3">
            <span className={`w-5 text-center text-sm font-bold tabular-nums ${i === 0 ? "text-gold-300" : "text-ivory-muted"}`}>
              {i + 1}
            </span>
            <Avatar name={r.name} photoURL={photo(r.uid)} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="truncate text-xs text-ivory-muted tabular-nums">
                Won {r.handsWon}/{r.handsPlayed}
                {r.handsPlayed ? ` (${Math.round(r.winRate * 100)}%)` : ""}
                {r.biggestPot ? ` · Best pot ${formatChips(r.biggestPot)}` : ""}
                {r.rebuys ? ` · Rebuys ${formatChips(r.rebuys)}` : ""}
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-sm font-bold">
                <Net value={r.net} />
              </p>
              <p className="text-xs text-ivory-muted">{formatChips(r.stack)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ivory-muted">
        Net = stack − starting stack ({formatChips(startingStack)}) − rebuys. Win rate counts finished hands you were
        in.
      </p>
    </>
  );
}

function Sessions({ hands, rebuys, name }: { hands: HandRecord[]; rebuys: RebuyRecord[]; name: (uid: string) => string }) {
  const list = sessions(hands, rebuys);
  if (!list.length) return <Empty>No finished hands this season yet.</Empty>;
  const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <ul className="flex flex-col gap-4">
      {list.map((s) => {
        // Colours follow players in a fixed order (first appearance), never their rank.
        const order = Object.keys(s.timeline[0]?.stacks ?? {});
        const colorOf = (uid: string) => seriesColor(order.indexOf(uid));
        return (
          <li key={s.startedAt} className="rounded-2xl border gold-hairline bg-felt-900/60 p-4">
            <p className="font-serif text-lg font-bold">{date(s.startedAt)}</p>
            <p className="text-xs text-ivory-muted tabular-nums">
              {time(s.startedAt)}–{time(s.endedAt)} · {s.hands.length} hand{s.hands.length === 1 ? "" : "s"}
              {s.biggestPot ? ` · Biggest pot ${formatChips(s.biggestPot.amount)} (${name(s.biggestPot.uid)}, #${s.biggestPot.hand})` : ""}
            </p>

            {s.timeline.length > 1 && (
              <div className="mt-3">
                <StackChart timeline={s.timeline} uids={order} nameOf={name} />
              </div>
            )}

            {/* Legend and table view in one: who, where they started and ended, net. */}
            <table className="mt-2 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ivory-muted">
                  <th className="py-1 font-medium">Player</th>
                  <th className="py-1 text-right font-medium">Start</th>
                  <th className="py-1 text-right font-medium">End</th>
                  <th className="py-1 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {s.players.map((p) => (
                  <tr key={p.uid} className="border-t gold-hairline">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(p.uid) }} aria-hidden />
                        {name(p.uid)}
                        {p.rebuys > 0 && <span className="text-[11px] text-ivory-muted">+{formatChips(p.rebuys)} rebuy</span>}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-ivory-muted">{formatChips(p.start)}</td>
                    <td className="py-1.5 text-right">{formatChips(p.end)}</td>
                    <td className="py-1.5 text-right font-semibold">
                      <Net value={p.net} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!s.players.length && (
              <p className="mt-2 text-xs text-ivory-muted">These hands were played before stacks were recorded.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

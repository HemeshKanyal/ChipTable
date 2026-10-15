"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ChevronRightIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import type { Street } from "@/lib/engine";
import { describeAction } from "@/lib/hand/guided";
import { handPlayers, type HandRecord } from "@/lib/stats/history";

const when = (h: HandRecord) =>
  h.startedAt
    ? h.startedAt.toDate().toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "";

/** "Ann won 450 (everyone folded)", "Ann & Bob split", "Called off". */
function outcome(h: HandRecord, name: (uid: string) => string): string {
  const r = h.result;
  if (h.status === "cancelled" || !r) return h.status === "cancelled" ? "Called off" : "In progress";
  if ((r.pots?.length ?? 0) > 1) return r.pots!.map((p, i) => `${i ? `Side ${i}` : "Main"}: ${p.winners.map(name).join(" & ")}`).join(" · ");
  const who = r.winners.map(name).join(" & ");
  if (r.decidedBy === "fold") return `${who} won (all folded)`;
  return r.winners.length > 1 ? `${who} split` : `${who} won`;
}

interface HandListProps {
  hands: HandRecord[];
  name: (uid: string) => string;
}

/** Past hands, newest first. Tap one for its full action log. */
export function HandList({ hands, name }: HandListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const finished = hands.filter((h) => h.status === "complete" || h.status === "cancelled").reverse();
  const open = finished.find((h) => h.id === openId) ?? null;

  if (!finished.length) return <Empty>No finished hands this season yet.</Empty>;
  return (
    <>
      <ul className="flex flex-col">
        {finished.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => setOpenId(h.id)}
              className="flex w-full items-center gap-3 border-b gold-hairline py-3 text-left hover:bg-white/3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-felt-950/70 text-xs font-bold text-gold-300 tabular-nums">
                {h.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{outcome(h, name)}</span>
                <span className="block text-xs text-ivory-muted tabular-nums">
                  {h.mode === "guided" ? "Guided" : "Wallet"} · Pot {formatChips(h.pot)} · {when(h)}
                </span>
              </span>
              <ChevronRightIcon size={16} className="text-ivory-muted" />
            </button>
          </li>
        ))}
      </ul>
      <BottomSheet open={!!open} onClose={() => setOpenId(null)} title={open ? `Hand #${open.number}` : ""}>
        {open && <HandDetail hand={open} name={name} />}
      </BottomSheet>
    </>
  );
}

const STREETS: Street[] = ["preflop", "flop", "turn", "river"];

/** Everything about one hand: how it ended, who put in and took out what, and every move. */
export function HandDetail({ hand, name }: { hand: HandRecord; name: (uid: string) => string }) {
  const r = hand.result;
  const people = handPlayers(hand);
  const tallyLine = (tally: Record<string, number>) =>
    Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `${key.split(",").map(name).join(" & ")} ${n}`)
      .join(" · ");

  return (
    <div className="flex flex-col gap-5 pb-2">
      <p className="text-sm text-ivory-muted">
        {when(hand)} · {hand.mode === "guided" ? "Guided" : "Wallet"} · Pot{" "}
        <span className="font-semibold text-ivory tabular-nums">{formatChips(hand.pot)}</span>
      </p>

      <section>
        <H>Result</H>
        {!r || hand.status === "cancelled" ? (
          <p className="text-sm">Called off: everyone kept their chips.</p>
        ) : r.pots && r.pots.length ? (
          <ul className="flex flex-col gap-2">
            {r.pots.map((p, i) => (
              <li key={i} className="text-sm">
                <span className="text-ivory-muted">{i === 0 ? "Main pot" : `Side pot ${i}`} </span>
                <span className="tabular-nums">{formatChips(p.amount)}</span> →{" "}
                <span className="font-semibold text-gold-200">{p.winners.map(name).join(" & ")}</span>
                {Object.keys(p.tally).length > 0 && (
                  <span className="block text-xs text-ivory-muted">
                    Vote: {tallyLine(p.tally)}
                    {p.voteRounds > 1 ? ` (round ${p.voteRounds})` : ""}
                  </span>
                )}
                {p.eligible.length === 1 && <span className="block text-xs text-ivory-muted">Only one player could win it</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            <span className="font-semibold text-gold-200">{r.winners.map(name).join(" & ")}</span>{" "}
            {r.decidedBy === "fold" ? "won when everyone else folded." : r.winners.length > 1 ? "split the pot." : "won the vote."}
            {Object.keys(r.tally).length > 0 && (
              <span className="block text-xs text-ivory-muted">
                Vote: {tallyLine(r.tally)}
                {r.voteRounds > 1 ? ` (round ${r.voteRounds})` : ""}
              </span>
            )}
          </p>
        )}
      </section>

      <section>
        <H>Players</H>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ivory-muted">
              <th className="py-1 font-medium">Player</th>
              <th className="py-1 text-right font-medium">In</th>
              <th className="py-1 text-right font-medium">Won</th>
              <th className="py-1 text-right font-medium">Net</th>
              <th className="py-1 text-right font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {people.map((uid) => {
              const put = hand.contributions[uid] ?? 0;
              const got = hand.status === "cancelled" ? put : (r?.payouts[uid] ?? 0);
              const after = r?.stacksAfter?.[uid];
              return (
                <tr key={uid} className="border-t gold-hairline">
                  <td className="py-1.5">{name(uid)}</td>
                  <td className="py-1.5 text-right">{formatChips(put)}</td>
                  <td className="py-1.5 text-right">{formatChips(got)}</td>
                  <td className="py-1.5 text-right">
                    <Net value={got - put} />
                  </td>
                  <td className="py-1.5 text-right text-ivory-muted">{after === undefined ? "–" : formatChips(after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <H>Action</H>
        {hand.mode === "guided" ? (
          STREETS.map((street) => {
            const moves = hand.engine.log.filter((e) => e.street === street);
            if (!moves.length) return null;
            return (
              <div key={street} className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300/80">{street}</p>
                <ol className="flex flex-col gap-0.5 text-sm">
                  {moves.map((e, i) => (
                    <li key={i} className="tabular-nums">
                      <span className="font-semibold">{name(e.uid)}</span>{" "}
                      <span className="text-ivory-muted">{describeAction(e)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })
        ) : hand.actions.length ? (
          <ol className="flex flex-col gap-0.5 text-sm">
            {hand.actions.map((a, i) => (
              <li key={i} className="tabular-nums">
                <span className="font-semibold">{name(a.uid)}</span>{" "}
                <span className="text-ivory-muted">put in {formatChips(a.amount)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ivory-muted">No chips went in.</p>
        )}
        {hand.mode === "guided" && hand.engine.runout && (
          <p className="text-xs text-ivory-muted">Everyone was all-in: the board was run out.</p>
        )}
      </section>
    </div>
  );
}

export function Net({ value }: { value: number }) {
  // Sign carries the meaning; colour only reinforces it.
  return (
    <span className={value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-ivory-muted"}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {formatChips(Math.abs(value))}
    </span>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-gold-300/80">{children}</h3>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-ivory-muted">{children}</p>;
}

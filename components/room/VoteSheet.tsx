"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { CheckIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import type { Hand, Vote } from "@/lib/hooks/useHand";
import { useNow } from "@/lib/hooks/useNow";
import { tallyBallots, voteIsDecided, type Choice } from "@/lib/vote/tally";
import type { PlayerDoc } from "@/lib/types";

interface VoteSheetProps {
  open: boolean;
  onMinimize: () => void;
  hand: Hand;
  vote: Vote;
  players: PlayerDoc[];
  myUid: string;
  hostUid: string;
  busy: boolean;
  onCast: (winners: string[]) => Promise<unknown>;
  onAccept: (winners: string[]) => Promise<unknown>;
  onRedo: () => Promise<unknown>;
}

export function VoteSheet(props: VoteSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onMinimize} title={`Who won hand #${props.hand.number}?`}>
      {/* Keyed by vote so a re-vote starts with a clean selection. */}
      <VoteBody key={props.vote.id} {...props} />
    </BottomSheet>
  );
}

function VoteBody({ hand, vote, players, myUid, hostUid, busy, onCast, onAccept, onRedo }: VoteSheetProps) {
  const now = useNow(200);
  const byUid = useMemo(() => new Map(players.map((p) => [p.uid, p])), [players]);
  const name = (uid: string) => (uid === myUid ? "You" : (byUid.get(uid)?.displayName.split(" ")[0] ?? "Someone"));
  const label = (winners: string[]) => winners.map(name).join(" & ");

  const openedAt = vote.openedAt?.toMillis() ?? now;
  const remaining = openedAt + vote.durationMs - now;
  const decided = voteIsDecided(openedAt, vote.ballots, vote.voterUids, now);
  const tally = useMemo(() => tallyBallots(vote.ballots), [vote.ballots]);
  const isHost = myUid === hostUid;
  const iCanVote = vote.voterUids.includes(myUid);
  const myBallot = vote.ballots[myUid];
  const [picked, setPicked] = useState<string[]>(() => myBallot ?? []);
  const votedCount = vote.voterUids.filter((uid) => vote.ballots[uid]?.length).length;
  const pickedChanged = [...picked].sort().join() !== [...(myBallot ?? [])].sort().join();

  const toggle = (uid: string) =>
    setPicked((cur) => (cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <CountdownRing remainingMs={decided ? 0 : remaining} totalMs={vote.durationMs} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-ivory-muted">Pot</p>
          <p className="text-gold text-3xl font-bold leading-none tabular-nums">{formatChips(hand.pot)}</p>
          <p className="mt-1 text-xs text-ivory-muted">
            {votedCount} of {vote.voterUids.length} voted{vote.round > 1 ? ` · round ${vote.round}` : ""}
          </p>
        </div>
      </div>

      {!decided ? (
        <>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pick the winner(s)">
            {vote.candidates.map((uid) => {
              const p = byUid.get(uid);
              const selected = picked.includes(uid);
              return (
                <motion.button
                  key={uid}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  disabled={!iCanVote}
                  aria-pressed={selected}
                  onClick={() => toggle(uid)}
                  className={`relative flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition ${
                    selected ? "border-gold-400 bg-gold-400/12 shadow-gold-glow" : "gold-hairline bg-felt-950/40"
                  } disabled:opacity-60`}
                >
                  <Avatar name={p?.displayName ?? "?"} photoURL={p?.photoURL} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{name(uid)}</p>
                    <p className="text-[11px] text-ivory-muted tabular-nums">
                      {hand.contributions[uid] ? `put in ${formatChips(hand.contributions[uid])}` : "no chips in"}
                    </p>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-felt-950">
                      <CheckIcon size={13} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {iCanVote ? (
            <div className="flex flex-col gap-2">
              {picked.length > 1 && (
                <p className="text-center text-xs text-gold-200">
                  Split pot: about {formatChips(Math.floor(hand.pot / picked.length))} each
                </p>
              )}
              <Button
                size="lg"
                disabled={busy || picked.length === 0 || (!!myBallot && !pickedChanged)}
                onClick={() => onCast(picked)}
              >
                {picked.length === 0
                  ? "Tap the winner"
                  : myBallot && !pickedChanged
                    ? "Vote in ✓"
                    : `${myBallot ? "Change vote to" : "Vote"} ${label(picked)}`}
              </Button>
              {myBallot && (
                <p className="text-center text-xs text-ivory-muted">You can change your vote until time runs out.</p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-ivory-muted">You weren&apos;t seated when voting opened, so you can watch.</p>
          )}
        </>
      ) : (
        <Results
          tally={tally}
          label={label}
          name={name}
          isHost={isHost}
          hostName={name(hostUid)}
          busy={busy}
          onAccept={onAccept}
          onRedo={onRedo}
        />
      )}
    </div>
  );
}

interface ResultsProps {
  tally: ReturnType<typeof tallyBallots>;
  label: (winners: string[]) => string;
  name: (uid: string) => string;
  isHost: boolean;
  hostName: string;
  busy: boolean;
  onAccept: (winners: string[]) => Promise<unknown>;
  onRedo: () => Promise<unknown>;
}

function Results({ tally, label, name, isHost, hostName, busy, onAccept, onRedo }: ResultsProps) {
  const { majority, top, choices, totalBallots } = tally;
  const choiceRow = (c: Choice) => {
    const share = totalBallots ? c.count / totalBallots : 0;
    const win = majority?.key === c.key;
    return (
      <li key={c.key} className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className={`font-semibold ${win ? "text-gold-200" : ""}`}>
            {label(c.winners)}
            {c.winners.length > 1 && <span className="ml-1 text-xs font-normal text-ivory-muted">(split)</span>}
          </span>
          <span className="tabular-nums text-ivory-muted">{c.count}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ivory/10">
          <motion.div
            className={`h-full rounded-full ${win ? "bg-gold-400" : "bg-ivory/40"}`}
            initial={{ width: 0 }}
            animate={{ width: `${share * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <p className="truncate text-[11px] text-ivory-muted">{c.voters.map(name).join(", ")}</p>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-serif text-xl font-bold">
        {majority ? (
          <>
            Table says: <span className="text-gold">{label(majority.winners)}</span>
          </>
        ) : totalBallots ? (
          "No majority"
        ) : (
          "Nobody voted"
        )}
      </p>

      {choices.length > 0 && <ul className="flex flex-col gap-3">{choices.map(choiceRow)}</ul>}

      {isHost ? (
        <div className="flex flex-col gap-2">
          {majority ? (
            <Button size="lg" disabled={busy} onClick={() => onAccept(majority.winners)}>
              Accept · pay {label(majority.winners)}
            </Button>
          ) : (
            top.length > 0 && (
              <>
                <p className="text-center text-xs text-ivory-muted">Pick one of the top choices, or vote again.</p>
                {top.map((c) => (
                  <Button key={c.key} variant="felt" size="lg" disabled={busy} onClick={() => onAccept(c.winners)}>
                    Pay {label(c.winners)}
                  </Button>
                ))}
              </>
            )
          )}
          <Button variant="ghost" disabled={busy} onClick={onRedo}>
            Redo the vote (fresh 30s)
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-ivory-muted">Waiting for {hostName} to confirm…</p>
      )}
    </div>
  );
}

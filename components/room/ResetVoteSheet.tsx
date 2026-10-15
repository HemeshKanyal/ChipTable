"use client";

import { motion } from "framer-motion";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { formatChips } from "@/lib/chips";
import type { ResetVote } from "@/lib/hooks/useHistory";
import { useNow } from "@/lib/hooks/useNow";
import { tallyReset } from "@/lib/vote/reset";

interface ResetVoteSheetProps {
  open: boolean;
  onMinimize: () => void;
  vote: ResetVote;
  myUid: string;
  isHost: boolean;
  startingStack: number;
  nameOf: (uid: string) => string;
  busy: boolean;
  onCast: (yes: boolean) => Promise<unknown>;
  onConfirm: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  onCloseFailed: () => Promise<unknown>;
}

/** "Reset the room?": a 30s yes/no vote. Passes with yes from more than half the table. */
export function ResetVoteSheet(props: ResetVoteSheetProps) {
  const { open, onMinimize, vote, myUid, isHost, startingStack, nameOf, busy } = props;
  const now = useNow(250);
  const openedAt = vote.openedAt?.toMillis() ?? now;
  const t = tallyReset(vote.ballots, vote.voterUids, openedAt, now);
  const mine = vote.ballots[myUid]?.[0];
  const canVote = vote.voterUids.includes(myUid) && !t.passed && !t.failed;

  return (
    <BottomSheet open={open} onClose={onMinimize} title="Reset the room?">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ivory-muted">
          <span className="font-semibold text-ivory">{nameOf(vote.proposedBy)}</span> wants to put every stack back to{" "}
          <span className="font-semibold text-ivory tabular-nums">{formatChips(startingStack)}</span> and start a new
          season. This season&apos;s history and leaderboard are kept.
        </p>

        <div className="flex items-center gap-4">
          <CountdownRing remainingMs={t.passed || t.failed ? 0 : openedAt + vote.durationMs - now} totalMs={vote.durationMs} />
          <div className="flex-1">
            <div className="flex justify-between text-sm tabular-nums">
              <span>
                Yes <span className="font-bold text-gold-200">{t.yes}</span>
              </span>
              <span className="text-ivory-muted">needs {t.needed}</span>
              <span>
                No <span className="font-bold">{t.no}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ivory/10">
              <motion.div
                className="h-full rounded-full bg-gold-400"
                animate={{ width: `${(t.yes / vote.voterUids.length) * 100}%` }}
                transition={{ type: "spring", stiffness: 140, damping: 20 }}
              />
            </div>
            <p className="mt-1 text-xs text-ivory-muted">
              {Object.keys(vote.ballots).length} of {vote.voterUids.length} voted
            </p>
          </div>
        </div>

        {canVote && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mine === "no" ? "gold" : "felt"} size="lg" disabled={busy} onClick={() => props.onCast(false)}>
              {mine === "no" ? "No ✓" : "No, keep playing"}
            </Button>
            <Button variant={mine === "yes" ? "gold" : "felt"} size="lg" disabled={busy} onClick={() => props.onCast(true)}>
              {mine === "yes" ? "Yes ✓" : "Yes, reset"}
            </Button>
          </div>
        )}

        {t.passed &&
          (isHost ? (
            <Button size="lg" disabled={busy} onClick={props.onConfirm}>
              Confirm: reset every stack
            </Button>
          ) : (
            <p className="text-center text-sm text-gold-200">The table said yes. Waiting for the host to confirm…</p>
          ))}

        {t.failed && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-sm text-ivory-muted">Not enough yes votes. Stacks stay as they are.</p>
            <Button variant="felt" disabled={busy} onClick={props.onCloseFailed}>
              OK
            </Button>
          </div>
        )}

        {isHost && !t.failed && (
          <Button variant="ghost" disabled={busy} onClick={props.onCancel}>
            Call off the vote
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrownIcon } from "@/components/ui/icons";
import type { Hand } from "@/lib/hooks/useHand";
import type { GameMode } from "@/lib/room/settings";

interface HostHandBarProps {
  mode: GameMode;
  hand: Hand | null;
  /** Players who'd be dealt in (guided: seated with chips). */
  seatedCount: number;
  voteDecided: boolean;
  /** Guided: who we're waiting on, and whether they've gone (left, or quiet for 2+ minutes). */
  waitingOn: { name: string; absent: boolean } | null;
  /** Guided showdown: what the dealer still has to do. */
  showdownHint: string | null;
  busy: boolean;
  onStart: () => void;
  onShowdown: () => void;
  onShowVote: () => void;
  onFoldFor: () => void;
  onCancel: () => void;
}

/** The host's hand controls under the table. */
export function HostHandBar(props: HostHandBarProps) {
  const { mode, hand, seatedCount, voteDecided, waitingOn, showdownHint, busy } = props;
  const [confirmCancel, setConfirmCancel] = useState(false);

  let caption: string;
  let primary: React.ReactNode = null;
  if (!hand) {
    if (seatedCount < 2) {
      caption =
        mode === "guided"
          ? "Waiting for at least two seated players with chips."
          : "Waiting for at least two seated players.";
    } else {
      caption =
        mode === "guided"
          ? `${seatedCount} players will be dealt in. Blinds go in automatically.`
          : `${seatedCount} players will be dealt in.`;
    }
    primary = (
      <Button className="h-10" disabled={busy || seatedCount < 2} onClick={props.onStart}>
        {mode === "guided" ? "Deal hand" : "Start hand"}
      </Button>
    );
  } else if (hand.mode === "guided" && hand.status === "betting") {
    caption = waitingOn
      ? waitingOn.absent
        ? `${waitingOn.name} has gone quiet. You can fold their hand.`
        : `Waiting on ${waitingOn.name}.`
      : "Your move.";
    if (waitingOn?.absent) {
      primary = (
        <Button className="h-10" variant="felt" disabled={busy} onClick={props.onFoldFor}>
          Fold for {waitingOn.name}
        </Button>
      );
    }
  } else if (hand.status === "betting" || hand.status === "showdown") {
    caption = showdownHint ?? "When the cards are shown, call the vote.";
    primary = (
      <Button className="h-10" disabled={busy} onClick={props.onShowdown}>
        Showdown · vote
      </Button>
    );
  } else {
    caption = voteDecided ? "Votes are in. Confirm the winner." : "The table is voting…";
    primary = (
      <Button className="h-10" variant={voteDecided ? "gold" : "felt"} onClick={props.onShowVote}>
        {voteDecided ? "Review vote" : "Open vote"}
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t gold-hairline pt-3">
      <div className="flex items-center gap-2">
        <CrownIcon size={16} />
        <p className="flex-1 text-xs leading-snug text-ivory-muted">{caption}</p>
        {primary}
      </div>
      {hand && (
        <div className="flex justify-end">
          {confirmCancel ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                props.onCancel();
              }}
              className="h-7 rounded-lg bg-danger px-3 text-xs font-semibold text-white"
            >
              Tap again: call off{hand.mode === "wallet" ? " and refund" : ""}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="h-7 px-1 text-xs text-ivory-muted underline-offset-2 hover:text-ivory hover:underline"
            >
              Call off hand (misdeal)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CrownIcon } from "@/components/ui/icons";
import type { Hand } from "@/lib/hooks/useHand";
import type { GameMode } from "@/lib/room/settings";

interface HostHandBarProps {
  mode: GameMode;
  hand: Hand | null;
  seatedCount: number;
  voteDecided: boolean;
  busy: boolean;
  onStart: () => void;
  onShowdown: () => void;
  onShowVote: () => void;
  onCancel: () => void;
}

/** The host's hand controls under the table. */
export function HostHandBar(props: HostHandBarProps) {
  const { mode, hand, seatedCount, voteDecided, busy, onStart, onShowdown, onShowVote, onCancel } = props;
  const [confirmCancel, setConfirmCancel] = useState(false);

  let caption: string;
  let primary: React.ReactNode;
  if (!hand) {
    if (mode === "guided") {
      caption = "Guided mode is coming in a later update. Switch the room to Wallet in settings to play now.";
      primary = null;
    } else {
      caption = seatedCount < 2 ? "Waiting for at least two seated players." : `${seatedCount} players will be dealt in.`;
      primary = (
        <Button className="h-10" disabled={busy || seatedCount < 2} onClick={onStart}>
          Start hand
        </Button>
      );
    }
  } else if (hand.status === "betting") {
    caption = "When the cards are shown, call the vote.";
    primary = (
      <Button className="h-10" disabled={busy} onClick={onShowdown}>
        Showdown · vote
      </Button>
    );
  } else {
    caption = voteDecided ? "Votes are in. Confirm the winner." : "The table is voting…";
    primary = (
      <Button className="h-10" variant={voteDecided ? "gold" : "felt"} onClick={onShowVote}>
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
                onCancel();
              }}
              className="h-7 rounded-lg bg-danger px-3 text-xs font-semibold text-white"
            >
              Tap again: call off and refund
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

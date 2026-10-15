"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatChips } from "@/lib/chips";
import { legalActions, potTotal, type HandState, type PlayerAction } from "@/lib/engine";
import { raisePresets } from "@/lib/hand/guided";

interface GuidedControlsProps {
  state: HandState;
  uid: string;
  busy: boolean;
  onAct: (action: PlayerAction) => Promise<boolean>;
}

/**
 * Fold / Check or Call / Bet or Raise, for the player whose turn it is. Key it by the hand's
 * actionCount so the raise slider resets every turn.
 */
export function GuidedControls({ state, uid, busy, onAct }: GuidedControlsProps) {
  const legal = legalActions(state, uid);
  const me = state.players.find((p) => p.uid === uid)!;
  const presets = raisePresets(state, uid);
  const [raiseTo, setRaiseTo] = useState(() => legal.raise?.min ?? 0);
  const [confirmFold, setConfirmFold] = useState(false);

  const isBet = state.currentBet === 0;
  const raiseIsAllIn = !!legal.raise && raiseTo >= legal.raise.max;
  const pot = potTotal(state);

  function fold() {
    // Folding when you could check for free is almost always a slip: ask twice.
    if (legal.check && !confirmFold) {
      setConfirmFold(true);
      return;
    }
    void onAct({ type: "fold" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <motion.p
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-300"
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            Your turn
          </motion.p>
          <p className="text-gold text-2xl font-bold leading-none tabular-nums">{formatChips(me.stack)}</p>
        </div>
        <div className="text-right text-xs text-ivory-muted tabular-nums">
          <p>
            Pot <span className="font-semibold text-ivory">{formatChips(pot)}</span>
          </p>
          {legal.call !== null && (
            <p>
              To call <span className="font-semibold text-gold-200">{formatChips(legal.call)}</span>
            </p>
          )}
        </div>
      </div>

      {legal.raise && legal.raise.min < legal.raise.max && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Raise size">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy}
                onClick={() => setRaiseTo(p.to)}
                aria-pressed={raiseTo === p.to}
                className={`h-8 flex-1 rounded-full border text-[11px] font-semibold transition ${
                  raiseTo === p.to
                    ? "border-gold-400 bg-gold-400/15 text-gold-200"
                    : "gold-hairline bg-felt-950/50 text-ivory-muted hover:text-ivory"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={legal.raise.min}
              max={legal.raise.max}
              step={1}
              value={raiseTo}
              disabled={busy}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              aria-label={isBet ? "Bet amount" : "Raise to"}
              className="h-2 flex-1 cursor-pointer accent-gold-400"
            />
            <span className="w-16 text-right text-sm font-bold text-ivory tabular-nums">{formatChips(raiseTo)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {confirmFold ? (
          <button
            type="button"
            disabled={busy}
            onClick={fold}
            className="h-12 flex-1 rounded-xl bg-danger px-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            Fold anyway?
          </button>
        ) : (
          <Button variant="felt" className="h-12 flex-1" disabled={busy} onClick={fold}>
            Fold
          </Button>
        )}
        {legal.check ? (
          <Button variant="felt" className="h-12 flex-1" disabled={busy} onClick={() => onAct({ type: "check" })}>
            Check
          </Button>
        ) : (
          legal.call !== null && (
            <Button variant="felt" className="h-12 flex-1" disabled={busy} onClick={() => onAct({ type: "call" })}>
              {legal.callIsAllIn ? `All-in ${formatChips(legal.call)}` : `Call ${formatChips(legal.call)}`}
            </Button>
          )
        )}
        {legal.raise && (
          <Button
            className="h-12 flex-[1.4]"
            disabled={busy}
            onClick={() => onAct(raiseIsAllIn ? { type: "allIn" } : { type: "raise", to: raiseTo })}
          >
            {raiseIsAllIn
              ? `All-in ${formatChips(legal.raise.max)}`
              : isBet
                ? `Bet ${formatChips(raiseTo)}`
                : `Raise to ${formatChips(raiseTo)}`}
          </Button>
        )}
      </div>
    </div>
  );
}

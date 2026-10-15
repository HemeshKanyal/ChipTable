"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ChipPile } from "@/components/ui/ChipPile";
import { formatChips } from "@/lib/chips";

const QUICK_CHIPS = [5, 25, 100, 500];

interface WalletControlsProps {
  stack: number;
  /** Already in this pot. */
  inPot: number;
  busy: boolean;
  onBet: (amount: number) => Promise<boolean>;
}

/** Tap chips (or type) to build a bet, then push it in. */
export function WalletControls({ stack, inPot, busy, onBet }: WalletControlsProps) {
  const [text, setText] = useState("");
  const amount = /^\d+$/.test(text) ? Number(text) : 0;
  const tooMuch = amount > stack;

  const add = (value: number) => setText((t) => String(Math.min(stack, (/^\d+$/.test(t) ? Number(t) : 0) + value)));

  async function submit() {
    if (amount <= 0 || tooMuch) return;
    if (await onBet(amount)) setText("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ivory-muted">Your stack</p>
          <p className="text-gold text-2xl font-bold leading-none tabular-nums">{formatChips(stack)}</p>
          {inPot > 0 && <p className="mt-1 text-xs text-ivory-muted tabular-nums">{formatChips(inPot)} in the pot</p>}
        </div>
        <div className="flex h-12 items-end">{amount > 0 && <ChipPile amount={Math.min(amount, stack)} size={22} />}</div>
      </div>

      <div className="flex items-center justify-between gap-1">
        {QUICK_CHIPS.map((v) => (
          <motion.button
            key={v}
            type="button"
            whileTap={{ scale: 0.88, y: -4 }}
            disabled={busy || stack < v}
            onClick={() => add(v)}
            aria-label={`Add ${v}`}
            className="rounded-full drop-shadow-[0_3px_3px_rgb(0_0_0/0.5)] disabled:opacity-30"
          >
            <Chip value={v} size={46} />
          </motion.button>
        ))}
        <button
          type="button"
          disabled={busy || stack === 0}
          onClick={() => setText(String(stack))}
          className="h-11 rounded-full border border-gold-400/60 px-3 text-xs font-bold uppercase tracking-wider text-gold-200 hover:bg-gold-400/10 disabled:opacity-30"
        >
          All in
        </button>
      </div>

      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
          placeholder="Amount"
          aria-label="Bet amount"
          className={`h-12 w-0 min-w-0 flex-1 rounded-xl border bg-felt-950/60 px-4 text-lg font-semibold tabular-nums text-ivory outline-none placeholder:text-ivory-muted/40 focus:border-gold-400 ${
            tooMuch ? "border-danger" : "gold-hairline"
          }`}
        />
        {amount > 0 && (
          <Button variant="ghost" className="h-12" onClick={() => setText("")} disabled={busy}>
            Clear
          </Button>
        )}
        <Button className="h-12 min-w-28" onClick={submit} disabled={busy || amount <= 0 || tooMuch}>
          {tooMuch ? "Too much" : amount > 0 ? `Bet ${formatChips(amount)}` : "Bet"}
        </Button>
      </div>
    </div>
  );
}

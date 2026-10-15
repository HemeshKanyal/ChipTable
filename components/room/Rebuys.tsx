"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatChips } from "@/lib/chips";
import type { RebuyRecord } from "@/lib/stats/history";

interface RebuySheetProps {
  open: boolean;
  onClose: () => void;
  startingStack: number;
  stack: number;
  totalRebuys: number;
  /** My request waiting on the host, if any. */
  pending: RebuyRecord | null;
  busy: boolean;
  onRequest: (amount: number) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
}

/** Ask the host for more chips. */
export function RebuySheet(props: RebuySheetProps) {
  const { open, onClose, startingStack, stack, totalRebuys, pending, busy, onRequest, onCancel } = props;
  const [text, setText] = useState("");
  const amount = /^\d+$/.test(text) ? Number(text) : 0;
  // Top back up to a full starting stack, or a fresh one.
  const quick = [...new Set([startingStack - stack, Math.round(startingStack / 2), startingStack])].filter((n) => n > 0);

  return (
    <BottomSheet open={open} onClose={onClose} title="Rebuy">
      {pending ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-gold text-3xl font-bold tabular-nums">{formatChips(pending.amount)}</p>
          <p className="text-sm text-ivory-muted">Waiting for the host to approve…</p>
          <Button variant="ghost" disabled={busy} onClick={() => onCancel(pending.id)}>
            Cancel request
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ivory-muted">
            You have <span className="font-semibold text-ivory tabular-nums">{formatChips(stack)}</span>.
            {totalRebuys > 0 && (
              <>
                {" "}
                Rebuys so far: <span className="tabular-nums">{formatChips(totalRebuys)}</span>.
              </>
            )}{" "}
            Rebuys count against you on the leaderboard.
          </p>
          <div className="flex flex-wrap gap-2">
            {quick.map((n, i) => (
              <button
                key={n}
                type="button"
                onClick={() => setText(String(n))}
                aria-pressed={amount === n}
                className={`h-10 rounded-full border px-4 text-sm font-semibold tabular-nums ${
                  amount === n ? "border-gold-400 bg-gold-400/15 text-gold-200" : "gold-hairline text-ivory-muted"
                }`}
              >
                {i === 0 && n === startingStack - stack ? `Top up ${formatChips(n)}` : formatChips(n)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
              placeholder="Amount"
              aria-label="Rebuy amount"
              className="h-12 w-0 min-w-0 flex-1 rounded-xl border gold-hairline bg-felt-950/60 px-4 text-lg font-semibold tabular-nums text-ivory outline-none placeholder:text-ivory-muted/40 focus:border-gold-400"
            />
            <Button
              className="h-12 min-w-32"
              disabled={busy || amount <= 0}
              onClick={async () => {
                if (await onRequest(amount)) setText("");
              }}
            >
              {amount > 0 ? `Ask for ${formatChips(amount)}` : "Ask the host"}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

interface RebuyRequestsProps {
  requests: RebuyRecord[];
  nameOf: (uid: string) => string;
  busy: boolean;
  onDecide: (id: string, approve: boolean) => void;
}

/** Host: rebuy requests waiting for a yes or no. */
export function RebuyRequests({ requests, nameOf, busy, onDecide }: RebuyRequestsProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Rebuy requests">
      <AnimatePresence initial={false}>
        {requests.map((r) => (
          <motion.li
            key={r.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 rounded-xl border border-gold-400/40 bg-gold-400/8 px-3 py-2"
          >
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold">{nameOf(r.uid)}</span> asks for{" "}
              <span className="font-semibold text-gold-200 tabular-nums">{formatChips(r.amount)}</span>
            </p>
            <Button variant="ghost" className="h-8 px-3 text-xs" disabled={busy} onClick={() => onDecide(r.id, false)}>
              Deny
            </Button>
            <Button className="h-8 px-3 text-xs" disabled={busy} onClick={() => onDecide(r.id, true)}>
              Approve
            </Button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

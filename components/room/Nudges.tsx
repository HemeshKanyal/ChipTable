"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { NUDGE_PRESETS } from "@/lib/hand/guided";
import { vibrate } from "@/lib/sound";

interface NudgeSheetProps {
  open: boolean;
  onClose: () => void;
  targetName: string;
  busy: boolean;
  onSend: (preset: number) => Promise<boolean>;
}

/** Pick a tease for whoever's taking their time. */
export function NudgeSheet({ open, onClose, targetName, busy, onSend }: NudgeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Nudge ${targetName}`}>
      <div className="grid grid-cols-2 gap-2">
        {NUDGE_PRESETS.map((text, i) => (
          <motion.button
            key={text}
            type="button"
            whileTap={{ scale: 0.95 }}
            disabled={busy}
            onClick={async () => {
              if (await onSend(i)) onClose();
            }}
            className="min-h-14 rounded-2xl border gold-hairline bg-felt-950/50 px-3 py-2 text-left text-sm font-semibold text-ivory hover:border-gold-400/60 disabled:opacity-45"
          >
            {text}
          </motion.button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-ivory-muted">One nudge every 15 seconds. Be nice-ish.</p>
    </BottomSheet>
  );
}

interface ShownNudge {
  id: number;
  from: string;
  text: string;
}

/** The nudges aimed at you: a bouncy, shaking toast plus a buzz. */
export function useNudgeToasts() {
  const [shown, setShown] = useState<ShownNudge[]>([]);
  const show = useCallback((from: string, preset: number) => {
    const id = Date.now() + Math.random();
    setShown((s) => [...s.slice(-1), { id, from, text: NUDGE_PRESETS[preset] ?? "👋 Your turn" }]);
    setTimeout(() => setShown((s) => s.filter((n) => n.id !== id)), 4_000);
    vibrate([120, 60, 120, 60, 200]);
  }, []);
  return { shown, show };
}

export function NudgeToasts({ shown }: { shown: ShownNudge[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {shown.map((n) => (
          <motion.div
            key={n.id}
            role="alert"
            initial={{ opacity: 0, y: -40, scale: 0.6 }}
            animate={
              reduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 1, y: 0, scale: 1, rotate: [0, -6, 6, -5, 5, -3, 3, 0] }
            }
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{
              type: "spring",
              stiffness: 520,
              damping: 14,
              rotate: { duration: 0.6, delay: 0.15, ease: "easeInOut" },
            }}
            className="max-w-sm rounded-2xl border-2 border-gold-400 bg-felt-900/95 px-5 py-3 text-center shadow-gold-glow backdrop-blur"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300">{n.from} nudged you</p>
            <p className="font-serif text-lg font-bold text-ivory">{n.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

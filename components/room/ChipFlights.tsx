"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { breakdownChips } from "@/lib/chips";
import type { Hand } from "@/lib/hooks/useHand";

export interface Point {
  x: number;
  y: number;
}

interface Flight {
  id: string;
  from: Point;
  to: Point;
  value: number;
  delay: number;
}

interface Burst {
  id: string;
  at: Point;
  delay: number;
}

const CENTER: Point = { x: 50, y: 50 };
const topChip = (amount: number) => breakdownChips(Math.max(1, amount))[0].denomination.value;

/**
 * Animates what changed in the hand since the last render: chips flying seat → pot for each
 * new bet, and pot → winners (with a sparkle) when the hand is paid out.
 */
export function ChipFlights({ hand, seatOf }: { hand: Hand | null; seatOf: (uid: string) => Point | null }) {
  const reduceMotion = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const seen = useRef<{ handId: string; actions: number; status: string } | null>(null);
  const seatOfRef = useRef(seatOf);

  useEffect(() => {
    seatOfRef.current = seatOf;
  });

  useEffect(() => {
    if (!hand) return;
    const prev = seen.current;
    seen.current = { handId: hand.id, actions: hand.actions.length, status: hand.status };
    // The first time we see a hand there's nothing to animate from.
    if (!prev || prev.handId !== hand.id || reduceMotion) return;

    const newFlights: Flight[] = [];
    const newBursts: Burst[] = [];
    hand.actions.slice(prev.actions).forEach((a, i) => {
      const from = seatOfRef.current(a.uid);
      if (from) {
        newFlights.push({ id: `${hand.id}-bet-${prev.actions + i}`, from, to: CENTER, value: topChip(a.amount), delay: 0 });
      }
    });
    if (prev.status !== "complete" && hand.status === "complete" && hand.result) {
      hand.result.winners.forEach((uid, w) => {
        const to = seatOfRef.current(uid);
        const amount = hand.result!.payouts[uid] ?? 0;
        if (!to || amount <= 0) return;
        for (let c = 0; c < 5; c++) {
          newFlights.push({
            id: `${hand.id}-win-${uid}-${c}`,
            from: CENTER,
            to,
            value: topChip(amount),
            delay: 0.15 + w * 0.12 + c * 0.07,
          });
        }
        newBursts.push({ id: `${hand.id}-burst-${uid}`, at: to, delay: 0.65 + w * 0.12 });
      });
    }
    if (!newFlights.length && !newBursts.length) return;
    // Scheduled so the state update happens outside the effect body.
    const raf = requestAnimationFrame(() => {
      setFlights((f) => [...f, ...newFlights]);
      setBursts((b) => [...b, ...newBursts]);
    });
    return () => cancelAnimationFrame(raf);
  }, [hand, reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      {flights.map((f) => (
        <motion.div
          key={f.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_4px_4px_rgb(0_0_0/0.6)]"
          initial={{ left: `${f.from.x}%`, top: `${f.from.y}%`, scale: 0.9, opacity: 1 }}
          animate={{ left: `${f.to.x}%`, top: `${f.to.y}%`, scale: 0.75, opacity: [1, 1, 0] }}
          transition={{ duration: 0.6, delay: f.delay, ease: [0.3, 0.7, 0.4, 1], opacity: { times: [0, 0.85, 1], duration: 0.6, delay: f.delay } }}
          onAnimationComplete={() => setFlights((all) => all.filter((x) => x.id !== f.id))}
        >
          <Chip value={f.value} size={26} plain />
        </motion.div>
      ))}
      {bursts.map((b) => (
        <div key={b.id} className="absolute" style={{ left: `${b.at.x}%`, top: `${b.at.y}%` }}>
          {Array.from({ length: 10 }, (_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                className="absolute h-1.5 w-1.5 rounded-full bg-gold-300 shadow-[0_0_6px_var(--color-gold-300)]"
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                animate={{ x: Math.cos(angle) * 38, y: Math.sin(angle) * 38, opacity: [0, 1, 0], scale: [0.5, 1.2, 0.4] }}
                transition={{ duration: 0.9, delay: b.delay, ease: "easeOut" }}
                onAnimationComplete={
                  i === 0 ? () => setBursts((all) => all.filter((x) => x.id !== b.id)) : undefined
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

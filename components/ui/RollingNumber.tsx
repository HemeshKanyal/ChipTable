"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import { formatChips } from "@/lib/chips";

/** A chip count that rolls smoothly to its new value (or jumps, with reduced motion). */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => formatChips(Math.round(v)));
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    // Imperative animate() doesn't read MotionConfig, so honour the setting here.
    if (reduceMotion) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value, reduceMotion]);
  return <motion.span className={className}>{text}</motion.span>;
}

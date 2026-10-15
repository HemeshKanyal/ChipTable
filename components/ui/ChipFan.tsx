"use client";

import { motion } from "framer-motion";
import { DENOMINATIONS } from "@/lib/chips";
import { Chip } from "./Chip";

/** The six denominations fanned out in an arc; drops in on mount. */
export function ChipFan({ size = 56 }: { size?: number }) {
  const chips = [...DENOMINATIONS].reverse();
  const mid = (chips.length - 1) / 2;
  return (
    <div className="flex items-end justify-center" style={{ height: size * 1.35 }}>
      {chips.map((d, i) => {
        const offset = i - mid;
        return (
          <motion.div
            key={d.value}
            initial={{ y: -40, opacity: 0, rotate: offset * 20 }}
            animate={{ y: Math.abs(offset) * 6, opacity: 1, rotate: offset * 7 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.08 * i }}
            style={{ marginLeft: i === 0 ? 0 : -size * 0.28, zIndex: i }}
            className="drop-shadow-[0_6px_6px_rgb(0_0_0/0.55)]"
          >
            <Chip value={d.value} size={size} />
          </motion.div>
        );
      })}
    </div>
  );
}

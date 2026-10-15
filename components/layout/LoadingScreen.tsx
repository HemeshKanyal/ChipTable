"use client";

import { motion } from "framer-motion";
import { Chip } from "@/components/ui/Chip";

export function LoadingScreen({ label = "Shuffling up…" }: { label?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5" aria-busy>
      <motion.div
        animate={{ rotateY: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        className="drop-shadow-[0_8px_8px_rgb(0_0_0/0.6)]"
      >
        <Chip value={100} size={64} />
      </motion.div>
      <p className="text-sm tracking-wide text-ivory-muted">{label}</p>
    </main>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-rail-900/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-gold-200 shadow-lg"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
          Reconnecting… your chips are safe.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

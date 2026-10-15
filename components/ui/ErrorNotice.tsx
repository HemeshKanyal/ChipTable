"use client";

import { AnimatePresence, motion } from "framer-motion";

export function ErrorNotice({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory"
        >
          <span className="flex-1">{message}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-m-1 rounded p-1 text-ivory-muted hover:text-ivory"
            >
              ✕
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

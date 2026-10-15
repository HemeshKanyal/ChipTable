"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAuth, useSignedInUser } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";

export function UserMenu() {
  const user = useSignedInUser();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const name = user.displayName ?? "Player";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full"
      >
        <Avatar name={name} photoURL={user.photoURL} size={36} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-12 z-40 w-60 origin-top-right overflow-hidden rounded-2xl border gold-hairline bg-felt-900/95 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center gap-3 border-b gold-hairline px-4 py-3">
              <Avatar name={name} photoURL={user.photoURL} size={40} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                {user.email && <p className="truncate text-xs text-ivory-muted">{user.email}</p>}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="w-full px-4 py-3 text-left text-sm text-ivory-muted hover:bg-white/5 hover:text-ivory"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

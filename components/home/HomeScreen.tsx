"use client";

import { motion } from "framer-motion";
import { useAuth, useSignedInUser } from "@/components/auth/AuthProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

function greeting(hour: number) {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const user = useSignedInUser();
  const { error, clearError } = useAuth();
  const firstName = (user.displayName ?? "Player").split(" ")[0];

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
        <ErrorNotice message={error} onDismiss={clearError} />

        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-sm text-ivory-muted" suppressHydrationWarning>
            {greeting(new Date().getHours())},
          </p>
          <h1 className="text-gold text-3xl font-bold">{firstName}</h1>
        </motion.section>

        {/* Create New Room */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rail rounded-[1.75rem] p-2"
        >
          <div className="felt relative overflow-hidden rounded-[1.35rem] px-5 py-6">
            <div className="vignette pointer-events-none absolute inset-0" />
            <div className="relative flex items-center gap-4">
              <div className="flex shrink-0 -space-x-5">
                <Chip value={5} size={44} />
                <Chip value={25} size={44} />
                <Chip value={100} size={44} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-ivory">Create New Room</h2>
                <p className="text-sm text-ivory-muted">Name it, set blinds and stacks, invite friends.</p>
              </div>
            </div>
            <Button size="lg" className="relative mt-5 w-full" disabled>
              Create room
            </Button>
            <p className="relative mt-2 text-center text-xs text-ivory-muted/70">Coming in Phase 2</p>
          </div>
        </motion.section>

        {/* My Rooms */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          aria-labelledby="my-rooms"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="my-rooms" className="text-xl font-bold text-ivory">
              My Rooms
            </h2>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed gold-hairline bg-felt-900/40 px-6 py-10 text-center">
            <span className="text-2xl text-gold-500/70" aria-hidden>
              ♠
            </span>
            <p className="font-semibold">No rooms yet</p>
            <p className="max-w-xs text-sm text-ivory-muted">
              Rooms you create or join will show up here with when you last played.
            </p>
          </div>
        </motion.section>
      </main>
    </>
  );
}

"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ChipFan } from "@/components/ui/ChipFan";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { useAuth } from "./AuthProvider";

export function SignInScreen() {
  const { signInWithGoogle, signingIn, error, clearError } = useAuth();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <ChipFan size={58} />

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-gold mt-8 text-5xl font-bold tracking-tight"
        >
          ChipTable
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-3 max-w-xs text-balance text-ivory-muted"
        >
          Real cards on the table. Digital chips in your pocket.
        </motion.p>

        <div className="mt-6 flex items-center gap-3 text-gold-500/70" aria-hidden>
          <span className="h-px w-10 bg-current" />
          <span className="text-xs">♠ ♥ ♣ ♦</span>
          <span className="h-px w-10 bg-current" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <ErrorNotice message={error} onDismiss={clearError} />
        <Button size="lg" onClick={signInWithGoogle} disabled={signingIn} className="w-full">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
            <GoogleIcon size={18} />
          </span>
          {signingIn ? "Signing in…" : "Continue with Google"}
        </Button>
        <p className="text-center text-xs text-ivory-muted/70">
          Play chips only. No real money, ever.
        </p>
      </div>
    </main>
  );
}

"use client";

import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SoundProvider } from "@/components/SoundProvider";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <SoundProvider>
          <ToastProvider>
            <ConnectionBanner />
            {children}
          </ToastProvider>
        </SoundProvider>
      </AuthProvider>
    </MotionConfig>
  );
}

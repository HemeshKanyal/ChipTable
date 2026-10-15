"use client";

import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ConnectionBanner />
        {children}
      </AuthProvider>
    </MotionConfig>
  );
}

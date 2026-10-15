"use client";

import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <ConnectionBanner />
          {children}
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}

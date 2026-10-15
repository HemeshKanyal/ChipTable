"use client";

import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { useAuth } from "./AuthProvider";
import { SignInScreen } from "./SignInScreen";

/** Renders children only for signed-in users; otherwise shows the sign-in screen. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  switch (status.kind) {
    case "loading":
      return <LoadingScreen />;
    case "configError":
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-gold text-2xl font-bold">Table not set up</h1>
          <p className="text-sm text-ivory-muted">{status.message}</p>
        </main>
      );
    case "signedOut":
      return <SignInScreen />;
    case "signedIn":
      return <>{children}</>;
  }
}

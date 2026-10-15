"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSignedInUser } from "@/components/auth/AuthProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { Button } from "@/components/ui/Button";
import { ChipFan } from "@/components/ui/ChipFan";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { TextInput } from "@/components/ui/Field";
import { LockIcon } from "@/components/ui/icons";
import { getFirebase } from "@/lib/firebase/client";
import { RoomError, enterRoom, isMember, joinRoom, lookupCode } from "@/lib/firebase/rooms";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/room/code";
import type { CodeDoc } from "@/lib/types";

type State =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; info: CodeDoc };

export function JoinScreen({ rawCode }: { rawCode: string }) {
  const user = useSignedInUser();
  const router = useRouter();
  const code = normalizeJoinCode(decodeURIComponent(rawCode));
  const valid = isValidJoinCode(code);
  const [state, setState] = useState<State>(valid ? { kind: "checking" } : { kind: "invalid" });
  const [password, setPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const { db } = getFirebase();
    (async () => {
      const info = await lookupCode(db, code);
      if (cancelled) return;
      if (!info) return setState({ kind: "notFound" });
      // Already a member: no need to ask again, just sit back down.
      if (await isMember(db, info.roomId, user.uid)) {
        await enterRoom(db, user, info.roomId);
        if (!cancelled) router.replace(`/room/${info.roomId}`);
        return;
      }
      setState({ kind: "ready", info });
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setState({ kind: "error", message: "Couldn't look up that code. Check your connection." });
    });
    return () => {
      cancelled = true;
    };
  }, [code, valid, user, router]);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready") return;
    setJoining(true);
    setJoinError(null);
    try {
      const roomId = await joinRoom(getFirebase().db, user, code, state.info, password);
      router.replace(`/room/${roomId}`);
    } catch (err) {
      setJoinError(err instanceof RoomError ? err.message : "Couldn't join. Please try again.");
      setJoining(false);
    }
  }

  if (state.kind === "checking") return <LoadingScreen label="Finding your table…" />;

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-col items-center px-6 pb-10 pt-10 text-center">
        <ChipFan size={44} />

        {state.kind === "ready" ? (
          <form onSubmit={onJoin} className="mt-6 flex w-full flex-col items-center gap-4">
            <p className="text-sm text-ivory-muted">You&apos;re invited to</p>
            <h1 className="text-gold -mt-3 text-4xl font-bold">{state.info.name}</h1>
            <p className="rounded-full border gold-hairline px-3 py-1 font-mono text-sm tracking-[0.3em] text-gold-200">
              {code}
            </p>

            {state.info.hasPassword && (
              <div className="w-full text-left">
                <label htmlFor="join-password" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-300/80">
                  <LockIcon size={13} /> Password
                </label>
                <TextInput
                  id="join-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ask the host"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            )}

            <div className="w-full">
              <ErrorNotice message={joinError} onDismiss={() => setJoinError(null)} />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={joining || (state.info.hasPassword && !password)}
            >
              {joining ? "Pulling up a chair…" : "Join the table"}
            </Button>
          </form>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold text-ivory">
              {state.kind === "invalid" && "That code doesn't look right"}
              {state.kind === "notFound" && "No table with that code"}
              {state.kind === "error" && "Something went wrong"}
            </h1>
            <p className="max-w-xs text-sm text-ivory-muted">
              {state.kind === "error"
                ? state.message
                : "Codes are 6 letters and numbers, like K7Q2MX. Double-check with the host."}
            </p>
            <Link href="/" className="mt-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
              Back home
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

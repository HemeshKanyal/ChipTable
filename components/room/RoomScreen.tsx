"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSignedInUser } from "@/components/auth/AuthProvider";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { Button } from "@/components/ui/Button";
import { ChipPile } from "@/components/ui/ChipPile";
import { ArrowLeftIcon, CrownIcon, SettingsIcon, ShareIcon, UsersIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { formatChips } from "@/lib/chips";
import { getFirebase } from "@/lib/firebase/client";
import {
  RoomError,
  enterRoom,
  kickPlayer,
  leaveTable,
  setHost,
  setSittingOut,
  takeSeat,
  toPresence,
} from "@/lib/firebase/rooms";
import { useNow } from "@/lib/hooks/useNow";
import { useHostWatch, usePresence } from "@/lib/hooks/usePresence";
import { useRoom, type Room } from "@/lib/hooks/useRoom";
import { firstFreeSeat } from "@/lib/room/seating";
import type { PlayerDoc } from "@/lib/types";
import { InviteSheet } from "./InviteSheet";
import { PlayersSheet } from "./PlayersSheet";
import { PokerTable } from "./PokerTable";
import { SettingsSheet } from "./SettingsSheet";

export function RoomScreen({ roomId, openInvite }: { roomId: string; openInvite: boolean }) {
  const state = useRoom(roomId);

  switch (state.kind) {
    case "loading":
      return <LoadingScreen label="Pulling up the table…" />;
    case "forbidden":
      return (
        <Message title="You're not at this table">
          Ask the host for the join code or link, then join from the home screen.
        </Message>
      );
    case "error":
      return <Message title="Couldn't load the room">{state.message}</Message>;
    case "ready":
      return <RoomView room={state.room} players={state.players} openInvite={openInvite} />;
  }
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-3xl text-gold-500/70" aria-hidden>
        ♣
      </span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-ivory-muted">{children}</p>
      <Link href="/" className="mt-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
        Back home
      </Link>
    </main>
  );
}

type Sheet = "invite" | "players" | "settings" | null;

function RoomView({ room, players, openInvite }: { room: Room; players: PlayerDoc[]; openInvite: boolean }) {
  const user = useSignedInUser();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(10_000);
  const [sheet, setSheet] = useState<Sheet>(openInvite ? "invite" : null);
  const [busy, setBusy] = useState(false);

  const me = players.find((p) => p.uid === user.uid);
  const isHost = room.hostUid === user.uid;
  const presence = useMemo(() => players.map(toPresence), [players]);
  const seatedCount = Object.keys(room.seats).length;
  const tableFull = firstFreeSeat(room.seats, room.settings.maxPlayers) === null;

  usePresence(room.id, user.uid, !!me);
  useHostWatch(room.id, room.hostUid, room.settings.maxPlayers, presence, user.uid, now);

  // Drop ?invite=1 so a refresh doesn't pop the sheet again.
  useEffect(() => {
    if (openInvite) router.replace(`/room/${room.id}`, { scroll: false });
  }, [openInvite, room.id, router]);

  // Announce host changes.
  const prevHost = useRef(room.hostUid);
  useEffect(() => {
    if (prevHost.current === room.hostUid) return;
    prevHost.current = room.hostUid;
    const name = players.find((p) => p.uid === room.hostUid)?.displayName ?? "Someone";
    toast(room.hostUid === user.uid ? "You're the host now 👑" : `${name} is now the host`);
  }, [room.hostUid, players, user.uid, toast]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(label, err);
      toast(err instanceof RoomError ? err.message : `Couldn't ${label}. Try again.`, "error");
    } finally {
      setBusy(false);
    }
  }

  const { db } = getFirebase();
  const onSit = (seatIndex: number) =>
    act("take that seat", () => (me ? takeSeat(db, room.id, user.uid, seatIndex) : enterRoom(db, user, room.id)));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b gold-hairline bg-felt-950/70 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-2 px-2">
          <Link href="/" aria-label="Home" className="flex h-10 w-10 items-center justify-center rounded-full text-ivory-muted hover:bg-white/5 hover:text-ivory">
            <ArrowLeftIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{room.name}</h1>
            <button
              type="button"
              onClick={() => setSheet("invite")}
              className="font-mono text-xs tracking-[0.2em] text-gold-300/80 hover:text-gold-200"
            >
              {room.code}
            </button>
          </div>
          <IconButton label="Invite" onClick={() => setSheet("invite")}>
            <ShareIcon />
          </IconButton>
          <IconButton label="Players" onClick={() => setSheet("players")}>
            <UsersIcon />
          </IconButton>
          {isHost && (
            <IconButton label="Room settings" onClick={() => setSheet("settings")}>
              <SettingsIcon />
            </IconButton>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-center gap-1.5 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider">
        <Pill>{room.settings.mode === "guided" ? "Guided" : "Wallet"}</Pill>
        <Pill>
          Blinds <span className="tabular-nums">{room.settings.sb}/{room.settings.bb}</span>
        </Pill>
        <Pill>
          <span className="tabular-nums">
            {seatedCount}/{room.settings.maxPlayers}
          </span>{" "}
          seated
        </Pill>
      </div>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-2 py-2">
        <PokerTable room={room} players={players} myUid={user.uid} now={now} onSit={onSit} />
      </main>

      <section className="sticky bottom-0 z-20 border-t gold-hairline bg-felt-950/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {!me || me.status === "left" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{me ? "You're on the rail" : "Welcome to the table"}</p>
                <p className="text-xs text-ivory-muted">
                  {tableFull
                    ? "Every seat is taken. One will open up when someone leaves."
                    : "Tap an open seat to sit down."}
                </p>
              </div>
              {me && <span className="text-sm font-semibold text-gold-300 tabular-nums">{formatChips(me.stack)}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-ivory-muted">Your stack</p>
                <p className="text-gold text-2xl font-bold tabular-nums">{formatChips(me.stack)}</p>
              </div>
              <ChipPile amount={me.stack} size={22} />
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="felt"
                  className="h-9"
                  disabled={busy}
                  onClick={() =>
                    act("change your status", () => setSittingOut(db, room.id, user.uid, me.status === "seated"))
                  }
                >
                  {me.status === "seated" ? "Sit out" : "I'm back"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => act("leave the table", () => leaveTable(db, room.id, user.uid, presence, Date.now()))}
                >
                  Leave table
                </Button>
              </div>
            </div>
          )}

          {isHost && (
            <div className="mt-3 flex items-center gap-2 border-t gold-hairline pt-3">
              <CrownIcon size={16} />
              <p className="flex-1 text-xs text-ivory-muted">You&apos;re the host. Dealing hands arrives in the next update.</p>
              <Button disabled className="h-9">
                Start hand
              </Button>
            </div>
          )}
        </div>
      </section>

      <InviteSheet
        open={sheet === "invite"}
        onClose={() => setSheet(null)}
        roomName={room.name}
        code={room.code}
        hasPassword={room.hasPassword}
      />
      <PlayersSheet
        open={sheet === "players"}
        onClose={() => setSheet(null)}
        players={players}
        hostUid={room.hostUid}
        myUid={user.uid}
        now={now}
        onMakeHost={(uid) => act("hand over hosting", () => setHost(db, room.id, uid, user.uid))}
        onKick={(uid) => act("remove that player", () => kickPlayer(db, room.id, uid))}
      />
      {isHost && <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} room={room} />}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ivory-muted hover:bg-white/5 hover:text-ivory"
    >
      {children}
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border gold-hairline bg-felt-900/60 px-2.5 py-1 text-ivory-muted">{children}</span>;
}

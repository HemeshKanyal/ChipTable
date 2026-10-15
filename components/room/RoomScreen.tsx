"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSignedInUser } from "@/components/auth/AuthProvider";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { Button } from "@/components/ui/Button";
import { ChipPile } from "@/components/ui/ChipPile";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { ArrowLeftIcon, HistoryIcon, SettingsIcon, ShareIcon, UsersIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { formatChips } from "@/lib/chips";
import type { PlayerAction } from "@/lib/engine";
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
import {
  acceptVote,
  cancelHand,
  castBallot,
  contribute,
  openWinnerVote,
  redoVote,
  startWalletHand,
} from "@/lib/firebase/hands";
import {
  acceptPotVote,
  openPotVotes,
  redoPotVote,
  sendNudge,
  startGuidedHand,
  takeAction,
} from "@/lib/firebase/guided";
import { cancelRebuy, decideRebuy, requestRebuy } from "@/lib/firebase/rebuys";
import { cancelReset, closeFailedReset, confirmReset, proposeReset } from "@/lib/firebase/seasons";
import { NUDGE_COOLDOWN_MS, streetBanner } from "@/lib/hand/guided";
import { usePendingRebuys, useResetVote } from "@/lib/hooks/useHistory";
import { tallyReset } from "@/lib/vote/reset";
import { useHand, useVotes } from "@/lib/hooks/useHand";
import { useNow } from "@/lib/hooks/useNow";
import { useNudges } from "@/lib/hooks/useNudges";
import { useHostWatch, usePresence } from "@/lib/hooks/usePresence";
import { useRoom, type Room } from "@/lib/hooks/useRoom";
import { HOST_TIMEOUT_MS, firstFreeSeat } from "@/lib/room/seating";
import { voteIsDecided } from "@/lib/vote/tally";
import type { PlayerDoc } from "@/lib/types";
import { GuidedControls } from "./GuidedControls";
import { HostHandBar } from "./HostHandBar";
import { InviteSheet } from "./InviteSheet";
import { NudgeSheet, NudgeToasts, useNudgeToasts } from "./Nudges";
import { PlayersSheet } from "./PlayersSheet";
import { PokerTable } from "./PokerTable";
import { RebuyRequests, RebuySheet } from "./Rebuys";
import { ResetVoteSheet } from "./ResetVoteSheet";
import { SettingsSheet } from "./SettingsSheet";
import { VoteSheet, type PotVote } from "./VoteSheet";
import { WalletControls } from "./WalletControls";

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

type Sheet = "invite" | "players" | "settings" | "nudge" | "rebuy" | null;

function RoomView({ room, players, openInvite }: { room: Room; players: PlayerDoc[]; openInvite: boolean }) {
  const user = useSignedInUser();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(10_000);
  const [sheet, setSheet] = useState<Sheet>(openInvite ? "invite" : null);
  const [busy, setBusy] = useState(false);

  // The hand in progress, or else the last one (for its result and the payout animation).
  const hand = useHand(room.id, room.currentHandId ?? room.lastHandId ?? null);
  const liveHand = hand && room.currentHandId === hand.id ? hand : null;
  const guided = liveHand?.mode === "guided" ? liveHand : null;
  const engine = guided?.engine ?? null;

  // Winner votes: one for a wallet hand, one per contested pot at a guided showdown.
  const voteIds = liveHand?.status === "voting" ? (liveHand.mode === "wallet" ? [liveHand.voteId] : liveHand.voteIds) : [];
  const votes = useVotes(room.id, voteIds);
  const voteKey = voteIds.join(",");
  const potVotes: PotVote[] = liveHand
    ? votes.flatMap((vote, i) => {
        if (!vote) return [];
        const multi = !!guided && guided.pots.length > 1;
        return [
          {
            vote,
            label: multi ? (i === 0 ? "Main pot" : `Side pot ${i}`) : null,
            amount: guided ? guided.pots[i].amount : liveHand.pot,
          },
        ];
      })
    : [];
  const openVotes = potVotes.filter((p) => p.vote.status === "open");
  const [voteMinimized, setVoteMinimized] = useState<string | null>(null);
  const voteOpen = openVotes.length > 0 && voteMinimized !== voteKey;
  const votesDecided =
    openVotes.length > 0 &&
    openVotes.every(({ vote }) => voteIsDecided(vote.openedAt?.toMillis() ?? now, vote.ballots, vote.voterUids, now));

  const me = players.find((p) => p.uid === user.uid);
  const isHost = room.hostUid === user.uid;
  const presence = useMemo(() => players.map(toPresence), [players]);
  const seatedCount = Object.keys(room.seats).length;
  const tableFull = firstFreeSeat(room.seats, room.settings.maxPlayers) === null;
  const firstName = (uid: string) => players.find((p) => p.uid === uid)?.displayName.split(" ")[0] ?? "Someone";

  // Guided: where I stand in the hand, and who we're waiting on.
  const myEngine = engine?.players.find((p) => p.uid === user.uid) ?? null;
  const stillInHand = !!myEngine && !myEngine.folded;
  const myTurn = guided?.status === "betting" && guided.toActUid === user.uid;
  const toActUid = guided?.status === "betting" ? guided.toActUid : null;
  const toActPlayer = toActUid ? players.find((p) => p.uid === toActUid) : undefined;
  const toActAbsent =
    !!toActUid &&
    (!toActPlayer ||
      toActPlayer.status === "left" ||
      now - (toActPlayer.lastSeen?.toMillis() ?? 0) > HOST_TIMEOUT_MS);

  usePresence(room.id, user.uid, !!me);
  useHostWatch(room.id, room.hostUid, room.settings.maxPlayers, presence, user.uid, now);

  // Rebuys: mine waiting on the host, and (for the host) everyone's.
  const pendingRebuys = usePendingRebuys(room.id);
  const myRebuy = pendingRebuys.find((r) => r.uid === user.uid) ?? null;
  const seenRequests = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(pendingRebuys.map((r) => r.id));
    const seen = seenRequests.current;
    seenRequests.current = ids;
    if (!isHost || !seen) return;
    for (const r of pendingRebuys) {
      if (!seen.has(r.id) && r.uid !== user.uid) toast(`${firstName(r.uid)} asks for ${formatChips(r.amount)} chips`);
    }
    // firstName reads `players`; announcing only needs the request list to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRebuys, isHost, user.uid, toast]);

  // Room reset vote.
  const resetVote = useResetVote(room.id, room.resetVoteId ?? null);
  const [resetMinimized, setResetMinimized] = useState<string | null>(null);
  const resetOpen = resetVote?.status === "open" ? resetVote : null;
  const resetStuck =
    !!resetOpen &&
    tallyReset(resetOpen.ballots, resetOpen.voterUids, resetOpen.openedAt?.toMillis() ?? now, now).failed;
  const canProposeReset = me?.seatIndex != null && !room.currentHandId && (!resetOpen || resetStuck);

  // Nudges aimed at me, and my own cooldown for sending them.
  const nudgeToasts = useNudgeToasts();
  useNudges(room.id, user.uid, (n) => nudgeToasts.show(firstName(n.from), n.preset));
  const [nudgeCooling, setNudgeCooling] = useState(false);

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

  // Announce how a hand ended, but only when we watched it end (not on arrival).
  const lastSeenHand = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!hand) return;
    const prev = lastSeenHand.current;
    lastSeenHand.current = { id: hand.id, status: hand.status };
    const wasLive = prev?.id === hand.id && prev.status !== "complete" && prev.status !== "cancelled";
    if (!wasLive || !hand.result || (hand.status !== "complete" && hand.status !== "cancelled")) return;

    const { winners, payouts, decidedBy } = hand.result;
    const name = (uid: string) =>
      uid === user.uid ? "You" : (players.find((p) => p.uid === uid)?.displayName.split(" ")[0] ?? "Someone");
    if (decidedBy === "cancelled") {
      toast(hand.mode === "wallet" ? "Hand called off. Everyone got their chips back." : "Hand called off. Stacks are back where they were.");
    } else if ((hand.result.pots?.length ?? 0) > 1) {
      // Different pots, different winners: not a split.
      toast(`Pots paid: ${winners.map((w) => `${name(w)} ${formatChips(payouts[w])}`).join(" · ")} 🎉`, "success");
    } else if (winners.length === 1) {
      toast(`${name(winners[0])} ${winners[0] === user.uid ? "win" : "wins"} ${formatChips(payouts[winners[0]])}! 🎉`, "success");
    } else {
      toast(`Split pot: ${winners.map((w) => `${name(w)} ${formatChips(payouts[w])}`).join(" · ")}`, "success");
    }
  }, [hand, players, user.uid, toast]);

  async function act(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      console.error(label, err);
      toast(err instanceof RoomError ? err.message : `Couldn't ${label}. Try again.`, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { db } = getFirebase();
  const onSit = (seatIndex: number) =>
    act("take that seat", () => (me ? takeSeat(db, room.id, user.uid, seatIndex) : enterRoom(db, user, room.id)));
  const onGuidedAct = (action: PlayerAction) =>
    act("make that move", () => takeAction(db, room.id, guided!.id, user.uid, action, guided!.actionCount));
  async function onNudge(preset: number) {
    if (!toActUid) return false;
    const sent = await act("nudge", () => sendNudge(db, room.id, user.uid, toActUid, preset));
    if (sent) {
      toast(`Nudged ${firstName(toActUid)}`);
      setNudgeCooling(true);
      setTimeout(() => setNudgeCooling(false), NUDGE_COOLDOWN_MS);
    }
    return sent;
  }

  // Chips I have behind right now: in a guided hand the stack only settles when it ends.
  const myStack = myEngine?.stack ?? me?.stack ?? 0;
  // Can't walk away from chips in the middle.
  const lockedIn =
    !!liveHand &&
    me?.status === "seated" &&
    (liveHand.mode === "wallet" ? (liveHand.contributions[user.uid] ?? 0) > 0 : stillInHand);

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
          <Link
            href={`/room/${room.id}/history`}
            aria-label="History and leaderboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ivory-muted hover:bg-white/5 hover:text-ivory"
          >
            <HistoryIcon />
          </Link>
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
        <Pill>{(liveHand?.mode ?? room.settings.mode) === "guided" ? "Guided" : "Wallet"}</Pill>
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
        <PokerTable
          room={room}
          players={players}
          myUid={user.uid}
          now={now}
          hand={hand}
          onSit={onSit}
          // The action panel (and the "waiting on" line) are taller than the default bar.
          reserveRem={myTurn ? (isHost ? 27 : 23) : toActUid ? (isHost ? 23 : 21) : isHost ? 22 : 19}
        />
      </main>

      <section className="sticky bottom-0 z-20 border-t gold-hairline bg-felt-950/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {toActUid && !myTurn && (
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold-300" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm text-ivory-muted">
                Waiting on <span className="font-semibold text-ivory">{firstName(toActUid)}</span>
              </p>
              {me && (
                <Button
                  variant="felt"
                  className="h-8 shrink-0 px-3 text-xs"
                  disabled={busy || nudgeCooling}
                  onClick={() => setSheet("nudge")}
                >
                  {nudgeCooling ? "Nudged ✓" : "🐢 Nudge"}
                </Button>
              )}
            </div>
          )}

          {myTurn && guided ? (
            <GuidedControls key={guided.actionCount} state={guided.engine} uid={user.uid} busy={busy} onAct={onGuidedAct} />
          ) : liveHand?.mode === "wallet" && liveHand.status === "betting" && me?.status === "seated" ? (
            <WalletControls
              stack={me.stack}
              inPot={liveHand.contributions[user.uid] ?? 0}
              busy={busy}
              onBet={(amount) => act("bet", () => contribute(db, room.id, liveHand.id, user.uid, amount))}
            />
          ) : !me || me.status === "left" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{me ? "You're on the rail" : "Welcome to the table"}</p>
                <p className="text-xs text-ivory-muted">
                  {tableFull
                    ? "Every seat is taken. One will open up when someone leaves."
                    : "Tap an open seat to sit down."}
                </p>
              </div>
              {me && <span className="text-sm font-semibold text-gold-300 tabular-nums">{formatChips(myStack)}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-ivory-muted">
                  {myEngine?.folded ? "Your stack · folded" : myEngine?.allIn ? "Your stack · all-in" : "Your stack"}
                </p>
                <RollingNumber value={myStack} className="text-gold text-2xl font-bold tabular-nums" />
                {myEngine && myEngine.totalIn > 0 && (
                  <p className="text-xs text-ivory-muted tabular-nums">{formatChips(myEngine.totalIn)} in this hand</p>
                )}
                <button
                  type="button"
                  onClick={() => setSheet("rebuy")}
                  className="text-xs font-semibold text-gold-300 underline-offset-2 hover:text-gold-200 hover:underline"
                >
                  {myRebuy ? `Rebuy ${formatChips(myRebuy.amount)} pending…` : "+ Rebuy"}
                </button>
              </div>
              <ChipPile amount={myStack} size={22} />
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="felt"
                  className="h-9"
                  disabled={busy || lockedIn}
                  onClick={() =>
                    act("change your status", () => setSittingOut(db, room.id, user.uid, me.status === "seated"))
                  }
                >
                  {me.status === "seated" ? "Sit out" : "I'm back"}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={busy || lockedIn}
                  onClick={() => act("leave the table", () => leaveTable(db, room.id, user.uid, presence, Date.now()))}
                >
                  Leave table
                </Button>
              </div>
            </div>
          )}

          {isHost && pendingRebuys.length > 0 && (
            <div className="mt-3">
              <RebuyRequests
                requests={pendingRebuys}
                nameOf={firstName}
                busy={busy}
                onDecide={(id, approve) =>
                  act(approve ? "approve the rebuy" : "deny the rebuy", () => decideRebuy(db, room.id, id, approve))
                }
              />
            </div>
          )}
          {isHost && (
            <HostHandBar
              mode={room.settings.mode}
              hand={liveHand}
              seatedCount={
                players.filter(
                  (p) =>
                    p.status === "seated" && p.seatIndex !== null && (room.settings.mode === "wallet" || p.stack > 0),
                ).length
              }
              voteDecided={votesDecided}
              waitingOn={toActUid && !myTurn ? { name: firstName(toActUid), absent: toActAbsent } : null}
              showdownHint={guided?.status === "showdown" && engine ? (streetBanner(engine)?.detail ?? null) : null}
              busy={busy}
              onStart={() =>
                act("start the hand", () =>
                  room.settings.mode === "guided"
                    ? startGuidedHand(db, room.id, user.uid)
                    : startWalletHand(db, room.id, user.uid),
                )
              }
              onShowdown={() =>
                liveHand &&
                act("open the vote", () =>
                  liveHand.mode === "guided" ? openPotVotes(db, room.id, liveHand.id) : openWinnerVote(db, room.id, liveHand.id),
                )
              }
              onShowVote={() => setVoteMinimized(null)}
              onFoldFor={() =>
                guided &&
                toActUid &&
                act("fold for them", () =>
                  takeAction(db, room.id, guided.id, toActUid, { type: "fold" }, guided.actionCount),
                )
              }
              onCancel={() => liveHand && act("call off the hand", () => cancelHand(db, room.id, liveHand.id))}
            />
          )}
          {!isHost && openVotes.length > 0 && !voteOpen && (
            <Button className="mt-3 w-full" onClick={() => setVoteMinimized(null)}>
              Back to the vote
            </Button>
          )}
          {resetOpen && resetMinimized === resetOpen.id && (
            <Button variant="felt" className="mt-3 w-full" onClick={() => setResetMinimized(null)}>
              Room reset vote in progress
            </Button>
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
        onProposeReset={
          canProposeReset
            ? async () => {
                if (await act("propose a reset", () => proposeReset(db, room.id, user.uid))) setSheet(null);
              }
            : undefined
        }
      />
      {me && (
        <RebuySheet
          open={sheet === "rebuy"}
          onClose={() => setSheet(null)}
          startingStack={room.settings.startingStack}
          stack={me.stack}
          totalRebuys={me.totalRebuys}
          pending={myRebuy}
          busy={busy}
          onRequest={async (amount) => {
            const ok = await act("ask for chips", () => requestRebuy(db, room.id, user.uid, amount));
            if (ok) toast(isHost ? "Approve it below" : "Asked the host");
            return ok;
          }}
          onCancel={(id) => act("cancel the request", () => cancelRebuy(db, room.id, id))}
        />
      )}
      {resetOpen && (
        <ResetVoteSheet
          open={resetMinimized !== resetOpen.id && sheet === null && !voteOpen}
          onMinimize={() => setResetMinimized(resetOpen.id)}
          vote={resetOpen}
          myUid={user.uid}
          isHost={isHost}
          startingStack={room.settings.startingStack}
          nameOf={firstName}
          busy={busy}
          onCast={(yes) => act("vote", () => castBallot(db, room.id, resetOpen.id, user.uid, [yes ? "yes" : "no"]))}
          onConfirm={async () => {
            if (await act("reset the room", () => confirmReset(db, room.id, resetOpen.id))) {
              toast("New season! Everyone is back to the starting stack.", "success");
            }
          }}
          onCancel={() => act("call off the vote", () => cancelReset(db, room.id, resetOpen.id))}
          onCloseFailed={() => act("close the vote", () => closeFailedReset(db, room.id, resetOpen.id))}
        />
      )}
      {isHost && <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} room={room} />}
      <NudgeSheet
        open={sheet === "nudge" && !!toActUid}
        onClose={() => setSheet(null)}
        targetName={toActUid ? firstName(toActUid) : ""}
        busy={busy}
        onSend={onNudge}
      />
      {liveHand && potVotes.length > 0 && (
        <VoteSheet
          open={voteOpen && sheet === null}
          onMinimize={() => setVoteMinimized(voteKey)}
          hand={liveHand}
          pots={potVotes}
          players={players}
          myUid={user.uid}
          hostUid={room.hostUid}
          busy={busy}
          onCast={(voteId, winners) => act("vote", () => castBallot(db, room.id, voteId, user.uid, winners))}
          onAccept={(voteId, winners) =>
            act("pay out", () =>
              liveHand.mode === "guided"
                ? acceptPotVote(db, room.id, liveHand.id, voteId, winners)
                : acceptVote(db, room.id, liveHand.id, voteId, winners),
            )
          }
          onRedo={(voteId) =>
            act("redo the vote", () =>
              liveHand.mode === "guided"
                ? redoPotVote(db, room.id, liveHand.id, voteId)
                : redoVote(db, room.id, liveHand.id, voteId),
            )
          }
        />
      )}
      <NudgeToasts shown={nudgeToasts.shown} />
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

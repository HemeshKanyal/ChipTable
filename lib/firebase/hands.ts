import {
  Timestamp,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import { nextButtonSeat } from "@/lib/engine/button";
import { orderFromButton, splitPot } from "@/lib/engine/split";
import { winnerCandidates } from "@/lib/hand/wallet";
import { VOTE_DURATION_MS, tallyBallots } from "@/lib/vote/tally";
import type { HandDoc, PlayerDoc, RoomDoc, VoteDoc, WalletHandDoc } from "@/lib/types";
import { handRef, handsCol, playerRef, roomRef, voteRef, votesCol } from "./paths";
import { RoomError } from "./rooms";

/** Seated (not sitting out) players, in seat order, read inside the transaction. */
export async function seatedPlayers(tx: Transaction, db: Firestore, roomId: string, room: RoomDoc) {
  const entries = Object.entries(room.seats)
    .map(([seat, uid]) => ({ seat: Number(seat), uid }))
    .sort((a, b) => a.seat - b.seat);
  const snaps = await Promise.all(entries.map((e) => tx.get(playerRef(db, roomId, e.uid))));
  return snaps
    .map((s) => s.data() as PlayerDoc | undefined)
    .filter((p): p is PlayerDoc => !!p && p.status === "seated" && p.seatIndex !== null);
}

export function newVote(handId: string, round: number, candidates: string[], voterUids: string[], potIndex = 0) {
  return {
    type: "winner",
    handId,
    potIndex,
    round,
    openedAt: serverTimestamp(),
    durationMs: VOTE_DURATION_MS,
    candidates,
    voterUids,
    ballots: {},
    status: "open",
    hostDecision: null,
    closedAt: null,
  };
}

/** Host: deal a new wallet-mode hand to everyone seated. The button moves one seat clockwise. */
export async function startWalletHand(db: Firestore, roomId: string, hostUid: string): Promise<string> {
  const hand = doc(handsCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    if (room.currentHandId) throw new RoomError("hand-in-progress", "A hand is already in progress.");
    const seated = await seatedPlayers(tx, db, roomId, room);
    if (seated.length < 2) throw new RoomError("not-enough-players", "You need at least two seated players.");

    const buttonSeat = nextButtonSeat(
      room.buttonSeat ?? null,
      seated.map((p) => p.seatIndex!),
      room.settings.maxPlayers,
    )!;
    const number = (room.handCount ?? 0) + 1;
    tx.set(hand, {
      number,
      mode: "wallet",
      status: "betting",
      buttonSeat,
      pot: 0,
      contributions: {},
      actions: [],
      participants: seated.map((p) => p.uid),
      voteId: null,
      startedBy: hostUid,
      startedAt: serverTimestamp(),
      endedAt: null,
      result: null,
    });
    tx.update(roomRef(db, roomId), {
      currentHandId: hand.id,
      handCount: number,
      buttonSeat,
      lastActiveAt: serverTimestamp(),
    });
  });
  return hand.id;
}

/** Any seated player: move chips from your stack into the pot. */
export async function contribute(
  db: Firestore,
  roomId: string,
  handId: string,
  uid: string,
  amount: number,
): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError("Bet a whole number of chips.");
  await runTransaction(db, async (tx) => {
    const [handSnap, playerSnap] = await Promise.all([
      tx.get(handRef(db, roomId, handId)),
      tx.get(playerRef(db, roomId, uid)),
    ]);
    const hand = handSnap.data() as WalletHandDoc;
    const player = playerSnap.data() as PlayerDoc;
    if (hand.status !== "betting") throw new RoomError("hand-closed", "Betting has closed for this hand.");
    if (player.status !== "seated") throw new RoomError("denied", "Sit in to put chips in.");
    if (amount > player.stack) throw new RoomError("not-enough-chips", "You don't have that many chips.");

    tx.update(playerRef(db, roomId, uid), { stack: player.stack - amount });
    tx.update(handRef(db, roomId, handId), {
      pot: hand.pot + amount,
      [`contributions.${uid}`]: (hand.contributions[uid] ?? 0) + amount,
      // serverTimestamp() isn't allowed inside arrays; the device clock is fine for a feed.
      actions: [...hand.actions, { uid, amount, at: Timestamp.now() }],
    });
  });
}

/** Host: close betting and open a 30s winner vote. */
export async function openWinnerVote(db: Firestore, roomId: string, handId: string): Promise<void> {
  const vote = doc(votesCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const [roomSnap, handSnap] = await Promise.all([tx.get(roomRef(db, roomId)), tx.get(handRef(db, roomId, handId))]);
    const room = roomSnap.data() as RoomDoc;
    const hand = handSnap.data() as WalletHandDoc;
    if (hand.status !== "betting") throw new RoomError("hand-closed", "This hand isn't taking bets any more.");
    const voters = (await seatedPlayers(tx, db, roomId, room)).map((p) => p.uid);
    tx.set(vote, newVote(handId, 1, winnerCandidates(hand.participants, hand.contributions), voters));
    tx.update(handRef(db, roomId, handId), { status: "voting", voteId: vote.id });
  });
}

/** Host: throw this round away and run a fresh 30s vote. */
export async function redoVote(db: Firestore, roomId: string, handId: string, voteId: string): Promise<void> {
  const next = doc(votesCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const [roomSnap, voteSnap] = await Promise.all([tx.get(roomRef(db, roomId)), tx.get(voteRef(db, roomId, voteId))]);
    const room = roomSnap.data() as RoomDoc;
    const old = voteSnap.data() as VoteDoc;
    if (old.status !== "open") throw new RoomError("hand-closed", "That vote is already closed.");
    const voters = (await seatedPlayers(tx, db, roomId, room)).map((p) => p.uid);
    tx.update(voteRef(db, roomId, voteId), { status: "redone", closedAt: serverTimestamp() });
    tx.set(next, newVote(handId, old.round + 1, old.candidates, voters));
    tx.update(handRef(db, roomId, handId), { voteId: next.id });
  });
}

/** Voter: pick one or more winners (several = split pot). Can change it until time runs out. */
export async function castBallot(db: Firestore, roomId: string, voteId: string, uid: string, winners: string[]) {
  await updateDoc(voteRef(db, roomId, voteId), { [`ballots.${uid}`]: [...new Set(winners)] });
}

/** Host: accept the chosen winners and pay out the pot, splitting it if there are several. */
export async function acceptVote(
  db: Firestore,
  roomId: string,
  handId: string,
  voteId: string,
  winners: string[],
): Promise<Record<string, number>> {
  let payouts: Record<string, number> = {};
  await runTransaction(db, async (tx) => {
    const [roomSnap, handSnap, voteSnap] = await Promise.all([
      tx.get(roomRef(db, roomId)),
      tx.get(handRef(db, roomId, handId)),
      tx.get(voteRef(db, roomId, voteId)),
    ]);
    const room = roomSnap.data() as RoomDoc;
    const hand = handSnap.data() as WalletHandDoc;
    const vote = voteSnap.data() as VoteDoc;
    if (hand.status !== "voting" || vote.status !== "open" || hand.voteId !== voteId) {
      throw new RoomError("hand-closed", "This vote has already been decided.");
    }
    if (winners.length === 0 || !winners.every((w) => vote.candidates.includes(w))) {
      throw new RoomError("denied", "Pick winners from the players in this hand.");
    }

    const winnerSnaps = await Promise.all(winners.map((uid) => tx.get(playerRef(db, roomId, uid))));
    const winnerDocs = winnerSnaps.map((s) => s.data() as PlayerDoc);
    const ordered = orderFromButton(
      winnerDocs.map((p) => ({ uid: p.uid, seatIndex: p.seatIndex })),
      hand.buttonSeat,
      room.settings.maxPlayers,
    );
    payouts = splitPot(hand.pot, ordered);
    const tally = Object.fromEntries(tallyBallots(vote.ballots).choices.map((c) => [c.key, c.count]));

    for (const p of winnerDocs) {
      if (payouts[p.uid] > 0) tx.update(playerRef(db, roomId, p.uid), { stack: p.stack + payouts[p.uid] });
    }
    tx.update(handRef(db, roomId, handId), {
      status: "complete",
      endedAt: serverTimestamp(),
      result: { winners: ordered, payouts, decidedBy: "vote", tally, voteRounds: vote.round },
    });
    tx.update(voteRef(db, roomId, voteId), {
      status: "accepted",
      hostDecision: { winners: ordered },
      closedAt: serverTimestamp(),
    });
    tx.update(roomRef(db, roomId), { currentHandId: null, lastHandId: handId, lastActiveAt: serverTimestamp() });
  });
  return payouts;
}

/**
 * Host: call the hand off (misdeal) and give everyone back what they put in. Wallet chips left
 * the stacks as they went in, so they're refunded; guided stacks never moved, so nothing to do.
 */
export async function cancelHand(db: Firestore, roomId: string, handId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const hand = (await tx.get(handRef(db, roomId, handId))).data() as HandDoc;
    if (hand.status === "complete" || hand.status === "cancelled") {
      throw new RoomError("hand-closed", "This hand is already over.");
    }
    const voteIds = (hand.mode === "wallet" ? [hand.voteId] : hand.voteIds).filter((id): id is string => !!id);
    const votes = await Promise.all(voteIds.map(async (id) => (await tx.get(voteRef(db, roomId, id))).data() as VoteDoc));
    const refunds =
      hand.mode === "wallet" ? Object.entries(hand.contributions).filter(([, amount]) => amount > 0) : [];
    const snaps = await Promise.all(refunds.map(([uid]) => tx.get(playerRef(db, roomId, uid))));

    snaps.forEach((snap, i) => {
      const p = snap.data() as PlayerDoc;
      tx.update(playerRef(db, roomId, p.uid), { stack: p.stack + refunds[i][1] });
    });
    tx.update(handRef(db, roomId, handId), {
      status: "cancelled",
      endedAt: serverTimestamp(),
      result: {
        winners: [],
        payouts: hand.contributions,
        decidedBy: "cancelled",
        tally: {},
        voteRounds: Math.max(0, ...votes.map((v) => v.round)),
      },
    });
    votes.forEach((vote, i) => {
      if (vote.status === "open") {
        tx.update(voteRef(db, roomId, voteIds[i]), { status: "cancelled", closedAt: serverTimestamp() });
      }
    });
    tx.update(roomRef(db, roomId), { currentHandId: null, lastHandId: handId, lastActiveAt: serverTimestamp() });
  });
}

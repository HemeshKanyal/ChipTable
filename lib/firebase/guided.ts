import { FirebaseError } from "firebase/app";
import { doc, runTransaction, serverTimestamp, setDoc, type Firestore, type Transaction } from "firebase/firestore";
import {
  EngineError,
  applyAction,
  nextButtonSeat,
  orderFromButton,
  settle,
  startHand,
  type HandState,
  type PlayerAction,
} from "@/lib/engine";
import { guidedFields } from "@/lib/hand/guided";
import { tallyBallots } from "@/lib/vote/tally";
import type { GuidedHandDoc, HandDoc, PlayerDoc, PotResult, RoomDoc, VoteDoc } from "@/lib/types";
import { newVote, seatedPlayers } from "./hands";
import { handRef, handsCol, nudgeRef, playerRef, roomRef, voteRef, votesCol } from "./paths";
import { RoomError } from "./rooms";

async function readGuidedHand(tx: Transaction, db: Firestore, roomId: string, handId: string) {
  const hand = (await tx.get(handRef(db, roomId, handId))).data() as HandDoc | undefined;
  if (!hand || hand.mode !== "guided") throw new RoomError("hand-closed", "That hand isn't running any more.");
  return hand;
}

/** Player docs for everyone dealt in. Read before any write in the transaction. */
async function readParticipants(tx: Transaction, db: Firestore, roomId: string, hand: GuidedHandDoc) {
  const snaps = await Promise.all(hand.participants.map((uid) => tx.get(playerRef(db, roomId, uid))));
  return snaps.map((s) => s.data() as PlayerDoc);
}

/** Moves each stack by what the hand did to it: payout − chips put in. */
function writeStacks(
  tx: Transaction,
  db: Firestore,
  roomId: string,
  players: PlayerDoc[],
  state: HandState,
  payouts: Record<string, number>,
) {
  for (const p of players) {
    const totalIn = state.players.find((x) => x.uid === p.uid)?.totalIn ?? 0;
    const delta = (payouts[p.uid] ?? 0) - totalIn;
    if (delta !== 0) tx.update(playerRef(db, roomId, p.uid), { stack: p.stack + delta });
  }
}

const seatsOf = (state: HandState, uids: string[]) =>
  uids.map((uid) => ({ uid, seatIndex: state.players.find((p) => p.uid === uid)?.seat ?? null }));

const ordered = (state: HandState, uids: string[]) => orderFromButton(seatsOf(state, uids), state.buttonSeat, state.maxSeats);

/**
 * Host: deal a guided hand to everyone seated with chips. The button moves one seat clockwise and
 * the blinds go in automatically.
 */
export async function startGuidedHand(db: Firestore, roomId: string, hostUid: string): Promise<string> {
  const hand = doc(handsCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    if (room.currentHandId) throw new RoomError("hand-in-progress", "A hand is already in progress.");
    const dealt = (await seatedPlayers(tx, db, roomId, room)).filter((p) => p.stack > 0);
    if (dealt.length < 2) {
      throw new RoomError("not-enough-players", "You need at least two seated players with chips.");
    }

    const { sb, bb, maxPlayers } = room.settings;
    const buttonSeat = nextButtonSeat(
      room.buttonSeat ?? null,
      dealt.map((p) => p.seatIndex!),
      maxPlayers,
    )!;
    const state = startHand({
      players: dealt.map((p) => ({ uid: p.uid, seat: p.seatIndex!, stack: p.stack })),
      buttonSeat,
      sb,
      bb,
      maxSeats: maxPlayers,
    });
    const number = (room.handCount ?? 0) + 1;
    tx.set(hand, {
      number,
      mode: "guided",
      ...guidedFields(state),
      buttonSeat,
      participants: state.players.map((p) => p.uid),
      voteIds: [],
      actionCount: 0,
      lastAction: null,
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

/**
 * Fold, check, call, bet or raise for `uid`, who must be the player to act. (The host may fold for
 * a player who left or went quiet; the Rules check that.) `seenActionCount` is the hand's
 * actionCount the button was showing, so a double tap or a stale screen can't act twice.
 * If everyone else has folded, this also pays the last player and ends the hand.
 */
export async function takeAction(
  db: Firestore,
  roomId: string,
  handId: string,
  uid: string,
  action: PlayerAction,
  seenActionCount: number,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const hand = await readGuidedHand(tx, db, roomId, handId);
    if (hand.status !== "betting") throw new RoomError("hand-closed", "Betting is over for this hand.");
    if (hand.actionCount !== seenActionCount) throw new RoomError("hand-moved", "The hand moved on. Have another look.");

    let next: HandState;
    try {
      next = applyAction(hand.engine, uid, action);
    } catch (err) {
      if (err instanceof EngineError) throw new RoomError("denied", err.message);
      throw err;
    }
    const players = next.phase === "complete" ? await readParticipants(tx, db, roomId, hand) : [];

    const last = next.log[next.log.length - 1];
    const update = {
      ...guidedFields(next),
      actionCount: hand.actionCount + 1,
      lastAction: { uid, type: last.type, amount: last.amount },
    };
    if (next.phase !== "complete") {
      tx.update(handRef(db, roomId, handId), update);
      return;
    }

    // Everyone else folded: no vote, the last player takes it all.
    const payouts = settle(next);
    writeStacks(tx, db, roomId, players, next, payouts);
    tx.update(handRef(db, roomId, handId), {
      ...update,
      endedAt: serverTimestamp(),
      result: { winners: [next.winnerByFold], payouts, decidedBy: "fold", tally: {}, voteRounds: 0 },
    });
    tx.update(roomRef(db, roomId), { currentHandId: null, lastHandId: handId, lastActiveAt: serverTimestamp() });
  });
}

/**
 * Host, at showdown: open a 30s winner vote for every pot more than one player can win. All the
 * pots vote at once; a pot only one player is in goes to them automatically.
 */
export async function openPotVotes(db: Firestore, roomId: string, handId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    const hand = await readGuidedHand(tx, db, roomId, handId);
    if (hand.status !== "showdown") throw new RoomError("hand-closed", "This hand isn't at showdown.");
    const voters = (await seatedPlayers(tx, db, roomId, room)).map((p) => p.uid);

    const voteIds = hand.pots.map((pot) => (pot.eligible.length > 1 ? doc(votesCol(db, roomId)).id : null));
    if (voteIds.every((id) => id === null)) throw new RoomError("hand-closed", "There's nothing to vote on.");
    voteIds.forEach((id, i) => {
      if (id) tx.set(voteRef(db, roomId, id), newVote(handId, 1, hand.pots[i].eligible, voters, i));
    });
    tx.update(handRef(db, roomId, handId), { status: "voting", voteIds });
  });
}

/** Host: throw one pot's round away and run a fresh 30s vote for it. */
export async function redoPotVote(db: Firestore, roomId: string, handId: string, voteId: string): Promise<void> {
  const next = doc(votesCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    const hand = await readGuidedHand(tx, db, roomId, handId);
    const old = (await tx.get(voteRef(db, roomId, voteId))).data() as VoteDoc;
    if (hand.status !== "voting" || old.status !== "open" || hand.voteIds[old.potIndex] !== voteId) {
      throw new RoomError("hand-closed", "That vote is already closed.");
    }
    const voters = (await seatedPlayers(tx, db, roomId, room)).map((p) => p.uid);
    tx.update(voteRef(db, roomId, voteId), { status: "redone", closedAt: serverTimestamp() });
    tx.set(next, newVote(handId, old.round + 1, old.candidates, voters, old.potIndex));
    tx.update(handRef(db, roomId, handId), {
      voteIds: hand.voteIds.map((id, i) => (i === old.potIndex ? next.id : id)),
    });
  });
}

/**
 * Host: accept the winners of one pot. Once every pot is decided, the hand is paid out (splits
 * even, odd chips to the first winner clockwise from the button). Returns the payouts then, or
 * null while other pots are still open.
 */
export async function acceptPotVote(
  db: Firestore,
  roomId: string,
  handId: string,
  voteId: string,
  winners: string[],
): Promise<Record<string, number> | null> {
  let payouts: Record<string, number> | null = null;
  await runTransaction(db, async (tx) => {
    payouts = null;
    const hand = await readGuidedHand(tx, db, roomId, handId);
    const votes = await Promise.all(
      hand.voteIds.map(async (id) => (id ? ((await tx.get(voteRef(db, roomId, id))).data() as VoteDoc) : null)),
    );
    const players = await readParticipants(tx, db, roomId, hand);

    const potIndex = hand.voteIds.indexOf(voteId);
    const vote = votes[potIndex];
    if (hand.status !== "voting" || !vote || vote.status !== "open") {
      throw new RoomError("hand-closed", "This vote has already been decided.");
    }
    if (winners.length === 0 || !winners.every((w) => vote.candidates.includes(w))) {
      throw new RoomError("denied", "Pick winners from the players in this pot.");
    }
    const decision = ordered(hand.engine, [...new Set(winners)]);
    tx.update(voteRef(db, roomId, voteId), {
      status: "accepted",
      hostDecision: { winners: decision },
      closedAt: serverTimestamp(),
    });

    // Winners per pot: [] lets the engine award a pot only one player can win.
    const byPot = votes.map((v, i) =>
      i === potIndex ? decision : v === null ? [] : v.status === "accepted" ? v.hostDecision!.winners : null,
    );
    if (byPot.some((w) => w === null)) return;
    const decided = byPot as string[][];

    const paid = settle(hand.engine, decided);
    const pots: PotResult[] = hand.pots.map((pot, i) => ({
      amount: pot.amount,
      eligible: pot.eligible,
      winners: decided[i].length ? decided[i] : pot.eligible,
      tally: votes[i] ? tallyMap(votes[i]!.ballots) : {},
      voteRounds: votes[i]?.round ?? 0,
    }));
    writeStacks(tx, db, roomId, players, hand.engine, paid);
    tx.update(handRef(db, roomId, handId), {
      status: "complete",
      endedAt: serverTimestamp(),
      result: {
        winners: ordered(hand.engine, [...new Set(pots.flatMap((p) => p.winners))]),
        payouts: paid,
        decidedBy: "vote",
        tally: pots[0].tally,
        voteRounds: Math.max(...pots.map((p) => p.voteRounds)),
        pots,
      },
    });
    tx.update(roomRef(db, roomId), { currentHandId: null, lastHandId: handId, lastActiveAt: serverTimestamp() });
    payouts = paid;
  });
  return payouts;
}

const tallyMap = (ballots: VoteDoc["ballots"]) =>
  Object.fromEntries(tallyBallots(ballots).choices.map((c) => [c.key, c.count]));

/** Tease whoever's taking their time. At most one per sender every 15 seconds (enforced by the Rules). */
export async function sendNudge(db: Firestore, roomId: string, fromUid: string, toUid: string, preset: number) {
  try {
    await setDoc(nudgeRef(db, roomId, fromUid), { to: toUid, preset, at: serverTimestamp() });
  } catch (err) {
    if (err instanceof FirebaseError && err.code === "permission-denied") {
      throw new RoomError("too-soon", "Easy! One nudge every 15 seconds.");
    }
    throw err;
  }
}

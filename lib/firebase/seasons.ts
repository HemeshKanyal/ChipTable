import { doc, getDocs, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { nextSeasonId, RESET_VOTE_MS, seasonNumber, tallyReset } from "@/lib/vote/reset";
import type { PlayerDoc, ResetVoteDoc, RoomDoc } from "@/lib/types";
import { playerRef, playersCol, roomRef, seasonRef, voteRef, votesCol } from "./paths";
import { RoomError } from "./rooms";

/**
 * Anyone at the table: propose resetting every stack to the starting amount (a new season).
 * Opens a 30s yes/no vote. An earlier proposal that has run out without passing is closed first.
 */
export async function proposeReset(db: Firestore, roomId: string, uid: string): Promise<string> {
  const vote = doc(votesCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    if (room.currentHandId) throw new RoomError("hand-in-progress", "Finish the hand first.");
    if (room.resetVoteId) {
      const old = (await tx.get(voteRef(db, roomId, room.resetVoteId))).data() as ResetVoteDoc;
      const t = tallyReset(old.ballots, old.voterUids, old.openedAt.toMillis(), Date.now());
      if (old.status === "open" && !t.failed) {
        throw new RoomError("hand-in-progress", t.passed ? "A reset already passed. The host needs to confirm it." : "A reset vote is already open.");
      }
      if (old.status === "open") tx.update(voteRef(db, roomId, room.resetVoteId), { status: "failed", closedAt: serverTimestamp() });
    }
    const atTable = Object.values(room.seats);
    if (!atTable.includes(uid)) throw new RoomError("denied", "Only players at the table can propose a reset.");
    tx.set(vote, {
      type: "reset",
      proposedBy: uid,
      openedAt: serverTimestamp(),
      durationMs: RESET_VOTE_MS,
      candidates: ["yes", "no"],
      voterUids: atTable,
      // Proposing counts as a yes.
      ballots: { [uid]: ["yes"] },
      status: "open",
      closedAt: null,
    });
    tx.update(roomRef(db, roomId), { resetVoteId: vote.id, lastActiveAt: serverTimestamp() });
  });
  return vote.id;
}

/** Anyone: close a reset vote that ran out (or everyone voted) without enough yes votes. */
export async function closeFailedReset(db: Firestore, roomId: string, voteId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const vote = (await tx.get(voteRef(db, roomId, voteId))).data() as ResetVoteDoc;
    if (vote.status !== "open") return;
    tx.update(voteRef(db, roomId, voteId), { status: "failed", closedAt: serverTimestamp() });
    tx.update(roomRef(db, roomId), { resetVoteId: null });
  });
}

/** Host: call a reset vote off. */
export async function cancelReset(db: Firestore, roomId: string, voteId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const vote = (await tx.get(voteRef(db, roomId, voteId))).data() as ResetVoteDoc;
    if (vote.status !== "open") return;
    tx.update(voteRef(db, roomId, voteId), { status: "cancelled", closedAt: serverTimestamp() });
    tx.update(roomRef(db, roomId), { resetVoteId: null });
  });
}

/**
 * Host, once the table voted yes: archive this season (final stacks) and start the next one with
 * every stack back at the starting amount and rebuys cleared. Hands and history stay.
 */
export async function confirmReset(db: Firestore, roomId: string, voteId: string): Promise<string> {
  // Transactions can't run queries: find every player first, then read each inside.
  const uids = (await getDocs(playersCol(db, roomId))).docs.map((d) => d.id);
  let newSeason = "";
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    const vote = (await tx.get(voteRef(db, roomId, voteId))).data() as ResetVoteDoc;
    const players = (await Promise.all(uids.map((uid) => tx.get(playerRef(db, roomId, uid))))).map(
      (s) => s.data() as PlayerDoc,
    );
    if (room.resetVoteId !== voteId || vote.status !== "open") throw new RoomError("hand-closed", "That vote is closed.");
    if (room.currentHandId) throw new RoomError("hand-in-progress", "Finish the hand first.");
    if (!tallyReset(vote.ballots, vote.voterUids, vote.openedAt.toMillis(), Date.now()).passed) {
      throw new RoomError("denied", "The reset hasn't passed.");
    }

    const { startingStack } = room.settings;
    newSeason = nextSeasonId(room.seasonId);
    tx.set(seasonRef(db, roomId, room.seasonId), {
      number: seasonNumber(room.seasonId),
      startedAt: room.seasonStartedAt ?? room.createdAt,
      endedAt: serverTimestamp(),
      startingStack,
      finalStacks: Object.fromEntries(
        players.map((p) => [p.uid, { displayName: p.displayName, stack: p.stack, totalRebuys: p.totalRebuys }]),
      ),
      resetVoteId: voteId,
    });
    for (const p of players) {
      if (p.stack !== startingStack || p.totalRebuys !== 0) {
        tx.update(playerRef(db, roomId, p.uid), { stack: startingStack, totalRebuys: 0 });
      }
    }
    tx.update(voteRef(db, roomId, voteId), { status: "accepted", closedAt: serverTimestamp() });
    tx.update(roomRef(db, roomId), {
      seasonId: newSeason,
      seasonStartedAt: serverTimestamp(),
      resetVoteId: null,
      lastActiveAt: serverTimestamp(),
    });
  });
  return newSeason;
}

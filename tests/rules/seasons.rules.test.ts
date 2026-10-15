import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, serverTimestamp, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startGuidedHand, takeAction } from "@/lib/firebase/guided";
import { acceptVote, cancelHand, castBallot, contribute, openWinnerVote, startWalletHand } from "@/lib/firebase/hands";
import { cancelRebuy, decideRebuy, requestRebuy } from "@/lib/firebase/rebuys";
import { createRoom, joinRoom, lookupCode } from "@/lib/firebase/rooms";
import { cancelReset, closeFailedReset, confirmReset, proposeReset } from "@/lib/firebase/seasons";
import { DEFAULT_SETTINGS } from "@/lib/room/settings";
import type {
  GuidedHandDoc,
  Identity,
  PlayerDoc,
  RebuyRequestDoc,
  ResetVoteDoc,
  RoomDoc,
  SeasonDoc,
  WalletHandDoc,
} from "@/lib/types";

let env: RulesTestEnvironment;
const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chiptable-seasons",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: emuHost, port: Number(emuPort) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const who: Record<string, Identity> = {
  ann: { uid: "ann", displayName: "Ann", photoURL: null },
  bob: { uid: "bob", displayName: "Bob", photoURL: null },
  cat: { uid: "cat", displayName: "Cat", photoURL: null },
};
const dbFor = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

async function admin<T>(path: string): Promise<T> {
  let data: T | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore() as unknown as Firestore, path))).data() as T;
  });
  return data!;
}
async function adminUpdate(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });
}
const player = (roomId: string, uid: string) => admin<PlayerDoc>(`rooms/${roomId}/players/${uid}`);

/** Ann hosts in seat 0, Bob seat 1, Cat seat 2. */
async function table(mode: "wallet" | "guided" = "wallet") {
  const { roomId, code } = await createRoom(dbFor("ann"), who.ann, {
    name: "Friday",
    settings: { ...DEFAULT_SETTINGS, mode },
    password: "",
  });
  for (const uid of ["bob", "cat"]) {
    await joinRoom(dbFor(uid), who[uid], code, (await lookupCode(dbFor(uid), code))!, "");
  }
  return roomId;
}

describe("rebuys", () => {
  it("the host approves and the chips land, counted as a rebuy", async () => {
    const roomId = await table();
    const id = await requestRebuy(dbFor("bob"), roomId, "bob", 500);
    await expect(decideRebuy(dbFor("bob"), roomId, id, true)).rejects.toThrow();
    await decideRebuy(dbFor("ann"), roomId, id, true);
    expect(await player(roomId, "bob")).toMatchObject({ stack: 1500, totalRebuys: 500, lastRebuyId: id });
    expect((await admin<RebuyRequestDoc>(`rooms/${roomId}/requests/${id}`)).status).toBe("approved");
    await expect(decideRebuy(dbFor("ann"), roomId, id, true)).rejects.toMatchObject({ code: "hand-closed" });
  });

  it("can be cancelled by the asker or turned down by the host", async () => {
    const roomId = await table();
    const a = await requestRebuy(dbFor("bob"), roomId, "bob", 200);
    await assertFails(cancelRebuy(dbFor("cat"), roomId, a));
    await cancelRebuy(dbFor("bob"), roomId, a);
    const b = await requestRebuy(dbFor("bob"), roomId, "bob", 200);
    await decideRebuy(dbFor("ann"), roomId, b, false);
    expect((await admin<RebuyRequestDoc>(`rooms/${roomId}/requests/${b}`)).status).toBe("denied");
    expect((await player(roomId, "bob")).stack).toBe(1000);
  });

  it("rejects bad amounts, asking for someone else, and chips without a request", async () => {
    const roomId = await table();
    await expect(requestRebuy(dbFor("bob"), roomId, "bob", 0)).rejects.toThrow();
    const db = dbFor("bob");
    const req = (uid: string, amount: number) => ({
      uid,
      amount,
      seasonId: "s1",
      status: "pending",
      createdAt: serverTimestamp(),
      decidedAt: null,
    });
    await assertFails(writeBatch(db).set(doc(db, "rooms", roomId, "requests", "x"), req("cat", 100)).commit());
    await assertFails(writeBatch(db).set(doc(db, "rooms", roomId, "requests", "y"), req("bob", -5)).commit());

    // Host credits more than was asked for.
    const id = await requestRebuy(dbFor("bob"), roomId, "bob", 100);
    const host = dbFor("ann");
    const b = writeBatch(host);
    b.update(doc(host, "rooms", roomId, "players", "bob"), { stack: 2000, totalRebuys: 1000, lastRebuyId: id });
    b.update(doc(host, "rooms", roomId, "requests", id), { status: "approved", decidedAt: serverTimestamp() });
    await assertFails(b.commit());
    // Host marks it approved without paying.
    await assertFails(
      updateDoc(doc(host, "rooms", roomId, "requests", id), { status: "approved", decidedAt: serverTimestamp() }),
    );
  });
});

describe("hand history fields", () => {
  it("tags hands with the season and records every stack after a wallet win", async () => {
    const roomId = await table();
    const handId = await startWalletHand(dbFor("ann"), roomId, "ann");
    await contribute(dbFor("ann"), roomId, handId, "ann", 100);
    await contribute(dbFor("bob"), roomId, handId, "bob", 100);
    await openWinnerVote(dbFor("ann"), roomId, handId);
    const voteId = (await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`)).voteId!;
    for (const uid of ["ann", "bob", "cat"]) await castBallot(dbFor(uid), roomId, voteId, uid, ["bob"]);
    await acceptVote(dbFor("ann"), roomId, handId, voteId, ["bob"]);
    const hand = await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand.seasonId).toBe("s1");
    expect(hand.result?.stacksAfter).toEqual({ ann: 900, bob: 1100, cat: 1000 });
  });

  it("records stacks after a guided fold-out", async () => {
    const roomId = await table("guided");
    const handId = await startGuidedHand(dbFor("ann"), roomId, "ann");
    for (const uid of ["ann", "bob"]) {
      const h = await admin<GuidedHandDoc>(`rooms/${roomId}/hands/${handId}`);
      await takeAction(dbFor(uid), roomId, handId, uid, { type: "fold" }, h.actionCount);
    }
    const hand = await admin<GuidedHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand.result?.stacksAfter).toEqual({ ann: 1000, bob: 995, cat: 1005 });
  });
});

describe("room reset", () => {
  async function proposed() {
    const roomId = await table();
    await adminUpdate(`rooms/${roomId}/players/bob`, { stack: 40, totalRebuys: 500 });
    const voteId = await proposeReset(dbFor("bob"), roomId, "bob");
    return { roomId, voteId };
  }

  it("anyone at the table proposes; a second proposal waits", async () => {
    const { roomId, voteId } = await proposed();
    const vote = await admin<ResetVoteDoc>(`rooms/${roomId}/votes/${voteId}`);
    expect(vote).toMatchObject({ type: "reset", proposedBy: "bob", ballots: { bob: ["yes"] }, status: "open" });
    expect(vote.voterUids.sort()).toEqual(["ann", "bob", "cat"]);
    expect((await admin<RoomDoc>(`rooms/${roomId}`)).resetVoteId).toBe(voteId);
    await expect(proposeReset(dbFor("cat"), roomId, "cat")).rejects.toThrow(/already open/);
  });

  it("can't be proposed during a hand", async () => {
    const roomId = await table();
    await startWalletHand(dbFor("ann"), roomId, "ann");
    await expect(proposeReset(dbFor("bob"), roomId, "bob")).rejects.toThrow(/Finish the hand/);
  });

  it("passes with yes from more than half, then the host starts a new season", async () => {
    const { roomId, voteId } = await proposed();
    await castBallot(dbFor("cat"), roomId, voteId, "cat", ["no"]);
    await assertFails(castBallot(dbFor("cat"), roomId, voteId, "cat", ["yes", "no"]));
    // 1 yes of 3: not yet.
    await expect(confirmReset(dbFor("ann"), roomId, voteId)).rejects.toThrow();
    await castBallot(dbFor("ann"), roomId, voteId, "ann", ["yes"]);
    await expect(confirmReset(dbFor("bob"), roomId, voteId)).rejects.toThrow();

    expect(await confirmReset(dbFor("ann"), roomId, voteId)).toBe("s2");
    const room = await admin<RoomDoc>(`rooms/${roomId}`);
    expect(room).toMatchObject({ seasonId: "s2", resetVoteId: null });
    expect(await player(roomId, "bob")).toMatchObject({ stack: 1000, totalRebuys: 0 });
    const s1 = await admin<SeasonDoc>(`rooms/${roomId}/seasons/s1`);
    expect(s1.number).toBe(1);
    expect(s1.finalStacks.bob).toEqual({ displayName: "Bob", stack: 40, totalRebuys: 500 });
    expect((await admin<ResetVoteDoc>(`rooms/${roomId}/votes/${voteId}`)).status).toBe("accepted");

    // New hands land in the new season.
    const handId = await startWalletHand(dbFor("ann"), roomId, "ann");
    expect((await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`)).seasonId).toBe("s2");
    await cancelHand(dbFor("ann"), roomId, handId);
  });

  it("the host can't reset without a passed vote", async () => {
    const { roomId, voteId } = await proposed();
    const db = dbFor("ann");
    const b = writeBatch(db);
    b.set(doc(db, "rooms", roomId, "seasons", "s1"), {
      number: 1,
      startedAt: Timestamp.now(),
      endedAt: serverTimestamp(),
      startingStack: 1000,
      finalStacks: {},
      resetVoteId: voteId,
    });
    b.update(doc(db, "rooms", roomId, "players", "bob"), { stack: 1000, totalRebuys: 0 });
    b.update(doc(db, "rooms", roomId, "votes", voteId), { status: "accepted", closedAt: serverTimestamp() });
    b.update(doc(db, "rooms", roomId), { seasonId: "s2", seasonStartedAt: serverTimestamp(), resetVoteId: null });
    await assertFails(b.commit());
  });

  it("fails once time runs out without enough yes, and a new one can start", async () => {
    const { roomId, voteId } = await proposed();
    await assertFails(closeFailedReset(dbFor("cat"), roomId, voteId)); // still running
    await adminUpdate(`rooms/${roomId}/votes/${voteId}`, { openedAt: Timestamp.fromMillis(Date.now() - 31_000) });
    await assertFails(castBallot(dbFor("ann"), roomId, voteId, "ann", ["yes"]));
    await closeFailedReset(dbFor("cat"), roomId, voteId);
    expect((await admin<ResetVoteDoc>(`rooms/${roomId}/votes/${voteId}`)).status).toBe("failed");
    expect((await admin<RoomDoc>(`rooms/${roomId}`)).resetVoteId).toBeNull();
    expect((await player(roomId, "bob")).stack).toBe(40);

    const again = await proposeReset(dbFor("cat"), roomId, "cat");
    await cancelReset(dbFor("ann"), roomId, again);
    expect((await admin<ResetVoteDoc>(`rooms/${roomId}/votes/${again}`)).status).toBe("cancelled");
  });

  it("a rebuy asked for before the reset can't be paid after it", async () => {
    const { roomId, voteId } = await proposed();
    const id = await requestRebuy(dbFor("cat"), roomId, "cat", 300);
    await castBallot(dbFor("ann"), roomId, voteId, "ann", ["yes"]);
    await confirmReset(dbFor("ann"), roomId, voteId);
    await decideRebuy(dbFor("ann"), roomId, id, true); // turned into a denial
    expect((await admin<RebuyRequestDoc>(`rooms/${roomId}/requests/${id}`)).status).toBe("denied");
    expect((await player(roomId, "cat")).stack).toBe(1000);
    // And forcing it through is refused.
    const id2 = await requestRebuy(dbFor("cat"), roomId, "cat", 300);
    await adminUpdate(`rooms/${roomId}/requests/${id2}`, { seasonId: "s1" });
    const db = dbFor("ann");
    const b = writeBatch(db);
    b.update(doc(db, "rooms", roomId, "players", "cat"), { stack: 1300, totalRebuys: 300, lastRebuyId: id2 });
    b.update(doc(db, "rooms", roomId, "requests", id2), { status: "approved", decidedAt: serverTimestamp() });
    await assertFails(b.commit());
    await assertSucceeds(decideRebuy(dbFor("ann"), roomId, id2, false));
  });
});

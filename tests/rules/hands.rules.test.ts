import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptVote,
  cancelHand,
  castBallot,
  contribute,
  openWinnerVote,
  redoVote,
  startWalletHand,
} from "@/lib/firebase/hands";
import { createRoom, joinRoom, lookupCode, setSittingOut, updateRoomSettings } from "@/lib/firebase/rooms";
import { DEFAULT_SETTINGS } from "@/lib/room/settings";
import type { WalletHandDoc, Identity, PlayerDoc, RoomDoc, VoteDoc } from "@/lib/types";

let env: RulesTestEnvironment;
const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chiptable-hands",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: emuHost, port: Number(emuPort) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const ann: Identity = { uid: "ann", displayName: "Ann", photoURL: null };
const bob: Identity = { uid: "bob", displayName: "Bob", photoURL: null };
const cat: Identity = { uid: "cat", displayName: "Cat", photoURL: null };
const dbFor = (who: Identity) => env.authenticatedContext(who.uid).firestore() as unknown as Firestore;

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
const stack = async (roomId: string, uid: string) => (await admin<PlayerDoc>(`rooms/${roomId}/players/${uid}`)).stack;

/** Ann hosts in seat 0; Bob seat 1; Cat seat 2. Wallet mode. */
async function table() {
  const { roomId, code } = await createRoom(dbFor(ann), ann, {
    name: "Friday",
    settings: { ...DEFAULT_SETTINGS, mode: "wallet" },
    password: "",
  });
  for (const who of [bob, cat]) {
    const db = dbFor(who);
    await joinRoom(db, who, code, (await lookupCode(db, code))!, "");
  }
  return { roomId, code };
}

describe("starting a hand", () => {
  it("host deals in everyone seated and the button moves each hand", async () => {
    const { roomId } = await table();
    await expect(startWalletHand(dbFor(bob), roomId, "bob")).rejects.toThrow();
    const handId = await startWalletHand(dbFor(ann), roomId, "ann");
    const hand = await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand).toMatchObject({ number: 1, status: "betting", buttonSeat: 0, participants: ["ann", "bob", "cat"] });
    await expect(startWalletHand(dbFor(ann), roomId, "ann")).rejects.toMatchObject({ code: "hand-in-progress" });

    await cancelHand(dbFor(ann), roomId, handId);
    const second = await startWalletHand(dbFor(ann), roomId, "ann");
    expect((await admin<WalletHandDoc>(`rooms/${roomId}/hands/${second}`)).buttonSeat).toBe(1);
  });

  it("needs two seated players", async () => {
    const { roomId } = await table();
    await setSittingOut(dbFor(bob), roomId, "bob", true);
    await setSittingOut(dbFor(cat), roomId, "cat", true);
    await expect(startWalletHand(dbFor(ann), roomId, "ann")).rejects.toMatchObject({ code: "not-enough-players" });
  });

  it("locks settings while a hand is on", async () => {
    const { roomId, code } = await table();
    await startWalletHand(dbFor(ann), roomId, "ann");
    await expect(
      updateRoomSettings(dbFor(ann), roomId, code, "Friday", { ...DEFAULT_SETTINGS, mode: "guided" }),
    ).rejects.toThrow();
  });
});

describe("contributing", () => {
  it("moves chips from stack to pot and records the feed", async () => {
    const { roomId } = await table();
    const handId = await startWalletHand(dbFor(ann), roomId, "ann");
    await contribute(dbFor(bob), roomId, handId, "bob", 200);
    await contribute(dbFor(bob), roomId, handId, "bob", 50);
    await contribute(dbFor(cat), roomId, handId, "cat", 100);
    const hand = await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand.pot).toBe(350);
    expect(hand.contributions).toEqual({ bob: 250, cat: 100 });
    expect(hand.actions.map((a) => [a.uid, a.amount])).toEqual([
      ["bob", 200],
      ["bob", 50],
      ["cat", 100],
    ]);
    expect(await stack(roomId, "bob")).toBe(750);
  });

  it("can't bet more than your stack, or while sitting out", async () => {
    const { roomId } = await table();
    const handId = await startWalletHand(dbFor(ann), roomId, "ann");
    await expect(contribute(dbFor(bob), roomId, handId, "bob", 1001)).rejects.toMatchObject({ code: "not-enough-chips" });
    await contribute(dbFor(bob), roomId, handId, "bob", 1000); // all in is fine
    expect(await stack(roomId, "bob")).toBe(0);
    await setSittingOut(dbFor(cat), roomId, "cat", true);
    await expect(contribute(dbFor(cat), roomId, handId, "cat", 10)).rejects.toThrow();
  });

  it("rejects writes that create or destroy chips", async () => {
    const { roomId } = await table();
    const handId = await startWalletHand(dbFor(ann), roomId, "ann");
    const db = dbFor(bob);
    const hand = doc(db, "rooms", roomId, "hands", handId);
    const me = doc(db, "rooms", roomId, "players", "bob");
    const feed = (amount: number) => [{ uid: "bob", amount, at: Timestamp.now() }];

    // Pot grows without the stack shrinking.
    await assertFails(updateDoc(hand, { pot: 100, "contributions.bob": 100, actions: feed(100) }));
    // Stack shrinks less than the pot grows.
    let b = writeBatch(db);
    b.update(hand, { pot: 100, "contributions.bob": 100, actions: feed(100) });
    b.update(me, { stack: 950 });
    await assertFails(b.commit());
    // Credit someone else's contribution.
    b = writeBatch(db);
    b.update(hand, { pot: 100, "contributions.cat": 100, actions: feed(100) });
    b.update(me, { stack: 900 });
    await assertFails(b.commit());
    // Stack shrinks on its own (or grows).
    await assertFails(updateDoc(me, { stack: 5000 }));
    // The honest version passes.
    b = writeBatch(db);
    b.update(hand, { pot: 100, "contributions.bob": 100, actions: feed(100) });
    b.update(me, { stack: 900 });
    await assertSucceeds(b.commit());
    // Honest chips, but rewriting the earlier feed entry.
    b = writeBatch(db);
    b.update(hand, {
      pot: 150,
      "contributions.bob": 150,
      actions: [{ uid: "bob", amount: 1, at: Timestamp.now() }, { uid: "bob", amount: 50, at: Timestamp.now() }],
    });
    b.update(me, { stack: 850 });
    await assertFails(b.commit());
  });
});

describe("winner vote", () => {
  async function toVote() {
    const { roomId } = await table();
    const handId = await startWalletHand(dbFor(ann), roomId, "ann");
    await contribute(dbFor(ann), roomId, handId, "ann", 101);
    await contribute(dbFor(bob), roomId, handId, "bob", 100);
    await expect(openWinnerVote(dbFor(bob), roomId, handId)).rejects.toThrow();
    await openWinnerVote(dbFor(ann), roomId, handId);
    const voteId = (await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`)).voteId!;
    return { roomId, handId, voteId };
  }

  it("closes betting while voting", async () => {
    const { roomId, handId } = await toVote();
    await expect(contribute(dbFor(bob), roomId, handId, "bob", 10)).rejects.toMatchObject({ code: "hand-closed" });
  });

  it("takes one ballot per voter, only for candidates", async () => {
    const { roomId, voteId } = await toVote();
    await castBallot(dbFor(bob), roomId, voteId, "bob", ["bob"]);
    await castBallot(dbFor(bob), roomId, voteId, "bob", ["ann", "bob"]); // can change it
    await assertFails(castBallot(dbFor(cat), roomId, voteId, "cat", ["nobody"]));
    await assertFails(updateDoc(doc(dbFor(cat), "rooms", roomId, "votes", voteId), { "ballots.bob": ["cat"] }));
    expect((await admin<VoteDoc>(`rooms/${roomId}/votes/${voteId}`)).ballots).toEqual({ bob: ["ann", "bob"] });
  });

  it("host can't accept early, then pays a split pot with the odd chip left of the button", async () => {
    const { roomId, handId, voteId } = await toVote();
    await castBallot(dbFor(ann), roomId, voteId, "ann", ["ann", "bob"]);
    await expect(acceptVote(dbFor(ann), roomId, handId, voteId, ["ann", "bob"])).rejects.toThrow();
    await castBallot(dbFor(bob), roomId, voteId, "bob", ["ann", "bob"]);
    await castBallot(dbFor(cat), roomId, voteId, "cat", ["bob"]);
    await expect(acceptVote(dbFor(bob), roomId, handId, voteId, ["bob"])).rejects.toThrow(); // not host

    const payouts = await acceptVote(dbFor(ann), roomId, handId, voteId, ["ann", "bob"]);
    // Button is seat 0 (Ann), so Bob (seat 1) is first clockwise and gets the odd chip.
    expect(payouts).toEqual({ bob: 101, ann: 100 });
    expect(await stack(roomId, "ann")).toBe(999);
    expect(await stack(roomId, "bob")).toBe(1001);
    const hand = await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand.status).toBe("complete");
    expect(hand.result?.tally).toEqual({ "ann,bob": 2, bob: 1 });
    expect(await admin<RoomDoc>(`rooms/${roomId}`)).toMatchObject({ currentHandId: null, lastHandId: handId });
    // Ballots are frozen after acceptance.
    await assertFails(castBallot(dbFor(cat), roomId, voteId, "cat", ["ann"]));
  });

  it("closes ballots after 30s and lets the host accept with whatever came in", async () => {
    const { roomId, handId, voteId } = await toVote();
    await castBallot(dbFor(cat), roomId, voteId, "cat", ["ann"]);
    await adminUpdate(`rooms/${roomId}/votes/${voteId}`, { openedAt: Timestamp.fromMillis(Date.now() - 31_000) });
    await assertFails(castBallot(dbFor(bob), roomId, voteId, "bob", ["bob"]));
    await acceptVote(dbFor(ann), roomId, handId, voteId, ["ann"]);
    expect(await stack(roomId, "ann")).toBe(1100);
  });

  it("can't pay out more than the pot", async () => {
    const { roomId, handId, voteId } = await toVote();
    await adminUpdate(`rooms/${roomId}/votes/${voteId}`, { openedAt: Timestamp.fromMillis(Date.now() - 31_000) });
    const db = dbFor(ann);
    const b = writeBatch(db);
    b.update(doc(db, "rooms", roomId, "players", "ann"), { stack: 899 + 500 });
    b.update(doc(db, "rooms", roomId, "hands", handId), {
      status: "complete",
      endedAt: Timestamp.now(),
      result: { winners: ["ann"], payouts: { ann: 500 }, decidedBy: "vote", tally: {}, voteRounds: 1 },
    });
    b.update(doc(db, "rooms", roomId, "votes", voteId), {
      status: "accepted",
      hostDecision: { winners: ["ann"] },
      closedAt: Timestamp.now(),
    });
    b.update(doc(db, "rooms", roomId), { currentHandId: null, lastHandId: handId });
    await assertFails(b.commit());
  });

  it("redo opens a fresh round", async () => {
    const { roomId, handId, voteId } = await toVote();
    await castBallot(dbFor(cat), roomId, voteId, "cat", ["ann"]);
    await redoVote(dbFor(ann), roomId, handId, voteId);
    const hand = await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`);
    expect(hand.voteId).not.toBe(voteId);
    const fresh = await admin<VoteDoc>(`rooms/${roomId}/votes/${hand.voteId}`);
    expect(fresh).toMatchObject({ round: 2, ballots: {}, status: "open" });
    expect((await admin<VoteDoc>(`rooms/${roomId}/votes/${voteId}`)).status).toBe("redone");
  });

  it("cancel refunds everyone exactly", async () => {
    const { roomId, handId } = await toVote();
    await cancelHand(dbFor(ann), roomId, handId);
    expect(await stack(roomId, "ann")).toBe(1000);
    expect(await stack(roomId, "bob")).toBe(1000);
    expect((await admin<WalletHandDoc>(`rooms/${roomId}/hands/${handId}`)).status).toBe("cancelled");
  });
});

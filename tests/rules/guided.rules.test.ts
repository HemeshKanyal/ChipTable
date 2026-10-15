import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAction } from "@/lib/engine";
import { acceptPotVote, openPotVotes, redoPotVote, sendNudge, startGuidedHand, takeAction } from "@/lib/firebase/guided";
import { cancelHand, castBallot } from "@/lib/firebase/hands";
import { createRoom, joinRoom, kickPlayer, lookupCode } from "@/lib/firebase/rooms";
import { guidedFields } from "@/lib/hand/guided";
import { DEFAULT_SETTINGS } from "@/lib/room/settings";
import type { PlayerAction } from "@/lib/engine";
import type { GuidedHandDoc, Identity, PlayerDoc, RoomDoc, VoteDoc } from "@/lib/types";

let env: RulesTestEnvironment;
const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chiptable-guided",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: emuHost, port: Number(emuPort) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const ann: Identity = { uid: "ann", displayName: "Ann", photoURL: null };
const bob: Identity = { uid: "bob", displayName: "Bob", photoURL: null };
const cat: Identity = { uid: "cat", displayName: "Cat", photoURL: null };
const who = { ann, bob, cat };
const dbFor = (uid: keyof typeof who) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

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
const getHand = (roomId: string, handId: string) => admin<GuidedHandDoc>(`rooms/${roomId}/hands/${handId}`);

/**
 * Ann hosts in seat 0, Bob seat 1, Cat seat 2. Guided, blinds 5/10. The first hand's button is
 * seat 0, so Bob posts the SB, Cat the BB, and Ann acts first.
 */
async function table(stacks: Partial<Record<keyof typeof who, number>> = {}) {
  const { roomId, code } = await createRoom(dbFor("ann"), ann, {
    name: "Friday",
    settings: { ...DEFAULT_SETTINGS, mode: "guided", sb: 5, bb: 10 },
    password: "",
  });
  for (const uid of ["bob", "cat"] as const) {
    const db = dbFor(uid);
    await joinRoom(db, who[uid], code, (await lookupCode(db, code))!, "");
  }
  for (const [uid, amount] of Object.entries(stacks)) {
    await adminUpdate(`rooms/${roomId}/players/${uid}`, { stack: amount });
  }
  const handId = await startGuidedHand(dbFor("ann"), roomId, "ann");
  return { roomId, handId };
}

/** Plays moves in order, each as the player making it. */
async function play(roomId: string, handId: string, ...moves: [keyof typeof who, PlayerAction][]) {
  for (const [uid, action] of moves) {
    const hand = await getHand(roomId, handId);
    await takeAction(dbFor(uid), roomId, handId, uid, action, hand.actionCount);
  }
}

describe("starting a guided hand", () => {
  it("posts the blinds without touching stacks", async () => {
    const { roomId, handId } = await table();
    const hand = await getHand(roomId, handId);
    expect(hand).toMatchObject({
      mode: "guided",
      status: "betting",
      buttonSeat: 0,
      toActUid: "ann",
      street: "preflop",
      pot: 15,
      contributions: { ann: 0, bob: 5, cat: 10 },
      participants: ["ann", "bob", "cat"],
    });
    expect(await stack(roomId, "bob")).toBe(1000);
    expect(await admin<RoomDoc>(`rooms/${roomId}`)).toMatchObject({ currentHandId: handId, handCount: 1 });
  });

  it("only the host deals, and skips players with no chips", async () => {
    const { roomId, code } = await createRoom(dbFor("ann"), ann, {
      name: "Friday",
      settings: { ...DEFAULT_SETTINGS, mode: "guided" },
      password: "",
    });
    for (const uid of ["bob", "cat"] as const) {
      await joinRoom(dbFor(uid), who[uid], code, (await lookupCode(dbFor(uid), code))!, "");
    }
    await adminUpdate(`rooms/${roomId}/players/cat`, { stack: 0 });
    await expect(startGuidedHand(dbFor("bob"), roomId, "bob")).rejects.toThrow();
    const handId = await startGuidedHand(dbFor("ann"), roomId, "ann");
    expect((await getHand(roomId, handId)).participants).toEqual(["ann", "bob"]);
  });
});

describe("taking turns", () => {
  it("only the player to act can move", async () => {
    const { roomId, handId } = await table();
    const hand = await getHand(roomId, handId);
    // Bob tries to make Ann's move for her.
    const next = applyAction(hand.engine, "ann", { type: "call" });
    const forged = { ...guidedFields(next), actionCount: 1, lastAction: { uid: "ann", type: "call", amount: 10 } };
    await assertFails(updateDoc(doc(dbFor("bob"), "rooms", roomId, "hands", handId), forged));
    await assertSucceeds(updateDoc(doc(dbFor("ann"), "rooms", roomId, "hands", handId), forged));
    // The engine refuses out-of-turn moves before they get to the Rules.
    await expect(takeAction(dbFor("ann"), roomId, handId, "ann", { type: "call" }, 1)).rejects.toMatchObject({
      code: "denied",
    });
  });

  it("refuses a stale screen", async () => {
    const { roomId, handId } = await table();
    await play(roomId, handId, ["ann", { type: "call" }]);
    await expect(takeAction(dbFor("bob"), roomId, handId, "bob", { type: "call" }, 0)).rejects.toMatchObject({
      code: "hand-moved",
    });
  });

  it("can't put in more than your stack, or skip the action count", async () => {
    const { roomId, handId } = await table();
    const ref = doc(dbFor("ann"), "rooms", roomId, "hands", handId);
    const hand = await getHand(roomId, handId);
    const next = guidedFields(applyAction(hand.engine, "ann", { type: "call" }));
    const last = { uid: "ann", type: "call", amount: 10 };
    await assertFails(
      updateDoc(ref, { ...next, contributions: { ...next.contributions, ann: 5000 }, pot: 5015, actionCount: 1, lastAction: last }),
    );
    await assertFails(updateDoc(ref, { ...next, actionCount: 5, lastAction: last }));
    await assertFails(updateDoc(ref, { ...next, pot: 1, actionCount: 1, lastAction: last }));
  });

  it("everyone folding pays the last player at once, settled by whoever folded last", async () => {
    const { roomId, handId } = await table();
    await play(roomId, handId, ["ann", { type: "raise", to: 30 }], ["bob", { type: "fold" }], ["cat", { type: "fold" }]);
    const hand = await getHand(roomId, handId);
    expect(hand.status).toBe("complete");
    expect(hand.result).toMatchObject({ winners: ["ann"], payouts: { ann: 45 }, decidedBy: "fold" });
    expect(await stack(roomId, "ann")).toBe(1015);
    expect(await stack(roomId, "bob")).toBe(995);
    expect(await stack(roomId, "cat")).toBe(990);
    expect(await admin<RoomDoc>(`rooms/${roomId}`)).toMatchObject({ currentHandId: null, lastHandId: handId });
  });

  it("a player can't end someone else's hand or grab chips", async () => {
    const { roomId, handId } = await table();
    const db = dbFor("bob");
    await assertFails(updateDoc(doc(db, "rooms", roomId), { currentHandId: null, lastHandId: handId }));
    await assertFails(updateDoc(doc(db, "rooms", roomId, "players", "bob"), { stack: 2000 }));
  });

  it("the host can fold for a player who left, but not bet for them", async () => {
    const { roomId, handId } = await table();
    await play(roomId, handId, ["ann", { type: "call" }]);
    const count = (await getHand(roomId, handId)).actionCount;
    // Bob's still here: nobody else can act for him.
    await expect(takeAction(dbFor("ann"), roomId, handId, "bob", { type: "fold" }, count)).rejects.toThrow();
    await kickPlayer(dbFor("ann"), roomId, "bob");
    await expect(takeAction(dbFor("ann"), roomId, handId, "bob", { type: "call" }, count)).rejects.toThrow();
    await expect(takeAction(dbFor("cat"), roomId, handId, "bob", { type: "fold" }, count)).rejects.toThrow();
    await takeAction(dbFor("ann"), roomId, handId, "bob", { type: "fold" }, count);
    expect((await getHand(roomId, handId)).toActUid).toBe("cat");
  });
});

describe("showdown and side pots", () => {
  /** Ann all-in for 100, Bob all-in for 300, Cat calls: main pot 300 (all three), side pot 400 (Bob, Cat). */
  async function allInShowdown() {
    const { roomId, handId } = await table({ ann: 100, bob: 300 });
    await play(roomId, handId, ["ann", { type: "allIn" }], ["bob", { type: "allIn" }], ["cat", { type: "call" }]);
    return { roomId, handId };
  }

  it("stops betting and splits the pots", async () => {
    const { roomId, handId } = await allInShowdown();
    const hand = await getHand(roomId, handId);
    expect(hand.status).toBe("showdown");
    expect(hand.engine.runout).toBe(true);
    expect(hand.pots).toEqual([
      { amount: 300, eligible: ["ann", "bob", "cat"] },
      { amount: 400, eligible: ["bob", "cat"] },
    ]);
  });

  it("votes on each pot separately, then pays out once all are decided", async () => {
    const { roomId, handId } = await allInShowdown();
    await expect(openPotVotes(dbFor("bob"), roomId, handId)).rejects.toThrow();
    await openPotVotes(dbFor("ann"), roomId, handId);
    const [mainId, sideId] = (await getHand(roomId, handId)).voteIds as string[];
    expect((await admin<VoteDoc>(`rooms/${roomId}/votes/${sideId}`)).candidates).toEqual(["bob", "cat"]);

    // Ann can't win the side pot.
    await assertFails(castBallot(dbFor("cat"), roomId, sideId, "cat", ["ann"]));
    for (const uid of ["ann", "bob", "cat"] as const) {
      await castBallot(dbFor(uid), roomId, mainId, uid, ["ann"]);
      await castBallot(dbFor(uid), roomId, sideId, uid, ["cat"]);
    }

    expect(await acceptPotVote(dbFor("ann"), roomId, handId, mainId, ["ann"])).toBeNull();
    expect((await getHand(roomId, handId)).status).toBe("voting");
    expect(await acceptPotVote(dbFor("ann"), roomId, handId, sideId, ["cat"])).toEqual({ ann: 300, cat: 400 });

    const hand = await getHand(roomId, handId);
    expect(hand.status).toBe("complete");
    expect(hand.result?.pots?.map((p) => p.winners)).toEqual([["ann"], ["cat"]]);
    expect(await stack(roomId, "ann")).toBe(300);
    expect(await stack(roomId, "bob")).toBe(0);
    expect(await stack(roomId, "cat")).toBe(1100);
  });

  it("can't pay out more than the pot", async () => {
    const { roomId, handId } = await allInShowdown();
    await openPotVotes(dbFor("ann"), roomId, handId);
    const db = dbFor("ann");
    const b = writeBatch(db);
    b.update(doc(db, "rooms", roomId, "players", "ann"), { stack: 5000 });
    b.update(doc(db, "rooms", roomId, "hands", handId), {
      status: "complete",
      endedAt: Timestamp.now(),
      result: { winners: ["ann"], payouts: { ann: 4900 }, decidedBy: "vote", tally: {}, voteRounds: 1, pots: [] },
    });
    b.update(doc(db, "rooms", roomId), { currentHandId: null, lastHandId: handId });
    await assertFails(b.commit());
  });

  it("redo replaces one pot's vote", async () => {
    const { roomId, handId } = await allInShowdown();
    await openPotVotes(dbFor("ann"), roomId, handId);
    const [mainId, sideId] = (await getHand(roomId, handId)).voteIds as string[];
    await redoPotVote(dbFor("ann"), roomId, handId, sideId);
    const after = (await getHand(roomId, handId)).voteIds;
    expect(after[0]).toBe(mainId);
    expect(after[1]).not.toBe(sideId);
    expect(await admin<VoteDoc>(`rooms/${roomId}/votes/${after[1]}`)).toMatchObject({ round: 2, potIndex: 1 });
  });

  it("calling it off leaves every stack where it was", async () => {
    const { roomId, handId } = await allInShowdown();
    await openPotVotes(dbFor("ann"), roomId, handId);
    await cancelHand(dbFor("ann"), roomId, handId);
    expect((await getHand(roomId, handId)).status).toBe("cancelled");
    expect(await stack(roomId, "ann")).toBe(100);
    expect(await stack(roomId, "cat")).toBe(1000);
  });
});

describe("nudges", () => {
  it("one per sender every 15 seconds, only as yourself", async () => {
    const { roomId } = await table();
    await sendNudge(dbFor("bob"), roomId, "bob", "ann", 0);
    await expect(sendNudge(dbFor("bob"), roomId, "bob", "ann", 1)).rejects.toMatchObject({ code: "too-soon" });
    const nudge = (as: "bob" | "cat", from: string, to: string, preset: number) =>
      setDoc(doc(dbFor(as), "rooms", roomId, "nudges", from), { to, preset, at: serverTimestamp() });
    await assertFails(nudge("bob", "cat", "ann", 1)); // as someone else
    await assertFails(nudge("cat", "cat", "cat", 1)); // yourself
    await assertFails(nudge("cat", "cat", "ann", 99)); // unknown preset
    await assertSucceeds(nudge("cat", "cat", "ann", 7));

    await adminUpdate(`rooms/${roomId}/nudges/bob`, { at: Timestamp.fromMillis(Date.now() - 16_000) });
    await sendNudge(dbFor("bob"), roomId, "bob", "ann", 2);
    expect(await admin(`rooms/${roomId}/nudges/bob`)).toMatchObject({ to: "ann", preset: 2 });
    await assertSucceeds(getDoc(doc(dbFor("ann"), "rooms", roomId, "nudges", "bob")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, "rooms", roomId, "nudges", "x"), {}));
  });
});

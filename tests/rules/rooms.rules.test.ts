import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createRoom,
  enterRoom,
  joinRoom,
  kickPlayer,
  leaveTable,
  lookupCode,
  setHost,
  setRoomPassword,
  takeSeat,
  toPresence,
  updateRoomSettings,
} from "@/lib/firebase/rooms";
import { DEFAULT_SETTINGS } from "@/lib/room/settings";
import type { Identity, PlayerDoc, RoomDoc } from "@/lib/types";

let env: RulesTestEnvironment;

const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chiptable-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: emuHost, port: Number(emuPort) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const ann: Identity = { uid: "ann", displayName: "Ann", photoURL: null };
const bob: Identity = { uid: "bob", displayName: "Bob", photoURL: null };
const cat: Identity = { uid: "cat", displayName: "Cat", photoURL: null };

const dbFor = (who: Identity) => env.authenticatedContext(who.uid).firestore() as unknown as Firestore;

async function adminRead<T>(path: string): Promise<T> {
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

async function setupRoom(opts: { password?: string; maxPlayers?: number } = {}) {
  const { roomId, code } = await createRoom(dbFor(ann), ann, {
    name: "Friday",
    settings: { ...DEFAULT_SETTINGS, maxPlayers: opts.maxPlayers ?? DEFAULT_SETTINGS.maxPlayers },
    password: opts.password ?? "",
  });
  return { roomId, code };
}

async function join(who: Identity, code: string, password = "") {
  const db = dbFor(who);
  const info = await lookupCode(db, code);
  return joinRoom(db, who, code, info!, password);
}

describe("creating a room", () => {
  it("seats the host with the starting stack", async () => {
    const { roomId, code } = await setupRoom();
    const room = await adminRead<RoomDoc>(`rooms/${roomId}`);
    expect(room).toMatchObject({ hostUid: "ann", code, seats: { "0": "ann" }, hasPassword: false });
    const player = await adminRead<PlayerDoc>(`rooms/${roomId}/players/ann`);
    expect(player).toMatchObject({ stack: 1000, seatIndex: 0, status: "seated" });
    await assertSucceeds(getDoc(doc(dbFor(ann), "rooms", roomId, "secrets", "join")));
  });

  it("rejects invalid settings", async () => {
    await expect(
      createRoom(dbFor(ann), ann, { name: "x", settings: { ...DEFAULT_SETTINGS, maxPlayers: 11 }, password: "" }),
    ).rejects.toThrow();
  });
});

describe("privacy", () => {
  it("lets code holders look up a code but not browse codes or read the room", async () => {
    const { roomId, code } = await setupRoom();
    const db = dbFor(bob);
    expect((await lookupCode(db, code))?.roomId).toBe(roomId);
    await assertFails(getDocs(collection(db, "codes")));
    await assertFails(getDoc(doc(db, "rooms", roomId)));
    await assertFails(getDocs(collection(db, "rooms", roomId, "players")));
    await assertFails(getDoc(doc(db, "rooms", roomId, "secrets", "join")));
  });

  it("refuses unauthenticated lookups", async () => {
    const { code } = await setupRoom();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, "codes", code)));
  });
});

describe("joining", () => {
  it("joins with the code and takes the next free seat", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    const player = await adminRead<PlayerDoc>(`rooms/${roomId}/players/bob`);
    expect(player).toMatchObject({ stack: 1000, seatIndex: 1, status: "seated" });
    await assertSucceeds(getDoc(doc(dbFor(bob), "rooms", roomId)));
    await assertSucceeds(getDoc(doc(dbFor(bob), "users", "bob", "rooms", roomId)));
    // But not the host-only secret.
    await assertFails(getDoc(doc(dbFor(bob), "rooms", roomId, "secrets", "join")));
  });

  it("needs the right password", async () => {
    const { roomId, code } = await setupRoom({ password: "aces" });
    await expect(join(bob, code, "kings")).rejects.toMatchObject({ code: "wrong-password" });
    await assertFails(getDoc(doc(dbFor(bob), "rooms", roomId)));
    await join(bob, code, "aces");
    await assertSucceeds(getDoc(doc(dbFor(bob), "rooms", roomId)));
  });

  it("can't forge a membership with the wrong code", async () => {
    const { roomId } = await setupRoom();
    await assertFails(
      setDoc(doc(dbFor(bob), "rooms", roomId, "members", "bob"), {
        code: "ZZZZZZ",
        passwordHash: null,
        createdAt: Timestamp.now(),
      }),
    );
  });

  it("can't create a player doc without being a member, or with a fat stack", async () => {
    const { roomId, code } = await setupRoom();
    const db = dbFor(bob);
    const base = {
      uid: "bob",
      displayName: "Bob",
      photoURL: null,
      status: "left",
      seatIndex: null,
      totalRebuys: 0,
    };
    // Not a member yet: the serverTimestamp fields don't matter, membership fails first.
    await assertFails(setDoc(doc(db, "rooms", roomId, "players", "bob"), { ...base, stack: 1000 }));
    await setDoc(doc(db, "rooms", roomId, "members", "bob"), {
      code,
      passwordHash: null,
      createdAt: (await import("firebase/firestore")).serverTimestamp(),
    });
    const { serverTimestamp } = await import("firebase/firestore");
    await assertFails(
      setDoc(doc(db, "rooms", roomId, "players", "bob"), {
        ...base,
        stack: 999_999,
        lastSeen: serverTimestamp(),
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it("puts latecomers to a full table on the rail without a seat", async () => {
    const { roomId, code } = await setupRoom({ maxPlayers: 2 });
    await join(bob, code);
    await join(cat, code);
    const player = await adminRead<PlayerDoc>(`rooms/${roomId}/players/cat`);
    expect(player).toMatchObject({ status: "left", seatIndex: null, stack: 1000 });
  });
});

describe("seats", () => {
  it("moves between free seats but never into a taken one", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    await takeSeat(dbFor(bob), roomId, "bob", 4);
    const room = await adminRead<RoomDoc>(`rooms/${roomId}`);
    expect(room.seats).toEqual({ "0": "ann", "4": "bob" });
    await expect(takeSeat(dbFor(bob), roomId, "bob", 0)).rejects.toMatchObject({ code: "seat-taken" });
  });

  it("blocks direct seat-map tampering", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    const db = dbFor(bob);
    // Steal Ann's seat.
    await assertFails(updateDoc(doc(db, "rooms", roomId), { "seats.0": "bob" }));
    // Hold two seats at once.
    await assertFails(updateDoc(doc(db, "rooms", roomId), { "seats.5": "bob" }));
    // Seat someone else.
    await assertFails(updateDoc(doc(db, "rooms", roomId), { "seats.6": "cat" }));
    // Out of range, even with a matching player doc.
    const batch = writeBatch(db);
    batch.update(doc(db, "rooms", roomId), { "seats.1": deleteField(), "seats.12": "bob" });
    batch.update(doc(db, "rooms", roomId, "players", "bob"), { seatIndex: 12 });
    await assertFails(batch.commit());
  });

  it("never lets players touch their own stack", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    await assertFails(updateDoc(doc(dbFor(bob), "rooms", roomId, "players", "bob"), { stack: 5000 }));
    await assertFails(updateDoc(doc(dbFor(bob), "rooms", roomId, "players", "ann"), { status: "left", seatIndex: null }));
  });

  it("keeps your stack when you leave and come back", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    await adminUpdate(`rooms/${roomId}/players/bob`, { stack: 1750 });
    const players = await allPlayers(roomId);
    await leaveTable(dbFor(bob), roomId, "bob", players, Date.now());
    expect(await adminRead<PlayerDoc>(`rooms/${roomId}/players/bob`)).toMatchObject({ status: "left", seatIndex: null });
    await enterRoom(dbFor(bob), bob, roomId);
    expect(await adminRead<PlayerDoc>(`rooms/${roomId}/players/bob`)).toMatchObject({ status: "seated", stack: 1750 });
  });
});

async function allPlayers(roomId: string) {
  const out: ReturnType<typeof toPresence>[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(collection(ctx.firestore() as unknown as Firestore, "rooms", roomId, "players"));
    snap.forEach((d) => out.push(toPresence(d.data() as PlayerDoc)));
  });
  return out;
}

describe("host powers", () => {
  it("only the host changes settings or kicks", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    const newSettings = { ...DEFAULT_SETTINGS, sb: 10, bb: 20 };
    await expect(updateRoomSettings(dbFor(bob), roomId, code, "Mine now", newSettings)).rejects.toThrow();
    await expect(kickPlayer(dbFor(bob), roomId, "ann")).rejects.toThrow();
    await updateRoomSettings(dbFor(ann), roomId, code, "Saturday", newSettings);
    expect((await adminRead<RoomDoc>(`rooms/${roomId}`)).settings.bb).toBe(20);
    expect((await lookupCode(dbFor(cat), code))?.name).toBe("Saturday");
    await kickPlayer(dbFor(ann), roomId, "bob");
    expect(await adminRead<PlayerDoc>(`rooms/${roomId}/players/bob`)).toMatchObject({ status: "left", seatIndex: null });
    expect((await adminRead<RoomDoc>(`rooms/${roomId}`)).seats).toEqual({ "0": "ann" });
  });

  it("host can set and clear the password", async () => {
    const { roomId, code } = await setupRoom();
    await setRoomPassword(dbFor(ann), roomId, code, "queens");
    await expect(join(bob, code, "")).rejects.toMatchObject({ code: "wrong-password" });
    await join(bob, code, "queens");
    await expect(setRoomPassword(dbFor(bob), roomId, code, "")).rejects.toThrow();
    await setRoomPassword(dbFor(ann), roomId, code, "");
    await join(cat, code, "");
  });

  it("host hands over manually; others can't grab it while the host is around", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    await expect(setHost(dbFor(bob), roomId, "bob", "bob")).rejects.toThrow();
    await setHost(dbFor(ann), roomId, "bob", "ann");
    expect((await adminRead<RoomDoc>(`rooms/${roomId}`)).hostUid).toBe("bob");
  });

  it("an online player takes over after the host is quiet for 2+ minutes", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code);
    await adminUpdate(`rooms/${roomId}/players/ann`, {
      lastSeen: Timestamp.fromMillis(Date.now() - 3 * 60_000),
    });
    await setHost(dbFor(bob), roomId, "bob", "bob");
    expect((await adminRead<RoomDoc>(`rooms/${roomId}`)).hostUid).toBe("bob");
  });

  it("a leaving host passes hosting clockwise", async () => {
    const { roomId, code } = await setupRoom();
    await join(bob, code); // seat 1
    await join(cat, code); // seat 2
    await takeSeat(dbFor(bob), roomId, "bob", 5);
    await leaveTable(dbFor(ann), roomId, "ann", await allPlayers(roomId), Date.now());
    expect((await adminRead<RoomDoc>(`rooms/${roomId}`)).hostUid).toBe("cat");
  });
});

describe("My Rooms index", () => {
  it("can't list rooms you aren't playing in", async () => {
    const { roomId } = await setupRoom();
    const { serverTimestamp } = await import("firebase/firestore");
    await assertFails(
      setDoc(doc(dbFor(bob), "users", "bob", "rooms", roomId), {
        roomId,
        joinedAt: serverTimestamp(),
        lastVisitedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDocs(collection(dbFor(bob), "users", "ann", "rooms")));
  });
});

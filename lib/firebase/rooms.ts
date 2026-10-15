import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
  type UpdateData,
} from "firebase/firestore";
import { generateJoinCode, generateSalt } from "@/lib/room/code";
import { hashRoomPassword } from "@/lib/room/password";
import { firstFreeSeat, pickNextHost, type PresencePlayer } from "@/lib/room/seating";
import type { RoomSettings } from "@/lib/room/settings";
import type { CodeDoc, Identity, PlayerDoc, RoomDoc } from "@/lib/types";
import {
  codeRef,
  memberRef,
  myRoomRef,
  playerRef,
  roomRef,
  secretRef,
} from "./paths";

export type RoomErrorCode =
  | "not-found"
  | "wrong-password"
  | "seat-taken"
  | "denied"
  | "hand-in-progress"
  | "not-enough-players"
  | "not-enough-chips"
  | "hand-closed"
  | "hand-moved"
  | "too-soon";

export class RoomError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const isPermissionDenied = (err: unknown) => err instanceof FirebaseError && err.code === "permission-denied";

const cleanName = (name: string | null) => (name?.trim() || "Player").slice(0, 80);

function newPlayer(me: Identity, stack: number, seatIndex: number | null) {
  return {
    uid: me.uid,
    displayName: cleanName(me.displayName),
    photoURL: me.photoURL ?? null,
    stack,
    status: seatIndex === null ? "left" : "seated",
    seatIndex,
    totalRebuys: 0,
    lastSeen: serverTimestamp(),
    joinedAt: serverTimestamp(),
  };
}

/** Converts a player doc to the shape the pure seating helpers use. */
export function toPresence(p: PlayerDoc): PresencePlayer {
  return {
    uid: p.uid,
    seatIndex: p.seatIndex,
    status: p.status,
    lastSeen: (p.lastSeen as Timestamp | null)?.toMillis() ?? null,
  };
}

// ---------------------------------------------------------------- create / join

export interface CreateRoomInput {
  name: string;
  settings: RoomSettings;
  /** Empty for no password. */
  password: string;
}

/** Creates the room with the creator as host in seat 0. Retries if the random code is taken. */
export async function createRoom(
  db: Firestore,
  me: Identity,
  input: CreateRoomInput,
): Promise<{ roomId: string; code: string }> {
  const room = doc(collection(db, "rooms"));
  const salt = generateSalt();
  const passwordHash = input.password ? hashRoomPassword(input.password, salt) : null;
  const name = input.name.trim();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const created = await runTransaction(db, async (tx) => {
      if ((await tx.get(codeRef(db, code))).exists()) return false;
      tx.set(room, {
        name,
        code,
        hostUid: me.uid,
        settings: input.settings,
        seats: { "0": me.uid },
        hasPassword: passwordHash !== null,
        seasonId: "s1",
        status: "active",
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        currentHandId: null,
        lastHandId: null,
        handCount: 0,
        buttonSeat: null,
      });
      tx.set(codeRef(db, code), {
        roomId: room.id,
        name,
        salt,
        hasPassword: passwordHash !== null,
        createdAt: serverTimestamp(),
      });
      tx.set(secretRef(db, room.id), { passwordHash });
      tx.set(memberRef(db, room.id, me.uid), { code, passwordHash, createdAt: serverTimestamp() });
      tx.set(playerRef(db, room.id, me.uid), newPlayer(me, input.settings.startingStack, 0));
      tx.set(myRoomRef(db, me.uid, room.id), {
        roomId: room.id,
        joinedAt: serverTimestamp(),
        lastVisitedAt: serverTimestamp(),
      });
      return true;
    });
    if (created) return { roomId: room.id, code };
  }
  throw new Error("Couldn't find a free join code. Please try again.");
}

export async function lookupCode(db: Firestore, code: string): Promise<CodeDoc | null> {
  const snap = await getDoc(codeRef(db, code));
  return snap.exists() ? (snap.data() as CodeDoc) : null;
}

export async function isMember(db: Firestore, roomId: string, uid: string): Promise<boolean> {
  return (await getDoc(memberRef(db, roomId, uid))).exists();
}

/**
 * Proves knowledge of the code (and password) by writing the member doc, then takes a seat.
 * Returning members skip straight to sitting down.
 */
export async function joinRoom(
  db: Firestore,
  me: Identity,
  code: string,
  info: CodeDoc,
  password: string,
): Promise<string> {
  const { roomId } = info;
  if (!(await isMember(db, roomId, me.uid))) {
    const passwordHash = info.hasPassword ? hashRoomPassword(password, info.salt) : null;
    try {
      await setDoc(memberRef(db, roomId, me.uid), { code, passwordHash, createdAt: serverTimestamp() });
    } catch (err) {
      if (isPermissionDenied(err)) {
        throw info.hasPassword
          ? new RoomError("wrong-password", "That password isn't right.")
          : new RoomError("denied", "You can't join this room.");
      }
      throw err;
    }
  }
  await enterRoom(db, me, roomId);
  return roomId;
}

/**
 * Makes sure the member has a player doc and, if they'd left, a seat (the first free one).
 * New players get the starting stack; returning players keep theirs.
 */
export async function enterRoom(db: Firestore, me: Identity, roomId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [roomSnap, playerSnap, myRoomSnap] = await Promise.all([
      tx.get(roomRef(db, roomId)),
      tx.get(playerRef(db, roomId, me.uid)),
      tx.get(myRoomRef(db, me.uid, roomId)),
    ]);
    if (!roomSnap.exists()) throw new RoomError("not-found", "This room no longer exists.");
    const room = roomSnap.data() as RoomDoc;
    const existing = playerSnap.exists() ? (playerSnap.data() as PlayerDoc) : null;

    const holdsSeat =
      existing?.seatIndex != null && room.seats[String(existing.seatIndex)] === me.uid;

    if (!existing) {
      const seat = firstFreeSeat(room.seats, room.settings.maxPlayers);
      tx.set(playerRef(db, roomId, me.uid), newPlayer(me, room.settings.startingStack, seat));
      if (seat !== null) {
        tx.update(roomRef(db, roomId), { [`seats.${seat}`]: me.uid, lastActiveAt: serverTimestamp() });
      }
    } else if (existing.status === "left" && !holdsSeat) {
      const seat = firstFreeSeat(room.seats, room.settings.maxPlayers);
      tx.update(playerRef(db, roomId, me.uid), {
        status: seat === null ? "left" : "seated",
        seatIndex: seat,
        displayName: cleanName(me.displayName),
        photoURL: me.photoURL ?? null,
        lastSeen: serverTimestamp(),
      });
      if (seat !== null) {
        tx.update(roomRef(db, roomId), { [`seats.${seat}`]: me.uid, lastActiveAt: serverTimestamp() });
      }
    }

    if (myRoomSnap.exists()) {
      tx.update(myRoomRef(db, me.uid, roomId), { lastVisitedAt: serverTimestamp() });
    } else {
      tx.set(myRoomRef(db, me.uid, roomId), {
        roomId,
        joinedAt: serverTimestamp(),
        lastVisitedAt: serverTimestamp(),
      });
    }
  });
}

/** Bumps "last played" in My Rooms. Best effort. */
export async function markVisited(db: Firestore, uid: string, roomId: string): Promise<void> {
  await updateDoc(myRoomRef(db, uid, roomId), { lastVisitedAt: serverTimestamp() }).catch(() => {});
}

// ---------------------------------------------------------------- seats

/** Sit in an empty seat, moving from your current one if you have it. */
export async function takeSeat(db: Firestore, roomId: string, uid: string, seatIndex: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [roomSnap, playerSnap] = await Promise.all([
      tx.get(roomRef(db, roomId)),
      tx.get(playerRef(db, roomId, uid)),
    ]);
    const room = roomSnap.data() as RoomDoc;
    const player = playerSnap.data() as PlayerDoc;
    const occupant = room.seats[String(seatIndex)];
    if (occupant === uid) return;
    if (occupant || seatIndex < 0 || seatIndex >= room.settings.maxPlayers) {
      throw new RoomError("seat-taken", "Someone just took that seat.");
    }

    const roomUpdate: UpdateData<RoomDoc> = {
      [`seats.${seatIndex}`]: uid,
      lastActiveAt: serverTimestamp(),
    };
    if (player.seatIndex !== null && room.seats[String(player.seatIndex)] === uid) {
      roomUpdate[`seats.${player.seatIndex}`] = deleteField();
    }
    tx.update(roomRef(db, roomId), roomUpdate);
    tx.update(playerRef(db, roomId, uid), {
      seatIndex,
      status: player.status === "left" ? "seated" : player.status,
    });
  });
}

export async function setSittingOut(db: Firestore, roomId: string, uid: string, sittingOut: boolean) {
  await updateDoc(playerRef(db, roomId, uid), { status: sittingOut ? "sittingOut" : "seated" });
}

/**
 * Stand up and leave the table. A leaving host hands over to the next player clockwise
 * (online players first). Their stack stays for when they come back.
 */
export async function leaveTable(
  db: Firestore,
  roomId: string,
  uid: string,
  players: PresencePlayer[],
  now: number,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [roomSnap, playerSnap] = await Promise.all([
      tx.get(roomRef(db, roomId)),
      tx.get(playerRef(db, roomId, uid)),
    ]);
    const room = roomSnap.data() as RoomDoc;
    const player = playerSnap.data() as PlayerDoc;

    const roomUpdate: UpdateData<RoomDoc> = {};
    if (player.seatIndex !== null && room.seats[String(player.seatIndex)] === uid) {
      roomUpdate[`seats.${player.seatIndex}`] = deleteField();
    }
    if (room.hostUid === uid) {
      const max = room.settings.maxPlayers;
      const next =
        pickNextHost(players, uid, max, now, { requireOnline: true }) ??
        pickNextHost(players, uid, max, now, { requireOnline: false });
      if (next) roomUpdate.hostUid = next;
    }
    if (Object.keys(roomUpdate).length) tx.update(roomRef(db, roomId), roomUpdate);
    tx.update(playerRef(db, roomId, uid), { status: "left", seatIndex: null });
  });
}

// ---------------------------------------------------------------- presence & host

export async function heartbeat(db: Firestore, roomId: string, uid: string): Promise<void> {
  await updateDoc(playerRef(db, roomId, uid), { lastSeen: serverTimestamp() });
}

/**
 * Hand the host role to `toUid`. The host can do this any time; anyone else only when the
 * host has left or been offline for 2+ minutes (enforced by rules).
 */
export async function setHost(db: Firestore, roomId: string, toUid: string, byUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(roomRef(db, roomId), { hostUid: toUid });
  // A takeover requires the new host to look online to the rules, so refresh our own heartbeat.
  if (toUid === byUid) batch.update(playerRef(db, roomId, byUid), { lastSeen: serverTimestamp() });
  await batch.commit();
}

/** Host only. The player keeps their stack and can come back with the code. */
export async function kickPlayer(db: Firestore, roomId: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [roomSnap, playerSnap] = await Promise.all([
      tx.get(roomRef(db, roomId)),
      tx.get(playerRef(db, roomId, uid)),
    ]);
    const room = roomSnap.data() as RoomDoc;
    const player = playerSnap.data() as PlayerDoc;
    if (player.seatIndex !== null && room.seats[String(player.seatIndex)] === uid) {
      tx.update(roomRef(db, roomId), { [`seats.${player.seatIndex}`]: deleteField() });
    }
    tx.update(playerRef(db, roomId, uid), { status: "left", seatIndex: null });
  });
}

// ---------------------------------------------------------------- host settings

export async function updateRoomSettings(
  db: Firestore,
  roomId: string,
  code: string,
  name: string,
  settings: RoomSettings,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(roomRef(db, roomId), { name: name.trim(), settings });
  batch.update(codeRef(db, code), { name: name.trim() });
  await batch.commit();
}

/** Host only. Empty string removes the password. Existing members aren't affected. */
export async function setRoomPassword(db: Firestore, roomId: string, code: string, password: string) {
  const info = await lookupCode(db, code);
  if (!info) throw new RoomError("not-found", "Room code not found.");
  const passwordHash = password ? hashRoomPassword(password, info.salt) : null;
  const batch = writeBatch(db);
  batch.update(secretRef(db, roomId), { passwordHash });
  batch.update(roomRef(db, roomId), { hasPassword: passwordHash !== null });
  batch.update(codeRef(db, code), { hasPassword: passwordHash !== null });
  await batch.commit();
}

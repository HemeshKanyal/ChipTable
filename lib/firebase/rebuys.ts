import { doc, runTransaction, serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";
import { LIMITS } from "@/lib/room/settings";
import type { PlayerDoc, RebuyRequestDoc, RoomDoc } from "@/lib/types";
import { playerRef, requestRef, requestsCol, roomRef } from "./paths";
import { RoomError } from "./rooms";

/** Ask the host for more chips. Returns the request id. */
export async function requestRebuy(db: Firestore, roomId: string, uid: string, amount: number): Promise<string> {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > LIMITS.stackMax) {
    throw new RoomError("denied", `Ask for between 1 and ${LIMITS.stackMax.toLocaleString("en-US")} chips.`);
  }
  const ref = doc(requestsCol(db, roomId));
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    if (!(await tx.get(playerRef(db, roomId, uid))).exists()) throw new RoomError("denied", "Take a seat first.");
    tx.set(ref, {
      uid,
      amount,
      seasonId: room.seasonId,
      status: "pending",
      createdAt: serverTimestamp(),
      decidedAt: null,
    });
  });
  return ref.id;
}

/** Take back your own pending request. */
export async function cancelRebuy(db: Firestore, roomId: string, requestId: string): Promise<void> {
  await updateDoc(requestRef(db, roomId, requestId), { status: "cancelled", decidedAt: serverTimestamp() });
}

/** Host: approve (chips go straight onto the stack and count as a rebuy) or deny. */
export async function decideRebuy(db: Firestore, roomId: string, requestId: string, approve: boolean): Promise<void> {
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(roomRef(db, roomId))).data() as RoomDoc;
    const req = (await tx.get(requestRef(db, roomId, requestId))).data() as RebuyRequestDoc;
    if (req.status !== "pending") throw new RoomError("hand-closed", "That request was already handled.");
    const player = (await tx.get(playerRef(db, roomId, req.uid))).data() as PlayerDoc;
    // A request from before a room reset belongs to the old season: it can only be turned down.
    const ok = approve && req.seasonId === room.seasonId;
    if (ok) {
      tx.update(playerRef(db, roomId, req.uid), {
        stack: player.stack + req.amount,
        totalRebuys: player.totalRebuys + req.amount,
        lastRebuyId: requestId,
      });
    }
    tx.update(requestRef(db, roomId, requestId), { status: ok ? "approved" : "denied", decidedAt: serverTimestamp() });
  });
}

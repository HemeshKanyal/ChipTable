import { collection, doc, type Firestore } from "firebase/firestore";

export const roomRef = (db: Firestore, roomId: string) => doc(db, "rooms", roomId);
export const playersCol = (db: Firestore, roomId: string) => collection(db, "rooms", roomId, "players");
export const playerRef = (db: Firestore, roomId: string, uid: string) => doc(db, "rooms", roomId, "players", uid);
export const memberRef = (db: Firestore, roomId: string, uid: string) => doc(db, "rooms", roomId, "members", uid);
export const secretRef = (db: Firestore, roomId: string) => doc(db, "rooms", roomId, "secrets", "join");
export const codeRef = (db: Firestore, code: string) => doc(db, "codes", code);
export const myRoomsCol = (db: Firestore, uid: string) => collection(db, "users", uid, "rooms");
export const myRoomRef = (db: Firestore, uid: string, roomId: string) => doc(db, "users", uid, "rooms", roomId);

import type { Timestamp } from "firebase/firestore";
import type { PlayerStatus, SeatMap } from "@/lib/room/seating";
import type { RoomSettings } from "@/lib/room/settings";

/** `users/{uid}` */
export interface UserProfile {
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
}

/** `users/{uid}/rooms/{roomId}`: the "My Rooms" index. */
export interface MyRoomEntry {
  roomId: string;
  joinedAt: Timestamp;
  lastVisitedAt: Timestamp;
}

/** `rooms/{roomId}` */
export interface RoomDoc {
  name: string;
  code: string;
  hostUid: string;
  settings: RoomSettings;
  seats: SeatMap;
  hasPassword: boolean;
  seasonId: string;
  status: "active";
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

/** `rooms/{roomId}/players/{uid}` */
export interface PlayerDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  stack: number;
  status: PlayerStatus;
  seatIndex: number | null;
  totalRebuys: number;
  lastSeen: Timestamp | null;
  joinedAt: Timestamp;
}

/** `codes/{code}`: what someone holding a join code can see before joining. */
export interface CodeDoc {
  roomId: string;
  name: string;
  salt: string;
  hasPassword: boolean;
  createdAt: Timestamp;
}

/** `rooms/{roomId}/members/{uid}`: proof the user knew the code (and password). Write-once. */
export interface MemberDoc {
  code: string;
  passwordHash: string | null;
  createdAt: Timestamp;
}

/** The bits of an auth user the data layer needs. */
export interface Identity {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

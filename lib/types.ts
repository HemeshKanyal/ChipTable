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
  /** The hand in progress, if any. Rooms created before Phase 3 lack these four fields. */
  currentHandId?: string | null;
  /** Most recent finished hand, for "last hand" display and payout animation. */
  lastHandId?: string | null;
  handCount?: number;
  /** Dealer button of the latest hand. */
  buttonSeat?: number | null;
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

export type HandStatus = "betting" | "voting" | "complete" | "cancelled";

/** One line of the live feed: "Rahul +200". */
export interface HandAction {
  uid: string;
  amount: number;
  at: Timestamp;
}

export interface HandResult {
  /** Clockwise from the button; the first one got any odd chips. Empty when cancelled. */
  winners: string[];
  /** uid → chips paid back. Sums to the pot. */
  payouts: Record<string, number>;
  decidedBy: "vote" | "cancelled";
  /** Final round's breakdown: choice key (sorted uids, comma-joined) → ballots. */
  tally: Record<string, number>;
  voteRounds: number;
}

/** `rooms/{roomId}/hands/{handId}` (wallet mode for now) */
export interface HandDoc {
  number: number;
  mode: "wallet";
  status: HandStatus;
  buttonSeat: number;
  pot: number;
  contributions: Record<string, number>;
  actions: HandAction[];
  /** Seated players dealt in when the hand started. */
  participants: string[];
  voteId: string | null;
  startedBy: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  result: HandResult | null;
}

export type VoteStatus = "open" | "accepted" | "redone" | "cancelled";

/** `rooms/{roomId}/votes/{voteId}` */
export interface VoteDoc {
  type: "winner";
  handId: string;
  potIndex: number;
  round: number;
  openedAt: Timestamp;
  durationMs: number;
  /** Who can be chosen. */
  candidates: string[];
  /** Who can vote: everyone seated when the vote opened. */
  voterUids: string[];
  /** voter uid → chosen winners (several = split pot). */
  ballots: Record<string, string[]>;
  status: VoteStatus;
  hostDecision: { winners: string[] } | null;
  closedAt: Timestamp | null;
}

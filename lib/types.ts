import type { Timestamp } from "firebase/firestore";
import type { ActionType, HandState, Pot, Street } from "@/lib/engine/types";
import type { PlayerStatus, SeatMap } from "@/lib/room/seating";
import type { RoomSettings } from "@/lib/room/settings";

/** `users/{uid}` */
export interface UserProfile {
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
  /** Sounds off. Missing = sounds on. */
  muted?: boolean;
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
  /** The room-reset vote in progress, if any. */
  resetVoteId?: string | null;
  /** When the current season began; the room's createdAt for the first one. */
  seasonStartedAt?: Timestamp;
}

/** `rooms/{roomId}/players/{uid}` */
export interface PlayerDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  stack: number;
  status: PlayerStatus;
  seatIndex: number | null;
  /** Approved rebuys this season. */
  totalRebuys: number;
  /** The request behind the latest rebuy (the Rules check the stack grew by its amount). */
  lastRebuyId?: string;
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

/**
 * betting: chips going in. showdown (guided only): betting is over and the cards decide; the host
 * opens the vote. voting: winner vote(s) open. complete / cancelled: paid out or called off.
 */
export type HandStatus = "betting" | "showdown" | "voting" | "complete" | "cancelled";

/** One line of the live feed: "Rahul +200". */
export interface HandAction {
  uid: string;
  amount: number;
  at: Timestamp;
}

/** How one pot of a guided hand was decided. */
export interface PotResult {
  amount: number;
  eligible: string[];
  winners: string[];
  /** Choice key → ballots from the accepted round. Empty when only one player could win it. */
  tally: Record<string, number>;
  voteRounds: number;
}

export interface HandResult {
  /** Clockwise from the button; the first one got any odd chips. Empty when cancelled. */
  winners: string[];
  /** uid → chips paid back. Sums to the pot. */
  payouts: Record<string, number>;
  decidedBy: "vote" | "fold" | "cancelled";
  /** Final round's breakdown: choice key (sorted uids, comma-joined) → ballots. Guided: the main pot. */
  tally: Record<string, number>;
  voteRounds: number;
  /** Guided showdowns: each pot and who won it. */
  pots?: PotResult[];
  /** Every participant's stack once the hand was paid (complete hands). For stack timelines. */
  stacksAfter?: Record<string, number>;
}

interface HandBase {
  number: number;
  /** The season it was played in. Hands from before Phase 6 lack it (season "s1"). */
  seasonId?: string;
  status: HandStatus;
  buttonSeat: number;
  /** Everything in the middle. */
  pot: number;
  /** uid → chips put in over the whole hand. */
  contributions: Record<string, number>;
  /** Seated players dealt in when the hand started. */
  participants: string[];
  startedBy: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  result: HandResult | null;
}

/** `rooms/{roomId}/hands/{handId}` in wallet mode. Chips leave a stack the moment they go in. */
export interface WalletHandDoc extends HandBase {
  mode: "wallet";
  actions: HandAction[];
  voteId: string | null;
}

/** The latest move in a guided hand: who acted (checked by the Rules) and what they did. */
export interface GuidedLastAction {
  uid: string;
  type: ActionType;
  amount: number;
}

/**
 * Guided mode. The engine state is the source of truth while the hand runs; player stacks don't
 * move until it settles (stack − chips put in + payout).
 */
export interface GuidedHandDoc extends HandBase {
  mode: "guided";
  engine: HandState;
  /** Mirrors engine.toAct so the Rules can check whose turn it is. */
  toActUid: string | null;
  street: Street;
  /** Main pot, then side pots. */
  pots: Pot[];
  /** One winner vote per pot (index-aligned); null for a pot only one player can win. */
  voteIds: (string | null)[];
  /** Bumped by every action, so a stale double tap can't land twice. */
  actionCount: number;
  lastAction: GuidedLastAction | null;
}

/** `rooms/{roomId}/hands/{handId}` */
export type HandDoc = WalletHandDoc | GuidedHandDoc;

export type VoteStatus = "open" | "accepted" | "redone" | "cancelled";

/** `rooms/{roomId}/votes/{voteId}`. A guided showdown opens one per contested pot. */
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

export type ResetVoteStatus = "open" | "accepted" | "failed" | "cancelled";

/**
 * `rooms/{roomId}/votes/{voteId}` with type "reset": anyone at the table proposes resetting every
 * stack. Passes with yes from more than half the voters; then the host confirms.
 */
export interface ResetVoteDoc {
  type: "reset";
  proposedBy: string;
  openedAt: Timestamp;
  durationMs: number;
  candidates: ["yes", "no"];
  /** Everyone at the table (seated or sitting out) when it opened. */
  voterUids: string[];
  /** voter uid → ["yes"] or ["no"] (same shape as winner ballots). */
  ballots: Record<string, string[]>;
  status: ResetVoteStatus;
  closedAt: Timestamp | null;
}

export type RebuyStatus = "pending" | "approved" | "denied" | "cancelled";

/** `rooms/{roomId}/requests/{requestId}`: a player asks the host for more chips. Kept as history. */
export interface RebuyRequestDoc {
  uid: string;
  amount: number;
  seasonId: string;
  status: RebuyStatus;
  createdAt: Timestamp;
  decidedAt: Timestamp | null;
}

/** `rooms/{roomId}/seasons/{seasonId}`: a finished season, archived when the room was reset. */
export interface SeasonDoc {
  number: number;
  startedAt: Timestamp;
  endedAt: Timestamp;
  startingStack: number;
  /** Everyone who had a seat that season, as they finished. */
  finalStacks: Record<string, { displayName: string; stack: number; totalRebuys: number }>;
  resetVoteId: string;
}

/** `rooms/{roomId}/nudges/{senderUid}`: one doc per sender, so the Rules can rate-limit it. */
export interface NudgeDoc {
  to: string;
  /** Index into NUDGE_PRESETS. */
  preset: number;
  at: Timestamp;
}

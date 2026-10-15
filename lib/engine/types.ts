// Guided-mode (No-Limit Texas Hold'em) betting engine types. Everything here is plain data so a
// HandState can be stored in Firestore as-is: no classes, no undefined, no Dates.

export type Street = "preflop" | "flop" | "turn" | "river";

/**
 * betting: someone is to act.
 * showdown: betting is over; cards decide the pot(s). If `runout` is set, the dealer still has to
 *   deal the rest of the board first.
 * complete: everyone else folded; `winnerByFold` takes it all.
 */
export type HandPhase = "betting" | "showdown" | "complete";

export interface SeatPlayer {
  uid: string;
  seat: number;
  stack: number;
}

export interface EnginePlayer {
  uid: string;
  seat: number;
  /** Chips behind, not yet put in. */
  stack: number;
  /** Put in on the current street. */
  committed: number;
  /** Put in over the whole hand, including `committed`. */
  totalIn: number;
  folded: boolean;
  allIn: boolean;
  /**
   * The table's current bet when this player last acted voluntarily this street, or null if
   * they haven't. A player may raise only if the bet has grown by at least a full raise since
   * then. That's how incomplete all-in raises don't reopen the action.
   */
  actedAt: number | null;
}

export type ActionType = "post-sb" | "post-bb" | "fold" | "check" | "call" | "bet" | "raise";

export interface ActionLogEntry {
  uid: string;
  type: ActionType;
  /** Chips added by this action. */
  amount: number;
  /** The player's total on this street afterwards. */
  to: number;
  street: Street;
  allIn: boolean;
}

export interface HandState {
  sb: number;
  bb: number;
  /** Seats at the table (room maxPlayers). Needed for clockwise order. */
  maxSeats: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  /** Players dealt in, in seat order. */
  players: EnginePlayer[];
  street: Street;
  phase: HandPhase;
  toAct: string | null;
  /** Highest total anyone must match on this street. */
  currentBet: number;
  /** Minimum raise increment: the size of the last full bet or raise this street (at least the BB). */
  minRaise: number;
  /** Betting ended early because at most one player could still bet: run out the board. */
  runout: boolean;
  winnerByFold: string | null;
  log: ActionLogEntry[];
}

export type PlayerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  /** Raise (or bet) to this total for the street. */
  | { type: "raise"; to: number }
  | { type: "allIn" };

export interface LegalActions {
  fold: boolean;
  check: boolean;
  /** Chips needed to call, or null if there's nothing to call. Capped at the stack. */
  call: number | null;
  /** Calling puts the player all-in. */
  callIsAllIn: boolean;
  /** Raise-to range for the street, or null if raising isn't allowed. min == max means all-in only. */
  raise: { min: number; max: number } | null;
}

export interface Pot {
  amount: number;
  /** Players who can win it, in seat order. */
  eligible: string[];
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

import {
  EngineError,
  type ActionLogEntry,
  type ActionType,
  type EnginePlayer,
  type HandState,
  type LegalActions,
  type PlayerAction,
  type SeatPlayer,
  type Street,
} from "./types";

const NEXT_STREET: Record<Street, Street | null> = { preflop: "flop", flop: "turn", turn: "river", river: null };

const isInt = (n: number) => Number.isSafeInteger(n);

function clone(state: HandState): HandState {
  return { ...state, players: state.players.map((p) => ({ ...p })), log: [...state.log] };
}

function player(state: HandState, uid: string): EnginePlayer {
  const p = state.players.find((x) => x.uid === uid);
  if (!p) throw new EngineError(`${uid} isn't in this hand`);
  return p;
}

/** First player clockwise after `seat` (wrapping, `seat` itself last) that matches. */
function nextFrom(players: EnginePlayer[], seat: number, match: (p: EnginePlayer) => boolean): EnginePlayer | null {
  const after = players.filter((p) => p.seat > seat);
  const upTo = players.filter((p) => p.seat <= seat);
  return [...after, ...upTo].find(match) ?? null;
}

function put(p: EnginePlayer, amount: number) {
  p.stack -= amount;
  p.committed += amount;
  p.totalIn += amount;
  if (p.stack === 0) p.allIn = true;
}

function log(state: HandState, p: EnginePlayer, type: ActionType, amount: number) {
  const entry: ActionLogEntry = { uid: p.uid, type, amount, to: p.committed, street: state.street, allIn: p.allIn };
  state.log.push(entry);
}

// ------------------------------------------------------------------ start

export interface StartHandInput {
  players: SeatPlayer[];
  buttonSeat: number;
  sb: number;
  bb: number;
  maxSeats: number;
}

/**
 * Deals a hand: posts the blinds and finds the first player to act.
 * Heads-up, the button posts the small blind and acts first preflop.
 */
export function startHand({ players: seated, buttonSeat, sb, bb, maxSeats }: StartHandInput): HandState {
  if (!isInt(sb) || !isInt(bb) || sb < 1 || bb < sb) throw new EngineError("Blinds must be whole numbers with 1 ≤ SB ≤ BB");
  const dealt = seated.filter((p) => p.stack > 0);
  if (dealt.length < 2) throw new EngineError("Need at least two players with chips");
  if (new Set(dealt.map((p) => p.seat)).size !== dealt.length) throw new EngineError("Two players share a seat");
  if (dealt.some((p) => !isInt(p.stack) || p.seat < 0 || p.seat >= maxSeats)) throw new EngineError("Bad seat or stack");
  if (!dealt.some((p) => p.seat === buttonSeat)) throw new EngineError("The button must be on a player dealt in");

  const players: EnginePlayer[] = dealt
    .map((p) => ({
      uid: p.uid,
      seat: p.seat,
      stack: p.stack,
      committed: 0,
      totalIn: 0,
      folded: false,
      allIn: false,
      actedAt: null,
    }))
    .sort((a, b) => a.seat - b.seat);

  const headsUp = players.length === 2;
  const sbPlayer = headsUp ? players.find((p) => p.seat === buttonSeat)! : nextFrom(players, buttonSeat, () => true)!;
  const bbPlayer = nextFrom(players, sbPlayer.seat, (p) => p !== sbPlayer)!;

  const state: HandState = {
    sb,
    bb,
    maxSeats,
    buttonSeat,
    sbSeat: sbPlayer.seat,
    bbSeat: bbPlayer.seat,
    players,
    street: "preflop",
    phase: "betting",
    toAct: null,
    // Everyone has to match the full big blind, even if the BB is short.
    currentBet: bb,
    minRaise: bb,
    runout: false,
    winnerByFold: null,
    log: [],
  };

  put(sbPlayer, Math.min(sb, sbPlayer.stack));
  log(state, sbPlayer, "post-sb", sbPlayer.committed);
  put(bbPlayer, Math.min(bb, bbPlayer.stack));
  log(state, bbPlayer, "post-bb", bbPlayer.committed);

  // Posting a blind isn't acting: the BB still gets their option.
  return advance(state, bbPlayer.seat);
}

// ------------------------------------------------------------------ queries

function needsAction(state: HandState, p: EnginePlayer): boolean {
  return !p.folded && !p.allIn && (p.actedAt === null || p.committed < state.currentBet);
}

/** Who acts next after `fromSeat`, or null if this betting round is over. */
function findNextToAct(state: HandState, fromSeat: number): string | null {
  const live = state.players.filter((p) => !p.folded);
  const canBet = live.filter((p) => !p.allIn);
  if (canBet.length === 0) return null;
  if (canBet.length === 1) {
    // Nobody left to bet against: they only act if they still owe chips to someone all-in.
    const p = canBet[0];
    const owed = Math.max(0, ...live.filter((o) => o !== p).map((o) => o.committed));
    return p.committed < owed ? p.uid : null;
  }
  return nextFrom(state.players, fromSeat, (p) => needsAction(state, p))?.uid ?? null;
}

export function legalActions(state: HandState, uid: string): LegalActions {
  const none: LegalActions = { fold: false, check: false, call: null, callIsAllIn: false, raise: null };
  if (state.phase !== "betting" || state.toAct !== uid) return none;
  const p = player(state, uid);

  const toCall = Math.max(0, state.currentBet - p.committed);
  const allInTo = p.committed + p.stack;
  const othersCanRespond = state.players.some((o) => o !== p && !o.folded && !o.allIn);
  const reopened = p.actedAt === null || state.currentBet - p.actedAt >= state.minRaise;
  const canRaise = othersCanRespond && reopened && allInTo > state.currentBet;

  return {
    fold: true,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, p.stack) : null,
    callIsAllIn: toCall > 0 && toCall >= p.stack,
    raise: canRaise ? { min: Math.min(state.currentBet + state.minRaise, allInTo), max: allInTo } : null,
  };
}

/** Everything in the middle, including bets on the current street. */
export function potTotal(state: HandState): number {
  return state.players.reduce((sum, p) => sum + p.totalIn, 0);
}

// ------------------------------------------------------------------ actions

export function applyAction(prev: HandState, uid: string, action: PlayerAction): HandState {
  if (prev.phase !== "betting") throw new EngineError("Betting is over for this hand");
  if (prev.toAct !== uid) throw new EngineError("It isn't your turn");
  const legal = legalActions(prev, uid);
  const state = clone(prev);
  const p = player(state, uid);

  switch (action.type) {
    case "fold": {
      p.folded = true;
      log(state, p, "fold", 0);
      const live = state.players.filter((x) => !x.folded);
      if (live.length === 1) {
        state.phase = "complete";
        state.toAct = null;
        state.winnerByFold = live[0].uid;
        return state;
      }
      break;
    }
    case "check": {
      if (!legal.check) throw new EngineError("You can't check facing a bet");
      p.actedAt = state.currentBet;
      log(state, p, "check", 0);
      break;
    }
    case "call": {
      if (legal.call === null) throw new EngineError("There's nothing to call");
      put(p, legal.call);
      p.actedAt = state.currentBet;
      log(state, p, "call", legal.call);
      break;
    }
    case "allIn": {
      if (legal.raise) return applyAction(prev, uid, { type: "raise", to: legal.raise.max });
      if (legal.callIsAllIn) return applyAction(prev, uid, { type: "call" });
      throw new EngineError("You can only call here, not go all-in");
    }
    case "raise": {
      const to = action.to;
      if (!legal.raise) throw new EngineError("You can't raise right now");
      if (!isInt(to)) throw new EngineError("Raise to a whole number of chips");
      if (to < legal.raise.min) throw new EngineError(`The minimum raise is to ${legal.raise.min}`);
      if (to > legal.raise.max) throw new EngineError(`You only have ${legal.raise.max} in total`);
      const increment = to - state.currentBet;
      const full = increment >= state.minRaise;
      // A raise smaller than a full raise is only allowed as an all-in, and doesn't reopen the action.
      if (!full && to !== legal.raise.max) throw new EngineError(`The minimum raise is to ${state.currentBet + state.minRaise}`);
      const type: ActionType = state.currentBet === 0 ? "bet" : "raise";
      const added = to - p.committed;
      put(p, added);
      if (full) state.minRaise = increment;
      state.currentBet = to;
      p.actedAt = to;
      log(state, p, type, added);
      break;
    }
    default:
      throw new EngineError("Unknown action");
  }

  return advance(state, p.seat);
}

// ------------------------------------------------------------------ rounds

/** Sets the next player to act, or closes the round and moves the hand along. */
function advance(state: HandState, fromSeat: number): HandState {
  const next = findNextToAct(state, fromSeat);
  if (next) {
    state.toAct = next;
    return state;
  }
  return closeRound(state);
}

function closeRound(state: HandState): HandState {
  returnUncalledBet(state);
  for (const p of state.players) {
    p.committed = 0;
    p.actedAt = null;
  }
  state.toAct = null;
  state.currentBet = 0;
  state.minRaise = state.bb;

  const canBet = state.players.filter((p) => !p.folded && !p.allIn);
  const next = NEXT_STREET[state.street];
  if (!next) {
    state.phase = "showdown";
    return state;
  }
  if (canBet.length <= 1) {
    // Everyone (or all but one) is all-in: no more betting, just deal the rest of the board.
    state.phase = "showdown";
    state.runout = true;
    return state;
  }
  state.street = next;
  // Postflop, the first live player left of the button acts first (heads-up, that's the BB).
  return advance(state, state.buttonSeat);
}

/** If one player bet more than anyone else could match, give them the difference back. */
function returnUncalledBet(state: HandState) {
  const sorted = [...state.players].sort((a, b) => b.committed - a.committed);
  const [top, second] = sorted;
  const excess = top.committed - (second?.committed ?? 0);
  if (excess > 0) {
    top.stack += excess;
    top.committed -= excess;
    top.totalIn -= excess;
    if (top.stack > 0) top.allIn = false;
  }
}

/** The cards the dealer still has to put out before showdown, e.g. "the TURN and RIVER". */
export function cardsToDeal(state: HandState): Street[] {
  if (state.phase !== "showdown" || !state.runout) return [];
  const order: Street[] = ["flop", "turn", "river"];
  const dealtThrough = state.street === "preflop" ? -1 : order.indexOf(state.street);
  return order.slice(dealtThrough + 1);
}

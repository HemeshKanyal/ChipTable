import { potTotal } from "./betting";
import { orderFromButton, splitPot } from "./split";
import { EngineError, type HandState, type Pot } from "./types";

interface PotInput {
  uid: string;
  totalIn: number;
  folded: boolean;
}

/**
 * Main pot and side pots from what everyone put in over the hand. Each all-in level caps a pot
 * that only players who reached it can win. Folded players' chips stay in but they can't win.
 * Pots with the same eligible players are merged.
 */
export function computePots(players: PotInput[]): Pot[] {
  const live = players.filter((p) => !p.folded);
  const levels = [...new Set(live.map((p) => p.totalIn))].filter((l) => l > 0).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = players.reduce((sum, p) => sum + Math.min(Math.max(p.totalIn - prev, 0), level - prev), 0);
    const eligible = live.filter((p) => p.totalIn >= level).map((p) => p.uid);
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // A folded player can have put in more than anyone still in (e.g. bet, then folded to a raise
  // from a shorter stack that went all-in). Those chips go to the top pot.
  const excess = players.reduce((sum, p) => sum + Math.max(0, p.totalIn - prev), 0);
  if (excess > 0) {
    if (pots.length === 0) pots.push({ amount: excess, eligible: live.map((p) => p.uid) });
    else pots[pots.length - 1].amount += excess;
  }
  return pots;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function handPots(state: HandState): Pot[] {
  return computePots(state.players);
}

/**
 * The pots as they stand right now, for showing at the table. While betting, only all-in players
 * cap a pot: anyone still betting can reach every level, so they're in every pot. Once betting is
 * over this is the same as handPots.
 */
export function currentPots(state: HandState): Pot[] {
  if (state.phase !== "betting") return handPots(state);
  const live = state.players.filter((p) => !p.folded);
  const caps = [...new Set(live.filter((p) => p.allIn).map((p) => p.totalIn))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of [...caps, Infinity]) {
    const amount = state.players.reduce((sum, p) => sum + Math.max(0, Math.min(p.totalIn, level) - prev), 0);
    const eligible = live.filter((p) => !p.allIn || p.totalIn >= level).map((p) => p.uid);
    const last = pots[pots.length - 1];
    if (amount > 0 && last && (eligible.length === 0 || sameSet(last.eligible, eligible))) last.amount += amount;
    else if (amount > 0) pots.push({ amount, eligible: eligible.length ? eligible : live.map((p) => p.uid) });
    prev = level;
  }
  return pots;
}

/**
 * Pays the hand out. Win by fold: everything to the last player. Showdown: `winnersByPot[i]`
 * are the winners of pot i (a split if several). A pot only one player can win may be left
 * empty and is awarded automatically. Odd chips in a split go to the first winner clockwise
 * from the button.
 */
export function settle(state: HandState, winnersByPot: string[][] = []): Record<string, number> {
  if (state.phase === "complete") {
    if (!state.winnerByFold) throw new EngineError("Hand is complete without a winner");
    return { [state.winnerByFold]: potTotal(state) };
  }
  if (state.phase !== "showdown") throw new EngineError("The hand isn't at showdown yet");

  const pots = handPots(state);
  if (winnersByPot.length > pots.length) throw new EngineError("More winner lists than pots");
  const seatOf = new Map(state.players.map((p) => [p.uid, p.seat]));
  const payouts: Record<string, number> = {};

  pots.forEach((pot, i) => {
    let winners = winnersByPot[i] ?? [];
    if (winners.length === 0 && pot.eligible.length === 1) winners = pot.eligible;
    if (winners.length === 0) throw new EngineError(`Pot ${i + 1} needs a winner`);
    if (new Set(winners).size !== winners.length) throw new EngineError("A winner is listed twice");
    for (const w of winners) {
      if (!pot.eligible.includes(w)) throw new EngineError(`${w} can't win pot ${i + 1}`);
    }
    const ordered = orderFromButton(
      winners.map((uid) => ({ uid, seatIndex: seatOf.get(uid) ?? null })),
      state.buttonSeat,
      state.maxSeats,
    );
    for (const [uid, amount] of Object.entries(splitPot(pot.amount, ordered))) {
      payouts[uid] = (payouts[uid] ?? 0) + amount;
    }
  });
  return payouts;
}

/** Pots that need a decision (more than one player could win them). */
export function contestedPots(state: HandState): number[] {
  return handPots(state)
    .map((pot, i) => (pot.eligible.length > 1 ? i : -1))
    .filter((i) => i >= 0);
}

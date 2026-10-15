export interface SeatedUid {
  uid: string;
  seatIndex: number | null;
}

/** Winners ordered clockwise starting left of the button. Players without a seat go last. */
export function orderFromButton(winners: SeatedUid[], buttonSeat: number, maxSeats: number): string[] {
  const distance = (s: number | null) => (s === null ? Infinity : (s - buttonSeat - 1 + maxSeats) % maxSeats);
  return [...winners]
    .sort((a, b) => distance(a.seatIndex) - distance(b.seatIndex) || a.uid.localeCompare(b.uid))
    .map((w) => w.uid);
}

/**
 * Splits a pot evenly between winners. Spec: odd chips go to the first winner clockwise from
 * the button, so `orderedWinners` must already be in that order (see orderFromButton).
 */
export function splitPot(amount: number, orderedWinners: string[]): Record<string, number> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`Bad pot amount: ${amount}`);
  if (orderedWinners.length === 0) throw new RangeError("A pot needs at least one winner");
  if (new Set(orderedWinners).size !== orderedWinners.length) throw new RangeError("Duplicate winner");
  const share = Math.floor(amount / orderedWinners.length);
  const remainder = amount - share * orderedWinners.length;
  const payouts: Record<string, number> = {};
  orderedWinners.forEach((uid, i) => (payouts[uid] = share + (i === 0 ? remainder : 0)));
  return payouts;
}

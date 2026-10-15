/** Seats after `from`, wrapping, i.e. clockwise around the table. `from` comes last. */
export function clockwiseFrom(from: number, maxSeats: number): number[] {
  return Array.from({ length: maxSeats }, (_, i) => (from + 1 + i) % maxSeats);
}

/**
 * Dealer button for the next hand: the first occupied seat clockwise after the previous
 * button. With no previous button, the lowest occupied seat. (No dead-button rule: the
 * button always lands on a player.)
 */
export function nextButtonSeat(prevButton: number | null, occupiedSeats: number[], maxSeats: number): number | null {
  if (occupiedSeats.length === 0) return null;
  const occupied = new Set(occupiedSeats);
  return clockwiseFrom(prevButton ?? maxSeats - 1, maxSeats).find((s) => occupied.has(s)) ?? null;
}

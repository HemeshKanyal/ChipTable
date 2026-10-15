/** Who can be voted the winner: everyone dealt in, plus anyone who put chips in later. */
export function winnerCandidates(participants: string[], contributions: Record<string, number>): string[] {
  return [...new Set([...participants, ...Object.keys(contributions)])];
}

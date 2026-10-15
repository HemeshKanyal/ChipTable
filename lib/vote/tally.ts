export type Ballots = Record<string, string[]>;

export interface Choice {
  /** Canonical key: sorted winner uids joined by commas. */
  key: string;
  winners: string[];
  count: number;
  voters: string[];
}

export interface Tally {
  choices: Choice[];
  totalBallots: number;
  /** The winning choice if it has more than half the ballots cast. */
  majority: Choice | null;
  /** Choices tied for the most votes. The host picks from these when there's no majority. */
  top: Choice[];
}

export const choiceKey = (winners: string[]) => [...new Set(winners)].sort().join(",");

export function tallyBallots(ballots: Ballots): Tally {
  const byKey = new Map<string, Choice>();
  for (const [voter, winners] of Object.entries(ballots)) {
    if (!winners?.length) continue;
    const key = choiceKey(winners);
    const choice = byKey.get(key) ?? { key, winners: key.split(","), count: 0, voters: [] };
    choice.count++;
    choice.voters.push(voter);
    byKey.set(key, choice);
  }
  const choices = [...byKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const totalBallots = choices.reduce((n, c) => n + c.count, 0);
  const best = choices[0]?.count ?? 0;
  return {
    choices,
    totalBallots,
    majority: choices[0] && choices[0].count * 2 > totalBallots ? choices[0] : null,
    top: choices.filter((c) => c.count === best && best > 0),
  };
}

export const VOTE_DURATION_MS = 30_000;

/** Voting is over once time is up or every eligible voter has a ballot in. */
export function voteIsDecided(openedAt: number, ballots: Ballots, voterUids: string[], now: number): boolean {
  return now >= openedAt + VOTE_DURATION_MS || voterUids.every((uid) => (ballots[uid]?.length ?? 0) > 0);
}

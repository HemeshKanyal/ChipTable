// Room-reset vote: pure counting, mirrored by resetPassed() in firestore.rules.
import type { Ballots } from "./tally";

export const RESET_VOTE_MS = 30_000;

export interface ResetTally {
  yes: number;
  no: number;
  /** Yes votes needed: more than half of everyone who can vote (not just those who did). */
  needed: number;
  passed: boolean;
  /** Can't pass any more: time is up, or everyone has voted, without enough yes. */
  failed: boolean;
}

export function tallyReset(ballots: Ballots, voterUids: string[], openedAt: number, now: number): ResetTally {
  const said = (uid: string) => ballots[uid]?.[0];
  const yes = voterUids.filter((uid) => said(uid) === "yes").length;
  const no = voterUids.filter((uid) => said(uid) === "no").length;
  const needed = Math.floor(voterUids.length / 2) + 1;
  const passed = yes >= needed;
  const over = now >= openedAt + RESET_VOTE_MS || yes + no === voterUids.length;
  return { yes, no, needed, passed, failed: !passed && over };
}

/** Seasons are "s1", "s2", … */
export function seasonNumber(seasonId: string): number {
  const n = Number(/^s(\d+)$/.exec(seasonId)?.[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

export const nextSeasonId = (seasonId: string) => `s${seasonNumber(seasonId) + 1}`;

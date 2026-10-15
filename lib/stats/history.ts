// Leaderboard, sessions and stack timelines, worked out from a season's hands. Pure: no Firebase.
import type { HandDoc, RebuyRequestDoc } from "@/lib/types";

export type HandRecord = HandDoc & { id: string };
export type RebuyRecord = RebuyRequestDoc & { id: string };

const ms = (t: { toMillis(): number } | null | undefined) => t?.toMillis() ?? 0;

/** Hands that finished with a payout (not called off), oldest first. */
export function playedHands(hands: HandRecord[]): HandRecord[] {
  return hands.filter((h) => h.status === "complete" && h.result).sort((a, b) => a.number - b.number);
}

/** Who was in a hand: dealt in, or put chips in. */
export function handPlayers(h: HandRecord): string[] {
  return [...new Set([...h.participants, ...Object.keys(h.contributions)])];
}

/** A player's stack just before the hand: after, minus what they won, plus what they put in. */
export function stackBefore(h: HandRecord, uid: string): number | null {
  const after = h.result?.stacksAfter?.[uid];
  if (after === undefined) return null;
  return after - (h.result!.payouts[uid] ?? 0) + (h.contributions[uid] ?? 0);
}

/** Chips a player was paid from a hand (the pot or their share of it). */
const won = (h: HandRecord, uid: string) => h.result?.payouts[uid] ?? 0;

// ------------------------------------------------------------------ leaderboard

export interface StandingInput {
  uid: string;
  name: string;
  stack: number;
  rebuys: number;
  /** Still at the table (current season), so they show even before playing a hand. */
  active: boolean;
}

export interface Standing {
  uid: string;
  name: string;
  stack: number;
  rebuys: number;
  /** stack − starting stack − rebuys. */
  net: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  /** handsWon / handsPlayed, 0 when they haven't played. */
  winRate: number;
}

export function leaderboard(people: StandingInput[], hands: HandRecord[], startingStack: number): Standing[] {
  const played = playedHands(hands);
  const rows: Standing[] = [];
  for (const p of people) {
    const mine = played.filter((h) => handPlayers(h).includes(p.uid));
    // Someone who left without playing a hand isn't part of this season.
    if (!p.active && mine.length === 0) continue;
    const wins = mine.filter((h) => won(h, p.uid) > 0);
    rows.push({
      uid: p.uid,
      name: p.name,
      stack: p.stack,
      rebuys: p.rebuys,
      net: p.stack - startingStack - p.rebuys,
      handsPlayed: mine.length,
      handsWon: wins.length,
      biggestPot: Math.max(0, ...wins.map((h) => won(h, p.uid))),
      winRate: mine.length ? wins.length / mine.length : 0,
    });
  }
  return rows.sort((a, b) => b.net - a.net || b.handsWon - a.handsWon || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ sessions

/** Hands further apart than this start a new session ("one evening of play"). */
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

export interface SessionPlayer {
  uid: string;
  start: number;
  end: number;
  rebuys: number;
  /** end − start − rebuys during the session. */
  net: number;
  handsWon: number;
}

export interface TimelinePoint {
  /** 0 = before the first hand, then each hand's number. */
  hand: number;
  /** Stacks known at this point (players appear once they've played). */
  stacks: Record<string, number>;
}

export interface Session {
  startedAt: number;
  endedAt: number;
  hands: HandRecord[];
  players: SessionPlayer[];
  biggestPot: { uid: string; amount: number; hand: number } | null;
  timeline: TimelinePoint[];
}

/**
 * Groups finished hands into sessions and summarises each: who's up or down, the biggest pot, and
 * everyone's stack after every hand. Only hands that recorded stacksAfter can be charted; older
 * ones still count towards the session's hands.
 */
export function sessions(hands: HandRecord[], rebuys: RebuyRecord[], gapMs = SESSION_GAP_MS): Session[] {
  const played = playedHands(hands);
  const groups: HandRecord[][] = [];
  for (const h of played) {
    const last = groups.at(-1)?.at(-1);
    const gap = last ? ms(h.startedAt) - (ms(last.endedAt) || ms(last.startedAt)) : Infinity;
    if (!last || gap > gapMs) groups.push([h]);
    else groups.at(-1)!.push(h);
  }
  const approved = rebuys.filter((r) => r.status === "approved");
  return groups.map((g) => summarise(g, approved)).reverse();
}

function summarise(hands: HandRecord[], rebuys: RebuyRecord[]): Session {
  const startedAt = ms(hands[0].startedAt);
  const endedAt = ms(hands.at(-1)!.endedAt) || ms(hands.at(-1)!.startedAt);

  const timeline: TimelinePoint[] = [{ hand: 0, stacks: {} }];
  const start: Record<string, number> = {};
  const current: Record<string, number> = {};
  for (const h of hands) {
    const after = h.result?.stacksAfter;
    if (!after) continue;
    for (const uid of Object.keys(after)) {
      if (!(uid in start)) {
        start[uid] = stackBefore(h, uid)!;
        timeline[0].stacks[uid] = start[uid];
      }
      current[uid] = after[uid];
    }
    timeline.push({ hand: h.number, stacks: { ...current } });
  }

  const players: SessionPlayer[] = Object.keys(start)
    .map((uid) => {
      const added = rebuys
        .filter((r) => r.uid === uid && ms(r.decidedAt) >= startedAt && ms(r.decidedAt) <= endedAt)
        .reduce((n, r) => n + r.amount, 0);
      return {
        uid,
        start: start[uid],
        end: current[uid],
        rebuys: added,
        net: current[uid] - start[uid] - added,
        handsWon: hands.filter((h) => won(h, uid) > 0).length,
      };
    })
    .sort((a, b) => b.net - a.net);

  let biggestPot: Session["biggestPot"] = null;
  for (const h of hands) {
    for (const [uid, amount] of Object.entries(h.result!.payouts)) {
      if (amount > (biggestPot?.amount ?? 0)) biggestPot = { uid, amount, hand: h.number };
    }
  }
  return { startedAt, endedAt, hands, players, biggestPot, timeline: timeline.length > 1 ? timeline : [] };
}

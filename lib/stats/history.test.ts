import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { tallyReset, nextSeasonId, seasonNumber } from "../vote/reset";
import { leaderboard, sessions, stackBefore, type HandRecord, type RebuyRecord } from "./history";

const T0 = Date.UTC(2026, 9, 10, 19); // 7pm
const at = (offsetMs: number) => Timestamp.fromMillis(T0 + offsetMs);

/** A finished wallet hand: who put in what, who was paid what, and stacks before it. */
function hand(
  number: number,
  minutes: number,
  contributions: Record<string, number>,
  payouts: Record<string, number>,
  before: Record<string, number>,
  status: "complete" | "cancelled" = "complete",
): HandRecord {
  const stacksAfter = Object.fromEntries(
    Object.entries(before).map(([uid, s]) => [uid, s - (contributions[uid] ?? 0) + (payouts[uid] ?? 0)]),
  );
  return {
    id: `h${number}`,
    number,
    seasonId: "s1",
    mode: "wallet",
    status,
    buttonSeat: 0,
    pot: Object.values(contributions).reduce((a, b) => a + b, 0),
    contributions,
    actions: [],
    participants: Object.keys(before),
    voteId: null,
    startedBy: "ann",
    startedAt: at(minutes * 60_000),
    endedAt: at(minutes * 60_000 + 60_000),
    result: {
      winners: Object.keys(payouts),
      payouts,
      decidedBy: status === "cancelled" ? "cancelled" : "vote",
      tally: {},
      voteRounds: 1,
      stacksAfter,
    },
  };
}

const rebuy = (uid: string, amount: number, minutes: number, status: RebuyRecord["status"] = "approved"): RebuyRecord => ({
  id: `r-${uid}-${minutes}`,
  uid,
  amount,
  seasonId: "s1",
  status,
  createdAt: at(minutes * 60_000),
  decidedAt: at(minutes * 60_000),
});

// Evening 1: Ann wins 200 then Bob wins 100. Bob rebuys 500 between hands.
// Evening 2 (next day): Ann wins 50.
const H = [
  hand(1, 0, { ann: 100, bob: 100 }, { ann: 200 }, { ann: 1000, bob: 1000 }),
  hand(2, 10, { ann: 50, bob: 50 }, { bob: 100 }, { ann: 1100, bob: 1400 }),
  hand(3, 20, { ann: 10 }, {}, { ann: 1050, bob: 1450 }, "cancelled"),
  hand(4, 24 * 60, { ann: 25, bob: 25 }, { ann: 50 }, { ann: 1050, bob: 1450 }),
];
const R = [rebuy("bob", 500, 5), rebuy("bob", 999, 6, "denied")];

describe("stackBefore", () => {
  it("is the stack after, less winnings, plus what went in", () => {
    expect(stackBefore(H[1], "bob")).toBe(1400);
    expect(stackBefore(H[1], "cat")).toBeNull();
  });
});

describe("leaderboard", () => {
  const people = [
    { uid: "ann", name: "Ann", stack: 1075, rebuys: 0, active: true },
    { uid: "bob", name: "Bob", stack: 1425, rebuys: 500, active: true },
    { uid: "cat", name: "Cat", stack: 1000, rebuys: 0, active: true },
    { uid: "dan", name: "Dan", stack: 1000, rebuys: 0, active: false },
  ];

  it("ranks by net profit after rebuys and counts finished hands only", () => {
    const rows = leaderboard(people, H, 1000);
    expect(rows.map((r) => [r.uid, r.net, r.handsPlayed, r.handsWon, r.biggestPot])).toEqual([
      ["ann", 75, 3, 2, 200],
      ["cat", 0, 0, 0, 0],
      ["bob", -75, 3, 1, 100],
    ]);
    expect(rows[0].winRate).toBeCloseTo(2 / 3);
    // Dan left without playing, so he's not listed.
    expect(rows.find((r) => r.uid === "dan")).toBeUndefined();
  });
});

describe("sessions", () => {
  const all = sessions(H, R);

  it("splits evenings at a 3-hour gap, newest first", () => {
    expect(all.map((s) => s.hands.map((h) => h.number))).toEqual([[4], [1, 2]]);
  });

  it("works out each player's result, taking rebuys out", () => {
    const evening = all[1];
    expect(evening.players).toEqual([
      { uid: "ann", start: 1000, end: 1050, rebuys: 0, net: 50, handsWon: 1 },
      { uid: "bob", start: 1000, end: 1450, rebuys: 500, net: -50, handsWon: 1 },
    ]);
    expect(evening.biggestPot).toEqual({ uid: "ann", amount: 200, hand: 1 });
    expect(evening.endedAt - evening.startedAt).toBe(11 * 60_000);
  });

  it("charts stacks from the start through every hand", () => {
    expect(all[1].timeline).toEqual([
      { hand: 0, stacks: { ann: 1000, bob: 1000 } },
      { hand: 1, stacks: { ann: 1100, bob: 900 } },
      { hand: 2, stacks: { ann: 1050, bob: 1450 } },
    ]);
  });

  it("is empty without hands", () => {
    expect(sessions([], [])).toEqual([]);
  });
});

describe("reset vote", () => {
  it("needs yes from more than half of everyone who can vote", () => {
    const voters = ["a", "b", "c", "d"];
    expect(tallyReset({ a: ["yes"], b: ["yes"] }, voters, 0, 1000)).toMatchObject({ yes: 2, needed: 3, passed: false, failed: false });
    expect(tallyReset({ a: ["yes"], b: ["yes"], c: ["yes"] }, voters, 0, 1000).passed).toBe(true);
    // Time's up, or everyone voted, without enough yes.
    expect(tallyReset({ a: ["yes"] }, voters, 0, 31_000).failed).toBe(true);
    expect(tallyReset({ a: ["yes"], b: ["no"], c: ["no"], d: ["yes"] }, voters, 0, 1000).failed).toBe(true);
  });

  it("numbers seasons", () => {
    expect(seasonNumber("s1")).toBe(1);
    expect(seasonNumber("weird")).toBe(1);
    expect(nextSeasonId("s9")).toBe("s10");
  });
});


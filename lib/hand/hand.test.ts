import { describe, expect, it } from "vitest";
import { choiceKey, tallyBallots, voteIsDecided, VOTE_DURATION_MS } from "../vote/tally";
import { nextButtonSeat, orderFromButton, splitPot, winnerCandidates } from "./wallet";

describe("nextButtonSeat", () => {
  it("starts at the lowest occupied seat", () => {
    expect(nextButtonSeat(null, [3, 1, 6], 9)).toBe(1);
  });
  it("moves clockwise to the next occupied seat and wraps", () => {
    expect(nextButtonSeat(1, [1, 3, 6], 9)).toBe(3);
    expect(nextButtonSeat(6, [1, 3, 6], 9)).toBe(1);
    expect(nextButtonSeat(4, [1, 3, 6], 9)).toBe(6); // previous button left
  });
  it("handles an empty table", () => {
    expect(nextButtonSeat(2, [], 9)).toBeNull();
  });
});

describe("orderFromButton", () => {
  it("starts left of the button", () => {
    const winners = [
      { uid: "a", seatIndex: 0 },
      { uid: "b", seatIndex: 3 },
      { uid: "c", seatIndex: 5 },
    ];
    expect(orderFromButton(winners, 3, 6)).toEqual(["c", "a", "b"]);
    expect(orderFromButton([...winners, { uid: "gone", seatIndex: null }], 0, 6)).toEqual(["b", "c", "a", "gone"]);
  });
});

describe("splitPot", () => {
  it("pays a single winner everything", () => {
    expect(splitPot(450, ["a"])).toEqual({ a: 450 });
  });
  it("splits evenly with odd chips to the first winner", () => {
    expect(splitPot(100, ["a", "b"])).toEqual({ a: 50, b: 50 });
    expect(splitPot(101, ["b", "a"])).toEqual({ b: 51, a: 50 });
    expect(splitPot(200, ["x", "y", "z"])).toEqual({ x: 68, y: 66, z: 66 });
  });
  it("always pays out exactly the pot", () => {
    for (const pot of [0, 1, 7, 99, 1000, 12345]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const winners = Array.from({ length: n }, (_, i) => `p${i}`);
        const total = Object.values(splitPot(pot, winners)).reduce((s, x) => s + x, 0);
        expect(total).toBe(pot);
      }
    }
  });
  it("rejects nonsense", () => {
    expect(() => splitPot(10, [])).toThrow();
    expect(() => splitPot(-1, ["a"])).toThrow();
    expect(() => splitPot(10, ["a", "a"])).toThrow();
  });
});

describe("winnerCandidates", () => {
  it("adds late contributors", () => {
    expect(winnerCandidates(["a", "b"], { b: 10, c: 5 })).toEqual(["a", "b", "c"]);
  });
});

describe("tallyBallots", () => {
  it("finds a majority and treats split choices as one choice", () => {
    const t = tallyBallots({ v1: ["a"], v2: ["b", "a"], v3: ["a", "b"], v4: ["a"], v5: ["a"] });
    expect(t.totalBallots).toBe(5);
    expect(t.majority?.winners).toEqual(["a"]);
    expect(t.choices.map((c) => [c.key, c.count])).toEqual([
      ["a", 3],
      ["a,b", 2],
    ]);
  });
  it("has no majority on a tie, and offers the tied top choices", () => {
    const t = tallyBallots({ v1: ["a"], v2: ["b"], v3: ["a"], v4: ["b"], v5: ["c"] });
    expect(t.majority).toBeNull();
    expect(t.top.map((c) => c.key)).toEqual(["a", "b"]);
  });
  it("needs more than half, not just a plurality", () => {
    expect(tallyBallots({ v1: ["a"], v2: ["b"] }).majority).toBeNull();
    expect(tallyBallots({ v1: ["a"], v2: ["a"], v3: ["b"] }).majority?.key).toBe("a");
  });
  it("handles no ballots", () => {
    const t = tallyBallots({});
    expect(t).toMatchObject({ totalBallots: 0, majority: null, top: [] });
  });
  it("canonicalizes keys", () => {
    expect(choiceKey(["b", "a", "b"])).toBe("a,b");
  });
});

describe("voteIsDecided", () => {
  it("ends on time or when everyone voted", () => {
    expect(voteIsDecided(0, { a: ["x"] }, ["a", "b"], 1000)).toBe(false);
    expect(voteIsDecided(0, { a: ["x"], b: ["x"] }, ["a", "b"], 1000)).toBe(true);
    expect(voteIsDecided(0, {}, ["a", "b"], VOTE_DURATION_MS)).toBe(true);
  });
});

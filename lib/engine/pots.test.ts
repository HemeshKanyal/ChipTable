import { describe, expect, it } from "vitest";
import { potTotal } from "./betting";
import { computePots, contestedPots, handPots, settle } from "./pots";
import { chipsOnTable, deal, p, play } from "./testkit";
import { EngineError } from "./types";

describe("computePots", () => {
  it("makes a single pot when nobody is all-in for less", () => {
    expect(
      computePots([
        { uid: "A", totalIn: 100, folded: false },
        { uid: "B", totalIn: 100, folded: false },
        { uid: "C", totalIn: 30, folded: true },
      ]),
    ).toEqual([{ amount: 230, eligible: ["A", "B"] }]);
  });

  it("splits into main and side pots at each all-in level", () => {
    expect(
      computePots([
        { uid: "A", totalIn: 50, folded: false },
        { uid: "B", totalIn: 120, folded: false },
        { uid: "C", totalIn: 300, folded: false },
        { uid: "D", totalIn: 300, folded: false },
      ]),
    ).toEqual([
      { amount: 200, eligible: ["A", "B", "C", "D"] },
      { amount: 210, eligible: ["B", "C", "D"] },
      { amount: 360, eligible: ["C", "D"] },
    ]);
  });

  it("puts folded chips into the pots they reached, and merges pots with the same players", () => {
    expect(
      computePots([
        { uid: "A", totalIn: 100, folded: false },
        { uid: "B", totalIn: 250, folded: true },
        { uid: "C", totalIn: 400, folded: false },
      ]),
    ).toEqual([
      { amount: 300, eligible: ["A", "C"] },
      { amount: 450, eligible: ["C"] },
    ]);
  });

  it("gives a folded big contribution to the top pot", () => {
    // B bet 500 and folded; A and C are all-in for less.
    expect(
      computePots([
        { uid: "A", totalIn: 100, folded: false },
        { uid: "B", totalIn: 500, folded: true },
        { uid: "C", totalIn: 200, folded: false },
      ]),
    ).toEqual([
      { amount: 300, eligible: ["A", "C"] },
      { amount: 500, eligible: ["C"] },
    ]);
  });
});

describe("side pots from real hands", () => {
  it("three-way all-in: main pot for all, side pot for the two bigger stacks", () => {
    // Button A (UTG three-handed), SB B, BB C.
    let s = deal({ A: [0, 100], B: [1, 300], C: [2, 500] }, 0);
    s = play(s, ["A", "allIn"], ["B", "allIn"]);
    // C can't re-raise: nobody left could call it.
    s = play(s, ["C", "call"]);
    expect(s).toMatchObject({ phase: "showdown", runout: true });
    expect(p(s, "C")).toMatchObject({ stack: 200, totalIn: 300 });
    expect(handPots(s)).toEqual([
      { amount: 300, eligible: ["A", "B", "C"] },
      { amount: 400, eligible: ["B", "C"] },
    ]);
    expect(contestedPots(s)).toEqual([0, 1]);

    const total = chipsOnTable(s);
    const payouts = settle(s, [["A"], ["C"]]);
    expect(payouts).toEqual({ A: 300, C: 400 });
    expect(Object.values(payouts).reduce((a, b) => a + b, 0)).toBe(potTotal(s));
    expect(potTotal(s) + s.players.reduce((n, x) => n + x.stack, 0)).toBe(total);
  });

  it("four different stacks all-in, with the uncalled excess returned", () => {
    // Button A, SB B, BB C, UTG D.
    let s = deal({ A: [0, 50], B: [1, 120], C: [2, 300], D: [3, 1000] }, 0);
    s = play(s, ["D", "allIn"], ["A", "call"], ["B", "call"], ["C", "call"]);
    expect(p(s, "D")).toMatchObject({ totalIn: 300, stack: 700 });
    expect(handPots(s)).toEqual([
      { amount: 200, eligible: ["A", "B", "C", "D"] },
      { amount: 210, eligible: ["B", "C", "D"] },
      { amount: 360, eligible: ["C", "D"] },
    ]);
    expect(settle(s, [["A"], ["B"], ["D"]])).toEqual({ A: 200, B: 210, D: 360 });
    // Short stack wins the main pot, the side pots go elsewhere.
    expect(settle(s, [["A"], ["C"], ["C"]])).toEqual({ A: 200, C: 570 });
  });

  it("a folded player's chips still count", () => {
    // Button A, SB B, BB C (short), UTG D.
    let s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 200], D: [3, 1000] }, 0);
    s = play(s, ["D", 50], ["A", "fold"], ["B", "call"], ["C", "allIn"], ["D", "call"], ["B", "fold"]);
    expect(s).toMatchObject({ phase: "showdown", runout: true });
    expect(handPots(s)).toEqual([{ amount: 450, eligible: ["C", "D"] }]);
    expect(settle(s, [["C", "D"]])).toEqual({ C: 225, D: 225 });
  });
});

describe("settle", () => {
  it("pays everything to the last player standing", () => {
    const s = play(deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0), ["A", 30], ["B", "fold"], ["C", "fold"]);
    expect(settle(s)).toEqual({ A: 45 });
  });

  it("splits with odd chips to the first winner clockwise from the button", () => {
    // Button A (seat 0). 3-way split of 200 among A, C, D: C (seat 2) is first clockwise.
    let s = deal({ A: [0, 50], B: [1, 120], C: [2, 300], D: [3, 1000] }, 0);
    s = play(s, ["D", "allIn"], ["A", "call"], ["B", "call"], ["C", "call"]);
    expect(settle(s, [["A", "C", "D"], ["C"], ["C"]])).toEqual({ C: 68 + 570, D: 66, A: 66 });
    // An odd pot of 7 (SB folded its 1 chip): C, first clockwise from the button, gets the odd chip.
    let h = deal({ A: [4, 1000], B: [6, 1000], C: [8, 1000] }, 4, { sb: 1, bb: 3 });
    h = play(h, ["A", "call"], ["B", "fold"], ["C", "check"]);
    for (let i = 0; i < 3; i++) h = play(h, ["C", "check"], ["A", "check"]);
    expect(handPots(h)).toEqual([{ amount: 7, eligible: ["A", "C"] }]);
    expect(settle(h, [["A", "C"]])).toEqual({ C: 4, A: 3 });
  });

  it("awards single-player pots automatically", () => {
    // A all-in 100; B raises to 250; C re-raises to 400; B folds. C's uncalled 150 comes back,
    // and the 300 above A's all-in can only go to C.
    let s = deal({ A: [0, 100], B: [1, 1000], C: [2, 1000] }, 0);
    s = play(s, ["A", "allIn"], ["B", 250], ["C", 400], ["B", "fold"]);
    expect(p(s, "C").totalIn).toBe(250);
    expect(handPots(s)).toEqual([
      { amount: 300, eligible: ["A", "C"] },
      { amount: 300, eligible: ["C"] },
    ]);
    expect(contestedPots(s)).toEqual([0]);
    expect(settle(s, [["A"]])).toEqual({ A: 300, C: 300 });
  });

  it("validates winners", () => {
    const s = play(deal({ A: [0, 100], B: [1, 300], C: [2, 500] }, 0), ["A", "allIn"], ["B", "allIn"], ["C", "call"]);
    expect(() => settle(s, [["A"], ["A"]])).toThrow(/can't win pot 2/);
    expect(() => settle(s, [["A"], []])).toThrow(/needs a winner/);
    expect(() => settle(s, [["A", "A"], ["B"]])).toThrow(/twice/);
    expect(() => settle(s, [["A"], ["B"], ["C"]])).toThrow(EngineError);
    const betting = deal({ A: [0, 100], B: [1, 100] }, 0);
    expect(() => settle(betting, [])).toThrow(/isn't at showdown/);
  });
});

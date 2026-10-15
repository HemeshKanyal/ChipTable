import { describe, expect, it } from "vitest";
import { applyAction, cardsToDeal, legalActions, potTotal, startHand } from "./betting";
import { chipsOnTable, deal, p, play } from "./testkit";
import { EngineError } from "./types";

describe("blinds and first to act", () => {
  it("posts blinds left of the button; UTG acts first", () => {
    const s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0);
    expect([s.sbSeat, s.bbSeat]).toEqual([1, 2]);
    expect([p(s, "B").committed, p(s, "C").committed]).toEqual([5, 10]);
    expect(s).toMatchObject({ toAct: "A", currentBet: 10, minRaise: 10, street: "preflop", phase: "betting" });
    expect(s.log.map((l) => l.type)).toEqual(["post-sb", "post-bb"]);
  });

  it("wraps around the table and skips empty seats", () => {
    const s = deal({ A: [1, 1000], B: [4, 1000], C: [7, 1000], D: [8, 1000] }, 7);
    expect([s.sbSeat, s.bbSeat]).toEqual([8, 1]);
    expect(s.toAct).toBe("B");
  });

  it("heads-up: the button posts the small blind and acts first preflop, last after", () => {
    let s = deal({ A: [0, 1000], B: [5, 1000] }, 0);
    expect([s.sbSeat, s.bbSeat]).toEqual([0, 5]);
    expect(s.toAct).toBe("A");
    s = play(s, ["A", "call"], ["B", "check"]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe("B");
    s = play(s, ["B", "check"]);
    expect(s.toAct).toBe("A");
    s = play(s, ["A", "check"]);
    expect(s.street).toBe("turn");
    expect(s.toAct).toBe("B");
  });

  it("heads-up with the button in the higher seat", () => {
    const s = deal({ A: [2, 1000], B: [6, 1000] }, 6);
    expect([s.sbSeat, s.bbSeat]).toEqual([6, 2]);
    expect(s.toAct).toBe("B");
  });

  it("short stacks post what they have and are all-in", () => {
    const s = deal({ A: [0, 1000], B: [1, 3], C: [2, 7] }, 0);
    expect(p(s, "B")).toMatchObject({ committed: 3, allIn: true, stack: 0 });
    expect(p(s, "C")).toMatchObject({ committed: 7, allIn: true });
    // Everyone else still has to match the full big blind.
    expect(legalActions(s, "A")).toMatchObject({ call: 10, raise: null });
  });

  it("refuses bad setups", () => {
    expect(() => deal({ A: [0, 100] }, 0)).toThrow(EngineError);
    expect(() => deal({ A: [0, 100], B: [1, 0] }, 0)).toThrow(EngineError);
    expect(() => deal({ A: [0, 100], B: [1, 100] }, 3)).toThrow(EngineError);
    expect(() => deal({ A: [0, 100], B: [0, 100] }, 0)).toThrow(EngineError);
    expect(() => deal({ A: [0, 100], B: [1, 100] }, 0, { sb: 10, bb: 5 })).toThrow(EngineError);
  });
});

describe("preflop action", () => {
  it("gives the big blind their option after limps", () => {
    let s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0);
    s = play(s, ["A", "call"], ["B", "call"]);
    expect(s.toAct).toBe("C");
    expect(legalActions(s, "C")).toMatchObject({ check: true, call: null, raise: { min: 20, max: 1000 } });
    s = play(s, ["C", "check"]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe("B"); // first left of the button
    expect(potTotal(s)).toBe(30);
  });

  it("re-opens the action when the big blind raises", () => {
    let s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0);
    s = play(s, ["A", "call"], ["B", "call"], ["C", 40]);
    expect(s.toAct).toBe("A");
    expect(legalActions(s, "A")).toMatchObject({ call: 30, raise: { min: 70, max: 1000 } });
  });

  it("everyone folds to the big blind: they win without a showdown", () => {
    const s = play(deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0), ["A", "fold"], ["B", "fold"]);
    expect(s).toMatchObject({ phase: "complete", winnerByFold: "C", toAct: null });
    expect(potTotal(s)).toBe(15);
  });
});

describe("min-raise", () => {
  const four = () => deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000], D: [3, 1000] }, 0);

  it("tracks the last full raise size", () => {
    let s = four(); // SB B, BB C, UTG D
    expect(legalActions(s, "D").raise).toEqual({ min: 20, max: 1000 });
    s = play(s, ["D", 30]); // +20
    expect(s).toMatchObject({ currentBet: 30, minRaise: 20 });
    expect(legalActions(s, "A").raise?.min).toBe(50);
    expect(() => applyAction(s, "A", { type: "raise", to: 49 })).toThrow(/minimum raise is to 50/);
    s = play(s, ["A", 50]);
    expect(legalActions(s, "B").raise?.min).toBe(70);
    s = play(s, ["B", 100]); // +50
    expect(s.minRaise).toBe(50);
    expect(legalActions(s, "C").raise?.min).toBe(150);
  });

  it("postflop the minimum bet is one big blind, then raises must at least match the bet", () => {
    let s = play(four(), ["D", "call"], ["A", "call"], ["B", "call"], ["C", "check"]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe("B");
    expect(legalActions(s, "B")).toMatchObject({ check: true, raise: { min: 10, max: 990 } });
    s = play(s, ["B", 25]);
    expect(s.log.at(-1)).toMatchObject({ type: "bet", amount: 25 });
    expect(legalActions(s, "C").raise?.min).toBe(50);
    s = play(s, ["C", 50]);
    expect(s.log.at(-1)?.type).toBe("raise");
  });

  it("rejects malformed raises", () => {
    const s = four();
    expect(() => applyAction(s, "D", { type: "raise", to: 25.5 })).toThrow(EngineError);
    expect(() => applyAction(s, "D", { type: "raise", to: 1001 })).toThrow(/only have 1000/);
    expect(() => applyAction(s, "D", { type: "raise", to: 10 })).toThrow(/minimum raise/);
  });
});

describe("all-ins and re-opening the action", () => {
  // Button A, SB B, BB C, D. Everyone limps; flop action starts with B.
  const toFlop = (stacks: Record<string, number>) => {
    const s = deal(
      { A: [0, stacks.A ?? 1000], B: [1, stacks.B ?? 1000], C: [2, stacks.C ?? 1000], D: [3, stacks.D ?? 1000], ...(stacks.E ? { E: [4, stacks.E] as [number, number] } : {}) },
      0,
    );
    const order = stacks.E ? ["D", "E", "A", "B"] : ["D", "A", "B"];
    return play(s, ...order.map((u) => [u, "call"] as [string, "call"]), ["C", "check"]);
  };

  it("an incomplete all-in raise doesn't let earlier players re-raise", () => {
    let s = toFlop({ C: 160 }); // C has 150 behind on the flop
    s = play(s, ["B", 100], ["C", "allIn"]); // 150 is only +50 over a 100 bet
    expect(p(s, "C")).toMatchObject({ allIn: true, committed: 150 });
    expect(s).toMatchObject({ currentBet: 150, minRaise: 100 });
    // D hasn't acted on this street, so D may still raise (to at least 250).
    expect(legalActions(s, "D").raise).toEqual({ min: 250, max: 990 });
    s = play(s, ["D", "call"], ["A", "call"]);
    // B bet 100 and only faced the short all-in: call or fold, no raise.
    expect(legalActions(s, "B")).toMatchObject({ call: 50, raise: null, fold: true });
    expect(() => applyAction(s, "B", { type: "raise", to: 400 })).toThrow(/can't raise/);
    s = play(s, ["B", "call"]);
    expect(s.street).toBe("turn");
  });

  it("several short all-ins that add up to a full raise do re-open it", () => {
    let s = toFlop({ C: 160, D: 230, E: 1000 }); // flop: C 150 behind, D 220 behind
    s = play(s, ["B", 100], ["C", "allIn"], ["D", "allIn"]); // 150 (+50), then 220 (+70)
    expect(s).toMatchObject({ currentBet: 220, minRaise: 100 });
    s = play(s, ["E", "call"], ["A", "call"]);
    // B has seen the bet grow by 120 since acting, which is more than a full raise of 100.
    expect(legalActions(s, "B").raise).toEqual({ min: 320, max: 990 });
  });

  it("a full all-in raise re-opens the action", () => {
    let s = toFlop({ C: 210 }); // C has 200 behind
    s = play(s, ["B", 100], ["C", "allIn"]); // +100: a full raise
    expect(s.minRaise).toBe(100);
    s = play(s, ["D", "call"], ["A", "call"]);
    expect(legalActions(s, "B").raise).toEqual({ min: 300, max: 990 });
  });

  it("you can't raise when nobody behind can call", () => {
    const s = play(deal({ A: [0, 100], B: [1, 1000] }, 0), ["A", "allIn"]);
    expect(legalActions(s, "B")).toMatchObject({ call: 90, raise: null });
    expect(() => applyAction(s, "B", { type: "allIn" })).toThrow(/only call/);
  });

  it("all-in heads-up preflop skips straight to showdown and asks for the whole board", () => {
    const s = play(deal({ A: [0, 100], B: [1, 100] }, 0), ["A", "allIn"], ["B", "call"]);
    expect(s).toMatchObject({ phase: "showdown", runout: true, street: "preflop", toAct: null });
    expect(cardsToDeal(s)).toEqual(["flop", "turn", "river"]);
    expect(potTotal(s)).toBe(200);
  });

  it("all-in on the turn asks only for the river", () => {
    let s = play(deal({ A: [0, 500], B: [1, 1000] }, 0), ["A", "call"], ["B", "check"]);
    s = play(s, ["B", "check"], ["A", "check"]); // flop
    s = play(s, ["B", 100], ["A", "allIn"], ["B", "call"]); // turn
    expect(s).toMatchObject({ phase: "showdown", runout: true, street: "turn" });
    expect(cardsToDeal(s)).toEqual(["river"]);
  });

  it("returns an uncalled bet", () => {
    const s = play(deal({ A: [0, 1000], B: [1, 300] }, 0), ["A", "allIn"], ["B", "call"]);
    expect(p(s, "A")).toMatchObject({ stack: 700, totalIn: 300, allIn: false });
    expect(p(s, "B")).toMatchObject({ stack: 0, totalIn: 300, allIn: true });
    expect(s.runout).toBe(true);
  });

  it("over-calling a short big blind gets the difference back", () => {
    const s = play(deal({ A: [0, 1000], B: [1, 3], C: [2, 7] }, 0), ["A", "call"]);
    expect(s.phase).toBe("showdown");
    expect(p(s, "A")).toMatchObject({ totalIn: 7, stack: 993 });
  });

  it("one player left with chips still has to call an all-in", () => {
    let s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 50] }, 0);
    s = play(s, ["A", "call"], ["B", "fold"], ["C", "allIn"]);
    expect(s.toAct).toBe("A");
    expect(legalActions(s, "A")).toMatchObject({ call: 40, raise: null });
    s = play(s, ["A", "call"]);
    expect(s).toMatchObject({ phase: "showdown", runout: true });
  });
});

describe("turn order", () => {
  it("skips folded and all-in players", () => {
    let s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000], D: [3, 60], E: [4, 1000] }, 0);
    // UTG is D (left of BB C).
    s = play(s, ["D", "allIn"], ["E", "call"], ["A", "fold"], ["B", "call"], ["C", "call"]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe("B");
    s = play(s, ["B", "check"]);
    expect(s.toAct).toBe("C");
    s = play(s, ["C", "check"]);
    expect(s.toAct).toBe("E"); // D is all-in, A folded
  });

  it("reaches showdown after the river with nobody to act", () => {
    let s = play(deal({ A: [0, 1000], B: [1, 1000] }, 0), ["A", "call"], ["B", "check"]);
    for (const street of ["flop", "turn", "river"]) {
      expect(s.street).toBe(street);
      s = play(s, ["B", "check"], ["A", "check"]);
    }
    expect(s).toMatchObject({ phase: "showdown", runout: false, toAct: null });
    expect(cardsToDeal(s)).toEqual([]);
  });
});

describe("illegal actions", () => {
  const s = deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0);

  it("enforces turn order", () => {
    expect(() => applyAction(s, "B", { type: "call" })).toThrow(/isn't your turn/);
    expect(legalActions(s, "B")).toMatchObject({ fold: false, check: false, call: null, raise: null });
  });

  it("can't check facing a bet, or call nothing", () => {
    expect(() => applyAction(s, "A", { type: "check" })).toThrow(/can't check/);
    const limped = play(s, ["A", "call"], ["B", "call"]);
    expect(() => applyAction(limped, "C", { type: "call" })).toThrow(/nothing to call/);
  });

  it("nothing happens after the hand is over", () => {
    const over = play(s, ["A", "fold"], ["B", "fold"]);
    expect(() => applyAction(over, "C", { type: "check" })).toThrow(/Betting is over/);
  });

  it("never mutates the state it's given", () => {
    const before = JSON.stringify(s);
    play(s, ["A", 30], ["B", "fold"]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("chip conservation", () => {
  it("never creates or destroys chips through a hand", () => {
    let s = deal({ A: [0, 1000], B: [1, 400], C: [2, 1000] }, 0);
    const total = chipsOnTable(s);
    s = play(s, ["A", 30], ["B", "allIn"], ["C", "call"], ["A", "call"]);
    expect(chipsOnTable(s)).toBe(total);
    expect(startHand).toBeDefined();
  });
});

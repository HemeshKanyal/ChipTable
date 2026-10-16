import { describe, expect, it } from "vitest";
import { deal, play } from "../engine/testkit";
import { describeAction, guidedFields, NUDGE_PRESETS, potOdds, raisePresets, stackInHand, streetBanner } from "./guided";

// Button seat 0 (A), so B posts the SB (5), C the BB (10), and A acts first.
const three = () => deal({ A: [0, 1000], B: [1, 1000], C: [2, 1000] }, 0);

describe("guidedFields", () => {
  it("mirrors the engine onto the hand doc", () => {
    const f = guidedFields(three());
    expect(f).toMatchObject({
      status: "betting",
      toActUid: "A",
      street: "preflop",
      pot: 15,
      contributions: { A: 0, B: 5, C: 10 },
      pots: [{ amount: 15, eligible: ["A", "B", "C"] }],
    });
  });

  it("maps a fold-out to complete and an all-in to showdown", () => {
    expect(guidedFields(play(three(), ["A", "fold"], ["B", "fold"])).status).toBe("complete");
    const allIn = deal({ A: [0, 50], B: [1, 1000] }, 0);
    expect(guidedFields(play(allIn, ["A", "allIn"], ["B", "call"])).status).toBe("showdown");
  });

  it("reads a player's chips behind during the hand", () => {
    expect(stackInHand(three(), "C")).toBe(990);
    expect(stackInHand(three(), "nobody")).toBeNull();
  });
});

describe("streetBanner", () => {
  it("cues the dealer at the start of each street, until someone acts", () => {
    expect(streetBanner(three())).toMatchObject({ title: "Preflop", dealerCue: false });
    const flop = play(three(), ["A", "call"], ["B", "call"], ["C", "check"]);
    expect(streetBanner(flop)).toEqual({ title: "Deal the FLOP", detail: "3 cards", dealerCue: true });
    expect(streetBanner(play(flop, ["B", "check"]))).toMatchObject({ title: "Deal the FLOP", dealerCue: false });
    const turn = play(flop, ["B", "check"], ["C", "check"], ["A", "check"]);
    expect(streetBanner(turn)).toEqual({ title: "Deal the TURN", detail: "1 card", dealerCue: true });
  });

  it("asks for the rest of the board when everyone is all-in", () => {
    const s = play(deal({ A: [0, 50], B: [1, 1000] }, 0), ["A", "allIn"], ["B", "call"]);
    expect(streetBanner(s)).toMatchObject({
      title: "All in! Run it out",
      detail: "Deal the FLOP, TURN and RIVER, then turn the cards over",
    });
  });

  it("calls a plain showdown after the river, and nothing once it's won", () => {
    let s = play(three(), ["A", "call"], ["B", "call"], ["C", "check"]);
    for (let i = 0; i < 3; i++) s = play(s, ["B", "check"], ["C", "check"], ["A", "check"]);
    expect(streetBanner(s)).toMatchObject({ title: "Showdown", detail: "Turn the cards over" });
    expect(streetBanner(play(three(), ["A", "fold"], ["B", "fold"]))).toBeNull();
  });
});

describe("describeAction", () => {
  it("reads like a dealer", () => {
    const s = play(three(), ["A", 30], ["B", "call"], ["C", "fold"]);
    expect(s.log.map(describeAction)).toEqual(["posts SB 5", "posts BB 10", "raises to 30", "calls 25", "folds"]);
    const allIn = play(deal({ A: [0, 50], B: [1, 1000] }, 0), ["A", "allIn"]);
    expect(describeAction(allIn.log.at(-1)!)).toBe("raises to 50 (all-in)");
  });
});

describe("raisePresets", () => {
  it("sizes raises off the pot after calling", () => {
    // A faces 10 into a pot of 15: pot after calling is 25. Pot raise = 10 + 25.
    expect(raisePresets(three(), "A")).toEqual([
      { label: "Min", to: 20 },
      { label: "½ pot", to: 23 },
      { label: "¾ pot", to: 29 },
      { label: "Pot", to: 35 },
      { label: "All-in", to: 1000 },
    ]);
  });

  it("bets fractions of the pot on a fresh street", () => {
    const flop = play(three(), ["A", "call"], ["B", "call"], ["C", "check"]);
    expect(raisePresets(flop, "B").map((p) => p.to)).toEqual([10, 15, 23, 30, 990]);
  });

  it("drops sizes that are out of range, and offers only all-in when that's all there is", () => {
    const short = deal({ A: [0, 18], B: [1, 1000], C: [2, 1000] }, 0);
    expect(raisePresets(short, "A")).toEqual([{ label: "All-in", to: 18 }]);
    const mid = deal({ A: [0, 30], B: [1, 1000], C: [2, 1000] }, 0);
    expect(raisePresets(mid, "A")).toEqual([
      { label: "Min", to: 20 },
      { label: "½ pot", to: 23 },
      { label: "¾ pot", to: 29 },
      { label: "All-in", to: 30 },
    ]);
  });

  it("is empty when it isn't your turn or you can't raise", () => {
    expect(raisePresets(three(), "B")).toEqual([]);
  });
});

describe("potOdds", () => {
  it("compares the call with the whole pot", () => {
    // A faces 10 into 15: needs 10 / 25 = 40%.
    expect(potOdds(three(), "A")).toEqual({ call: 10, win: 15, equity: 0.4 });
    // Spec example: call 200 to win 800 → 20%.
    const s = play(deal({ A: [0, 5000], B: [1, 5000], C: [2, 5000] }, 0), ["A", 400], ["B", "fold"]);
    // C (BB, 10 in) faces 390 more into 415.
    expect(potOdds(s, "C")).toEqual({ call: 390, win: 415, equity: 390 / 805 });
  });

  it("caps what a short all-in call can win", () => {
    const s = play(deal({ A: [0, 1000], B: [1, 1000], C: [2, 60] }, 0), ["A", 500], ["B", "call"]);
    // C has 50 behind (10 posted): all-in for 60, they can win 60 each from A and B, plus their own 10.
    expect(potOdds(s, "C")).toMatchObject({ call: 50, win: 130 });
  });

  it("is null with nothing to call", () => {
    expect(potOdds(play(three(), ["A", "call"], ["B", "call"]), "C")).toBeNull();
    expect(potOdds(three(), "B")).toBeNull();
  });
});

describe("nudges", () => {
  it("has the 8 presets the Rules allow", () => {
    expect(NUDGE_PRESETS).toHaveLength(8);
  });
});

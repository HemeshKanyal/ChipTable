import { describe, expect, it } from "vitest";
import { applyAction, legalActions, potTotal, startHand } from "./betting";
import { nextButtonSeat } from "./button";
import { handPots, settle } from "./pots";
import type { HandState, PlayerAction } from "./types";

/** Small seeded PRNG so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAction(state: HandState, uid: string, r: () => number): PlayerAction {
  const legal = legalActions(state, uid);
  const options: PlayerAction[] = [];
  if (legal.check) options.push({ type: "check" }, { type: "check" });
  if (legal.call !== null) options.push({ type: "call" }, { type: "call" });
  if (legal.raise) {
    const { min, max } = legal.raise;
    options.push({ type: "raise", to: min }, { type: "raise", to: max });
    options.push({ type: "raise", to: min + Math.floor(r() * (max - min + 1)) });
  }
  if (r() < 0.15) options.push({ type: "fold" });
  if ((legal.raise || legal.callIsAllIn) && r() < 0.05) options.push({ type: "allIn" });
  return options[Math.floor(r() * options.length)] ?? { type: "fold" };
}

const chips = (s: HandState) => s.players.reduce((n, p) => n + p.stack + p.totalIn, 0);

describe("random hands", () => {
  it("always conserve chips, respect turn order, terminate, and settle to the pot", () => {
    const r = rng(20261015);
    let raises = 0;
    let incompleteRaises = 0;
    let sidePotHands = 0;

    for (let hand = 0; hand < 3000; hand++) {
      const maxSeats = 2 + Math.floor(r() * 9);
      const seats = Array.from({ length: maxSeats }, (_, i) => i).filter(() => r() < 0.8);
      if (seats.length < 2) continue;
      const bb = [2, 10, 20, 50][Math.floor(r() * 4)];
      const sb = Math.max(1, Math.floor(bb / 2));
      const players = seats.map((seat) => ({ uid: `p${seat}`, seat, stack: 1 + Math.floor(r() * 40 * bb) }));
      const button = nextButtonSeat(Math.floor(r() * maxSeats), seats, maxSeats)!;

      let s = startHand({ players, buttonSeat: button, sb, bb, maxSeats });
      const total = chips(s);
      let steps = 0;

      while (s.phase === "betting") {
        const actor = s.players.find((p) => p.uid === s.toAct);
        expect(actor, `hand ${hand}: someone must be to act`).toBeDefined();
        expect(actor!.folded || actor!.allIn).toBe(false);

        const action = randomAction(s, actor!.uid, r);
        const before = s;
        s = applyAction(s, actor!.uid, action);
        steps++;

        const last = s.log.at(-1)!;
        if (last.type === "raise" || last.type === "bet") {
          raises++;
          const increment = last.to - before.currentBet;
          if (increment < before.minRaise) {
            incompleteRaises++;
            expect(last.allIn, `hand ${hand}: short raise must be all-in`).toBe(true);
          }
        }
        expect(chips(s)).toBe(total);
        for (const p of s.players) {
          expect(p.stack).toBeGreaterThanOrEqual(0);
          expect(p.committed).toBeLessThanOrEqual(p.totalIn);
        }
        expect(steps).toBeLessThan(500);
      }

      const pots = s.phase === "showdown" ? handPots(s) : [];
      if (pots.length > 1) sidePotHands++;
      expect(pots.reduce((n, p) => n + p.amount, 0)).toBe(s.phase === "showdown" ? potTotal(s) : 0);
      for (const pot of pots) {
        for (const uid of pot.eligible) expect(s.players.find((p) => p.uid === uid)!.folded).toBe(false);
      }

      const winners = pots.map((pot) => pot.eligible.filter(() => r() < 0.5).slice(0, 3));
      const fixed = winners.map((w, i) => (w.length ? w : [pots[i].eligible[0]]));
      const payouts = settle(s, fixed);
      expect(Object.values(payouts).reduce((a, b) => a + b, 0)).toBe(potTotal(s));
      const after = s.players.reduce((n, p) => n + p.stack + (payouts[p.uid] ?? 0), 0);
      expect(after).toBe(total);
    }

    // Make sure the random games actually exercised the interesting paths.
    expect(raises).toBeGreaterThan(1000);
    expect(incompleteRaises).toBeGreaterThan(10);
    expect(sidePotHands).toBeGreaterThan(50);
  });
});

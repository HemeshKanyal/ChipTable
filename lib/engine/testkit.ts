// Helpers shared by the engine tests.
import { applyAction, startHand } from "./betting";
import type { HandState, PlayerAction } from "./types";

/** deal({ A: [seat, stack], ... }, buttonSeat) */
export function deal(
  table: Record<string, [seat: number, stack: number]>,
  buttonSeat: number,
  { sb = 5, bb = 10, maxSeats = 9 } = {},
): HandState {
  return startHand({
    players: Object.entries(table).map(([uid, [seat, stack]]) => ({ uid, seat, stack })),
    buttonSeat,
    sb,
    bb,
    maxSeats,
  });
}

type Step = [uid: string, action: PlayerAction["type"] | number];

/** play(state, ["A", "call"], ["B", 30] (raise to 30), ["C", "fold"]) */
export function play(state: HandState, ...steps: Step[]): HandState {
  return steps.reduce((s, [uid, a]) => applyAction(s, uid, typeof a === "number" ? { type: "raise", to: a } : ({ type: a } as PlayerAction)), state);
}

export const p = (state: HandState, uid: string) => state.players.find((x) => x.uid === uid)!;

export const chipsOnTable = (state: HandState) => state.players.reduce((sum, x) => sum + x.stack + x.totalIn, 0);

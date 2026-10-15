// Pure helpers between the guided-mode engine and the hand document / UI. No Firebase, no React.
import { cardsToDeal, currentPots, legalActions, potTotal } from "@/lib/engine";
import type { ActionLogEntry, HandState, Street } from "@/lib/engine/types";
import type { GuidedHandDoc, HandStatus } from "@/lib/types";

const STATUS: Record<HandState["phase"], HandStatus> = { betting: "betting", showdown: "showdown", complete: "complete" };

/** uid → chips put in over the hand, for every player dealt in (zeros included). */
export function contributionsOf(state: HandState): Record<string, number> {
  return Object.fromEntries(state.players.map((p) => [p.uid, p.totalIn]));
}

/** The hand-doc fields that follow from the engine state. Written together on every action. */
export function guidedFields(state: HandState) {
  return {
    engine: state,
    status: STATUS[state.phase],
    toActUid: state.toAct,
    street: state.street,
    pot: potTotal(state),
    contributions: contributionsOf(state),
    pots: currentPots(state),
  } satisfies Partial<GuidedHandDoc>;
}

/** A player's chips behind during a guided hand (the player doc's stack is only settled at the end). */
export function stackInHand(state: HandState, uid: string): number | null {
  return state.players.find((p) => p.uid === uid)?.stack ?? null;
}

const CARDS: Record<Exclude<Street, "preflop">, string> = { flop: "3 cards", turn: "1 card", river: "1 card" };

export interface Banner {
  title: string;
  detail: string;
  /** Something the dealer has to do right now: shown big over the table. */
  dealerCue: boolean;
}

/** What the physical dealer should be doing, e.g. "Deal the FLOP (3 cards)". */
export function streetBanner(state: HandState): Banner | null {
  if (state.phase === "complete") return null;
  if (state.phase === "showdown") {
    const left = cardsToDeal(state);
    if (left.length) {
      return {
        title: "All in! Run it out",
        detail: `Deal the ${joinStreets(left)}, then turn the cards over`,
        dealerCue: true,
      };
    }
    return { title: "Showdown", detail: "Turn the cards over", dealerCue: true };
  }
  if (state.street === "preflop") return { title: "Preflop", detail: "Cards are dealt", dealerCue: false };
  const name = state.street.toUpperCase();
  // Big until the first move of the street, so the dealer sees it before anyone acts.
  const fresh = !state.log.some((e) => e.street === state.street);
  return { title: `Deal the ${name}`, detail: CARDS[state.street], dealerCue: fresh };
}

function joinStreets(streets: Street[]): string {
  const names = streets.map((s) => s.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** Feed text for one action, without the name: "raises to 200", "calls 50 (all-in)". */
export function describeAction(e: Pick<ActionLogEntry, "type" | "amount" | "to" | "allIn">): string {
  const allIn = e.allIn ? " (all-in)" : "";
  switch (e.type) {
    case "post-sb":
      return `posts SB ${e.amount}${allIn}`;
    case "post-bb":
      return `posts BB ${e.amount}${allIn}`;
    case "fold":
      return "folds";
    case "check":
      return "checks";
    case "call":
      return `calls ${e.amount}${allIn}`;
    case "bet":
      return `bets ${e.to}${allIn}`;
    case "raise":
      return `raises to ${e.to}${allIn}`;
  }
}

export interface RaisePreset {
  label: string;
  to: number;
}

/**
 * Quick sizes for the raise slider: min, ½ pot, ¾ pot, pot, all-in. A pot-sized raise is the
 * current bet plus the pot after calling. Sizes are clamped to what's legal; duplicates are dropped.
 */
export function raisePresets(state: HandState, uid: string): RaisePreset[] {
  const range = legalActions(state, uid).raise;
  const me = state.players.find((p) => p.uid === uid);
  if (!range || !me) return [];
  const toCall = state.currentBet - me.committed;
  const potAfterCall = potTotal(state) + toCall;
  const allIn = { label: "All-in", to: range.max };
  if (range.min === range.max) return [allIn];

  const sized = ([label, f]: [string, number]) => ({ label, to: Math.round(state.currentBet + f * potAfterCall) });
  const middle = ([["½ pot", 0.5], ["¾ pot", 0.75], ["Pot", 1]] as [string, number][])
    .map(sized)
    .filter((p) => p.to > range.min && p.to < range.max)
    .filter((p, i, all) => i === 0 || p.to !== all[i - 1].to);
  return [{ label: "Min", to: range.min }, ...middle, allIn];
}

// ------------------------------------------------------------------ nudges

/** Playful prods for whoever's taking their time. Index is stored, so only append. */
export const NUDGE_PRESETS = [
  "🐢 Today please",
  "⏰ The flop is getting old",
  "😴 Wake up",
  "♟️ It's poker, not chess",
  "☕ Coffee break's over",
  "🃏 The cards won't play themselves",
  "👀 We're all waiting on you",
  "🦥 Speedy as ever",
] as const;

/** Spec: 1 nudge per sender per 15 seconds. Keep in sync with the nudge rule in firestore.rules. */
export const NUDGE_COOLDOWN_MS = 15_000;

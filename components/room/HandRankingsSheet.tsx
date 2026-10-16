"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";

interface Ranking {
  name: string;
  detail: string;
  /** Example cards, e.g. "K♠"; a trailing "~" marks a kicker (doesn't make the hand). */
  cards: string[];
}

// Best first. Ties within a rank go to the higher cards, then the kickers.
const RANKINGS: Ranking[] = [
  { name: "Royal flush", detail: "A K Q J 10, all one suit", cards: ["A♠", "K♠", "Q♠", "J♠", "10♠"] },
  { name: "Straight flush", detail: "Five in a row, all one suit", cards: ["9♥", "8♥", "7♥", "6♥", "5♥"] },
  { name: "Four of a kind", detail: "Four cards of one rank", cards: ["K♣", "K♦", "K♥", "K♠", "3♦~"] },
  { name: "Full house", detail: "Three of a kind plus a pair", cards: ["Q♠", "Q♥", "Q♦", "7♣", "7♥"] },
  { name: "Flush", detail: "Any five of one suit", cards: ["A♦", "J♦", "8♦", "5♦", "2♦"] },
  { name: "Straight", detail: "Five in a row, any suits (A can be low: A-2-3-4-5)", cards: ["10♣", "9♦", "8♠", "7♥", "6♣"] },
  { name: "Three of a kind", detail: "Three cards of one rank", cards: ["8♣", "8♥", "8♠", "K♦~", "4♣~"] },
  { name: "Two pair", detail: "Two different pairs", cards: ["J♥", "J♣", "4♠", "4♦", "A♥~"] },
  { name: "One pair", detail: "Two cards of one rank", cards: ["10♠", "10♥", "K♣~", "6♦~", "3♠~"] },
  { name: "High card", detail: "Nothing else: highest card plays", cards: ["A♣", "Q♦~", "9♠~", "5♥~", "3♣~"] },
];

function Card({ code }: { code: string }) {
  const kicker = code.endsWith("~");
  const face = kicker ? code.slice(0, -1) : code;
  const suit = face.slice(-1);
  const rank = face.slice(0, -1);
  const red = suit === "♥" || suit === "♦";
  return (
    <span
      className={`flex h-10 w-7 flex-col items-center justify-center rounded-md border bg-ivory leading-none shadow-sm ${
        red ? "text-[#c62828]" : "text-felt-950"
      } ${kicker ? "border-transparent opacity-40" : "border-gold-400"}`}
      aria-label={`${rank} of ${{ "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" }[suit]}${kicker ? " (kicker)" : ""}`}
    >
      <span className="text-[11px] font-bold">{rank}</span>
      <span className="text-sm">{suit}</span>
    </span>
  );
}

/** Poker hand rankings, best to worst. Opened from the table. */
export function HandRankingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Hand rankings">
      <p className="-mt-1 mb-3 text-xs text-ivory-muted">
        Best five cards from your two plus the five on the board. Highlighted cards make the hand; the faded ones
        are kickers that break ties.
      </p>
      <ol className="flex flex-col">
        {RANKINGS.map((r, i) => (
          <li key={r.name} className="flex items-center gap-3 border-b gold-hairline py-2.5 last:border-b-0">
            <span className="w-4 text-right text-xs font-bold text-gold-300 tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{r.name}</p>
              <p className="text-[11px] leading-snug text-ivory-muted">{r.detail}</p>
            </div>
            <div className="flex shrink-0 gap-0.5" role="img" aria-label={`Example: ${r.cards.join(" ").replaceAll("~", "")}`}>
              {r.cards.map((c) => (
                <Card key={c} code={c} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </BottomSheet>
  );
}

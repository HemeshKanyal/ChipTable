"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { CrownIcon, PlusIcon } from "@/components/ui/icons";
import { formatChips } from "@/lib/chips";
import type { PlayerDoc } from "@/lib/types";

interface SeatProps {
  seatIndex: number;
  player: PlayerDoc | null;
  isMe: boolean;
  isHost: boolean;
  online: boolean;
  /** Present when the viewer may sit in this (empty) seat. */
  onSit?: () => void;
  sitLabel?: string;
  /** Guided hands: chips behind right now (the player doc's stack settles when the hand ends). */
  stack?: number;
  /** Guided hands: out of this hand, or all in. */
  handState?: "folded" | "allIn" | null;
  /** Guided hands: it's this player's turn. */
  turn?: boolean;
  blind?: "SB" | "BB" | null;
}

export function Seat({
  seatIndex,
  player,
  isMe,
  isHost,
  online,
  onSit,
  sitLabel = "Sit",
  stack,
  handState = null,
  turn = false,
  blind = null,
}: SeatProps) {
  const reduceMotion = useReducedMotion();
  if (!player) {
    return (
      <button
        type="button"
        onClick={onSit}
        disabled={!onSit}
        aria-label={`Seat ${seatIndex + 1}: empty${onSit ? `, ${sitLabel.toLowerCase()} here` : ""}`}
        className="group flex flex-col items-center gap-1 disabled:cursor-default"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-ivory/20 bg-felt-950/40 text-ivory/40 transition group-enabled:group-hover:border-gold-400/70 group-enabled:group-hover:text-gold-300">
          {onSit ? <PlusIcon size={18} /> : <span className="text-xs tabular-nums">{seatIndex + 1}</span>}
        </span>
        {onSit && <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory/45">{sitLabel}</span>}
      </button>
    );
  }

  const sittingOut = player.status === "sittingOut";
  const size = isMe ? 56 : 44;
  const chips = stack ?? player.stack;
  const folded = handState === "folded";

  return (
    <motion.div
      layout
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={`flex flex-col items-center transition-opacity ${sittingOut || folded ? "opacity-50" : ""}`}
      aria-label={`Seat ${seatIndex + 1}: ${player.displayName}${isMe ? " (you)" : ""}, ${formatChips(chips)} chips${
        sittingOut ? ", sitting out" : ""
      }${folded ? ", folded" : handState === "allIn" ? ", all in" : ""}${turn ? ", to act" : ""}${online ? "" : ", offline"}`}
    >
      <div className="relative">
        {turn && (
          <motion.span
            aria-hidden
            className="absolute -inset-1.5 rounded-full border-2 border-gold-300"
            initial={{ opacity: 0.9, scale: 1 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : {
                    opacity: [0.95, 0.35, 0.95],
                    scale: [1, 1.12, 1],
                    boxShadow: [
                      "0 0 10px 2px rgb(241 214 141 / 0.7)",
                      "0 0 22px 8px rgb(241 214 141 / 0.15)",
                      "0 0 10px 2px rgb(241 214 141 / 0.7)",
                    ],
                  }
            }
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <Avatar
          name={player.displayName}
          photoURL={player.photoURL}
          size={size}
          className={isMe ? "ring-gold-300!" : ""}
        />
        {blind && (
          <span
            className={`absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-black/30 px-0.5 text-[9px] font-extrabold shadow ${
              blind === "BB" ? "bg-gold-400 text-felt-950" : "bg-ivory-muted text-felt-950"
            }`}
            title={blind === "BB" ? "Big blind" : "Small blind"}
          >
            {blind}
          </span>
        )}
        {isHost && (
          <span className="absolute -left-1.5 -top-2 rotate-[-18deg] drop-shadow" title="Host">
            <CrownIcon size={isMe ? 20 : 16} />
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-felt-900 ${
            online ? "bg-success" : "bg-ivory/30"
          }`}
          aria-hidden
        />
      </div>
      <div className="-mt-1.5 flex min-w-[4.25rem] max-w-[5.5rem] flex-col items-center rounded-lg border gold-hairline bg-felt-950/85 px-1.5 py-0.5 shadow-md">
        <span className={`w-full truncate text-center font-semibold leading-tight ${isMe ? "text-xs" : "text-[11px]"}`}>
          {isMe ? "You" : player.displayName.split(" ")[0]}
        </span>
        <span className="text-[11px] font-semibold leading-tight text-gold-300 tabular-nums">
          {folded ? "Folded" : handState === "allIn" ? "ALL-IN" : sittingOut ? "Sitting out" : formatChips(chips)}
        </span>
      </div>
    </motion.div>
  );
}

import { breakdownChips } from "@/lib/chips";
import { Chip } from "./Chip";

interface ChipPileProps {
  amount: number;
  size?: number;
  /** Chips drawn per stack; real counts can be higher. */
  maxPerStack?: number;
  maxStacks?: number;
}

/** A stack broken into denominations, one little tower per colour, biggest on the left. */
export function ChipPile({ amount, size = 22, maxPerStack = 6, maxStacks = 4 }: ChipPileProps) {
  const stacks = breakdownChips(amount).slice(0, maxStacks);
  const step = size * 0.16;
  return (
    <div className="flex items-end gap-0.5" aria-hidden>
      {stacks.map(({ denomination, count }) => {
        const n = Math.min(count, maxPerStack);
        return (
          <div
            key={denomination.value}
            className="relative drop-shadow-[0_2px_2px_rgb(0_0_0/0.5)]"
            style={{ width: size, height: size + (n - 1) * step }}
          >
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="absolute left-0" style={{ bottom: i * step }}>
                <Chip value={denomination.value} size={size} plain={i < n - 1} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

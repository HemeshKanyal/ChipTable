export interface Denomination {
  value: number;
  label: string;
  /** Chip body colour. */
  base: string;
  /** Edge spots and inner ring. */
  spot: string;
  /** Centre inlay. */
  inlay: string;
  text: string;
}

/** Classic casino colours, largest first. */
export const DENOMINATIONS: readonly Denomination[] = [
  { value: 1000, label: "1K", base: "#e0ae1f", spot: "#3b2a05", inlay: "#f3d36b", text: "#3b2a05" },
  { value: 500, label: "500", base: "#5b2a86", spot: "#f5efe0", inlay: "#7646a3", text: "#fdf9ef" },
  { value: 100, label: "100", base: "#1d1d20", spot: "#f5efe0", inlay: "#3a3a40", text: "#f5efe0" },
  { value: 25, label: "25", base: "#1f7a3a", spot: "#f5efe0", inlay: "#2f9650", text: "#fdf9ef" },
  { value: 5, label: "5", base: "#b3202a", spot: "#f5efe0", inlay: "#cf3b44", text: "#fdf9ef" },
  { value: 1, label: "1", base: "#efe9db", spot: "#2b5aa8", inlay: "#ffffff", text: "#1c2b4a" },
];

export function getDenomination(value: number): Denomination {
  const d = DENOMINATIONS.find((x) => x.value === value);
  if (!d) throw new RangeError(`Unknown chip denomination: ${value}`);
  return d;
}

export interface ChipCount {
  denomination: Denomination;
  count: number;
}

/** Splits an amount into the fewest chips, largest denomination first. */
export function breakdownChips(amount: number): ChipCount[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Chip amounts must be non-negative integers, got ${amount}`);
  }
  const result: ChipCount[] = [];
  let remaining = amount;
  for (const denomination of DENOMINATIONS) {
    const count = Math.floor(remaining / denomination.value);
    if (count > 0) {
      result.push({ denomination, count });
      remaining -= count * denomination.value;
    }
  }
  return result;
}

const chipFormatter = new Intl.NumberFormat("en-US");

export function formatChips(amount: number): string {
  return chipFormatter.format(amount);
}

import { describe, expect, it } from "vitest";
import { breakdownChips, formatChips, getDenomination } from "./chips";

const summarize = (amount: number) =>
  breakdownChips(amount).map(({ denomination, count }) => [denomination.value, count]);

describe("breakdownChips", () => {
  it("returns nothing for zero", () => {
    expect(breakdownChips(0)).toEqual([]);
  });

  it("uses the fewest chips, largest first", () => {
    expect(summarize(1631)).toEqual([
      [1000, 1],
      [500, 1],
      [100, 1],
      [25, 1],
      [5, 1],
      [1, 1],
    ]);
    expect(summarize(2750)).toEqual([
      [1000, 2],
      [500, 1],
      [100, 2],
      [25, 2],
    ]);
  });

  it("always sums back to the original amount", () => {
    for (const amount of [1, 4, 99, 124, 999, 1000, 12345]) {
      const total = breakdownChips(amount).reduce(
        (sum, { denomination, count }) => sum + denomination.value * count,
        0,
      );
      expect(total).toBe(amount);
    }
  });

  it("rejects negative and fractional amounts", () => {
    expect(() => breakdownChips(-5)).toThrow(RangeError);
    expect(() => breakdownChips(2.5)).toThrow(RangeError);
    expect(() => breakdownChips(Number.NaN)).toThrow(RangeError);
  });
});

describe("getDenomination", () => {
  it("knows the six classic chips", () => {
    expect(getDenomination(500).label).toBe("500");
    expect(() => getDenomination(50)).toThrow(RangeError);
  });
});

describe("formatChips", () => {
  it("adds thousands separators", () => {
    expect(formatChips(1234567)).toBe("1,234,567");
  });
});

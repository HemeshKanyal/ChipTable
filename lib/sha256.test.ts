import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

const nodeSha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto across block boundaries and unicode", () => {
    for (const s of ["a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "pässwörd ♠♥ 🃏"]) {
      expect(sha256Hex(s)).toBe(nodeSha(s));
    }
  });
});

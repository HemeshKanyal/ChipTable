import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, generateJoinCode, isValidJoinCode, normalizeJoinCode } from "./code";
import { hashRoomPassword } from "./password";
import {
  HOST_TIMEOUT_MS,
  clockwiseFrom,
  firstFreeSeat,
  hostIsAway,
  isOnline,
  pickNextHost,
  seatLayout,
  type PresencePlayer,
} from "./seating";
import { DEFAULT_SETTINGS, validateRoomSettings } from "./settings";
import { formatRelative } from "../time";

describe("join codes", () => {
  it("generates 6 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(isValidJoinCode(code)).toBe(true);
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it("maps random words onto the alphabet", () => {
    const code = generateJoinCode(() => Uint32Array.from([0, 1, 2, 30, 31, 61]));
    expect(code).toBe(`ABC${CODE_ALPHABET[30]}A${CODE_ALPHABET[30]}`);
  });

  it("normalizes user input", () => {
    expect(normalizeJoinCode(" abc-def ")).toBe("ABCDEF");
    expect(isValidJoinCode("ABCDE")).toBe(false);
    expect(isValidJoinCode("ABCDE1")).toBe(false);
  });
});

describe("hashRoomPassword", () => {
  it("is deterministic and salt-dependent", () => {
    expect(hashRoomPassword("pw", "salt")).toBe(hashRoomPassword("pw", "salt"));
    expect(hashRoomPassword("pw", "salt")).not.toBe(hashRoomPassword("pw", "pepper"));
    expect(hashRoomPassword("pw", "salt")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validateRoomSettings", () => {
  it("accepts the defaults", () => {
    expect(validateRoomSettings("Friday", DEFAULT_SETTINGS)).toEqual({});
  });

  it("flags each bad field", () => {
    const errors = validateRoomSettings("  ", {
      startingStack: 0,
      sb: 10,
      bb: 5,
      mode: "turbo" as never,
      maxPlayers: 11,
    });
    expect(Object.keys(errors).sort()).toEqual(["bb", "maxPlayers", "mode", "name", "startingStack"]);
  });

  it("rejects a big blind larger than the stack", () => {
    expect(validateRoomSettings("x", { ...DEFAULT_SETTINGS, startingStack: 100, bb: 200, sb: 100 }).bb).toBeDefined();
  });
});

describe("seating", () => {
  const now = 1_000_000_000;
  const p = (uid: string, seatIndex: number | null, status: PresencePlayer["status"], ago: number | null = 0): PresencePlayer => ({
    uid,
    seatIndex,
    status,
    lastSeen: ago === null ? null : now - ago,
  });

  it("finds the first free seat", () => {
    expect(firstFreeSeat({}, 4)).toBe(0);
    expect(firstFreeSeat({ "0": "a", "1": "b", "3": "c" }, 4)).toBe(2);
    expect(firstFreeSeat({ "0": "a", "1": "b" }, 2)).toBeNull();
  });

  it("walks clockwise and wraps", () => {
    expect(clockwiseFrom(2, 4)).toEqual([3, 0, 1, 2]);
  });

  it("knows when the host is away", () => {
    expect(hostIsAway(undefined, now)).toBe(true);
    expect(hostIsAway(p("h", 0, "seated", 1000), now)).toBe(false);
    expect(hostIsAway(p("h", 0, "seated", HOST_TIMEOUT_MS + 1), now)).toBe(true);
    expect(hostIsAway(p("h", null, "left", 0), now)).toBe(true);
    expect(isOnline(null, now)).toBe(false);
  });

  it("passes host clockwise, preferring seated over sitting out, skipping offline", () => {
    const players = [
      p("host", 2, "seated", HOST_TIMEOUT_MS * 2),
      p("a", 3, "sittingOut"),
      p("b", 5, "seated", 10 * 60_000), // offline
      p("c", 0, "seated"),
      p("d", null, "left"),
    ];
    expect(pickNextHost(players, "host", 6, now, { requireOnline: true })).toBe("c");
    expect(pickNextHost(players, "host", 6, now, { requireOnline: false })).toBe("b");
    expect(pickNextHost([p("host", 1, "seated"), p("a", 3, "sittingOut")], "host", 6, now, { requireOnline: true })).toBe("a");
    expect(pickNextHost([p("host", 1, "seated")], "host", 6, now, { requireOnline: false })).toBeNull();
  });

  it("puts the given seat at the bottom and goes clockwise", () => {
    const layout = seatLayout(4, 2);
    const at = (i: number) => layout[i];
    expect(at(2)).toMatchObject({ x: 50, y: 93 }); // bottom
    expect(at(3).x).toBeLessThan(50); // next clockwise is on the left
    expect(at(0).y).toBeLessThan(50); // opposite is at the top
    expect(at(1).x).toBeGreaterThan(50); // right
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2026, 9, 15, 12);
  it("buckets durations", () => {
    expect(formatRelative(now - 5_000, now)).toBe("just now");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelative(now - 30 * 3_600_000, now)).toBe("yesterday");
    expect(formatRelative(now - 4 * 86_400_000, now)).toBe("4 days ago");
  });
});

export type PlayerStatus = "seated" | "sittingOut" | "left";

/** room.seats: seat index (as a string key) → uid. */
export type SeatMap = Record<string, string>;

export interface PresencePlayer {
  uid: string;
  seatIndex: number | null;
  status: PlayerStatus;
  /** Epoch ms of the last heartbeat, or null if never. */
  lastSeen: number | null;
}

export const HEARTBEAT_MS = 30_000;
/** A player counts as online if they've sent a heartbeat this recently. */
export const ONLINE_WINDOW_MS = 75_000;
/** Spec: host passes on after being offline for more than 2 minutes. Must match firestore.rules. */
export const HOST_TIMEOUT_MS = 120_000;

export function isOnline(lastSeen: number | null, now: number): boolean {
  return lastSeen !== null && now - lastSeen < ONLINE_WINDOW_MS;
}

export function firstFreeSeat(seats: SeatMap, maxPlayers: number): number | null {
  for (let i = 0; i < maxPlayers; i++) if (!seats[String(i)]) return i;
  return null;
}

/** Seat indices after `from`, wrapping, i.e. clockwise around the table. `from` comes last. */
export function clockwiseFrom(from: number, maxPlayers: number): number[] {
  return Array.from({ length: maxPlayers }, (_, i) => (from + 1 + i) % maxPlayers);
}

export function hostIsAway(host: PresencePlayer | undefined, now: number): boolean {
  return !host || host.status === "left" || host.lastSeen === null || now - host.lastSeen > HOST_TIMEOUT_MS;
}

/**
 * Next host: the first player clockwise from the current host's seat who is seated
 * (falling back to sitting out). With `requireOnline`, only players with a fresh heartbeat count.
 */
export function pickNextHost(
  players: PresencePlayer[],
  hostUid: string,
  maxPlayers: number,
  now: number,
  { requireOnline }: { requireOnline: boolean },
): string | null {
  const host = players.find((p) => p.uid === hostUid);
  const start = host?.seatIndex ?? maxPlayers - 1;
  const bySeat = new Map(
    players.filter((p) => p.seatIndex !== null && p.uid !== hostUid).map((p) => [p.seatIndex!, p]),
  );
  const order = clockwiseFrom(start, maxPlayers)
    .map((i) => bySeat.get(i))
    .filter((p): p is PresencePlayer => !!p && (!requireOnline || isOnline(p.lastSeen, now)));
  return (
    order.find((p) => p.status === "seated")?.uid ?? order.find((p) => p.status === "sittingOut")?.uid ?? null
  );
}

export interface SeatPosition {
  seatIndex: number;
  /** Percent of the table box. */
  x: number;
  y: number;
}

/** Seats around an ellipse, clockwise, with `bottomSeat` at the bottom centre. */
export function seatLayout(maxPlayers: number, bottomSeat: number, rx = 41, ry = 43): SeatPosition[] {
  return Array.from({ length: maxPlayers }, (_, seatIndex) => {
    const slot = (seatIndex - bottomSeat + maxPlayers) % maxPlayers;
    // Screen y points down, so increasing angles from 90° run bottom → left → top → right: clockwise.
    const angle = Math.PI / 2 + (slot * 2 * Math.PI) / maxPlayers;
    return {
      seatIndex,
      x: round(50 + rx * Math.cos(angle)),
      y: round(50 + ry * Math.sin(angle)),
    };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

export type GameMode = "guided" | "wallet";

export interface RoomSettings {
  startingStack: number;
  sb: number;
  bb: number;
  mode: GameMode;
  maxPlayers: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  startingStack: 1000,
  sb: 5,
  bb: 10,
  mode: "guided",
  maxPlayers: 9,
};

export const LIMITS = {
  nameMax: 40,
  stackMax: 1_000_000,
  minPlayers: 2,
  maxPlayers: 10,
  passwordMax: 64,
} as const;

export type SettingsErrors = Partial<Record<keyof RoomSettings | "name", string>>;

const isPositiveInt = (n: number) => Number.isSafeInteger(n) && n > 0;

/** Mirrors validSettings() in firestore.rules. Returns an empty object when valid. */
export function validateRoomSettings(name: string, s: RoomSettings): SettingsErrors {
  const errors: SettingsErrors = {};
  const trimmed = name.trim();
  if (!trimmed) errors.name = "Give the room a name.";
  else if (trimmed.length > LIMITS.nameMax) errors.name = `Keep it under ${LIMITS.nameMax} characters.`;

  if (!isPositiveInt(s.startingStack) || s.startingStack > LIMITS.stackMax) {
    errors.startingStack = `Between 1 and ${LIMITS.stackMax.toLocaleString("en-US")}.`;
  }
  if (!isPositiveInt(s.sb)) errors.sb = "Small blind must be at least 1.";
  if (!isPositiveInt(s.bb)) errors.bb = "Big blind must be at least 1.";
  else if (isPositiveInt(s.sb) && s.bb < s.sb) errors.bb = "Big blind can't be smaller than the small blind.";
  else if (isPositiveInt(s.startingStack) && s.bb > s.startingStack) errors.bb = "Big blind can't exceed the starting stack.";

  if (s.mode !== "guided" && s.mode !== "wallet") errors.mode = "Pick a game mode.";
  if (!Number.isSafeInteger(s.maxPlayers) || s.maxPlayers < LIMITS.minPlayers || s.maxPlayers > LIMITS.maxPlayers) {
    errors.maxPlayers = `Between ${LIMITS.minPlayers} and ${LIMITS.maxPlayers} players.`;
  }
  return errors;
}

export const hasErrors = (e: SettingsErrors) => Object.keys(e).length > 0;

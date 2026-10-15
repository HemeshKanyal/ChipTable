/** No I, L, O, 0 or 1, so codes survive being read aloud across a table. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateJoinCode(random: (n: number) => Uint32Array = randomWords): string {
  return Array.from(random(CODE_LENGTH), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

/** Uppercases and drops spaces/dashes. Doesn't guarantee validity; check with isValidJoinCode. */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidJoinCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

export function generateSalt(): string {
  return Array.from(randomWords(4), (x) => x.toString(16).padStart(8, "0")).join("");
}

function randomWords(n: number): Uint32Array {
  return crypto.getRandomValues(new Uint32Array(n));
}

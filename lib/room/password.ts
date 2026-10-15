import { sha256Hex } from "@/lib/sha256";

/** Casual protection only: salted SHA-256 computed on the client (see SECURITY.md). */
export function hashRoomPassword(password: string, salt: string): string {
  return sha256Hex(`chiptable:${salt}:${password}`);
}

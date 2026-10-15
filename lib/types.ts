import type { Timestamp } from "firebase/firestore";

/** `users/{uid}` */
export interface UserProfile {
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
}

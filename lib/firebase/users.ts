import type { User } from "firebase/auth";
import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import type { UserProfile } from "@/lib/types";

/** Creates `users/{uid}` on first sign-in and keeps name/photo in sync with Google afterwards. */
export async function upsertUserProfile(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const displayName = (user.displayName?.trim() || "Player").slice(0, 80);
  const photoURL = user.photoURL ?? null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { displayName, photoURL, createdAt: serverTimestamp() });
      return;
    }
    const current = snap.data() as UserProfile;
    if (current.displayName !== displayName || current.photoURL !== photoURL) {
      tx.update(ref, { displayName, photoURL });
    }
  });
}

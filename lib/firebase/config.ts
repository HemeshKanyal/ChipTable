// NEXT_PUBLIC_* vars must be referenced literally so Next.js can inline them.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
};

export const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

export const emulatorHostOverride = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "";

export const EMULATOR_PORTS = { auth: 9099, firestore: 8080 } as const;

/** Non-null when required env vars are missing. Same value on server and client. */
export const configErrorMessage: string | null =
  firebaseConfig.apiKey && firebaseConfig.projectId
    ? null
    : "Firebase isn't configured. Copy .env.example to .env.local and restart the dev server.";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import {
  EMULATOR_PORTS,
  configErrorMessage,
  emulatorHostOverride,
  firebaseConfig,
  useEmulators,
} from "./config";

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

// Kept on globalThis so hot reloads don't re-initialize Firestore (which throws).
const globalForFirebase = globalThis as typeof globalThis & {
  __chiptableFirebase?: FirebaseClient;
};

/** Browser-only. Call from effects or event handlers, never during render on the server. */
export function getFirebase(): FirebaseClient {
  if (typeof window === "undefined") {
    throw new Error("The Firebase client SDK is browser-only.");
  }
  if (globalForFirebase.__chiptableFirebase) return globalForFirebase.__chiptableFirebase;

  if (configErrorMessage) throw new Error(configErrorMessage);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Emulator data is wiped on restart, so an on-disk cache would only serve stale docs.
  const db = initializeFirestore(app, {
    localCache: useEmulators
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (useEmulators) {
    const host = emulatorHostOverride || window.location.hostname;
    connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore);
  }

  globalForFirebase.__chiptableFirebase = { app, auth, db };
  return globalForFirebase.__chiptableFirebase;
}

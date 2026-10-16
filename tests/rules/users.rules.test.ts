import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-chiptable-users",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: emuHost, port: Number(emuPort) },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const dbFor = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

describe("profile sound preference", () => {
  it("is yours to set, and only true or false", async () => {
    const ann = doc(dbFor("ann"), "users", "ann");
    await assertSucceeds(setDoc(ann, { displayName: "Ann", photoURL: null, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ann, { muted: true }));
    await assertSucceeds(updateDoc(ann, { muted: false }));
    await assertFails(updateDoc(ann, { muted: "yes" }));
    await assertFails(updateDoc(ann, { volume: 11 }));
    await assertFails(updateDoc(doc(dbFor("bob"), "users", "ann"), { muted: true }));
  });
});

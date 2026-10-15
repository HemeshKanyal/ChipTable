import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Security Rules tests. Need the Firestore emulator: `npm run test:rules` starts one.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});

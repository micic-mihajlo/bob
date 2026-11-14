import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** The live run: the real model brain against a fresh tasks project. Needs AI_GATEWAY_API_KEY in .env.local. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["scripts/**/*.live.ts"],
    testTimeout: 20 * 60_000,
    env: { BOB_BRAIN: "model", BOB_PACE: "0" },
  },
});

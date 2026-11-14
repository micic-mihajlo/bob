import path from "node:path";
import { defineConfig } from "vitest/config";

/** One chaos seed per process, driven by scripts/chaos.ts. Forks, so the driver can kill it and process.chdir works. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["scripts/**/*.chaos.ts"],
    pool: "forks",
    testTimeout: 60 * 60_000,
    env: { BOB_BRAIN: "script", BOB_PACE: "0" },
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "formal/**/*.test.ts"],
    env: { BOB_BRAIN: "script", BOB_PACE: "0" },
  },
});

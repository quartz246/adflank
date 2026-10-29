import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Tests never reach the real GLM or Qloo, whatever keys the shell has.
    env: { LLM_MODE: "mock", QLOO_MODE: "mock", SCHEDULER: "0", DEMO: "0", NODE_OPTIONS: "--disable-warning=ExperimentalWarning" },
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks",
    maxWorkers: 2,
  },
});

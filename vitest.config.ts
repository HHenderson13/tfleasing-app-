import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Math libs are pure functions — no DOM, no network. Keep the runtime lean
    // so `npm test` stays fast in CI and locally.
    environment: "node",
  },
});

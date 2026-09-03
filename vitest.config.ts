import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next aliases the bare "server-only" specifier itself, so the package is
      // never actually installed and vitest can't resolve it — which would make
      // any lib carrying that guard untestable. The import exists to fail a
      // client bundle, and a unit test has no client bundle, so stub it out.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Math libs are pure functions — no DOM, no network. Keep the runtime lean
    // so `npm test` stays fast in CI and locally.
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    // Playwright specs live under tests/e2e — vitest must not load them.
    exclude: ["node_modules/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@dashboard": resolve(__dirname, "./src/dashboard"),
    },
  },
});

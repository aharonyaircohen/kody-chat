import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    setupFiles: [resolve(__dirname, "./tests/setup.ts")],
  },
});

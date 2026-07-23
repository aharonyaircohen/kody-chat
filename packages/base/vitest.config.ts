import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: { KODY_SERVICE_KEY: "" },
    include: ["tests/**/*.spec.ts"],
  },
});

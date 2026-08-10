import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("browser gate isolation", () => {
  it("runs the browser gate in four fresh Playwright processes", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:e2e:gate"]).toBe(
      "pnpm test:e2e:gate:shard --shard=1/4 && pnpm test:e2e:gate:shard --shard=2/4 && pnpm test:e2e:gate:shard --shard=3/4 && pnpm test:e2e:gate:shard --shard=4/4",
    );
    expect(packageJson.scripts["test:e2e:gate:shard"]).toContain(
      "tests/e2e/memory-journey.spec.ts",
    );
  });
});

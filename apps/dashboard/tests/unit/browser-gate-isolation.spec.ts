import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("browser gate isolation", () => {
  it("builds before the browser gate and runs one browser worker at a time", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:e2e:gate"]).toMatch(
      /^pnpm build && PW_PRODUCTION=1 pnpm test:e2e:gate:shard$/,
    );
    expect(packageJson.scripts["test:e2e:gate:shard"]).toContain("--workers=1");
    expect(packageJson.scripts["test:e2e:gate:shard"]).toContain(
      "PW_LOCAL=1 BASE_URL=http://127.0.0.1:3333",
    );
    expect(packageJson.scripts["test:e2e:gate:shard"]).toContain(
      "tests/e2e/memory-journey.spec.ts",
    );
  });
});

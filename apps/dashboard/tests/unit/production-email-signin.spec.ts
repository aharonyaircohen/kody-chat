import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production email sign-in", () => {
  it("enables password sign-in while disabling registration", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "../../packages/kody-backend/convex/betterAuth/auth.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/emailPasswordOptions\s*\(/);
    expect(source).toMatch(/enabled:\s*true/);
    expect(source).toMatch(/disableSignUp:\s*!options\.allowSignUp/);
  });
});

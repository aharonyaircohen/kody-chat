import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");

describe("repo route rewrites", () => {
  it("serves repo-scoped URLs through the existing page tree", () => {
    expect(source).toContain("async rewrites()");
    expect(source).toContain('source: "/repo/:owner/:repo"');
    expect(source).toContain('destination: "/"');
    expect(source).toContain('source: "/repo/:owner/:repo/:path*"');
    expect(source).toContain('destination: "/:path*"');
  });
});

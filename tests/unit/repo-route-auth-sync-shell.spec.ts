import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync(
  join(process.cwd(), "src/dashboard/lib/components/ChatRailShell.tsx"),
  "utf8",
);
const authSource = readFileSync(
  join(process.cwd(), "src/dashboard/lib/auth-context.tsx"),
  "utf8",
);

describe("repo route auth sync wiring", () => {
  it("switches auth context to the repo encoded in the URL", () => {
    expect(shellSource).toContain("resolveRepoRouteAuthSync");
    expect(shellSource).toContain('status === "switch"');
    expect(shellSource).toContain("setCurrentRepo");
    expect(shellSource).toContain("redirectTo");
  });

  it("lets repo-route switches reload back to the same URL instead of root", () => {
    expect(authSource).toContain("redirectTo?: string");
    expect(authSource).toContain('window.location.href = redirectTo ?? "/"');
  });
});

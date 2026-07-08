import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("chat split structure", () => {
  it("routes persistent dashboard chat through the operator wrapper", () => {
    const source = read("src/dashboard/lib/components/ChatRailShell.tsx");

    expect(source).toContain('import { OperatorChat } from "./OperatorChat"');
    expect(source).toContain("<OperatorChat");
    expect(source).not.toContain('import { KodyChat } from "./KodyChat"');
  });

  it("keeps brand client chat on the real Kody chat surface", () => {
    const source = read("src/dashboard/lib/components/BrandClientChat.tsx");

    expect(source).toContain('import { KodyChat } from "./KodyChat"');
    expect(source).toContain("<KodyChat");
    expect(source).toContain("clientSurface");
    expect(source).toContain('lockedAgentId="kody"');
    expect(source).not.toContain("OperatorChat");
  });

  it("limits tools when the Kody route is called from a client surface", () => {
    const source = read("app/api/kody/chat/kody/route.ts");

    expect(source).toContain("clientSurface?: boolean");
    expect(source).toContain("const clientSurface = body.clientSurface === true");
    expect(source).toContain("clientSurface\n    ? {}\n    : { ...filteredTools }");
  });
});

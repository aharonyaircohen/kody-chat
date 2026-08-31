import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(
  new URL(
    "../../src/dashboard/lib/previews/use-browser-session.ts",
    import.meta.url,
  ),
);

describe("browser session View selection lifecycle", () => {
  it("does not reconnect the Fly session when only the selected View URL changes", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const initialUrlRef = useRef(input.initialUrl)");
    expect(source).toContain("const initialUrl = initialUrlRef.current");
    expect(source).toContain("[input.actorLogin, input.enabled]");
    expect(source).not.toContain(
      "[input.actorLogin, input.enabled, input.initialUrl]",
    );
  });

  it("aligns an existing Fly session with the selected View after a route remount", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("status.currentUrl !== initialUrl");
    expect(source).toContain("const navigation = await actInBrowserSession(");
    expect(source).toContain('{ type: "navigate", url: initialUrl }');
    expect(source).toContain("currentUrl: navigation.url ?? initialUrl");
  });
});

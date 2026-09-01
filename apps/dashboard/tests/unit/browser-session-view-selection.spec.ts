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
    expect(source).toContain(
      "for (let attempt = 0; attempt < 3; attempt += 1)",
    );
    expect(source).toContain("const desiredUrl = initialUrlRef.current");
    expect(source).toContain("const navigation = await actInBrowserSession(");
    expect(source).toContain('{ type: "navigate", url: desiredUrl }');
    expect(source).toContain("initialUrlRef.current !== desiredUrl");
    expect(source).toContain("currentUrl: navigation.url ?? desiredUrl");
    expect(
      source.indexOf('setMode({ kind: "remote", session });'),
    ).toBeGreaterThan(
      source.indexOf("for (let attempt = 0; attempt < 3; attempt += 1)"),
    );
  });

  it("retries a transient unavailable state without replacing the iframe fallback", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const recoveryAttemptsRef = useRef(0)");
    expect(source).toContain('mode.kind !== "iframe" && mode.kind !== "error"');
    expect(source).toContain("recoveryAttemptsRef.current >= 3");
    expect(source).toContain("recoveryAttemptsRef.current += 1");
    expect(source).toContain("[connect, input.initialUrl]");
  });

  it("allows only one browser connection attempt at a time", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const connectingRef = useRef(false)");
    expect(source).toContain("if (connectingRef.current) return");
    expect(source).toContain("connectingRef.current = true");
    expect(source).toContain("connectingRef.current = false");
  });
});

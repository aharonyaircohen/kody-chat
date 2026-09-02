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
  it("keeps an active Fly session while the selected View URL changes", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const initialUrlRef = useRef(input.initialUrl)");
    expect(source).toContain("const initialUrl = initialUrlRef.current");
    expect(source).toContain("[input.actorLogin, input.enabled]");
    expect(source).toContain('modeRef.current.kind === "remote" ||');
  });

  it("connects when the initial View arrives after configuration loads", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("[connect, input.initialUrl]");
    expect(source).toContain("void connect(false)");
  });

  it("aligns a resumed browser with the currently selected View", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("status.currentUrl !== initialUrl");
    expect(source).toContain('{ type: "navigate", url: desiredUrl }');
    expect(source).toContain("initialUrlRef.current !== desiredUrl");
  });

  it("resumes an existing repository browser without starting it again", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("await fetchBrowserSession(input.actorLogin)");
    expect(source).toContain('status.state === "idle"');
    expect(source).toContain('status.state === "failed"');
  });

  it("treats provider-free iframe mode as a terminal fallback", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('if (mode.kind !== "error") return');
    expect(source).not.toContain(
      'mode.kind !== "iframe" && mode.kind !== "error"',
    );
  });

  it("keeps the latest selected URL during an in-flight connection", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const generation = ++generationRef.current");
    expect(source).toContain(
      "if (generation !== generationRef.current) return",
    );
    expect(source).toContain("const desiredUrl = initialUrlRef.current");
    expect(source).toContain("initialUrlRef.current !== desiredUrl");
    expect(source).toContain("currentUrl: navigation.url ?? desiredUrl");
  });

  it("retries a transient unavailable state without replacing the iframe fallback", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const recoveryAttemptsRef = useRef(0)");
    expect(source).toContain('if (mode.kind !== "error") return');
    expect(source).toContain("recoveryAttemptsRef.current >= 3");
    expect(source).toContain("recoveryAttemptsRef.current += 1");
  });

  it("allows only one browser connection attempt at a time", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("const connectingRef = useRef(false)");
    expect(source).toContain("if (connectingRef.current) return");
    expect(source).toContain("connectingRef.current = true");
    expect(source).toContain("connectingRef.current = false");
  });

  it("waits for another starter instead of creating a second Machine", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('error.message !== "browser_start_in_progress"');
    expect(source).toContain("window.setTimeout(resolve, 1_000)");
  });
});

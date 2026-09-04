import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Apps page", () => {
  const source = readFileSync(
    new URL(
      "../../src/dashboard/lib/components/AppsManager.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  it("uses the approved master-detail layout and exposes the complete management sections", () => {
    expect(source).toContain("MasterDetailShell");
    for (const section of [
      "Overview",
      "Deployments",
      "Logs",
      "Environment",
      "Domains",
      "Storage",
      "Settings",
      "Danger zone",
    ]) {
      expect(source).toContain(section);
    }
  });

  it("sends new app setup through Chat instead of a duplicate wizard", () => {
    expect(source).toContain("Set up this repository as an app");
    expect(source).not.toContain("Create app wizard");
  });

  it("shows the external source repository owned by the App", () => {
    expect(source).toContain("app.repository");
  });

  it("shows explicit lifecycle progress and uses accessible icon actions", () => {
    expect(source).toContain("Starting app…");
    expect(source).toContain('aria-label="Start app"');
    expect(source).toContain('aria-label="Stop app"');
    expect(source).toContain('aria-label="Restart app"');
    expect(source).toContain('aria-label="Open app"');
  });

  it("waits for repository authentication before loading Apps", () => {
    expect(source).toContain("authLoading || !auth");
  });

  it("publishes only safe selected-App context to Chat", () => {
    expect(source).toContain('"kody:set-chat-scope"');
    expect(source).toMatch(/kind:\s*"app"/);
    expect(source).not.toContain("tokenHash");
  });

  it("has a mounted Chat consumer for the setup prefill event", () => {
    const chat = readFileSync(
      new URL(
        "../../src/dashboard/lib/components/KodyChat.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain('"kody:prefill-chat"');
    expect(chat).toContain('window.addEventListener("kody:prefill-chat"');
    expect(chat).toContain("setInput(detail.message.trim())");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/components/Sidebar.tsx"),
  "utf8",
);
const composerSource = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/chat/surface/Composer.tsx"),
  "utf8",
);
const chatShellSource = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/components/ChatShell.tsx"),
  "utf8",
);

describe("sidebar issue report action", () => {
  it("keeps the version left-aligned and places an icon-only report action on the right", () => {
    expect(sidebarSource).toContain("onReportIssue?: () => void;");
    expect(sidebarSource).toContain("onClick={onReportIssue}");
    expect(sidebarSource).toContain('aria-label="Report issue to Kody"');
    expect(sidebarSource).toContain("text-destructive");
    expect(sidebarSource).toContain('Bug className="h-5 w-5"');
    expect(sidebarSource).toContain(
      'collapsed ? "justify-center px-0" : "justify-between px-3"',
    );
    expect(sidebarSource).not.toContain(">\n                Report issue\n");
    expect(sidebarSource.indexOf("{APP_VERSION && (")).toBeLessThan(
      sidebarSource.indexOf("{onReportIssue && ("),
    );
    expect(chatShellSource).toContain("onIssueReportReady={setIssueReporter}");
    expect(chatShellSource).toContain("onReportIssue={reportIssueAction}");
  });

  it("does not keep the action in the compose menu", () => {
    expect(composerSource).not.toContain("onReportIssue");
    expect(composerSource).not.toContain("Report issue");
  });
});

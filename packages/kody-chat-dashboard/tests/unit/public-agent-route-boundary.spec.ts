import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  fileURLToPath(
    new URL("../../app/api/kody/chat/kody/route.ts", import.meta.url),
  ),
  "utf8",
);

describe("public Agent route boundary", () => {
  it("keeps specialist construction outside the main chat route", () => {
    expect(routeSource).toContain("handleConfiguredPublicAgentChat");
    expect(routeSource).not.toContain('from "./public-agent-delegation"');
    expect(routeSource).not.toContain('from "./public-agent-orchestrator"');
    expect(routeSource).not.toContain("routePublicAgentTask");
    expect(routeSource).not.toContain("runIsolatedPublicAgentTaskWithRetry");
    expect(routeSource).not.toContain("synthesizePublicAgentResponse");
  });
});

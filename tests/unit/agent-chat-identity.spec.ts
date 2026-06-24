import { describe, expect, it } from "vitest";
import { buildAgentChatIdentity } from "@dashboard/lib/agent-chat-identity";

describe("buildAgentChatIdentity", () => {
  it("frames a repo agent as the immediate chat speaker", () => {
    const prompt = buildAgentChatIdentity({
      slug: "pedagogical-math-manager",
      title: "Pedagogical Math Manager",
      body: "## Agent\nHelp teachers explain math clearly.",
    });

    expect(prompt).toContain("addressed as @pedagogical-math-manager");
    expect(prompt).toContain("answer directly as this agent");
    expect(prompt).toContain("Do not dispatch a GitHub run");
    expect(prompt).toContain("Help teachers explain math clearly.");
  });
});

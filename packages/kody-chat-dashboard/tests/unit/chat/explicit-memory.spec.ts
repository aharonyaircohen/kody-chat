import { describe, expect, it } from "vitest";

import { buildExplicitMemoryDraft } from "../../../app/api/kody/chat/kody/explicit-memory";

describe("explicit memory requests", () => {
  it("turns Remember: repo guidance into a repository decision draft", () => {
    const draft = buildExplicitMemoryDraft(
      "Remember: for this repo, chat prompt workflows should live as capabilities that use implementations",
    );

    expect(draft).toMatchObject({
      scope: "repository",
      kind: "decision",
    });
    expect(draft?.body).toContain(
      "chat prompt workflows should live as capabilities that use implementations",
    );
  });

  it("ignores ordinary chat messages", () => {
    expect(buildExplicitMemoryDraft("Diagnose PR #123")).toBeNull();
  });
});

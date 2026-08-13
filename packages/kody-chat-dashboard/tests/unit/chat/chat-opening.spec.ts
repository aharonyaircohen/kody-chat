import { describe, expect, it } from "vitest";
import {
  buildRepositoryChatOpeningView,
  PROJECT_ASSESSMENT_REQUEST,
} from "../../../src/dashboard/lib/chat/core/chat-opening";

describe("repository chat opening", () => {
  it("uses a generic renderer with a caller-owned assessment suggestion", () => {
    const view = buildRepositoryChatOpeningView("conversation-1");

    expect(view.rendererSlug).toBe("guided-flow-status");
    expect(view.id).toBe("chat-opening-conversation-1");
    expect(view.data).toMatchObject({
      greeting: "How can Kody help?",
      actions: [
        {
          id: "run-project-assessment",
          label: "Run project assessment",
          response: PROJECT_ASSESSMENT_REQUEST,
        },
      ],
    });
  });
});

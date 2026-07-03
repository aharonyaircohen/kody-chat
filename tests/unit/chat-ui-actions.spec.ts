/**
 * Unit tests for chat UI directive validators.
 *
 * @testFramework vitest
 * @domain unit
 */
import { describe, expect, it } from "vitest";
import {
  RENDER_VIEW_DIRECTIVE,
  isRenderedViewDirective,
} from "@dashboard/lib/chat-ui-actions";

describe("isRenderedViewDirective", () => {
  it("accepts a generic renderer view directive", () => {
    expect(
      isRenderedViewDirective({
        action: RENDER_VIEW_DIRECTIVE,
        view: "renderer",
        id: "view-1",
        rendererSlug: "my-renderer",
        rendererName: "My renderer",
        resultTarget: "chat",
        blocks: [
          { type: "title", bind: "title" },
          { type: "text", bind: "body" },
          { type: "buttons", bind: "actions" },
        ],
        data: {
          title: "Create this issue?",
          body: "Review before continuing.",
          actions: [
            {
              id: "approve",
              label: "Approve",
              response: "approve",
              variant: "primary",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("rejects unknown renderer block types and unsafe result targets", () => {
    expect(
      isRenderedViewDirective({
        action: RENDER_VIEW_DIRECTIVE,
        view: "renderer",
        id: "view-1",
        rendererSlug: "my-renderer",
        rendererName: "My renderer",
        resultTarget: "api",
        blocks: [{ type: "script", bind: "code" }],
        data: {},
      }),
    ).toBe(false);
  });
});

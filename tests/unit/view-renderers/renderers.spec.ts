/**
 * @testFramework vitest
 * @domain view-renderers
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_RENDERER,
  buildRenderedViewDirective,
  buildViewRendererRulesPrompt,
  matchViewRendererDefinition,
  parseViewRendererDefinition,
  serializeViewRendererDefinition,
} from "@dashboard/lib/view-renderers/renderers";

describe("view renderer definitions", () => {
  it("parses the default layout renderer", () => {
    const parsed = parseViewRendererDefinition(
      serializeViewRendererDefinition(DEFAULT_VIEW_RENDERER),
    );

    expect(parsed.slug).toBe("basic-card");
    expect(parsed.purpose).toBe("approval");
    expect(parsed.rule).toContain("approve");
    expect(parsed.defaults?.actions).toHaveLength(3);
    expect(parsed.type).toBe("layout");
    expect(parsed.blocks.map((block) => block.type)).toEqual([
      "title",
      "text",
      "buttons",
    ]);
  });

  it("formats renderer rules for the chat prompt", () => {
    const prompt = buildViewRendererRulesPrompt([DEFAULT_VIEW_RENDERER]);

    expect(prompt).toContain("Purpose `approval`");
    expect(prompt).toContain("Data keys: title, body, actions");
  });

  it("rejects unknown block types", () => {
    expect(() =>
      parseViewRendererDefinition(
        JSON.stringify({
          slug: "bad-renderer",
          name: "Bad renderer",
          purpose: "bad",
          type: "layout",
          blocks: [{ type: "script", bind: "code" }],
        }),
      ),
    ).toThrow(/Invalid view renderer/);
  });

  it("builds a generic chat render directive", () => {
    const directive = buildRenderedViewDirective({
      id: "view-test",
      definition: DEFAULT_VIEW_RENDERER,
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
    });

    expect(directive).toMatchObject({
      action: "render_view",
      view: "renderer",
      id: "view-test",
      rendererSlug: "basic-card",
      resultTarget: "chat",
    });
    expect(directive.blocks.map((block) => block.type)).toEqual([
      "title",
      "text",
      "buttons",
    ]);
    expect(directive.data.title).toBe("Create this issue?");
  });

  it("fills missing fields from renderer defaults", () => {
    const directive = buildRenderedViewDirective({
      id: "view-test",
      definition: DEFAULT_VIEW_RENDERER,
      data: {
        title: "Create this issue?",
      },
    });

    expect(directive.data.actions).toEqual(DEFAULT_VIEW_RENDERER.defaults?.actions);
  });

  it("matches the renderer whose binds best fit the data", () => {
    const titleOnly = {
      slug: "title-only",
      name: "Title only",
      purpose: "approval",
      type: "layout" as const,
      blocks: [{ type: "title" as const, bind: "title" }],
    };
    const titleBodyActions = {
      slug: "title-body-actions",
      name: "Title body actions",
      purpose: "approval",
      type: "layout" as const,
      blocks: [
        { type: "title" as const, bind: "title" },
        { type: "text" as const, bind: "body" },
        { type: "buttons" as const, bind: "actions" },
      ],
    };

    expect(
      matchViewRendererDefinition(
        [titleOnly, titleBodyActions],
        "approval",
        {
          title: "Create this issue?",
          body: "Kody will continue only after you approve.",
          actions: [{ id: "approve", label: "Approve", response: "approve" }],
        },
      )?.slug,
    ).toBe("title-body-actions");
  });

  it("falls back to a partial renderer when no exact shape exists", () => {
    const matched = matchViewRendererDefinition(
      [DEFAULT_VIEW_RENDERER],
      "approval",
      {
        title: "Create this issue?",
      },
    );

    expect(matched?.slug).toBe("basic-card");
  });
});

/**
 * @testFramework vitest
 * @domain view-renderers
 */
import { describe, expect, it } from "vitest";
import type { ViewRendererDefinition } from "@dashboard/lib/view-renderers/renderers";
import {
  buildFallbackShowViewInput,
  buildShowViewInputJsonSchema,
  repairShowViewToolCall,
  validateShowViewInput,
} from "@dashboard/lib/view-renderers/chat-contract";

describe("view renderer chat contract", () => {
  const decisionRenderer: ViewRendererDefinition = {
    slug: "decision-card",
    name: "Decision card",
    purpose: "decision",
    aliases: ["approval"],
    rule: "Use this purpose when Kody presents a decision.",
    data: {
      title: { description: "Short heading." },
      body: { description: "Supporting text." },
      actions: {
        type: "actions",
        description: "Available responses.",
      },
    },
    defaults: {
      actions: [
        {
          id: "continue",
          label: "Continue",
          response: "continue",
          variant: "primary",
        },
      ],
    },
    type: "layout",
    blocks: [
      { type: "title", bind: "title" },
      { type: "text", bind: "body" },
      { type: "buttons", bind: "actions" },
    ],
  };

  const choiceRenderer: ViewRendererDefinition = {
    slug: "choice-list",
    name: "Choice list",
    purpose: "choice",
    rule: "Use this purpose when Kody presents choices.",
    data: {
      items: {
        type: "selection",
        description: "Choices the user can select from.",
      },
    },
    type: "layout",
    blocks: [
      { type: "title", bind: "title" },
      { type: "text", bind: "body" },
      { type: "selection", bind: "items" },
    ],
  };

  it("builds a provider schema with renderer-specific required data keys", () => {
    const schema = buildShowViewInputJsonSchema([
      decisionRenderer,
      choiceRenderer,
    ]) as {
      type: string;
      oneOf: Array<{
        properties: {
          purpose: { enum: string[] };
          data: {
            required: string[];
            additionalProperties: boolean;
            properties: Record<string, { type?: string }>;
          };
        };
      }>;
    };
    const decisionVariant = schema.oneOf.find(
      (variant) => variant.properties.purpose.enum[0] === "decision",
    );
    const choiceVariant = schema.oneOf.find(
      (variant) => variant.properties.purpose.enum[0] === "choice",
    );

    expect(schema.type).toBe("object");
    expect(decisionVariant?.properties.data).toMatchObject({
      required: ["title", "body"],
      additionalProperties: false,
      properties: {
        title: expect.objectContaining({ type: "string" }),
        body: expect.objectContaining({ type: "string" }),
        actions: expect.objectContaining({ type: "array" }),
      },
    });
    expect(choiceVariant?.properties.data).toMatchObject({
      required: ["title", "body", "items"],
      properties: {
        items: expect.objectContaining({ type: "array" }),
      },
    });
  });

  it("normalizes valid show_view input", () => {
    expect(
      validateShowViewInput({
        purpose: "decision",
        title: "Continue?",
        body: "Confirm before moving on.",
      }),
    ).toEqual({
      success: true,
      value: {
        purpose: "decision",
        data: {
          title: "Continue?",
          body: "Confirm before moving on.",
        },
        title: "Continue?",
        body: "Confirm before moving on.",
      },
    });
  });

  it("rejects empty show_view input before execution", () => {
    expect(validateShowViewInput({})).toEqual({
      success: false,
      error: expect.objectContaining({
        message: "show_view purpose is required",
      }),
    });
  });

  it("builds fallback show_view input from renderer rules and user text", () => {
    const fallback = buildFallbackShowViewInput({
      definitions: [decisionRenderer, choiceRenderer],
      userText: "aske me a q and ask for approval to confirm it",
    });

    expect(fallback).toEqual({
      purpose: "decision",
      data: {
        title: "aske me a q and ask for approval to confirm it",
        body: "aske me a q and ask for approval to confirm it",
      },
    });
  });

  it("repairs an invalid show_view tool call through the renderer contract", () => {
    const repaired = repairShowViewToolCall({
      toolCall: {
        toolName: "show_view",
        input: "{}",
      },
      definitions: [decisionRenderer],
      userText: "aske me a q and ask for approval to confirm it",
    });

    expect(repaired).toEqual({
      toolName: "show_view",
      input: JSON.stringify({
        purpose: "decision",
        data: {
          title: "aske me a q and ask for approval to confirm it",
          body: "aske me a q and ask for approval to confirm it",
        },
      }),
    });
  });
});

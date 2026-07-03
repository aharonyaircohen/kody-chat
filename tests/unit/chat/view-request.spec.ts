/**
 * @testFramework vitest
 * @domain kody-chat
 */
import { describe, expect, it } from "vitest";
import {
  buildExplicitViewRequestInstruction,
  parseExplicitViewRequest,
} from "../../../app/api/kody/chat/kody/view-request";

describe("explicit view requests", () => {
  it("parses the approval-card UI prompt without treating it as issue creation", () => {
    expect(
      parseExplicitViewRequest("Show approval-card UI:\nCreate this issue?"),
    ).toEqual({
      purpose: "approval",
      title: "Create this issue?",
    });
  });

  it("maps approval card wording to the semantic approval purpose", () => {
    expect(parseExplicitViewRequest("Show approval card UI")).toEqual({
      purpose: "approval",
    });
  });

  it("builds a force-tool instruction for the parsed request", () => {
    const request = parseExplicitViewRequest(
      "Show approval-card UI:\nCreate this issue?",
    );

    expect(request).not.toBeNull();
    expect(buildExplicitViewRequestInstruction(request!)).toContain(
      "Your next action must be a show_view tool call.",
    );
    expect(buildExplicitViewRequestInstruction(request!)).toContain(
      "Use purpose: approval.",
    );
  });
});

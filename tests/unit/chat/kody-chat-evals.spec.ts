/**
 * Deterministic chat evals for Kody behavior.
 *
 * These do not call a model. They pin the rules that made recent bad
 * conversations fail: fake issue links, noisy clarifying questions, and
 * over-complicated prompt guidance.
 */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../app/api/kody/chat/kody/system-prompt";
import {
  loadChatDefaults,
  composeBasePrompt,
} from "@dashboard/lib/chat-defaults";
import { getCreatedIssueNumberFromToolOutput } from "@dashboard/lib/components/kody-chat-types";

const prompt = buildSystemPrompt(
  composeBasePrompt(await loadChatDefaults("acme", "repo")),
  { owner: "acme", repo: "repo" },
  undefined,
  { vibeMode: true, flyConfigured: false },
);

describe("Kody chat evals", () => {
  it("does not count read-tool issue URLs as newly created issues", () => {
    const existingIssue = {
      number: 77,
      url: "https://github.com/acme/repo/issues/77",
    };

    expect(
      getCreatedIssueNumberFromToolOutput("github_get_issue", existingIssue),
    ).toBeNull();
  });

  it("does not count failed create tools as created issues", () => {
    expect(
      getCreatedIssueNumberFromToolOutput("create_feature", {
        error: "Validation Failed",
      }),
    ).toBeNull();
  });

  it("allows create_task to transfer chat scope after real creation", () => {
    expect(
      getCreatedIssueNumberFromToolOutput("create_task", {
        number: 88,
        url: "https://github.com/acme/repo/issues/88",
      }),
    ).toBe(88);
  });

  it("tells Kody to ask at most one blocking clarifying question", () => {
    expect(prompt).toContain("Ask at most one clarifying question");
    expect(prompt).toContain(
      "If there is no blocking question, ask only for approval",
    );
  });

  it("does not encourage endless clarification loops in Vibe mode", () => {
    expect(prompt).not.toContain("Ask in small batches");
    expect(prompt).not.toContain("repeat. Stop ONLY");
  });

  it("keeps rendered view data scoped to explicit values or the active workflow step", async () => {
    const promptWithPreview = buildSystemPrompt(
      composeBasePrompt(await loadChatDefaults("acme", "repo")),
      { owner: "acme", repo: "repo" },
      undefined,
      {
        previewContext: "Preview shows a Hebrew marketing page.",
        viewRendererRules:
          "- Purpose `approval`: Use this purpose for approval cards.\n  Data keys: title, body, actions",
      },
    );

    expect(promptWithPreview).toContain("Generic view rendering");
    expect(promptWithPreview).toContain(
      "If the user asks to show, render, or display a UI/card, call `show_view`",
    );
    expect(promptWithPreview).toContain(
      "Do not print JSON or describe the tool call",
    );
    expect(promptWithPreview).toContain(
      "Dashboard chooses the matching user-managed renderer",
    );
    expect(promptWithPreview).toContain(
      "For approval views, a short title is enough",
    );
    expect(promptWithPreview).toContain(
      "UI-card requests are display requests, not issue-creation requests",
    );
    expect(promptWithPreview).toContain(
      'If the user says "Show approval-card UI: Create this issue?", render that literal card',
    );
    expect(promptWithPreview).toContain(
      "Each field in `data` must come from one of two places",
    );
    expect(promptWithPreview).toContain(
      "Do not silently copy preview, page, repo, task, memory, or research context into view fields",
    );
    expect(promptWithPreview).toContain(
      "Do not name a renderer, preset, or hardcoded view type",
    );
    expect(promptWithPreview).toContain("Available renderer rules");
    expect(promptWithPreview).toContain("Purpose `approval`");
    expect(promptWithPreview).toContain("Use this purpose for approval cards");
    expect(promptWithPreview).toContain("Data keys: title, body, actions");
  });
});

describe("Kody chat evals", () => {
  it("does not count read-tool issue URLs as newly created issues", () => {
    const existingIssue = {
      number: 77,
      url: "https://github.com/acme/repo/issues/77",
    };

    expect(
      getCreatedIssueNumberFromToolOutput("github_get_issue", existingIssue),
    ).toBeNull();
  });

  it("does not count failed create tools as created issues", () => {
    expect(
      getCreatedIssueNumberFromToolOutput("create_feature", {
        error: "Validation Failed",
      }),
    ).toBeNull();
  });

  it("allows create_task to transfer chat scope after real creation", () => {
    expect(
      getCreatedIssueNumberFromToolOutput("create_task", {
        number: 88,
        url: "https://github.com/acme/repo/issues/88",
      }),
    ).toBe(88);
  });

  it("tells Kody to ask at most one blocking clarifying question", () => {
    expect(prompt).toContain("Ask at most one clarifying question");
    expect(prompt).toContain(
      "If there is no blocking question, ask only for approval",
    );
  });

  it("does not encourage endless clarification loops in Vibe mode", () => {
    expect(prompt).not.toContain("Ask in small batches");
    expect(prompt).not.toContain("repeat. Stop ONLY");
  });
});

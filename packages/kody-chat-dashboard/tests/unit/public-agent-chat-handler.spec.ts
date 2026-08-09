import { describe, expect, it, vi } from "vitest";

import { handlePublicAgentChat } from "../../app/api/kody/chat/kody/public-agent-chat-handler";
import { handleConfiguredPublicAgentChat } from "../../app/api/kody/chat/kody/public-agent-chat-runtime";

const agents = [
  {
    slug: "agency-specialist",
    title: "Agency Specialist",
    body: "Owns Agency structure.",
  },
];

describe("public Agent chat handler", () => {
  it("adapts configured specialist capabilities without exposing their tools to Kody", async () => {
    const log = vi.fn();
    await expect(
      handleConfiguredPublicAgentChat({
        userText: "Hello",
        assignedAgents: agents,
        model: {} as never,
        availableTools: { agency_read: {}, final_answer: {} },
        specialistTools: { agency_read: {}, final_answer: {} },
        outputToolNames: ["final_answer"],
        loadCapabilities: vi.fn(async () => [
          {
            instructions: "Read Agency state.",
            capabilityTools: [{ name: "agency_read" }],
          },
        ]),
        wrapTool: (_name, candidate) => candidate,
        maxSteps: 8,
        providerCapabilities: { supportsRequiredToolChoice: true },
        requireViewOutput: false,
        telemetry: {
          traceId: "trace-runtime",
          startedAt: Date.now(),
          formatError: (error) => String(error),
          clearContext: vi.fn(),
          log,
          warn: vi.fn(),
          error: vi.fn(),
        },
      }),
    ).resolves.toEqual({
      mode: "self",
      parentTools: { final_answer: {} },
    });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "self", agents: [] }),
      "kody-direct: specialist routing completed",
    );
  });

  it("returns parent tools when Kody keeps control", async () => {
    const parentTools = { final_answer: {} };
    const orchestrate = vi.fn(async () => ({
      parentTools,
      results: [],
    }));

    await expect(
      handlePublicAgentChat({
        traceId: "trace-self",
        assignedAgents: agents,
        route: vi.fn(async () => ({ mode: "self" as const })),
        orchestrate,
        synthesize: vi.fn(),
        formatStreamError: (error) => String(error),
      }),
    ).resolves.toEqual({ mode: "self", parentTools });

    expect(orchestrate).toHaveBeenCalledWith(
      { mode: "self" },
      expect.any(Function),
    );
  });

  it("returns a streamed specialist response for delegated work", async () => {
    const onFinished = vi.fn();
    const decision = {
      mode: "delegate" as const,
      assignments: [{ agent: "agency-specialist", task: "Explain Agency" }],
    };

    const handled = await handlePublicAgentChat({
      traceId: "trace-delegate",
      assignedAgents: agents,
      route: vi.fn(async () => decision),
      orchestrate: vi.fn(async (_decision, onReasoningDelta) => {
        onReasoningDelta({
          agent: "agency-specialist",
          delta: "Checking the definition.",
        });
        return {
          parentTools: {},
          results: [
            {
              status: "completed" as const,
              agent: "agency-specialist",
              sessionId: "child-session",
              result: "Agency result",
              reference: "Agency structure reference",
            },
          ],
        };
      }),
      synthesize: vi.fn(async () => "Agency has a clear structure."),
      formatStreamError: (error) => String(error),
      onFinished,
    });

    expect(handled.mode).toBe("delegated");
    if (handled.mode !== "delegated") return;
    const streamBody = await handled.response.text();
    expect(streamBody).toContain("Agency Specialist");
    expect(streamBody).toContain("Agency has a clear structure.");
    expect(onFinished).toHaveBeenCalledWith(
      expect.objectContaining({
        childSessionIds: ["child-session"],
        returnedFailure: false,
      }),
    );
  });

  it("returns delegated results to the parent presentation callback", async () => {
    const decision = {
      mode: "delegate" as const,
      assignments: [{ agent: "agency-specialist", task: "Create a Todo" }],
    };
    const showView = { description: "render a form" };
    const present = vi.fn(async (_decision, _results, parentTools, writer) => {
      expect(parentTools).toEqual({ show_view: showView });
      writer.write({
        type: "tool-input-available",
        toolCallId: "todo-form",
        toolName: "show_view",
        input: { purpose: "guided-form" },
      });
      writer.write({
        type: "tool-output-available",
        toolCallId: "todo-form",
        output: { action: "render_view" },
      });
      return "Presented a Todo form.";
    });

    const handled = await handlePublicAgentChat({
      traceId: "trace-present",
      assignedAgents: agents,
      route: vi.fn(async () => decision),
      orchestrate: vi.fn(async () => ({
        parentTools: { show_view: showView },
        results: [
          {
            status: "completed" as const,
            agent: "agency-specialist",
            result: "A Todo needs a name.",
            reference: "Todos are managed by Agency.",
          },
        ],
      })),
      present,
      synthesize: vi.fn(),
      formatStreamError: (error) => String(error),
    });

    expect(handled.mode).toBe("delegated");
    if (handled.mode !== "delegated") return;
    const streamBody = await handled.response.text();
    expect(streamBody).toContain("show_view");
    expect(streamBody).not.toContain('"type":"text-start"');
    expect(present).toHaveBeenCalledWith(
      decision,
      expect.arrayContaining([
        expect.objectContaining({ agent: "agency-specialist" }),
      ]),
      { show_view: showView },
      expect.objectContaining({ write: expect.any(Function) }),
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_AGENT_DEFAULT_MAX_STEPS,
  PROJECT_ASSESSMENT_SYNTHESIS_MAX_OUTPUT_TOKENS,
  PROJECT_ASSESSMENT_SYNTHESIS_TIMEOUT_MS,
  PUBLIC_AGENT_TASK_TIMEOUT_MS,
  buildPublicAgentChildSystem,
  buildPublicAgentReference,
  buildPublicAgentSynthesisInput,
  appendPublicAgentInternalLinks,
  collectPublicAgentEvidence,
  formatPublicAgentFailure,
  parsePublicAgentGeneratedAnswer,
  runPublicAgentAssignments,
  runIsolatedPublicAgentTask,
  runIsolatedPublicAgentTaskWithRetry,
  requiresPublicAgentToolEvidence,
  selectPublicAgentTools,
  synthesizePublicAgentResponse,
  describePublicAgentSynthesisError,
  describePublicAgentEmptySynthesis,
} from "../../app/api/kody/chat/kody/public-agent-delegation";
import { publicAgentPurpose } from "../../app/api/kody/chat/kody/public-agent-definition";
import { COMPLETE_PROJECT_ASSESSMENT } from "../fixtures/project-assessment-report";

const roster = [
  {
    slug: "agency-specialist",
    title: "Agency Specialist",
    body: [
      "## Agent",
      "",
      "Manages Agents, Workflows, Capabilities, Loops, Intents, and Todos.",
      "",
      "## Restrictions",
      "",
      "- Stay inside Agency management.",
    ].join("\n"),
  },
  {
    slug: "repo-scout",
    title: "Repository Scout",
    body: "Understands repository structure and code ownership.",
  },
];

it("requires delegated prose to end with a relevant follow-up question", () => {
  const input = buildPublicAgentSynthesisInput({
    userText: "Explain Agency structure.",
    assignments: [
      { agent: "agency-specialist", task: "Explain Agency structure." },
    ],
    assignedAgents: roster,
    results: [
      {
        status: "completed",
        agent: "agency-specialist",
        result: "Agency connects operating definitions.",
        reference: "Agency owns reusable operating definitions.",
      },
    ],
  });

  expect(input.system).toContain(
    "Every prose final reply must end with one short, relevant follow-up question",
  );
  expect(input.system).toContain("Do not add or change a renderer");
});

describe("public Agent delegation", () => {
  it("appends validated tool links to the user-facing answer once", () => {
    const answer = appendPublicAgentInternalLinks("Todo saved.", [
      {
        status: "completed",
        agent: "agency-specialist",
        result: "saved",
        internalLinks: [
          { href: "/repo/acme/app/todos/launch", label: "Open todo: launch" },
        ],
      },
    ]);

    expect(answer).toContain(
      "[Open todo: launch](/repo/acme/app/todos/launch)",
    );
    expect(
      appendPublicAgentInternalLinks(answer, [
        {
          status: "completed",
          agent: "agency-specialist",
          internalLinks: [
            {
              href: "/repo/acme/app/todos/launch",
              label: "Open todo: launch",
            },
          ],
        },
      ]),
    ).toBe(answer);
  });

  it("does not carry specialist scratchpad into the visible result", () => {
    expect(
      parsePublicAgentGeneratedAnswer(
        "<think>private scratchpad</think>Visible answer",
      ),
    ).toBe("Visible answer");
  });

  it("describes the real synthesis failure without exposing raw provider data", () => {
    expect(
      describePublicAgentSynthesisError(
        new Error("The operation was aborted due to timeout"),
      ),
    ).toBe(
      "Final report writing failed because it exceeded the 480-second limit.",
    );
    expect(
      describePublicAgentSynthesisError({
        statusCode: 400,
        data: { error: { message: "maximum context length exceeded" } },
      }),
    ).toBe(
      "Final report writing failed because DeepSeek rejected the combined input as too large.",
    );
    expect(
      describePublicAgentSynthesisError({
        statusCode: 429,
        responseBody: "private provider response",
      }),
    ).toBe("Final report writing failed because DeepSeek was rate-limited.");
  });

  it("describes why DeepSeek returned no usable final report", () => {
    expect(
      describePublicAgentEmptySynthesis({ text: "", finishReason: "length" }),
    ).toBe(
      "Final report writing failed because DeepSeek returned no text after reaching its output limit.",
    );
    expect(
      describePublicAgentEmptySynthesis({
        text: "<think>I am still planning.</think>",
        finishReason: "stop",
      }),
    ).toBe(
      "Final report writing failed because DeepSeek returned reasoning without a final report.",
    );
    expect(
      describePublicAgentEmptySynthesis({
        text: '<tool_call>{"name":"inspect"}</tool_call>',
        finishReason: "tool-calls",
      }),
    ).toBe(
      "Final report writing failed because DeepSeek returned a tool call instead of the report.",
    );
  });

  it("gives deep-assessment specialists a four-minute, 100-step budget", () => {
    expect(PUBLIC_AGENT_TASK_TIMEOUT_MS).toBe(240_000);
    expect(PUBLIC_AGENT_DEFAULT_MAX_STEPS).toBe(100);
    expect(PROJECT_ASSESSMENT_SYNTHESIS_TIMEOUT_MS).toBe(480_000);
    expect(PROJECT_ASSESSMENT_SYNTHESIS_MAX_OUTPUT_TOKENS).toBe(12_000);
  });

  it("keeps repeated specialist results aligned with their focused tasks", () => {
    const input = buildPublicAgentSynthesisInput({
      userText: "Assess this project.",
      assignments: [
        { agent: "repo-scout", task: "Map architecture." },
        { agent: "repo-scout", task: "Inspect test health." },
      ],
      assignedAgents: roster,
      results: [
        {
          status: "completed",
          agent: "repo-scout",
          result: "Architecture conclusion.",
          evidence: "Architecture evidence.",
        },
        {
          status: "completed",
          agent: "repo-scout",
          result: "Testing conclusion.",
          evidence: "Testing evidence.",
        },
      ],
    });

    expect(input.messages[0]!.content).toContain(
      "Focused task: Map architecture.\n\nSource status: authoritative source available",
    );
    expect(input.messages[0]!.content).toContain("Architecture evidence.");
    expect(input.messages[0]!.content).toContain(
      "Focused task: Inspect test health.\n\nSource status: authoritative source available",
    );
    expect(input.messages[0]!.content).toContain("Testing evidence.");
  });

  it("requires tools for requests about current repository or operational state", () => {
    expect(
      requiresPublicAgentToolEvidence(
        "Explain how this repository is structured.",
      ),
    ).toBe(true);
    expect(
      requiresPublicAgentToolEvidence("What work is currently blocked?"),
    ).toBe(true);
    expect(
      requiresPublicAgentToolEvidence("Explain AI Agency structure."),
    ).toBe(false);
    expect(requiresPublicAgentToolEvidence("Can you add a Todo?")).toBe(false);
  });

  it("turns provider failures into safe actionable messages", () => {
    expect(formatPublicAgentFailure("timeout")).toBe(
      "The specialist timed out. Retry or choose another model.",
    );
    expect(formatPublicAgentFailure("rate_limited")).toBe(
      "The specialist model is temporarily rate-limited. Retry shortly or choose another model.",
    );
    expect(formatPublicAgentFailure("empty_result")).toBe(
      "The specialist returned no answer. Retry or choose another model.",
    );
    expect(formatPublicAgentFailure("provider_error")).toBe(
      "The specialist model request failed. Retry or choose another model.",
    );
  });

  it("has Kody synthesize one user-facing answer from grounded specialist reports", async () => {
    const generate = vi.fn(async () => ({
      text: "Agency is implemented through the inspected repository modules.",
    }));

    await expect(
      synthesizePublicAgentResponse({
        userText: "Explain Agency and its repository implementation.",
        assignments: [
          { agent: "agency-specialist", task: "Explain Agency." },
          { agent: "repo-scout", task: "Locate its implementation." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Agency draft.",
            reference: "Agency owns reusable Agents and Capabilities.",
          },
          {
            status: "completed",
            agent: "repo-scout",
            result: "Repository draft.",
            evidence:
              'github_get_file: {"path":"packages/agency/src/index.ts"}',
          },
        ],
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toBe(
      "Agency is implemented through the inspected repository modules.",
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        system: expect.stringContaining(
          "Repository-specific claims require actual tool evidence",
        ),
        tools: undefined,
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              'github_get_file: {"path":"packages/agency/src/index.ts"}',
            ),
          }),
        ],
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          "copied character-for-character from actual tool evidence",
        ),
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.not.stringContaining("Agency draft."),
          }),
        ],
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("Repository draft."),
          }),
        ],
      }),
    );
  });

  it("gives a complete ten-track assessment enough synthesis space", async () => {
    const assignments = [
      "architecture",
      "code-quality",
      "security",
      "test-reliability",
      "delivery-system",
      "operational-readiness",
      "scalability",
      "repository-history",
      "team-capacity",
      "continuous-product-qa",
    ].map((track) => ({
      agent: "repo-scout",
      capability: `assess-${track}`,
      task: `Assess ${track}.`,
    }));
    const generate = vi.fn(async () => ({
      text: "# Project assessment\n\n## Overall health\n\nNeeds attention.",
    }));

    await synthesizePublicAgentResponse({
      userText: "Run the assessment.",
      assignments,
      assignedAgents: roster,
      results: assignments.map(() => ({
        status: "completed" as const,
        agent: "repo-scout",
        result: "Grounded finding.",
        evidence: "Verified evidence.",
      })),
      model: {} as never,
      generate: generate as never,
    });

    for (const requiredInstruction of [
      "## Executive verdict",
      "exactly five clear labeled parts",
      "**Current state:**",
      "**Main risk:**",
      "**Maintenance capacity:**",
      "**Kody's value:**",
      "**Next step:**",
      "as much space as needed",
      "avoid repetition",
      "## Product readiness",
      "## Ranked risks",
      "## Maintenance capacity gap",
      "## Why Kody matters",
      "## Kody coverage and proof",
      "## Advanced continuous QA",
      "## Technical assessment",
      "## Specialist findings and evidence",
      "Honor explicit user preferences for report language",
      "one compact block per risk",
      "`**Severity:**`",
      "`**Business impact:**`",
      "`**Evidence:**`",
      "`**Action:**`",
      "Without Kody versus with Kody",
      "up to 20 independent maintenance tasks in parallel",
      "Keep repository paths, implementation details, and specialist-level evidence out of the leadership sections",
      "Proven now, available but untested, or planned",
      "continuous user-level QA",
      "predefined Quality Runs, free-form browser QA, continuous scheduling, bug creation, and automatic repair",
      "Do not invent staffing multipliers or FTE ranges",
      "available capacity, tested capacity, and useful capacity",
      "test coverage, maintenance automation, security advice, coding-agent documentation, and continuous product QA",
      "classify every material claim as `Verified`, `User-provided`, `Inferred`, or `Unverified`",
      "A configured file, dependency, test, capability, workflow, or integration proves only that it exists",
      "Proven now requires direct evidence of a relevant successful completed run",
      "Inspect the complete CI workflow",
      "most recent relevant run",
      "Error-reporting code does not prove live alert delivery",
      "Treat an account as automated only when",
      "Do not estimate required staffing or maintenance time",
      "Product readiness requires evidence from live behavior",
      "Do not let one section claim a capability is proven while another says it is absent",
      "Recommendations must trace directly to a ranked finding",
      "Do not invent a management team",
    ]) {
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxOutputTokens: PROJECT_ASSESSMENT_SYNTHESIS_MAX_OUTPUT_TOKENS,
          system: expect.stringContaining(requiredInstruction),
        }),
      );
    }

    expect(generate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("provide an ordered table"),
      }),
    );
  });

  it("keeps the ten-track synthesis packet compact enough for one reliable final report", () => {
    const assignments = Array.from({ length: 10 }, (_, index) => ({
      agent: "repo-scout",
      capability: `assess-track-${index}`,
      task: `Assess track ${index}.`,
    }));
    const input = buildPublicAgentSynthesisInput({
      userText: "Run the assessment.",
      assignments,
      assignedAgents: roster,
      results: assignments.map(() => ({
        status: "completed" as const,
        agent: "repo-scout",
        result: "C".repeat(20_000),
        reference: "R".repeat(20_000),
        evidence: "E".repeat(20_000),
      })),
    });

    expect(input.messages[0]!.content.length).toBeLessThan(45_000);
  });

  it("does not publish raw specialist reports when assessment synthesis fails", async () => {
    const assignments = Array.from({ length: 10 }, (_, index) => ({
      agent: "repo-scout",
      capability: `assess-track-${index}`,
      task: `Assess track ${index}.`,
    }));

    const onSynthesisFailure = vi.fn();
    await expect(
      synthesizePublicAgentResponse({
        userText: "Run the assessment.",
        assignments,
        assignedAgents: roster,
        results: assignments.map(() => ({
          status: "completed" as const,
          agent: "repo-scout",
          result: "Raw specialist report that is not a leadership report.",
          evidence: "Verified evidence.",
        })),
        model: {} as never,
        generate: vi.fn(async () => {
          throw new Error("The operation was aborted due to timeout");
        }) as never,
        onSynthesisFailure,
      }),
    ).resolves.toBe(
      "Final report writing failed because it exceeded the 480-second limit.",
    );
    expect(onSynthesisFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rewrites an incomplete assessment once using the existing specialist packets", async () => {
    const assignments = Array.from({ length: 10 }, (_, index) => ({
      agent: "repo-scout",
      capability: `assess-track-${index}`,
      task: `Assess track ${index}.`,
    }));
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        text: [
          "Deep Project Assessment",
          "1. Overall Scope",
          "Partial repository summary.",
          '{"name":"github_commits_for_path","arguments":{"path":"/"}}',
        ].join("\n\n"),
        finishReason: "stop",
      })
      .mockResolvedValueOnce({
        text: COMPLETE_PROJECT_ASSESSMENT,
        finishReason: "stop",
      });

    await expect(
      synthesizePublicAgentResponse({
        userText: "Run the assessment.",
        assignments,
        assignedAgents: roster,
        results: assignments.map(() => ({
          status: "completed" as const,
          agent: "repo-scout",
          result: "Grounded finding.",
          evidence: "Verified evidence.",
        })),
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toBe(COMPLETE_PROJECT_ASSESSMENT);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(
              "The previous report draft was rejected",
            ),
          }),
        ]),
      }),
    );
  });

  it("reports the provider finish reason when assessment synthesis returns no text", async () => {
    const assignments = Array.from({ length: 10 }, (_, index) => ({
      agent: "repo-scout",
      capability: `assess-track-${index}`,
      task: `Assess track ${index}.`,
    }));
    const onSynthesisFailure = vi.fn();

    await expect(
      synthesizePublicAgentResponse({
        userText: "Run the assessment.",
        assignments,
        assignedAgents: roster,
        results: assignments.map(() => ({
          status: "completed" as const,
          agent: "repo-scout",
          result: "Grounded finding.",
          evidence: "Verified evidence.",
        })),
        model: {} as never,
        generate: vi.fn(async () => ({
          text: "",
          finishReason: "length",
        })) as never,
        onSynthesisFailure,
      }),
    ).resolves.toBe(
      "Final report writing failed because DeepSeek returned no text after reaching its output limit.",
    );
    expect(onSynthesisFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it("does not give Kody an unsupported specialist draft as a factual source", async () => {
    const generate = vi.fn(async () => ({
      text: "The evidence is incomplete.",
    }));

    await synthesizePublicAgentResponse({
      userText: "Explain the repository.",
      assignments: [{ agent: "repo-scout", task: "Map the repository." }],
      assignedAgents: roster,
      results: [
        {
          status: "completed",
          agent: "repo-scout",
          result: "The repository secretly uses C++.",
        },
      ],
      model: {} as never,
      generate: generate as never,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("must not add factual claims"),
        messages: [
          expect.objectContaining({
            content: expect.not.stringContaining(
              "The repository secretly uses C++.",
            ),
          }),
        ],
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("No authoritative source"),
          }),
        ],
      }),
    );
  });

  it("rejects provider safety classification as the synthesized answer", async () => {
    await expect(
      synthesizePublicAgentResponse({
        userText: "Do you know how to add a todo?",
        assignments: [
          { agent: "agency-specialist", task: "Answer about Todos." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Yes. I can help create a new Agency Todo.",
            reference: "Todos are managed by Agency.",
          },
        ],
        model: {} as never,
        generate: vi.fn(async () => ({ text: "User Safety: safe" })) as never,
      }),
    ).resolves.toBe("Yes. I can help create a new Agency Todo.");
  });

  it("combines grounded specialist results when multi-agent synthesis returns no text", async () => {
    await expect(
      synthesizePublicAgentResponse({
        userText: "Explain Agency workflows in this repository.",
        assignments: [
          { agent: "agency-specialist", task: "Explain workflows." },
          { agent: "repo-scout", task: "Locate the implementation." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Workflows sequence reusable Capabilities.",
            reference: "A Workflow is an Agent-owned sequence of steps.",
          },
          {
            status: "completed",
            agent: "repo-scout",
            result: "The implementation is under packages/agency.",
            evidence: '{"path":"packages/agency"}',
          },
        ],
        model: {} as never,
        generate: vi.fn(async () => ({ text: "" })) as never,
      }),
    ).resolves.toBe(
      "Workflows sequence reusable Capabilities.\n\nThe implementation is under packages/agency.",
    );
  });

  it("uses grounded specialist results when multi-agent synthesis times out", async () => {
    await expect(
      synthesizePublicAgentResponse({
        userText: "Explain Agency workflows in this repository.",
        assignments: [
          { agent: "agency-specialist", task: "Explain workflows." },
          { agent: "repo-scout", task: "Locate the implementation." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Workflows sequence reusable Capabilities.",
            reference: "A Workflow is an Agent-owned sequence of steps.",
          },
          {
            status: "completed",
            agent: "repo-scout",
            result: "The implementation is under packages/agency.",
            evidence: '{"path":"packages/agency"}',
          },
        ],
        model: {} as never,
        generate: vi.fn(async () => {
          throw new Error("The operation was aborted due to timeout");
        }) as never,
      }),
    ).resolves.toBe(
      "Workflows sequence reusable Capabilities.\n\nThe implementation is under packages/agency.",
    );
  });

  it("rejects a synthesized plain-text tool call and uses grounded results", async () => {
    await expect(
      synthesizePublicAgentResponse({
        userText: "Explain Agency workflows in this repository.",
        assignments: [
          { agent: "agency-specialist", task: "Explain workflows." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Workflows sequence reusable Capabilities.",
            reference: "A Workflow is an Agent-owned sequence of steps.",
          },
        ],
        model: {} as never,
        generate: vi.fn(async () => ({
          text: 'Let me inspect it. <tool_call>{"name":"inspect"}</tool_call>',
        })) as never,
      }),
    ).resolves.toBe("Workflows sequence reusable Capabilities.");
  });

  it("rejects reasoning-only synthesis and uses grounded results", async () => {
    await expect(
      synthesizePublicAgentResponse({
        userText: "Explain Agency workflows in this repository.",
        assignments: [
          { agent: "agency-specialist", task: "Explain workflows." },
        ],
        assignedAgents: roster,
        results: [
          {
            status: "completed",
            agent: "agency-specialist",
            result: "Workflows sequence reusable Capabilities.",
            reference: "A Workflow is an Agent-owned sequence of steps.",
          },
        ],
        model: {} as never,
        generate: vi.fn(async () => ({
          text: "<think>\nI am still planning the final answer.",
        })) as never,
      }),
    ).resolves.toBe("Workflows sequence reusable Capabilities.");
  });

  it("derives routing guidance from the existing Agent definition", () => {
    expect(publicAgentPurpose(roster[0]!)).toBe(
      "Manages Agents, Workflows, Capabilities, Loops, Intents, and Todos.",
    );
    expect(publicAgentPurpose(roster[1]!)).toBe(
      "Understands repository structure and code ownership.",
    );
  });

  it("runs the specialist with only its focused child task", async () => {
    const reasoningDeltas: string[] = [];
    const stream = vi.fn(() => ({
      fullStream: (async function* () {
        yield {
          type: "reasoning-delta" as const,
          text: "I checked the Agency ",
        };
        yield {
          type: "reasoning-delta" as const,
          text: "definitions before answering.",
        };
      })(),
      text: Promise.resolve("Agency task complete."),
      reasoningText: Promise.resolve(
        "I checked the Agency definitions before answering.",
      ),
      steps: Promise.resolve([
        {
          reasoningText: "I checked the Agency definitions before answering.",
          toolResults: [
            {
              toolName: "inspect_agency",
              output: { agents: ["kody"] },
            },
          ],
        },
      ]),
    }));

    await expect(
      runIsolatedPublicAgentTask({
        agent: roster[0]!,
        task: "Review the Agency setup",
        reference: "Intent is plain-language direction only.",
        system: "Agency Specialist isolated system prompt",
        model: {} as never,
        tools: { inspect_agency: {} as never },
        sessionId: "child-session",
        stream: stream as never,
        onReasoningDelta: (delta) => reasoningDeltas.push(delta),
      }),
    ).resolves.toEqual({
      status: "completed",
      agent: "agency-specialist",
      sessionId: "child-session",
      result: "Agency task complete.",
      reasoning: "I checked the Agency definitions before answering.",
      reference: "Intent is plain-language direction only.",
      evidence: 'Evidence item 1 (inspect_agency): {"agents":["kody"]}',
    });

    expect(reasoningDeltas).toEqual([
      "I checked the Agency ",
      "definitions before answering.",
    ]);
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        system: "Agency Specialist isolated system prompt",
        messages: [
          {
            role: "user",
            content: [
              "## Focused task",
              "Review the Agency setup",
              "## Authoritative capability reference",
              "Intent is plain-language direction only.",
              "Use this reference exactly for domain facts. Do not omit or reinterpret relevant definitions.",
            ].join("\n\n"),
          },
        ],
        tools: { inspect_agency: {} },
        toolChoice: "auto",
        maxOutputTokens: 2_000,
      }),
    );
  });

  it("keeps evidence-required turns compatible with providers that reject required tool choice", async () => {
    const stream = vi.fn(() => ({
      fullStream: (async function* () {})(),
      text: Promise.resolve("The repository contains packages."),
      reasoningText: Promise.resolve(""),
      steps: Promise.resolve([]),
    }));

    await runIsolatedPublicAgentTask({
      agent: roster[1]!,
      task: "Inspect the current repository",
      system: "Repository Scout isolated system prompt",
      model: {} as never,
      tools: { inspect_repository: {} as never },
      requireToolEvidence: true,
      providerCapabilities: {
        supportsRequiredToolChoice: false,
      },
      stream: stream as never,
    } as never);

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: "auto",
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("Use at least one available tool"),
          }),
        ],
      }),
    );
  });

  it("requires tool evidence only on the first specialist step", async () => {
    const stream = vi.fn(() => ({
      fullStream: (async function* () {})(),
      text: Promise.resolve("The workflow was started."),
      reasoningText: Promise.resolve(""),
      steps: Promise.resolve([
        {
          toolResults: [
            {
              toolName: "run_workflow",
              output: { status: "started" },
            },
          ],
        },
      ]),
    }));

    await runIsolatedPublicAgentTask({
      agent: roster[0]!,
      task: "Run the CI Repair workflow",
      system: "Operations Specialist isolated system prompt",
      model: {} as never,
      tools: { run_workflow: {} as never },
      requireToolEvidence: true,
      providerCapabilities: {
        supportsRequiredToolChoice: true,
      },
      stream: stream as never,
    });

    const streamOptions = (
      stream.mock.calls as unknown as Array<
        [
          {
            prepareStep: (input: {
              steps: Array<{ toolResults: unknown[] }>;
            }) => { toolChoice: "auto" | "required" };
            toolChoice: "auto" | "required";
          },
        ]
      >
    )[0]?.[0];
    expect(streamOptions).toBeDefined();
    if (!streamOptions) return;
    const { prepareStep } = streamOptions;
    expect(streamOptions.toolChoice).toBe("auto");
    expect(prepareStep({ steps: [] })).toEqual({ toolChoice: "required" });
    expect(prepareStep({ steps: [{ toolResults: [] }] })).toEqual({
      toolChoice: "auto",
    });
  });

  it("does not expose provider safety classification as specialist reasoning", async () => {
    const reasoningDeltas: string[] = [];
    const stream = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: "reasoning-delta" as const, text: "User " };
        yield { type: "reasoning-delta" as const, text: "Safety: safe" };
      })(),
      text: Promise.resolve("I can help you add a todo."),
      reasoningText: Promise.resolve("User Safety: safe"),
      steps: Promise.resolve([
        { reasoningText: "User Safety: safe", toolResults: [] },
      ]),
    }));

    const result = await runIsolatedPublicAgentTask({
      agent: roster[0]!,
      task: "Answer whether a todo can be added",
      system: "Agency Specialist isolated system prompt",
      model: {} as never,
      tools: {},
      stream: stream as never,
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "completed",
        agent: "agency-specialist",
        result: "I can help you add a todo.",
      }),
    );

    expect(reasoningDeltas).toEqual([]);
    expect(result).not.toHaveProperty("reasoning");
  });

  it("collects bounded tool outputs as factual evidence", () => {
    expect(
      collectPublicAgentEvidence([
        {
          toolResults: [
            {
              toolName: "github_get_file",
              output: {
                path: "src/index.ts",
                content: "export const ok = true",
              },
            },
          ],
        },
      ]),
    ).toBe(
      'Evidence item 1 (github_get_file): {"path":"src/index.ts","content":"export const ok = true"}',
    );
  });

  it("puts the latest focused tool evidence first when a broad result is large", () => {
    const evidence = collectPublicAgentEvidence([
      {
        toolResults: [
          {
            toolName: "github_list_tree",
            output: { tree: "x".repeat(40_000) },
          },
        ],
      },
      {
        toolResults: [
          {
            toolName: "github_get_file",
            output: { path: "package.json", content: "next payload" },
          },
        ],
      },
    ]);

    expect(evidence).toMatch(
      /^Evidence item 2 \(github_get_file\): \{"path":"package.json","content":"next payload"\}/,
    );
    expect(evidence).toContain("Evidence item 1 (github_list_tree):");
  });

  it("preserves the authoritative reference when a specialist model call fails", async () => {
    await expect(
      runIsolatedPublicAgentTask({
        agent: roster[0]!,
        task: "Explain Agency",
        reference: "Agency owns Agents, Workflows, and Capabilities.",
        system: "Agency Specialist isolated system prompt",
        model: {} as never,
        tools: {},
        sessionId: "failed-child-session",
        stream: vi.fn(() => {
          throw new Error("specialist timed out");
        }) as never,
      }),
    ).resolves.toEqual({
      status: "failed",
      agent: "agency-specialist",
      sessionId: "failed-child-session",
      reference: "Agency owns Agents, Workflows, and Capabilities.",
      failure: { code: "timeout", detail: "specialist timed out" },
    });
  });

  it("preserves the authoritative reference when a specialist returns no text", async () => {
    await expect(
      runIsolatedPublicAgentTask({
        agent: roster[0]!,
        task: "Explain Agency",
        reference: "Agency owns Agents, Workflows, and Capabilities.",
        system: "Agency Specialist isolated system prompt",
        model: {} as never,
        tools: {},
        sessionId: "empty-child-session",
        stream: vi.fn(() => ({
          fullStream: (async function* () {})(),
          text: Promise.resolve(""),
          reasoningText: Promise.resolve(""),
          steps: Promise.resolve([]),
        })) as never,
      }),
    ).resolves.toEqual({
      status: "failed",
      agent: "agency-specialist",
      sessionId: "empty-child-session",
      reference: "Agency owns Agents, Workflows, and Capabilities.",
      failure: { code: "empty_result" },
    });
  });

  it("treats successful tool evidence as completion when the specialist returns no text", async () => {
    await expect(
      runIsolatedPublicAgentTask({
        agent: roster[1]!,
        task: "Inspect the repository",
        reference: "Repository claims require current evidence.",
        system: "Repository Scout isolated system prompt",
        model: {} as never,
        tools: { inspect_repository: {} as never },
        sessionId: "evidence-child-session",
        stream: vi.fn(() => ({
          fullStream: (async function* () {})(),
          text: Promise.resolve(""),
          reasoningText: Promise.resolve("Inspected the repository."),
          steps: Promise.resolve([
            {
              reasoningText: "Inspected the repository.",
              toolResults: [
                {
                  toolName: "inspect_repository",
                  output: { directories: ["packages"] },
                },
              ],
            },
          ]),
        })) as never,
      }),
    ).resolves.toEqual({
      status: "completed",
      agent: "repo-scout",
      sessionId: "evidence-child-session",
      reasoning: "Inspected the repository.",
      reference: "Repository claims require current evidence.",
      evidence:
        'Evidence item 1 (inspect_repository): {"directories":["packages"]}',
    });
  });

  it("retries one ungrounded empty specialist response in the same child session", async () => {
    const emptyResponse = {
      fullStream: (async function* () {})(),
      text: Promise.resolve(""),
      reasoningText: Promise.resolve(""),
      steps: Promise.resolve([]),
    };
    const completedResponse = {
      fullStream: (async function* () {})(),
      text: Promise.resolve("Repository structure explained."),
      reasoningText: Promise.resolve(""),
      steps: Promise.resolve([]),
    };
    const stream = vi
      .fn()
      .mockReturnValueOnce(emptyResponse)
      .mockReturnValueOnce(completedResponse);

    await expect(
      runIsolatedPublicAgentTaskWithRetry({
        agent: roster[1]!,
        task: "Explain the repository structure",
        system: "Repository Specialist isolated system prompt",
        model: {} as never,
        tools: {},
        sessionId: "retry-child-session",
        stream: stream as never,
      }),
    ).resolves.toEqual({
      status: "completed",
      agent: "repo-scout",
      sessionId: "retry-child-session",
      result: "Repository structure explained.",
    });
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("does not publish reasoning from a discarded retry attempt", async () => {
    const response = (text: string, reasoning: string) => ({
      fullStream: (async function* () {
        if (reasoning) yield { type: "reasoning-delta", text: reasoning };
      })(),
      text: Promise.resolve(text),
      reasoningText: Promise.resolve(reasoning),
      steps: Promise.resolve([]),
    });
    const stream = vi
      .fn()
      .mockReturnValueOnce(response("", "first attempt"))
      .mockReturnValueOnce(response("Final result.", "final attempt"));
    const reasoningDeltas: string[] = [];

    await runIsolatedPublicAgentTaskWithRetry({
      agent: roster[1]!,
      task: "Explain the repository structure",
      system: "Repository Specialist isolated system prompt",
      model: {} as never,
      tools: {},
      sessionId: "retry-reasoning-session",
      stream: stream as never,
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
    });

    expect(reasoningDeltas).toEqual(["final attempt"]);
  });

  it("does not repeat a slow empty specialist call when authoritative context is already available", async () => {
    const stream = vi.fn(() => ({
      fullStream: (async function* () {})(),
      text: Promise.resolve(""),
      reasoningText: Promise.resolve(""),
      steps: Promise.resolve([]),
    }));

    await expect(
      runIsolatedPublicAgentTaskWithRetry({
        agent: roster[0]!,
        task: "Explain Agency",
        reference: "Agency owns Agents, Workflows, and Capabilities.",
        system: "Agency Specialist isolated system prompt",
        model: {} as never,
        tools: {},
        sessionId: "grounded-empty-session",
        stream: stream as never,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      agent: "agency-specialist",
      sessionId: "grounded-empty-session",
      reference: "Agency owns Agents, Workflows, and Capabilities.",
      failure: { code: "empty_result" },
    });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("retries an evidence-required specialist that writes a tool call without executing it", async () => {
    const stream = vi
      .fn()
      .mockReturnValueOnce({
        fullStream: (async function* () {})(),
        text: Promise.resolve(
          'I will inspect it now. <tool_call>{"name":"inspect_repository"}</tool_call>',
        ),
        reasoningText: Promise.resolve(""),
        steps: Promise.resolve([]),
      })
      .mockReturnValueOnce({
        fullStream: (async function* () {})(),
        text: Promise.resolve("The repository contains a packages directory."),
        reasoningText: Promise.resolve("Inspected the repository."),
        steps: Promise.resolve([
          {
            toolResults: [
              {
                toolName: "inspect_repository",
                output: { directories: ["packages"] },
              },
            ],
          },
        ]),
      });

    await expect(
      runIsolatedPublicAgentTaskWithRetry({
        agent: roster[1]!,
        task: "Explain the repository structure",
        reference: "Repository claims require current evidence.",
        system: "Repository Specialist isolated system prompt",
        model: {} as never,
        tools: { inspect_repository: {} as never },
        requireToolEvidence: true,
        providerCapabilities: { supportsRequiredToolChoice: false },
        sessionId: "fabricated-tool-session",
        stream: stream as never,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      agent: "repo-scout",
      sessionId: "fabricated-tool-session",
      result: "The repository contains a packages directory.",
      evidence:
        'Evidence item 1 (inspect_repository): {"directories":["packages"]}',
    });
    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream.mock.calls[1]![0]).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              "Your previous attempt returned no executed tool evidence",
            ),
          }),
        ],
      }),
    );
  });

  it("does not expose a textual tool call after real specialist evidence", async () => {
    await expect(
      runIsolatedPublicAgentTask({
        agent: roster[1]!,
        task: "Inspect the repository policies",
        reference: "Repository claims require current evidence.",
        system: "Repository Scout isolated system prompt",
        model: {} as never,
        tools: { inspect_repository: {} as never },
        requireToolEvidence: true,
        sessionId: "mixed-tool-session",
        stream: vi.fn(() => ({
          fullStream: (async function* () {})(),
          text: Promise.resolve(
            'The repository contains policy files. <tool_call>{"name":"inspect_repository"}</tool_call>',
          ),
          reasoningText: Promise.resolve("Inspected the repository."),
          steps: Promise.resolve([
            {
              toolResults: [
                {
                  toolName: "inspect_repository",
                  output: { files: ["POLICY.md"] },
                },
              ],
            },
          ]),
        })) as never,
      }),
    ).resolves.toEqual({
      status: "completed",
      agent: "repo-scout",
      sessionId: "mixed-tool-session",
      reasoning: "Inspected the repository.",
      reference: "Repository claims require current evidence.",
      evidence: 'Evidence item 1 (inspect_repository): {"files":["POLICY.md"]}',
    });
  });

  it("builds a minimal child system from configured Agent data", () => {
    const system = buildPublicAgentChildSystem({
      agent: roster[0]!,
      capabilityInstructions: [
        "Intent is plain-language direction only.",
        "Run is immutable execution history.",
      ],
      repository: { owner: "aharonyaircohen", repo: "kody-chat" },
    });

    expect(system).toContain("You are Agency Specialist");
    expect(system).toContain("Manages Agents, Workflows, Capabilities");
    expect(system).toContain("Intent is plain-language direction only.");
    expect(system).toContain("Run is immutable execution history.");
    expect(system).toContain("aharonyaircohen/kody-chat");
    expect(system).not.toContain("Kody Chat behavior");
    expect(system).not.toContain("memoryContext");
    expect(system).toContain("safe for Kody to show directly");
    expect(system).toContain("Do not mention internal tool names");
  });

  it("passes the original form submission unchanged beside every focused task", async () => {
    let capturedContent = "";
    const stream = vi.fn(
      (input: { messages: Array<{ role: string; content: string }> }) => {
        capturedContent = input.messages[0]?.content ?? "";
        return {
          fullStream: (async function* () {})(),
          text: Promise.resolve("Assessment complete."),
          reasoningText: Promise.resolve(""),
          steps: Promise.resolve([]),
        };
      },
    );
    const sharedContext =
      'Assess this project.\n\n<view_result>{"teamSize":"3","maintenanceTime":"one day weekly"}</view_result>';

    await runIsolatedPublicAgentTask({
      agent: roster[1]!,
      task: "Assess architecture only.",
      sharedContext,
      system: "System",
      model: {} as never,
      tools: {},
      stream: stream as never,
    });

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: expect.stringContaining(sharedContext),
          },
        ],
      }),
    );
    expect(capturedContent).toContain("## Shared request context");
  });

  it("grounds synthesis with the Agent definition as well as capabilities", () => {
    expect(
      buildPublicAgentReference({
        agent: roster[0]!,
        capabilityInstructions: ["Todos are stored as Agency state."],
      }),
    ).toContain(
      "Manages Agents, Workflows, Capabilities, Loops, Intents, and Todos.",
    );
    expect(
      buildPublicAgentReference({
        agent: roster[0]!,
        capabilityInstructions: ["Todos are stored as Agency state."],
        capabilityToolNames: ["create_or_update_todo_list"],
      }),
    ).toContain("Configured actions\n\n- create or update todo list");
  });

  it("gives a specialist only tools declared by its configured capabilities", () => {
    const inspectAgency = { description: "inspect Agency" };
    const updateAgency = { description: "update Agency" };
    const inspectRepository = { description: "inspect repository" };

    expect(
      selectPublicAgentTools({
        availableTools: {
          inspect_agency: inspectAgency,
          update_agency: updateAgency,
          inspect_repository: inspectRepository,
          final_answer: { description: "output" },
        },
        capabilityToolNames: ["inspect_agency", "update_agency", "missing"],
      }),
    ).toEqual({
      inspect_agency: inspectAgency,
      update_agency: updateAgency,
    });
  });

  it("runs independent assignments and preserves their configured order", async () => {
    const invoke = vi.fn(async ({ agent, task }) => ({
      status: "completed" as const,
      agent: agent.slug,
      result: `${agent.title}: ${task}`,
    }));

    await expect(
      runPublicAgentAssignments({
        assignments: [
          { agent: "agency-specialist", task: "Explain Agency" },
          { agent: "repo-scout", task: "Map the code" },
        ],
        assignedAgents: roster,
        invoke,
      }),
    ).resolves.toEqual([
      {
        status: "completed",
        agent: "agency-specialist",
        result: "Agency Specialist: Explain Agency",
      },
      {
        status: "completed",
        agent: "repo-scout",
        result: "Repository Scout: Map the code",
      },
    ]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("starts twenty focused tasks for one specialist in parallel", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    const assignments = Array.from({ length: 20 }, (_, index) => ({
      agent: "repo-scout",
      task: `Assessment track ${index + 1}`,
    }));
    const running = runPublicAgentAssignments({
      assignments,
      assignedAgents: roster,
      invoke: vi.fn(async ({ agent, task }) => {
        started.push(task);
        await gate;
        return {
          status: "completed" as const,
          agent: agent.slug,
          result: task,
        };
      }),
    });

    await vi.waitFor(() => expect(started).toHaveLength(20));
    release();
    await expect(running).resolves.toHaveLength(20);
  });
});

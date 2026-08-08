import { describe, expect, it, vi } from "vitest";

import {
  buildPublicAgentRoutingPrompt,
  inferPublicAgentRouteFromDefinitions,
  isClearlyConversationalTurn,
  parsePublicAgentRouteDecision,
  routePublicAgentTask,
  shouldDelegatePublicAgentChat,
} from "../../app/api/kody/chat/kody/public-agent-routing";

const assignedAgents = [
  {
    slug: "agency-specialist",
    title: "Agency Specialist",
    body: "Manages Agents, Workflows, Capabilities, Loops, and Todos.",
  },
  {
    slug: "repository-specialist",
    title: "Repository Specialist",
    body: "Investigates repository structure, code, commits, and pull requests.",
  },
  {
    slug: "operations-specialist",
    title: "Operations Specialist",
    body: "Manage tasks, runs, CI, pull requests, releases, inbox items, reports, blockers, and operational status.",
  },
  {
    slug: "experience-specialist",
    title: "Experience Specialist",
    body: "Explains Views, previews, guided flows, and user-interface behavior.",
  },
  {
    slug: "knowledge-specialist",
    title: "Knowledge Specialist",
    body: "Retrieves memory, documentation, policies, context, and instructions.",
  },
];

describe("public Agent routing", () => {
  it("keeps renderer-required interactions with the parent chat owner", () => {
    expect(
      shouldDelegatePublicAgentChat({
        clientSurface: false,
        assignedSubagentCount: 2,
        requireInteractiveAction: true,
      }),
    ).toBe(false);
    expect(
      shouldDelegatePublicAgentChat({
        clientSurface: false,
        assignedSubagentCount: 2,
        requireInteractiveAction: false,
      }),
    ).toBe(true);
  });

  it("builds routing guidance entirely from assigned Agent definitions", () => {
    const prompt = buildPublicAgentRoutingPrompt(assignedAgents);

    expect(prompt).toContain("agency-specialist");
    expect(prompt).toContain("Manages Agents, Workflows");
    expect(prompt).toContain("repository-specialist");
    expect(prompt).toContain("operations-specialist");
    expect(prompt).toContain("Manage tasks, runs, CI");
  });

  it("accepts one or more assigned Agents with focused tasks", () => {
    expect(
      parsePublicAgentRouteDecision(
        JSON.stringify({
          mode: "delegate",
          assignments: [
            {
              agent: "agency-specialist",
              task: "Explain the configured Agency structure.",
            },
            {
              agent: "repository-specialist",
              task: "Identify the files that implement Agency.",
            },
          ],
        }),
        assignedAgents,
      ),
    ).toEqual({
      mode: "delegate",
      assignments: [
        {
          agent: "agency-specialist",
          task: "Explain the configured Agency structure.",
        },
        {
          agent: "repository-specialist",
          task: "Identify the files that implement Agency.",
        },
      ],
    });
  });

  it("reliably selects a clear domain using only configured definitions", () => {
    expect(
      inferPublicAgentRouteFromDefinitions(
        "Explain AI Agency structure.",
        assignedAgents,
      ),
    ).toEqual({
      mode: "delegate",
      assignments: [
        { agent: "agency-specialist", task: "Explain AI Agency structure." },
      ],
    });
    expect(
      inferPublicAgentRouteFromDefinitions(
        "Hello, how are you?",
        assignedAgents,
      ),
    ).toEqual({ mode: "self" });
    expect(
      inferPublicAgentRouteFromDefinitions(
        "What work is currently blocked?",
        assignedAgents,
      ),
    ).toEqual({
      mode: "delegate",
      assignments: [
        {
          agent: "operations-specialist",
          task: "What work is currently blocked?",
        },
      ],
    });
    expect(
      inferPublicAgentRouteFromDefinitions(
        "Explain the Agency structure and identify where it is implemented in this repository.",
        assignedAgents,
      ),
    ).toEqual({
      mode: "delegate",
      assignments: [
        {
          agent: "repository-specialist",
          task: "Complete only the part of this request owned by your configured definition: Explain the Agency structure and identify where it is implemented in this repository.",
        },
        {
          agent: "agency-specialist",
          task: "Complete only the part of this request owned by your configured definition: Explain the Agency structure and identify where it is implemented in this repository.",
        },
      ],
    });
  });

  it.each([
    ["Explain AI Agency structure.", "agency-specialist"],
    ["Explain how this repository is structured.", "repository-specialist"],
    ["What work is currently blocked?", "operations-specialist"],
    ["What is the Views page used for?", "experience-specialist"],
    ["Which project policies should I follow?", "knowledge-specialist"],
  ])("routes %s to its configured domain owner", (prompt, agent) => {
    expect(
      inferPublicAgentRouteFromDefinitions(prompt, assignedAgents),
    ).toEqual({
      mode: "delegate",
      assignments: [{ agent, task: prompt }],
    });
  });

  it.each(["Hello", "Hi, what can you help me with?", "Thanks for the help"])(
    "recognizes conversational turns without domain work: %s",
    (prompt) => {
      expect(isClearlyConversationalTurn(prompt)).toBe(true);
    },
  );

  it("falls back to Kody when output is malformed or names no assigned Agent", () => {
    expect(parsePublicAgentRouteDecision("not json", assignedAgents)).toEqual({
      mode: "self",
    });
    expect(
      parsePublicAgentRouteDecision(
        '{"mode":"delegate","assignments":[{"agent":"unknown","task":"Do it"}]}',
        assignedAgents,
      ),
    ).toEqual({ mode: "self" });
  });

  it("routes with a tool-free model call and validates its result", async () => {
    const generate = vi.fn(async () => ({
      text: [
        "```json",
        JSON.stringify({
          mode: "delegate",
          assignments: [{ agent: "agency-specialist", task: "Explain Agency" }],
        }),
        "```",
      ].join("\n"),
    }));

    await expect(
      routePublicAgentTask({
        userText: "Help me understand this",
        assignedAgents,
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toEqual({
      mode: "delegate",
      assignments: [{ agent: "agency-specialist", task: "Explain Agency" }],
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        model: {},
        messages: [{ role: "user", content: "Help me understand this" }],
        tools: undefined,
      }),
    );
  });

  it("routes a clear configured domain without spending another model call", async () => {
    const generate = vi.fn();

    await expect(
      routePublicAgentTask({
        userText: "Explain AI Agency structure.",
        assignedAgents,
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toEqual({
      mode: "delegate",
      assignments: [
        { agent: "agency-specialist", task: "Explain AI Agency structure." },
      ],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps a greeting with Kody without spending a routing model call", async () => {
    const generate = vi.fn();

    await expect(
      routePublicAgentTask({
        userText: "Hi, what can you help me with?",
        assignedAgents,
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toEqual({ mode: "self" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("prefers a clear configured definition over a conflicting model choice", async () => {
    const generate = vi.fn(async () => ({
      text: JSON.stringify({
        mode: "delegate",
        assignments: [{ agent: "knowledge-specialist", task: "Explain Views" }],
      }),
    }));

    await expect(
      routePublicAgentTask({
        userText: "Explain what the Views page is used for.",
        assignedAgents,
        model: {} as never,
        generate: generate as never,
      }),
    ).resolves.toEqual({
      mode: "delegate",
      assignments: [
        {
          agent: "experience-specialist",
          task: "Explain what the Views page is used for.",
        },
      ],
    });
  });

  it("keeps Kody in control when the routing model fails", async () => {
    await expect(
      routePublicAgentTask({
        userText: "Explain Agency",
        assignedAgents,
        model: {} as never,
        generate: vi.fn(async () => {
          throw new Error("router unavailable");
        }) as never,
      }),
    ).resolves.toEqual({
      mode: "delegate",
      assignments: [{ agent: "agency-specialist", task: "Explain Agency" }],
    });
  });
});

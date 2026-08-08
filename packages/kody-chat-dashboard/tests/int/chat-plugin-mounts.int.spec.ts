/**
 * @fileoverview Integration test for platform Step 4: the server-side plugin
 * tool registry merged into the REAL kody route handler
 * (/api/kody/chat/kody). A fixture server-half plugin registers a tool in
 * the module-scope singleton (chat/platform/server-tools) and the route:
 *
 *   - exposes the exact built-in tool map when zero plugins are registered,
 *   - exposes built-ins + the fixture tool once the plugin registers
 *     (additive only — no built-in is removed or replaced),
 *   - zod-validates fixture-tool input through the registry wrapper and
 *     threads the per-request server context (owner/repo/token),
 *   - returns 500 with a clear message when a plugin tool name collides
 *     with a built-in.
 *
 * The model + streaming layer is mocked (streamText captures the `tools`
 * option); everything else on the request path is the real route code.
 *
 * @testFramework vitest
 * @domain chat-contract
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

vi.mock("@kody-ade/base/engine/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@kody-ade/base/engine/config")>();
  return {
    ...actual,
    getEngineConfig: vi.fn(async () => ({
      config: { implementations: { default: "run" } },
      sha: null,
    })),
  };
});

vi.mock("@kody-ade/base/variables/load-chat-models", () => ({
  loadChatModels: vi.fn(async () => []),
}));

// Model resolution is mocked so the request gets past the 409 fallback and
// actually builds the tool map (the code under test).
vi.mock("../../app/api/kody/chat/resolve-model", () => ({
  resolveChatModel: vi.fn(async () => ({
    model: {},
    resolvedModel: {
      id: "test/plugin-model",
      modelName: "plugin-model",
      provider: "test",
      protocol: "openai",
      apiKeySecret: "TEST_KEY",
      enabled: true,
    },
    apiKey: "test-key",
  })),
}));

// Actor verification normally resolves the token via GitHub — keep the test
// hermetic. The rest of the local auth module (requireKodyAuth, getRequestAuth)
// stays real so header auth + repo context go through the actual code.
vi.mock("@kody-ade/base/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kody-ade/base/auth")>();
  return {
    ...actual,
    verifyActorLogin: vi.fn(async () => ({
      identity: { login: "plugin-tester", avatar_url: "", githubId: 1 },
    })),
  };
});

// Best-effort prompt loaders hit GitHub; stub them to their empty shapes.
const loadRelevantMemoryForPromptMock = vi.hoisted(() =>
  vi.fn(async () => null),
);
vi.mock("@kody-ade/workspace/memory", () => ({
  loadRelevantMemoryForPrompt: loadRelevantMemoryForPromptMock,
  createMemoryRuntime: vi.fn(),
}));
vi.mock("@kody-ade/workspace/instructions/files", () => ({
  loadInstructionsForPrompt: vi.fn(async () => null),
}));
vi.mock("@kody-ade/workspace/context/files", () => ({
  loadContextForPrompt: vi.fn(async () => null),
}));
vi.mock(
  "../../src/dashboard/lib/view-renderers/standalone-renderer-store",
  () => ({
    loadViewRendererContextForPrompt: vi.fn(async () => ({
      rules: null,
      definitions: [],
    })),
  }),
);

// CMS tool creation awaits GitHub reads on the request path — stub to empty.
const createCmsToolsMock = vi.hoisted(() => vi.fn(async () => ({})));
const createUserStateToolsMock = vi.hoisted(() => vi.fn(async () => ({})));
const listResolvedAgentFilesMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<
      Array<{
        slug: string;
        title: string;
        body: string;
        capabilities?: string[];
        subagents?: string[];
        updatedAt: string;
        htmlUrl: string;
      }>
    > => [],
  ),
);

vi.mock("../../app/api/kody/chat/tools/cms-tools", () => ({
  createCmsTools: createCmsToolsMock,
}));

vi.mock("../../app/api/kody/chat/tools/user-state-tools", () => ({
  createUserStateTools: createUserStateToolsMock,
}));

vi.mock("../../src/dashboard/lib/agent-files", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/dashboard/lib/agent-files")
    >();
  return {
    ...actual,
    listResolvedAgentFiles: listResolvedAgentFilesMock,
  };
});

// Capture the `tools` option handed to streamText; return a stub whose UI
// stream closes immediately so the real createUIMessageStream(Response)
// wrapping still runs.
const streamTextCalls: Array<Record<string, unknown>> = [];
let nextUiMessageChunks: Array<Record<string, unknown>> | null = null;
type SpecialistStreamFixture = {
  parts?: Array<Record<string, unknown>>;
  text?: string;
  reasoningText?: string;
  steps?: Array<Record<string, unknown>>;
  error?: Error;
};
let nextSpecialistStream: SpecialistStreamFixture | null = null;
let nextSpecialistStreams: SpecialistStreamFixture[] = [];
const generateTextMock = vi.hoisted(() =>
  vi.fn(async (): Promise<{ text: string; reasoningText?: string }> => ({
    text: '{"mode":"self","assignments":[]}',
  })),
);
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: generateTextMock,
    streamText: vi.fn((options: Record<string, unknown>) => {
      streamTextCalls.push(options);
      const specialistStream =
        nextSpecialistStreams.shift() ?? nextSpecialistStream;
      if (specialistStream) {
        if (specialistStream === nextSpecialistStream) {
          nextSpecialistStream = null;
        }
        return {
          fullStream: (async function* () {
            if (specialistStream.error) throw specialistStream.error;
            for (const part of specialistStream.parts ?? []) yield part;
          })(),
          text: Promise.resolve(specialistStream.text ?? ""),
          reasoningText: Promise.resolve(specialistStream.reasoningText ?? ""),
          steps: Promise.resolve(specialistStream.steps ?? []),
        };
      }
      const chunks = nextUiMessageChunks;
      nextUiMessageChunks = null;
      return {
        consumeStream: vi.fn(async () => undefined),
        toUIMessageStream: () =>
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks ?? []) controller.enqueue(chunk);
              controller.close();
            },
          }),
      };
    }),
  };
});

import { POST as kodyChatPOST } from "../../app/api/kody/chat/kody/route";
import { getChatServerToolRegistry } from "../../src/dashboard/lib/chat/platform/server-tools";
import type { ChatToolServerContext } from "../../src/dashboard/lib/chat/platform";

function makeRequest(userText = "Inspect repository status"): NextRequest {
  return new NextRequest("https://dash.test/api/kody/chat/kody", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kody-token": "ghp_test",
      "x-kody-owner": "owner",
      "x-kody-repo": "repo",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: userText }] }),
  });
}

async function postAndCaptureToolNames(userText?: string): Promise<{
  status: number;
  toolNames: string[];
  tools: Record<string, unknown>;
  response: Response;
}> {
  const before = streamTextCalls.length;
  const res = await kodyChatPOST(makeRequest(userText));
  const call = streamTextCalls[before];
  const tools = (call?.tools ?? {}) as Record<string, unknown>;
  return {
    status: res.status,
    toolNames: Object.keys(tools).sort(),
    tools,
    response: res,
  };
}

beforeAll(() => {
  process.env.KODY_MASTER_KEY = "chat-plugin-mounts-test-secret";
});

// The server tool registry is a module-scope singleton with no unregister,
// so ordering is load-bearing: baseline (zero plugins) → fixture plugin →
// collision plugin. vitest isolates modules per file, so this file owns a
// fresh singleton.
describe("kody route × chat plugin server tools (Step 4)", () => {
  let baselineToolNames: string[] = [];

  it("zero plugins registered: streams with the built-in tool map only", async () => {
    const { status, toolNames } = await postAndCaptureToolNames();
    expect(status).toBe(200);
    expect(loadRelevantMemoryForPromptMock).toHaveBeenCalledWith(
      {
        actor: { kind: "user", id: "github:1" },
        tenantId: "owner/repo",
      },
      "Inspect repository status",
    );
    // Sanity: the built-in set is present and no plugin tool leaked in.
    expect(toolNames).toContain("fetch_url");
    expect(toolNames).not.toContain("fixture_echo");
    expect(toolNames.length).toBeGreaterThan(5);
    baselineToolNames = toolNames;
  });

  it("keeps a conversational greeting fast and limits it to the final answer tool", async () => {
    listResolvedAgentFilesMock.mockResolvedValueOnce([
      {
        slug: "kody",
        title: "Kody",
        body: "Coordinates assigned specialists.",
        subagents: ["agency-specialist"],
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "agency-specialist",
        title: "Agency Specialist",
        body: "Manages Agents, Workflows, Capabilities, and Todos.",
        updatedAt: "",
        htmlUrl: "",
      },
    ]);
    nextUiMessageChunks = [
      { type: "text-start", id: "reply" },
      { type: "text-delta", id: "reply", delta: "Hello!" },
      { type: "text-end", id: "reply" },
    ];

    const generateCallsBefore = generateTextMock.mock.calls.length;
    const streamTextCallCountBefore = streamTextCalls.length;
    const { status, toolNames } = await postAndCaptureToolNames(
      "Hi, what can you help me with?",
    );

    expect(status).toBe(200);
    expect(toolNames).toEqual(["final_answer"]);
    expect(generateTextMock).toHaveBeenCalledTimes(generateCallsBefore);
    expect(streamTextCalls.at(streamTextCallCountBefore)?.system).toContain(
      "Do not infer Kody's overall capabilities from this turn's reduced tool list",
    );
  });

  it("routes to and executes Kody's assigned public Agent before the parent turn", async () => {
    listResolvedAgentFilesMock.mockResolvedValueOnce([
      {
        slug: "kody",
        title: "Kody",
        body: "Coordinates assigned specialists.",
        subagents: ["agency-specialist"],
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "agency-specialist",
        title: "Agency Specialist",
        body: "Manages Agents, Workflows, Capabilities, and Todos.",
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "repo-scout",
        title: "Repository Scout",
        body: "Maps repository structure.",
        updatedAt: "",
        htmlUrl: "",
      },
    ]);
    nextSpecialistStream = {
      parts: [
        { type: "reasoning-delta", text: "I compared the configured " },
        { type: "reasoning-delta", text: "Agency models." },
      ],
      text: "Agency structure explained.",
      reasoningText: "I compared the configured Agency models.",
    };
    generateTextMock.mockResolvedValueOnce({
      text: "Kody's synthesized Agency explanation.",
    });

    const streamTextCallCountBefore = streamTextCalls.length;
    const { status, tools, response } = await postAndCaptureToolNames(
      "Explain AI Agency structure.",
    );
    expect(status).toBe(200);
    const responseBody = await response.text();
    expect(tools).not.toHaveProperty("delegate_to_agent");
    expect(streamTextCalls.at(streamTextCallCountBefore)).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Explain AI Agency structure."),
          }),
        ],
        tools: {},
      }),
    );
    expect(
      (streamTextCalls.at(streamTextCallCountBefore)?.messages as Array<{
        content: string;
      }>)[0]?.content,
    ).toContain("## Agent definition");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: undefined,
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              "Source status: authoritative source available",
            ),
          }),
        ],
      }),
    );
    expect(responseBody).toContain("Kody's synthesized Agency explanation.");
    expect(responseBody).toContain("data-subagent-activity");
    expect(responseBody).toContain("Agency Specialist");
    expect(responseBody).toContain('"phase":"reasoning"');
    expect(responseBody).toContain("I compared the configured ");
    expect(responseBody).toContain("Agency models.");
    expect(responseBody).not.toContain("Kody delegated this request");
    expect(streamTextCalls).toHaveLength(streamTextCallCountBefore + 1);
  });

  it("filters provider safety metadata and falls back to the grounded specialist answer", async () => {
    listResolvedAgentFilesMock.mockResolvedValueOnce([
      {
        slug: "kody",
        title: "Kody",
        body: "Coordinates assigned specialists.",
        subagents: ["agency-specialist"],
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "agency-specialist",
        title: "Agency Specialist",
        body: "Manages Agents, Workflows, Capabilities, and Todos.",
        updatedAt: "",
        htmlUrl: "",
      },
    ]);
    nextSpecialistStream = {
      parts: [
        { type: "reasoning-delta", text: "User " },
        { type: "reasoning-delta", text: "Safety: safe" },
      ],
      text: "Agency connects Agents to focused Capabilities and Workflows.",
      reasoningText: "User Safety: safe",
    };
    generateTextMock.mockResolvedValueOnce({ text: "User Safety: safe" });

    const { status, response } = await postAndCaptureToolNames(
      "Explain AI Agency structure.",
    );
    const responseBody = await response.text();

    expect(status).toBe(200);
    expect(responseBody).toContain(
      "Agency connects Agents to focused Capabilities and Workflows.",
    );
    expect(responseBody).not.toContain("User Safety");
  });

  it("lets Kody answer from the authoritative Agent definition when the specialist returns no text", async () => {
    listResolvedAgentFilesMock.mockResolvedValueOnce([
      {
        slug: "kody",
        title: "Kody",
        body: "Coordinates assigned specialists.",
        subagents: ["agency-specialist"],
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "agency-specialist",
        title: "Agency Specialist",
        body: "Manages Agents, Workflows, Capabilities, and Todos.",
        updatedAt: "",
        htmlUrl: "",
      },
    ]);
    nextSpecialistStream = { text: "" };
    generateTextMock.mockResolvedValueOnce({
      text: "Agency connects Agents, Workflows, Capabilities, and Todos.",
    });

    const { status, response } = await postAndCaptureToolNames(
      "Explain AI Agency structure.",
    );
    const responseBody = await response.text();

    expect(status).toBe(200);
    expect(responseBody).toContain(
      "Agency connects Agents, Workflows, Capabilities, and Todos.",
    );
    expect(responseBody).not.toContain(
      "Agency Specialist failed: The specialist returned no answer",
    );
  });

  it("stops without synthesis when the only specialist times out", async () => {
    listResolvedAgentFilesMock.mockResolvedValueOnce([
      {
        slug: "kody",
        title: "Kody",
        body: "Coordinates assigned specialists.",
        subagents: ["agency-specialist"],
        updatedAt: "",
        htmlUrl: "",
      },
      {
        slug: "agency-specialist",
        title: "Agency Specialist",
        body: "Manages Agents, Workflows, Capabilities, and Todos.",
        updatedAt: "",
        htmlUrl: "",
      },
    ]);
    const generateCallCountBefore = generateTextMock.mock.calls.length;
    nextSpecialistStream = {
      error: new Error(
        "The operation was aborted because the request timed out",
      ),
    };

    const streamTextCallCountBefore = streamTextCalls.length;
    const { status, response } = await postAndCaptureToolNames(
      "Explain AI Agency structure.",
    );
    const responseBody = await response.text();

    expect(status).toBe(200);
    expect(responseBody).toContain(
      "Agency Specialist failed: The specialist timed out. Retry or choose another model.",
    );
    expect(responseBody).toContain("data-subagent-activity");
    expect(responseBody).toContain("errorText");
    expect(responseBody).not.toContain("Kody delegated this request");
    expect(generateTextMock).toHaveBeenCalledTimes(generateCallCountBefore);
    expect(streamTextCalls).toHaveLength(streamTextCallCountBefore + 1);
  });

  it("continues the chat when optional CMS tools cannot be loaded", async () => {
    createCmsToolsMock.mockRejectedValueOnce(
      new Error("CMS config unavailable"),
    );
    nextUiMessageChunks = [
      { type: "text-start", id: "reply" },
      { type: "text-delta", id: "reply", delta: "Still responding." },
      { type: "text-end", id: "reply" },
    ];

    const { status, toolNames, response } = await postAndCaptureToolNames();

    expect(status).toBe(200);
    expect(toolNames).toContain("fetch_url");
    expect(toolNames).not.toContain("cms_list_collections");
    expect(await response.text()).toContain("Still responding.");
  });

  it("continues the chat when optional user-state tools cannot be loaded", async () => {
    createUserStateToolsMock.mockRejectedValueOnce(
      new Error("user-state config unavailable"),
    );

    const { status, toolNames } = await postAndCaptureToolNames();

    expect(status).toBe(200);
    expect(toolNames).toContain("fetch_url");
    expect(toolNames).not.toContain("user_state_get");
  });

  it("fixture plugin tool is exposed additively and zod-validated with the request server context", async () => {
    const executions: Array<{ input: unknown; ctx: ChatToolServerContext }> =
      [];
    getChatServerToolRegistry().register("fixture", () => ({
      fixture_echo: {
        description: "Echo a message back (fixture plugin tool).",
        inputSchema: z.object({ message: z.string().min(1) }),
        execute: async (input, ctx) => {
          executions.push({ input, ctx });
          return { echoed: (input as { message: string }).message };
        },
      },
      remote_write: {
        description: "Must still be removed by the Kody chat tool policy.",
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      },
    }));

    const { status, toolNames, tools } = await postAndCaptureToolNames();
    expect(status).toBe(200);
    // Additive only: baseline built-ins all still present, plus the fixture.
    expect(toolNames).toEqual([...baselineToolNames, "fixture_echo"].sort());
    expect(toolNames).not.toContain("remote_write");

    const fixtureTool = tools.fixture_echo as {
      description: string;
      execute: (input: unknown, options: unknown) => Promise<unknown>;
    };
    expect(fixtureTool.description).toContain("fixture plugin tool");

    // Valid input executes and receives the per-request server context.
    await expect(
      fixtureTool.execute({ message: "hello" }, {}),
    ).resolves.toEqual({ echoed: "hello" });
    expect(executions).toHaveLength(1);
    expect(executions[0].ctx).toEqual({
      owner: "owner",
      repo: "repo",
      token: "ghp_test",
      extras: {
        actorLogin: "plugin-tester",
        actorGithubId: 1,
      },
    });

    // Invalid input is rejected by the registry's zod wrapper BEFORE the
    // handler runs.
    await expect(fixtureTool.execute({ message: 42 }, {})).resolves.toEqual({
      error: expect.stringContaining("Invalid input"),
    });
    expect(executions).toHaveLength(1);
  });

  it("a plugin tool colliding with a built-in name fails the request with 500", async () => {
    getChatServerToolRegistry().register("colliding", () => ({
      fetch_url: {
        description: "Collides with the built-in fetch_url tool.",
        inputSchema: z.object({}),
        execute: async () => null,
      },
    }));

    const res = await kodyChatPOST(makeRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(String(data.error)).toMatch(/collision/i);
    expect(String(data.error)).toContain("fetch_url");
  });
});

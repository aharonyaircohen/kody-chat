import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { createPublicAgentEvidenceTool } from "../../packages/kody-chat-dashboard/app/api/kody/chat/kody/public-agent-evidence-tool";
import { chatModelAdapter } from "../../packages/kody-chat-dashboard/app/api/kody/chat/model-adapters";
import { ChatModelSchema } from "../../packages/base/src/variables/models";
import { createAutomaticLanguageModel } from "../../packages/kody-chat-dashboard/src/dashboard/lib/chat/core/automatic-language-model";

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) throw new Error("MINIMAX_API_KEY is required");

const modelConfig = ChatModelSchema.parse({
  id: "minimax/MiniMax-M3",
  label: "MiniMax M3 evaluation",
  provider: "minimax",
  adapter: "openai-compatible",
  adapterBaseURL: "https://api.minimax.io/v1",
  protocol: "openai",
  baseURL: "https://api.minimax.io/v1",
  modelName: "MiniMax-M3",
  apiKeySecret: "MINIMAX_API_KEY",
  enabled: true,
});
const adapter = chatModelAdapter(modelConfig);
const model = createAutomaticLanguageModel(
  [
    { id: "minimax-primary", model: adapter.create(modelConfig, apiKey) },
    { id: "minimax-retry", model: adapter.create(modelConfig, apiKey) },
  ],
  { candidateTimeoutMs: 20_000 },
);
const assignedAgents = [
  {
    slug: "repository-specialist",
    title: "Repository Specialist",
    body: "Investigates repository code and structure when new code evidence is required.",
  },
  {
    slug: "experience-specialist",
    title: "Experience Specialist",
    body: "Reviews interfaces, usability, and accessibility.",
  },
  {
    slug: "operations-specialist",
    title: "Operations Specialist",
    body: "Investigates CI, deployments, and operational failures.",
  },
  {
    slug: "security-specialist",
    title: "Security Specialist",
    body: "Reviews security boundaries and risks.",
  },
];

const scenarios = [
  [
    "visible-page",
    "What page am I viewing?",
    "Current browser URL: https://www.iana.org/help/example-domains.",
    "direct",
    0,
  ],
  [
    "visible-summary",
    "Summarize what is visible on this page.",
    "Visible page: IANA Example Domains documentation and its domain-reservation explanation.",
    "direct",
    0,
  ],
  [
    "selection",
    "What element did I select?",
    "Current selection: the domain-reservation explanation on the IANA Example Domains page.",
    "direct",
    0,
  ],
  [
    "reference",
    "Where is the repository settings page?",
    "Active dashboard repository: aharonyaircohen/kody-chat. Repository navigation is available to Kody.",
    "direct",
    0,
  ],
  [
    "explanation",
    "Explain what a repository is in two sentences.",
    "General knowledge question; no live investigation requested.",
    "direct",
    0,
  ],
  [
    "parent-action",
    "Create a new Agent for local workflow checks.",
    "Active dashboard repository: aharonyaircohen/kody-chat. Agent management is available to Kody.",
    "direct",
    0,
  ],
  [
    "capability",
    "Run the draft-facebook-personal-post Capability.",
    "The named Capability is installed and executable by Kody.",
    "direct",
    0,
  ],
  [
    "code",
    "Find why preview history loses the selected URL.",
    "Active repository: aharonyaircohen/kody-chat. Preview browser source files are available for investigation.",
    "specialist",
    1,
  ],
  [
    "ui",
    "Review this page for accessibility problems.",
    "Visible page: the rendered IANA Example Domains page at https://www.iana.org/help/example-domains.",
    "specialist",
    1,
  ],
  [
    "operations",
    "Investigate why the latest CI run failed.",
    "Active repository: aharonyaircohen/kody-chat. CI run history and logs are available for investigation.",
    "specialist",
    1,
  ],
  [
    "cross-domain",
    "Review the preview implementation for UX, security, and operational risks.",
    "Active repository: aharonyaircohen/kody-chat. The preview implementation source, rendered preview, and deployment configuration are available.",
    "specialist",
    3,
  ],
  [
    "assessment",
    "Run a complete project assessment.",
    "Active repository: aharonyaircohen/kody-chat. Project assessment intake is owned by Kody.",
    "direct",
    0,
  ],
] as const;

async function evaluateScenario(
  run: number,
  scenario: (typeof scenarios)[number],
) {
  const [name, prompt, currentContext, expectedMode, expectedCount] = scenario;
  const startedAt = Date.now();
  try {
    let calls: Awaited<
      ReturnType<typeof generateText>
    >["steps"][number]["toolCalls"] = [];
    const emptyAttempts: Array<{ text: string; reasoning: string }> = [];
    let attempts = 0;
    while (calls.length === 0 && attempts < 3) {
      attempts += 1;
      const result = await generateText({
        model,
        system: [
          "You are Kody and own this complete turn.",
          "Use the matching Kody tool for Kody-owned work. Answer from authoritative current context when no operation is needed.",
          "Call request_specialist_evidence only when the request explicitly requires focused specialist investigation or review. Then continue the same turn and decide yourself.",
          "Never consult a specialist to decide, explain, navigate, or prepare a Kody-owned action.",
          "The current browser context below is authoritative for what the user sees.",
          currentContext,
        ].join("\n"),
        messages: [{ role: "user", content: prompt }],
        tools: {
          request_specialist_evidence: createPublicAgentEvidenceTool({
            agents: assignedAgents,
            run: async () => [],
          }),
          kody_action: tool({
            description:
              "Perform Kody-owned product actions: create or manage Agents, run Capabilities, start project assessment intake, and navigate repository or dashboard pages.",
            inputSchema: z.object({ request: z.string() }),
            execute: async ({ request }) => ({ request }),
          }),
          final_answer: tool({
            description:
              "Answer directly from current context or general knowledge when no operation or specialist investigation is needed.",
            inputSchema: z.object({ content: z.string() }),
            execute: async ({ content }) => ({ content }),
          }),
        },
        toolChoice: "required",
        stopWhen: stepCountIs(1),
      });
      calls = result.steps.flatMap((step) => step.toolCalls);
      if (calls.length === 0) {
        emptyAttempts.push({
          text: result.text,
          reasoning: result.steps
            .map((step) => step.reasoningText ?? "")
            .join("\n"),
        });
      }
    }
    const specialistCall = calls.find(
      (call) => call.toolName === "request_specialist_evidence",
    );
    const input = specialistCall?.input as
      { assignments?: Array<{ agent?: string }> } | undefined;
    const specialistCount = input?.assignments?.length ?? 0;
    const mode = specialistCall ? "specialist" : "direct";
    const passed =
      mode === expectedMode &&
      (expectedMode === "direct" || specialistCount === expectedCount);
    return {
      run,
      name,
      expectedMode,
      expectedCount,
      mode,
      specialistCount,
      calls: calls.map((call) => ({
        toolName: call.toolName,
        input: call.input,
      })),
      attempts,
      ...(emptyAttempts.length > 0 ? { emptyAttempts } : {}),
      elapsedMs: Date.now() - startedAt,
      passed,
    };
  } catch (error) {
    return {
      run,
      name,
      expectedMode,
      expectedCount,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      passed: false,
    };
  }
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  const runCount = Number(process.env.KODY_EVAL_RUNS ?? "3");
  const selectedScenarios = process.env.KODY_EVAL_SCENARIO
    ? scenarios.filter(([name]) => name === process.env.KODY_EVAL_SCENARIO)
    : scenarios;
  for (let run = 1; run <= runCount; run += 1) {
    for (const scenario of selectedScenarios) {
      const result = await evaluateScenario(run, scenario);
      results.push(result);
      process.stderr.write(
        `${run} ${scenario[0]}: ${result.passed ? "PASS" : "FAIL"}\n`,
      );
    }
  }
  const passed = results.filter((result) => result.passed).length;
  process.stdout.write(
    `${JSON.stringify({ passed, total: results.length, results }, null, 2)}\n`,
  );
}

void main();

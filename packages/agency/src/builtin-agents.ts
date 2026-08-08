import type { TickFile } from "@kody-ade/base/ticked/files";

export const BUILTIN_SPECIALIST_SLUGS = [
  "context-scout",
  "repository-analyst",
  "operations-specialist",
  "agency-architect",
  "system-admin",
  "ui-vibe-specialist",
] as const;

interface BuiltinAgentCapability {
  instructions: string;
  capabilityTools: Array<{ name: string }>;
}

interface BuiltinAgentDefinition {
  slug: string;
  title: string;
  body: string;
  toolNames: readonly string[];
}

const DEFINITIONS: readonly BuiltinAgentDefinition[] = [
  {
    slug: "context-scout",
    title: "Context Scout",
    body:
      "Context Scout finds the relevant memory, context, documentation, policies, instructions, and constraints needed to answer a request. It retrieves only focused supporting material and does not own repository analysis or presentation.",
    toolNames: [
      "list_context",
      "read_context",
      "read_instructions",
      "list_memories",
      "recall",
      "recall_search",
      "fetch_url",
    ],
  },
  {
    slug: "repository-analyst",
    title: "Repository Analyst",
    body:
      "Repository Analyst investigates repository structure, code, architecture, files, pull requests, commits, ownership, and technical documentation. It grounds repository claims in current repository evidence.",
    toolNames: [
      "github_get_issue",
      "github_get_pull_request",
      "github_list_tree",
      "github_get_file",
      "github_search_code",
      "github_blame",
      "github_commits_for_path",
      "github_list_issues",
      "kody_list_open_prs",
    ],
  },
  {
    slug: "operations-specialist",
    title: "Operations Specialist",
    body:
      "Operations Specialist handles tasks, runs, CI, releases, inbox work, blockers, and operational status. It checks current state before reporting or taking an operational action.",
    toolNames: [
      "github_get_issue",
      "github_list_issues",
      "github_comment_on_issue",
      "github_close_issue",
      "kody_get_pipeline_status",
      "kody_list_workflow_runs",
      "kody_list_open_prs",
      "list_agency_runs",
      "read_agency_run",
      "create_feature",
      "create_enhancement",
      "create_refactor",
      "create_documentation",
      "create_chore",
      "request_release",
    ],
  },
  {
    slug: "agency-architect",
    title: "Agency Architect",
    body:
      "Agency Architect owns AI Agency governance across Agents, Capabilities, Workflows, Loops, Intents, and Todos. It maintains their responsibilities and uses their existing management surfaces.",
    toolNames: [
      "list_agents",
      "read_agent",
      "update_agent",
      "dispatch_agent",
      "list_capabilities",
      "read_capability",
      "create_or_update_capability",
      "run_capability",
      "list_workflows",
      "read_workflow",
      "create_or_update_workflow",
      "run_workflow",
      "list_loops",
      "read_loop",
      "create_or_update_loop",
      "run_loop",
      "list_intents",
      "read_intent",
      "create_or_update_intent",
      "list_todo_lists",
      "read_todo_list",
      "create_or_update_todo_list",
    ],
  },
  {
    slug: "system-admin",
    title: "System Admin",
    body:
      "System Admin manages system configuration: models, secrets, variables, webhooks, notifications, CMS connections, and related administrative settings. It keeps operational configuration separate from product-domain work.",
    toolNames: [
      "list_models",
      "set_default_model",
      "set_model_enabled",
      "list_secret_names",
      "set_secret",
      "list_variables",
      "set_variable",
      "delete_variable",
      "register_webhook",
      "cms_list_collections",
      "cms_describe_collection",
      "cms_list_documents",
      "cms_get_document",
    ],
  },
  {
    slug: "ui-vibe-specialist",
    title: "UI/Vibe Specialist",
    body:
      "UI/Vibe Specialist inspects dashboard views, previews, guided flows, navigation, and user-interface behavior. It supplies focused UI findings while Kody remains responsible for the final chat renderer and user-facing presentation.",
    toolNames: [
      "list_dashboard_features",
      "describe_feature",
      "dashboard_navigate",
      "preview_act",
      "guided_flow_start",
      "guided_flow_context",
      "guided_flow_read",
    ],
  },
];

const CAPABILITY_PREFIX = "builtin-agent-";

function toAgentFile(definition: BuiltinAgentDefinition): TickFile {
  return {
    slug: definition.slug,
    title: definition.title,
    body: definition.body,
    sha: "",
    updatedAt: "",
    htmlUrl: "",
    source: "builtin",
    readOnly: true,
    capabilities: [`${CAPABILITY_PREFIX}${definition.slug}`],
  };
}

const KODY: TickFile = {
  slug: "kody",
  title: "Kody",
  body:
    "Kody is the main assistant and lightweight orchestrator. It answers directly when no specialist clearly owns the request, delegates focused domain work to assigned Agents, coordinates parallel work only when needed, and owns the final user-facing response and renderers.",
  sha: "",
  updatedAt: "",
  htmlUrl: "",
  source: "builtin",
  readOnly: true,
  subagents: [...BUILTIN_SPECIALIST_SLUGS],
};

const BUILTIN_AGENTS = [KODY, ...DEFINITIONS.map(toAgentFile)];

export function listBuiltinAgentFiles(): TickFile[] {
  return BUILTIN_AGENTS.map((agent) => ({
    ...agent,
    ...(agent.capabilities ? { capabilities: [...agent.capabilities] } : {}),
    ...(agent.subagents ? { subagents: [...agent.subagents] } : {}),
  }));
}

export function readBuiltinAgentFile(slug: string): TickFile | null {
  return listBuiltinAgentFiles().find((agent) => agent.slug === slug) ?? null;
}

export function readBuiltinAgentCapability(
  slug: string,
): BuiltinAgentCapability | null {
  if (!slug.startsWith(CAPABILITY_PREFIX)) return null;
  const agentSlug = slug.slice(CAPABILITY_PREFIX.length);
  const definition = DEFINITIONS.find(({ slug: value }) => value === agentSlug);
  if (!definition) return null;
  return {
    instructions: `${definition.title} must stay within this responsibility: ${definition.body}`,
    capabilityTools: definition.toolNames.map((name) => ({ name })),
  };
}

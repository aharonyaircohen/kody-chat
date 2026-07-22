/**
 * @fileType tool
 * @domain kody
 * @pattern ai-sdk-tool
 * @ai-summary Client-controllable UI actions. Each tool's execute returns a
 *  structured directive that KodyChat.tsx detects in the tool-output-available
 *  stream chunk and dispatches against React state. Server-side has no real
 *  side effect; the client owns the action.
 */
import { randomUUID } from "crypto";
import { jsonSchema, tool } from "ai";
import { z } from "zod";
import { AGENTS, type AgentId } from "../../../../../src/dashboard/lib/agents";
import {
  DASHBOARD_NAVIGATE_DIRECTIVE,
  PREVIEW_ACT_DIRECTIVE,
  SWITCH_AGENT_DIRECTIVE,
  type DashboardNavigateDirective,
  type PreviewActDirective,
  type RenderedViewUiNode,
  type SwitchAgentDirective,
  type SwitchAgentTargetId,
} from "../../../../../src/dashboard/lib/chat-ui-actions";
import {
  dashboardNavigationCatalogForPrompt,
  resolveDashboardNavigationTarget,
} from "../../../../../src/dashboard/lib/dashboard-navigation";
import type { ViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/renderers";
import { BUILTIN_VIEW_RENDERER_DEFINITIONS } from "../../../../../src/dashboard/lib/view-renderers/builtin";
import {
  buildChatViewCatalog,
  buildShowViewInputJsonSchema,
} from "../../../../../src/dashboard/lib/view-renderers/spec/catalog";
import { validateChatViewSpec } from "../../../../../src/dashboard/lib/view-renderers/spec/validate";
import { buildChatViewDirective } from "../../../../../src/dashboard/lib/view-renderers/spec/expand";
import { buildShowViewGuidance } from "../../../../../src/dashboard/lib/view-renderers/spec/prompt";
import {
  FINAL_ANSWER_REQUIRES_VIEW_ERROR,
  FINAL_ANSWER_TOOL,
  SHOW_VIEW_TOOL,
} from "../../../../../src/dashboard/lib/chat-output-tools";
import { shouldRequireViewOutputForAssistantText } from "../../../../../src/dashboard/lib/view-renderers/chat-intent";

const SELECTABLE_AGENT_IDS = Object.values(AGENTS).map(
  (a) => a.id,
) as SwitchAgentTargetId[];

interface UiToolsCtx {
  /** Brand renderer definitions; built-ins are used when empty/omitted. */
  viewRendererDefinitions?: ViewRendererDefinition[];
  /** Decision turns must render at least one control the user can operate. */
  requireInteractiveAction?: boolean;
}

function hasInteractiveControl(node: RenderedViewUiNode): boolean {
  if (
    node.type === "button" ||
    node.type === "submit" ||
    node.type === "checkbox" ||
    (node.type === "input" && node.readOnly !== true)
  ) {
    return true;
  }
  return "children" in node
    ? node.children.some((child) => hasInteractiveControl(child))
    : false;
}

export const switchAgentTool = tool({
  description:
    "Switch the active dashboard agent in the chat UI. Call ONLY when the user " +
    'explicitly asks to change agents ("switch to Kody Live", "use Brain instead"). ' +
    'Do NOT call proactively to "find the right agent" for a question. The switch ' +
    "takes effect for the user's NEXT message, not the current turn; explain " +
    "that to the user. For Kody Live specifically, the first message after the " +
    "switch starts the live session (the runner boots on first message; there " +
    'is no separate "start" action). When the call is made from voice mode and ' +
    "the target agent's backend is not kody-direct, voice will close " +
    "automatically; mention that the user will need to type the next message.",
  inputSchema: z.object({
    agentId: z
      .enum(SELECTABLE_AGENT_IDS as [string, ...string[]])
      .describe(
        "Target agent id. Valid: " +
          SELECTABLE_AGENT_IDS.join(", ") +
          ". Voice is a modality (the mic icon), not an agent; every agent works in voice mode but only kody-direct agents keep the mic open after a switch.",
      ),
    reason: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "One short sentence explaining why you are switching. Shown back to the " +
          "user as confirmation. Keep it natural for TTS in voice mode.",
      ),
  }),
  execute: async ({
    agentId,
    reason,
  }): Promise<SwitchAgentDirective | { error: string }> => {
    const target = AGENTS[agentId as AgentId];
    if (!target) {
      return { error: `Unknown agent id "${agentId}"` };
    }
    return {
      action: SWITCH_AGENT_DIRECTIVE,
      agentId: agentId as SwitchAgentTargetId,
      agentName: target.name,
      reason,
    };
  },
});

export const previewActTool = tool({
  description:
    "Drive the preview iframe: click, fill, navigate, scroll, or wait. " +
    "Use ONLY when the user asks you to interact with or verify something in " +
    'the preview (e.g. "log in", "click the Save button", "scroll to the footer"). ' +
    "The action runs in the user's browser via the Kody Preview Inspector " +
    "extension; if the extension isn't installed the call surfaces an error and you " +
    "should tell the user. Each successful call returns a fresh DOM snapshot " +
    "as a follow-up user turn so you can chain steps (e.g. fill email -> fill " +
    "password -> click submit -> read the next page).",
  inputSchema: z.object({
    op: z
      .enum(["click", "fill", "navigate", "scroll", "wait"])
      .describe("Which kind of action to run."),
    selector: z
      .string()
      .optional()
      .describe(
        "CSS selector identifying the target element. Required for click/fill. " +
          "Optional for scroll when scrolling to an element rather than by dy.",
      ),
    value: z
      .string()
      .optional()
      .describe("Value to set on a fill op. Ignored for other ops."),
    url: z
      .string()
      .optional()
      .describe(
        "Same-origin URL to navigate to. Cross-origin navigation is blocked.",
      ),
    dy: z
      .number()
      .int()
      .optional()
      .describe("Pixels to scroll by, used when selector is not provided."),
    ms: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .optional()
      .describe("Milliseconds to wait. Used by op=wait. Max 5000."),
    reason: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "One short sentence explaining why you're running this action. " +
          "Shown to the user as confirmation.",
      ),
  }),
  execute: async (input): Promise<PreviewActDirective> => {
    return {
      action: PREVIEW_ACT_DIRECTIVE,
      op: input.op,
      selector: input.selector,
      value: input.value,
      url: input.url,
      dy: input.dy,
      ms: input.ms,
      reason: input.reason,
    };
  },
});

export const dashboardNavigateTool = tool({
  description:
    "Navigate the user's Dashboard shell to a known internal page. " +
    "Call ONLY when the user clearly asks to go to, open, show, or take them to a dashboard place. " +
    'For informational questions like "where is X?" or "what page handles X?", answer with final_answer instead of moving the user. ' +
    "Never call during unrelated answers, never use external URLs, and never invent routes. " +
    "If the user asks for a specific task or issue number, use routeId=task and set issueNumber. " +
    "Allowed dashboard routes:\n" +
    dashboardNavigationCatalogForPrompt(),
  inputSchema: z.object({
    routeId: z
      .string()
      .min(1)
      .describe("Known route id from the allowed dashboard routes list."),
    issueNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Required only when routeId is task."),
    reason: z
      .string()
      .min(1)
      .max(200)
      .describe("One short sentence explaining why this page is being opened."),
  }),
  execute: async ({
    routeId,
    issueNumber,
    reason,
  }): Promise<DashboardNavigateDirective | { error: string }> => {
    const resolved = resolveDashboardNavigationTarget({
      routeId,
      issueNumber,
      reason,
    });
    if ("error" in resolved) return resolved;
    return {
      action: DASHBOARD_NAVIGATE_DIRECTIVE,
      routeId: resolved.routeId,
      href: resolved.href,
      label: resolved.label,
      reason: resolved.reason,
    };
  },
});

export function createUiTools(ctx: UiToolsCtx = {}) {
  let interactiveFinalAnswerText: string | null = null;
  const definitions =
    ctx.viewRendererDefinitions && ctx.viewRendererDefinitions.length > 0
      ? ctx.viewRendererDefinitions
      : [...BUILTIN_VIEW_RENDERER_DEFINITIONS];
  const catalog = buildChatViewCatalog(definitions);
  // The SDK-level schema documents the spec envelope but never rejects:
  // strict per-component validation runs inside execute, so a bad spec
  // surfaces as a tool error the model can read and retry — instead of
  // aborting the stream or triggering arg-repair heuristics.
  const showViewInputSchema = jsonSchema<unknown>(
    buildShowViewInputJsonSchema(catalog),
    {
      validate: (value) => ({ success: true, value }),
    },
  );
  return {
    [FINAL_ANSWER_TOOL]: tool({
      description:
        "Finish the turn with plain text when no chat UI renderer is needed. " +
        "Use this for ordinary answers, summaries, and status updates. " +
        "Do not use this for questions that ask the user to choose, approve, confirm, continue, cancel, or pick an action; use show_view instead.",
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .max(12000)
          .describe(
            "The final user-visible answer. Write it as a short executive summary for a product manager: 3-6 plain sentences leading with the outcome, at most one small list. NEVER include raw JSON, schemas, code, id dumps, or step-by-step work here unless the user explicitly asked to see them — say where the data lives instead. Long content the user did not ask for is a failure.",
          ),
      }),
      execute: async ({ content }) => {
        // Nudge toward show_view at most once per turn: if the model
        // insists on plain text after the first rejection, accept it —
        // a wrongly-forced card (e.g. on a greeting) is worse than prose.
        if (
          interactiveFinalAnswerText === null &&
          shouldRequireViewOutputForAssistantText({
            assistantText: content,
            definitions: ctx.viewRendererDefinitions ?? [],
          })
        ) {
          interactiveFinalAnswerText = content;
          return {
            error: FINAL_ANSWER_REQUIRES_VIEW_ERROR,
          };
        }
        interactiveFinalAnswerText = null;
        return { content };
      },
    }),
    switch_agent: switchAgentTool,
    dashboard_navigate: dashboardNavigateTool,
    preview_act: previewActTool,
    [SHOW_VIEW_TOOL]: tool({
      description:
        "Render an interactive UI card in the chat from a JSON spec. " +
        "Use this whenever the reply asks the user to choose, approve, confirm, continue, cancel, or pick an action — and when the user asks to show, render, or display a UI card; do not print JSON for the user to copy. " +
        "Compose the spec only from the components listed below. " +
        "Put only data that belongs to the current interaction into the view; do not copy preview, page, repo, task, memory, or research context into it. " +
        "This tool only shows UI; it does not execute the selected action. " +
        "If the call returns an error, fix the spec it describes and call again.\n\n" +
        buildShowViewGuidance(catalog),
      inputSchema: showViewInputSchema,
      execute: async (input) => {
        const validated = validateChatViewSpec(catalog, input);
        if (!validated.success) {
          return { error: validated.error };
        }
        try {
          const directive = buildChatViewDirective({
            id: `view-${randomUUID()}`,
            catalog,
            spec: validated.spec,
          });
          if (
            ctx.requireInteractiveAction &&
            !hasInteractiveControl(directive.ui)
          ) {
            return {
              error:
                "This turn asks the user to decide, but the view has no interactive control. Render an approval, selection, button, checkbox, or editable form control instead of placeholder/status text.",
            };
          }
          return directive;
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}

export const uiTools = createUiTools();

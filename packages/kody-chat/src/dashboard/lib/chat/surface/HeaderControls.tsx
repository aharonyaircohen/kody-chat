/**
 * @fileType component
 * @domain kody
 * @pattern chat-surface
 * @ai-summary Header region of the chat surface — agent/model picker (locked
 * label when the host pins an agent), thinking-level control, remote dev
 * status dot, the icon-only window action buttons (fullscreen, collapse,
 * close), and the context bar with conversation actions (task / capability /
 * planner / global session title). Extracted verbatim from
 * KodyChat (Step 3); selection + session state stays with the host, which
 * wires behavior through callbacks.
 */
"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  Brain,
  Globe,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeftClose,
  Plus,
  Target,
  X,
} from "lucide-react";
import type { AgentConfig, AgentId } from "@dashboard/lib/agents";
import { RepoScopedLink } from "@dashboard/lib/components/RepoScopedLink";
import type { ChatDropdownEntry } from "../platform/agent-entries";
import type { ModelReasoning } from "../core/reasoning-adapter";
import { writeReasoningEffort } from "../core/reasoning-pref";
import type { KodyTask } from "@kody-ade/base/types";
import { ChatPluginSlot } from "./ChatPluginProvider";

interface HeaderControlsProps {
  /**
   * Matched dropdown entry for the active pick — preferred label/icon
   * source. `null` when the selection points at a model that was just
   * removed (or on locked views).
   */
  currentEntry: ChatDropdownEntry | null;
  /** Static agent fallback when no dropdown entry matches. */
  currentAgent: AgentConfig;
  /** When set, the picker is a locked label — no dropdown. */
  lockedAgentId?: AgentId;
  /** Presentation-only lock for surfaces that pin chat defaults elsewhere. */
  hideAgentPicker?: boolean;
  /** Shorter one-row header for standalone surfaces that keep shared controls. */
  compact?: boolean;
  agentMenuOpen: boolean;
  setAgentMenuOpen: Dispatch<SetStateAction<boolean>>;
  /** Transcript length — renders the count chip when > 0. */
  messageCount: number;
  /** Thinking config for the active model; `null` hides the control. */
  currentReasoning: ModelReasoning | null;
  /** Resolved effort for the active model (host-computed). */
  effectiveReasoningEffort: string | null;
  /** Host state setter — the per-model persistence write stays here. */
  setReasoningEffort: (value: string) => void;
  reasoningMenuOpen: boolean;
  setReasoningMenuOpen: Dispatch<SetStateAction<boolean>>;
  agentList: ChatDropdownEntry[];
  selectedAgentId: AgentId;
  selectedModelId: string | null;
  /**
   * Picker row click. The host mutates agent/model selection AND the
   * per-session agent pick (setSessionAgent) — that logic is pinned to
   * KodyChat by kody-chat-per-session-agent.spec.ts.
   */
  onSelectEntry: (entry: ChatDropdownEntry) => void;
  /** Remote dev status — indicator renders only when configured. */
  remoteStatus?: { configured: boolean; online: boolean } | null;
  /**
   * New-conversation click. The host seeds the new session with the
   * current effective agent and clears tool calls (also spec-pinned).
   */
  onNewConversation: () => void;
  /** Disables the new-conversation button while a turn is streaming. */
  activeLoading: boolean;
  showSessionSidebar: boolean;
  onToggleSessionSidebar: () => void;
  /** Fullscreen / restore (desktop rail only). */
  onToggleFullscreen?: () => void;
  railFullscreen?: boolean;
  /** Collapse to a strip (desktop rail only). */
  onCollapseRail?: () => void;
  /** Close (mobile sheet) — button renders only when provided. */
  onClose?: () => void;
  /** Context bar: task scope. */
  isTaskMode: boolean;
  selectedTask: KodyTask | null;
  /** Context bar: capability scope. */
  isCapabilityMode: boolean;
  selectedCapability: { slug: string; title?: string } | null;
  /** Context bar: goal-planner scope. */
  isPlannerMode: boolean;
  plannerGoal: { name: string } | null;
  onPlannerExit?: () => void;
  /** Active session title for the global-context row. */
  activeSessionTitle?: string;
}

/**
 * Renders the chat header: top row (agent picker + reasoning control on the
 * left, remote status in the middle, icon-only action buttons on the right)
 * and the context bar underneath. Presentation-only — every state mutation
 * beyond menu open/close flows through host callbacks.
 */
export function HeaderControls({
  currentEntry,
  currentAgent,
  lockedAgentId,
  hideAgentPicker,
  compact,
  agentMenuOpen,
  setAgentMenuOpen,
  messageCount,
  currentReasoning,
  effectiveReasoningEffort,
  setReasoningEffort,
  reasoningMenuOpen,
  setReasoningMenuOpen,
  agentList,
  selectedAgentId,
  selectedModelId,
  onSelectEntry,
  remoteStatus,
  onNewConversation,
  activeLoading,
  showSessionSidebar,
  onToggleSessionSidebar,
  onToggleFullscreen,
  railFullscreen,
  onCollapseRail,
  onClose,
  isTaskMode,
  selectedTask,
  isCapabilityMode,
  selectedCapability,
  isPlannerMode,
  plannerGoal,
  onPlannerExit,
  activeSessionTitle,
}: HeaderControlsProps) {
  const headerClassName = compact
    ? "border-b bg-gradient-to-r from-muted/80 to-muted/40 px-3 py-1.5 sm:px-4"
    : "border-b bg-gradient-to-r from-muted/80 to-muted/40 px-3 py-2.5 sm:px-5 sm:py-4";
  const mainIconButtonClassName = compact
    ? "p-1.5 rounded-md border transition-all"
    : "p-2 rounded-md border transition-all";
  const quietIconButtonClassName = compact
    ? "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-all"
    : "p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-all";
  const showContextBar =
    !compact ||
    (isTaskMode && selectedTask) ||
    (isCapabilityMode && selectedCapability) ||
    (isPlannerMode && plannerGoal);
  const messageCountBadge =
    messageCount > 0 ? (
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-body-xs text-primary">
        {messageCount}
      </span>
    ) : null;
  const conversationActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {!lockedAgentId && !hideAgentPicker && (
        <button
          type="button"
          onClick={onNewConversation}
          disabled={activeLoading}
          className={`${quietIconButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
          title="Start a new conversation"
          aria-label="New conversation"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onToggleSessionSidebar}
        className={`${mainIconButtonClassName} ${
          showSessionSidebar
            ? "bg-primary text-primary-foreground border-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-background border-transparent hover:border-border"
        }`}
        title="Conversations"
        aria-label="Toggle conversations"
      >
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
      </button>
      {remoteStatus?.configured && (
        <span
          className={`h-2 w-2 rounded-full ${remoteStatus.online ? "bg-green-500" : "bg-red-400"}`}
          title={
            remoteStatus.online ? "Remote dev: online" : "Remote dev: offline"
          }
          aria-label={
            remoteStatus.online ? "Remote dev online" : "Remote dev offline"
          }
        />
      )}
      <ChatPluginSlot slot="header-actions" />
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={
            railFullscreen ? "Restore chat width" : "Expand chat fullscreen"
          }
          title={railFullscreen ? "Restore" : "Fullscreen"}
          className={quietIconButtonClassName}
        >
          {railFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
      )}
      {onCollapseRail && (
        <button
          type="button"
          onClick={onCollapseRail}
          aria-label="Collapse chat"
          title="Collapse"
          className={quietIconButtonClassName}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          title="Close"
          className={quietIconButtonClassName}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const selectionControls = !hideAgentPicker ? (
    <div className="flex shrink-0 items-center gap-1">
      {!lockedAgentId ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setAgentMenuOpen((value) => !value);
              setReasoningMenuOpen(false);
            }}
            className="flex max-w-[150px] items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            aria-haspopup="listbox"
            aria-expanded={agentMenuOpen}
            aria-label="Model"
            title={`Model: ${currentEntry?.name ?? currentAgent.name}`}
          >
            <span className="truncate">
              {currentEntry?.name ?? currentAgent.name}
            </span>
          </button>
          {agentMenuOpen && (
            <div className="absolute start-0 top-full z-30 mt-1 min-w-[220px] rounded-md border bg-popover p-1 shadow-md">
              <ul role="listbox">
                {agentList.map((entry) => {
                  const Icon = entry.icon;
                  const selected =
                    entry.agentId === selectedAgentId &&
                    (entry.modelId ?? null) === selectedModelId;
                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectEntry(entry);
                          setAgentMenuOpen(false);
                        }}
                        className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-accent ${selected ? "bg-accent/50" : ""}`}
                        role="option"
                        aria-selected={selected}
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {entry.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1 border-t border-border/60 pt-1">
                <RepoScopedLink
                  href="/models"
                  onClick={() => setAgentMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-zinc-800/70"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add chat model
                </RepoScopedLink>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (!currentReasoning?.efforts.length) return;
            setReasoningMenuOpen((value) => !value);
            setAgentMenuOpen(false);
          }}
          disabled={!currentReasoning?.efforts.length}
          className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          aria-haspopup="listbox"
          aria-expanded={reasoningMenuOpen}
          aria-label="Effort"
          title="Reasoning effort"
        >
          <Brain className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {currentReasoning?.efforts.find(
              (effort) => effort.value === effectiveReasoningEffort,
            )?.label ?? "Default"}
          </span>
        </button>
        {reasoningMenuOpen && currentReasoning && (
          <ul
            role="listbox"
            className="absolute start-0 top-full z-30 mt-1 min-w-[120px] rounded-md border bg-popover p-1 shadow-md"
          >
            {currentReasoning.efforts.map((effort) => (
              <li key={effort.value}>
                <button
                  type="button"
                  onClick={() => {
                    setReasoningEffort(effort.value);
                    if (selectedModelId) {
                      writeReasoningEffort(selectedModelId, effort.value);
                    }
                    setReasoningMenuOpen(false);
                  }}
                  className={`w-full rounded px-2 py-1.5 text-start text-sm hover:bg-accent ${effectiveReasoningEffort === effort.value ? "bg-accent/50 font-medium" : ""}`}
                  role="option"
                  aria-selected={effectiveReasoningEffort === effort.value}
                >
                  {effort.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className={headerClassName} data-testid="chat-header-controls">
        <div className="hidden">
          {/* Left: agent picker (locked label when parent forces an agent) */}
          <div className="relative flex items-center gap-2">
            {!hideAgentPicker &&
              (() => {
                // Header label/icon prefers the matched dropdown entry — that
                // way a user-managed model surfaces its own label (e.g.
                // "Claude Sonnet 4.6") rather than the generic "Kody" agent
                // name. Falls back to the static agent for locked views or
                // when the selection points at a model that was just removed.
                const headerIcon = currentEntry?.icon ?? currentAgent.icon;
                const headerName = currentEntry?.name ?? currentAgent.name;
                return lockedAgentId ? (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2"
                    title={`${headerName} (fixed for this view)`}
                    aria-label={`${headerName} (fixed)`}
                  >
                    {(() => {
                      const Icon = headerIcon;
                      return (
                        <Icon className="w-5 h-5" aria-label={headerName} />
                      );
                    })()}
                    <span className="font-semibold text-base">
                      {headerName}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAgentMenuOpen((v) => !v)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-haspopup="listbox"
                    aria-expanded={agentMenuOpen}
                    title={`Switch assistant (current: ${headerName})`}
                  >
                    {(() => {
                      const Icon = headerIcon;
                      return (
                        <Icon className="w-5 h-5" aria-label={headerName} />
                      );
                    })()}
                    <span className="font-semibold text-base">
                      {headerName}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                );
              })()}
            {/* Thinking-level control. Rendered only when the active model
            declares a `reasoning` block (or one is auto-detected from
            the model name). Three cases:
              • 1 effort  → static pill (e.g. o1 / R1 → "On")
              • 2+ efforts → dropdown, current value highlighted
              • no reasoning → nothing rendered (most models) */}
            {currentReasoning && !hideAgentPicker && (
              <div className="relative">
                {currentReasoning.efforts.length === 1 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/60 px-3 py-1.5 text-body-xs font-medium text-muted-foreground"
                    title={`This model always reasons at ${currentReasoning.efforts[0].label.toLowerCase()}.`}
                    aria-label={`Thinking: ${currentReasoning.efforts[0].label}`}
                  >
                    <Brain className="w-3.5 h-3.5" aria-hidden="true" />
                    {currentReasoning.efforts[0].label}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReasoningMenuOpen((v) => !v);
                        setAgentMenuOpen(false);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/60 px-3 py-1.5 text-body-xs font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-haspopup="listbox"
                      aria-expanded={reasoningMenuOpen}
                      title={`Thinking level (current: ${currentReasoning.efforts.find((e) => e.value === effectiveReasoningEffort)?.label ?? "default"})`}
                    >
                      <Brain className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {currentReasoning.efforts.find(
                          (e) => e.value === effectiveReasoningEffort,
                        )?.label ?? "—"}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {reasoningMenuOpen && (
                      <ul
                        role="listbox"
                        className="absolute top-full start-0 mt-1 z-30 min-w-[140px] rounded-md border bg-popover shadow-md"
                      >
                        {currentReasoning.efforts.map((effort) => (
                          <li key={effort.value}>
                            <button
                              type="button"
                              onClick={() => {
                                setReasoningEffort(effort.value);
                                if (selectedModelId) {
                                  writeReasoningEffort(
                                    selectedModelId,
                                    effort.value,
                                  );
                                }
                                setReasoningMenuOpen(false);
                              }}
                              className={`w-full text-start px-3 py-2 text-sm hover:bg-accent ${
                                effectiveReasoningEffort === effort.value
                                  ? "bg-accent/50 font-medium"
                                  : ""
                              }`}
                              role="option"
                              aria-selected={
                                effectiveReasoningEffort === effort.value
                              }
                            >
                              {effort.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            {!lockedAgentId && !hideAgentPicker && agentMenuOpen && (
              <ul
                role="listbox"
                className="absolute top-full start-0 mt-1 z-30 min-w-[260px] rounded-md border bg-popover shadow-md"
              >
                {agentList.map((a) => {
                  const isSelected =
                    a.agentId === selectedAgentId &&
                    (a.modelId ?? null) === selectedModelId;
                  return (
                    <li key={a.key}>
                      <button
                        type="button"
                        onClick={() => onSelectEntry(a)}
                        className={`w-full text-start px-3 py-2 hover:bg-accent text-sm flex items-start gap-2 ${
                          isSelected ? "bg-accent/50" : ""
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        {(() => {
                          const Icon = a.icon;
                          return (
                            <Icon
                              className="w-4 h-4 mt-0.5"
                              aria-hidden="true"
                            />
                          );
                        })()}
                        <span className="flex flex-col flex-1 min-w-0">
                          <span className="font-medium">{a.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {a.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Remote dev status indicator — only visible when configured */}
          {remoteStatus?.configured && (
            <div
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={
                remoteStatus.online
                  ? "Remote dev: online"
                  : "Remote dev: offline"
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${remoteStatus.online ? "bg-green-500" : "bg-red-400"}`}
                aria-label={
                  remoteStatus.online
                    ? "Remote dev online"
                    : "Remote dev offline"
                }
              />
              <span className="hidden sm:inline">
                {remoteStatus.online ? "Remote" : "Offline"}
              </span>
            </div>
          )}

          {/* Right: Window and host actions. Conversation actions sit with the title below. */}
          <div className="flex items-center gap-1">
            {/* Plugin header-actions slot (Step 4) — empty until a plugin
            contributes; renders nothing (no wrapper) with zero plugins. */}
            <ChatPluginSlot slot="header-actions" />
            {/* Fullscreen / restore (desktop rail only) */}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-label={
                  railFullscreen
                    ? "Restore chat width"
                    : "Expand chat fullscreen"
                }
                title={railFullscreen ? "Restore" : "Fullscreen"}
                className={`ms-1 ${quietIconButtonClassName}`}
              >
                {railFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Collapse to a strip (desktop rail only) */}
            {onCollapseRail && (
              <button
                type="button"
                onClick={onCollapseRail}
                aria-label="Collapse chat"
                title="Collapse"
                className={quietIconButtonClassName}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}

            {/* Close (mobile sheet) — only when an onClose handler is provided */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chat"
                title="Close"
                className={`ms-1 ${quietIconButtonClassName}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-7 w-full items-center">
          {selectionControls}
          {conversationActions}
        </div>
      </div>

      {/* Title line: task, capability, planner, or global */}
      {showContextBar ? (
        <div
          data-testid="chat-context-bar"
          className="border-b bg-background/80 px-3 py-0.5 sm:px-5"
        >
          {isTaskMode && selectedTask ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded font-medium">
                #{selectedTask.issueNumber}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {selectedTask.title}
              </span>
              {messageCountBadge}
            </div>
          ) : isCapabilityMode && selectedCapability ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded font-medium inline-flex items-center gap-1">
                <Target className="w-3 h-3" />
                {selectedCapability.slug}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {selectedCapability.title}
              </span>
              {messageCountBadge}
            </div>
          ) : isPlannerMode && plannerGoal ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="px-1.5 py-0.5 bg-sky-500/15 text-sky-400 rounded font-medium inline-flex items-center gap-1">
                Planning
              </span>
              <span className="truncate text-muted-foreground flex-1 min-w-0">
                {plannerGoal.name}
              </span>
              {messageCountBadge}
              {onPlannerExit ? (
                <button
                  type="button"
                  onClick={onPlannerExit}
                  className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent"
                  aria-label="Stop planning this goal"
                  title="Stop planning"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          ) : (
            (() => {
              const sessionTitle = activeSessionTitle;
              const hasRealTitle =
                !!sessionTitle && sessionTitle !== "New conversation";
              return (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Globe className="w-3 h-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {hasRealTitle
                      ? sessionTitle
                      : "Global chat — not tied to any task"}
                  </span>
                  {messageCountBadge}
                </div>
              );
            })()
          )}
        </div>
      ) : null}
    </>
  );
}

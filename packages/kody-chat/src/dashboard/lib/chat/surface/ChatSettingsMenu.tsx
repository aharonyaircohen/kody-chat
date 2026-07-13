"use client";

import { Brain, Settings2 } from "lucide-react";
import type { AgentConfig, AgentId } from "@dashboard/lib/agents";
import type { ChatDropdownEntry } from "../platform/agent-entries";
import type { ModelReasoning } from "../core/reasoning-adapter";
import { writeReasoningEffort } from "../core/reasoning-pref";

interface ChatSettingsMenuProps {
  currentEntry: ChatDropdownEntry | null;
  currentAgent: AgentConfig;
  lockedAgentId?: AgentId;
  hideAgentPicker?: boolean;
  agentList: ChatDropdownEntry[];
  selectedAgentId: AgentId;
  selectedModelId: string | null;
  currentReasoning: ModelReasoning | null;
  effectiveReasoningEffort: string | null;
  setReasoningEffort: (value: string) => void;
  onSelectEntry: (entry: ChatDropdownEntry) => void;
  placement?: "above" | "below";
}

export function ChatSettingsMenu({
  currentEntry,
  currentAgent,
  lockedAgentId,
  hideAgentPicker,
  agentList,
  selectedAgentId,
  selectedModelId,
  currentReasoning,
  effectiveReasoningEffort,
  setReasoningEffort,
  onSelectEntry,
  placement = "above",
}: ChatSettingsMenuProps) {
  if (hideAgentPicker) return null;

  const currentName = currentEntry?.name ?? currentAgent.name;
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden"
        title={`Chat settings (current: ${currentName})`}
        aria-label="Chat settings"
      >
        <Settings2 className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div
        className={`absolute right-0 z-30 w-72 max-w-[calc(100vw-2rem)] overflow-x-hidden rounded-md border bg-popover p-2 shadow-md ${
          placement === "above" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {!lockedAgentId && (
          <div className="grid gap-1">
            <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
              Assistant
            </p>
            {agentList.map((entry) => {
              const Icon = entry.icon;
              const selected =
                entry.agentId === selectedAgentId &&
                (entry.modelId ?? null) === selectedModelId;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => onSelectEntry(entry)}
                  className={`flex w-full min-w-0 items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    selected ? "bg-accent/50 font-medium" : ""
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {currentReasoning && (
          <div className="mt-2 grid gap-1 border-t pt-2">
            <p className="flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
              <Brain className="h-3.5 w-3.5" aria-hidden="true" /> Thinking
            </p>
            <div className="flex flex-wrap gap-1 px-2">
              {currentReasoning.efforts.map((effort) => (
                <button
                  key={effort.value}
                  type="button"
                  onClick={() => {
                    setReasoningEffort(effort.value);
                    if (selectedModelId) {
                      writeReasoningEffort(selectedModelId, effort.value);
                    }
                  }}
                  className={`rounded border px-2 py-1 text-xs hover:bg-accent ${
                    effectiveReasoningEffort === effort.value
                      ? "bg-accent font-medium"
                      : ""
                  }`}
                >
                  {effort.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Unit tests for the model picker contract.
 *
 * Only configured custom models are shown. Internal Brain/Live runners and
 * unfinished built-in provider connections must not appear in the picker.
 */
import { describe, expect, it } from "vitest";
import {
  buildAgentList,
  type ChatModelEntry,
} from "@dashboard/lib/chat/platform/agent-entries";
import { AGENTS } from "@dashboard/lib/agents";
import {
  FALLBACK_REASONING,
  resolveReasoning,
} from "@dashboard/lib/chat/core/reasoning-adapter";

const model = (
  over: Partial<ChatModelEntry> & { id: string },
): ChatModelEntry => ({
  label: over.id,
  ...over,
});

describe("buildAgentList", () => {
  it("shows no built-in choice when no custom model is configured", () => {
    expect(buildAgentList(false, false, false, [])).toEqual([]);
    expect(buildAgentList(true, true, true, [])).toEqual([]);
  });

  it("maps enabled custom models and drops disabled ones", () => {
    const list = buildAgentList(false, false, false, [
      model({ id: "gpt-x", label: "GPT X" }),
      model({ id: "off", enabled: false }),
      model({ id: "claude-y", label: "Claude Y", enabled: true }),
    ]);
    const byKey = new Map(list.map((entry) => [entry.key, entry]));
    const gptX = byKey.get("kody:gpt-x");
    expect(gptX).toMatchObject({
      key: "kody:gpt-x",
      agentId: "kody",
      modelId: "gpt-x",
      name: "GPT X",
      description: "gpt-x",
      icon: AGENTS.kody.icon,
    });
    expect(gptX?.reasoning).toEqual(FALLBACK_REASONING);
    expect(gptX?.reasoning).toEqual(
      resolveReasoning({ id: "gpt-x", label: "GPT X" }),
    );
    expect(byKey.has("kody:off")).toBe(false);
  });

  it("keeps custom models in input order", () => {
    const list = buildAgentList(true, true, true, [
      model({ id: "a" }),
      model({ id: "b" }),
    ]);
    expect(list.map((entry) => entry.key)).toEqual(["kody:a", "kody:b"]);
  });

  it("does not add a built-in Claude row even when a custom model uses Claude", () => {
    const keys = buildAgentList(true, true, true, [
      model({ id: "claude-y", label: "Claude Y" }),
    ]).map((entry) => entry.key);
    expect(keys).toEqual(["kody:claude-y"]);
  });
});

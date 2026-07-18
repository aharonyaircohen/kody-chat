/**
 * Unit coverage for the pure agent-selection decisions extracted in
 * phase 1.6c: the default-entry resolution chain and the family snap
 * for dropdown rows that disappeared from the list.
 *
 * @testFramework vitest
 * @domain unit
 */
import { describe, expect, it } from "vitest";
import {
  buildAgentList,
  type ChatModelEntry,
} from "@dashboard/lib/chat/platform/agent-entries";
import {
  familySnapEntry,
  resolveDefaultAgentEntry,
} from "@dashboard/lib/components/kody-chat-selection";

const MODELS: ChatModelEntry[] = [
  { id: "claude-sonnet", label: "Claude Sonnet" },
  { id: "gpt-5", label: "GPT-5", default: true },
];

function list(opts?: {
  brain?: boolean;
  fly?: boolean;
  brainFly?: boolean;
  models?: ChatModelEntry[];
}) {
  return buildAgentList(
    opts?.brain ?? false,
    opts?.fly ?? false,
    opts?.brainFly ?? false,
    opts?.models ?? [],
  );
}

describe("resolveDefaultAgentEntry", () => {
  it("prefers the Settings → 'Default chat' pick when present in the list", () => {
    const agentList = list({ models: MODELS, brain: true });
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: "kody:claude-sonnet",
      chatModels: MODELS,
      brainConfigured: true,
      agentList,
    });
    expect(entry?.key).toBe("kody:claude-sonnet");
  });

  it("falls back to the legacy default-flagged model when no saved pick", () => {
    const agentList = list({ models: MODELS });
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: null,
      chatModels: MODELS,
      brainConfigured: false,
      agentList,
    });
    expect(entry?.key).toBe("kody:gpt-5");
  });

  it("skips a disabled default-flagged model and uses the first Kody model", () => {
    const models: ChatModelEntry[] = [
      { id: "claude-sonnet", label: "Claude Sonnet" },
      { id: "gpt-5", label: "GPT-5", default: true, enabled: false },
    ];
    const agentList = list({ models });
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: null,
      chatModels: models,
      brainConfigured: false,
      agentList,
    });
    expect(entry?.agentId).toBe("kody");
    expect(entry?.key).toBe("kody:claude-sonnet");
  });

  it("returns no visible entry when no custom model exists", () => {
    const agentList = list({ brain: true });
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: null,
      chatModels: [],
      brainConfigured: true,
      agentList,
    });
    expect(entry).toBeNull();
  });

  it("returns no visible entry when nothing is configured", () => {
    const agentList = list();
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: null,
      chatModels: [],
      brainConfigured: false,
      agentList,
    });
    expect(entry).toBeNull();
  });

  it("does not expose an internal Fly runner as a model", () => {
    const agentList = list({ fly: true });
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: null,
      chatModels: [],
      brainConfigured: false,
      agentList,
    });
    expect(entry).toBeNull();
  });

  it("ignores a saved pick that no longer resolves to a row", () => {
    const agentList = list();
    const entry = resolveDefaultAgentEntry({
      defaultChatEntryKey: "kody:removed-model",
      chatModels: [],
      brainConfigured: false,
      agentList,
    });
    expect(entry).toBeNull();
  });
});

describe("familySnapEntry", () => {
  it("drops old Live keys when there is no visible custom model", () => {
    expect(familySnapEntry("kody-live", list({ fly: true }))).toBeNull();
    expect(familySnapEntry("kody-live-fly", list())).toBeNull();
  });

  it("migrates old Brain keys to the first custom model", () => {
    const models = list({ models: MODELS });
    expect(familySnapEntry("brain-fly", models)?.key).toBe(
      "kody:claude-sonnet",
    );
    expect(familySnapEntry("brain", list())).toBeNull();
  });

  it("snaps a removed gateway model to another custom row or null", () => {
    const withModel = list({
      models: [{ id: "claude-sonnet", label: "Claude Sonnet" }],
    });
    expect(familySnapEntry("kody:removed", withModel)?.key).toBe(
      "kody:claude-sonnet",
    );
    expect(familySnapEntry("kody:removed", list())).toBeNull();
  });

  it("returns null for keys outside the known families", () => {
    expect(familySnapEntry("something-else", list())).toBeNull();
  });
});

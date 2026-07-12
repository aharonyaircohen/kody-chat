/**
 * Unit tests for the trigger config loader/saver
 * (@kody-ade/base/triggers/config): validation, unknown-event drop,
 * caching, and CAS save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
}));
vi.mock("@kody-ade/base/logger", () => ({ logger: h.logger }));

import {
  getTriggers,
  saveTriggers,
  _resetTriggersConfigCache,
} from "@kody-ade/base/triggers/config";
import type { TriggerConfig } from "@kody-ade/base/triggers/types";

const octokit = {} as Octokit;

const VALID: TriggerConfig = {
  id: "save-form",
  name: "Save form",
  enabled: true,
  event: "ui.form.submitted",
  conditions: [],
  action: {
    type: "save-user-state",
    namespace: "selections",
    map: { view: "payload.viewId" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetTriggersConfigCache();
});

describe("getTriggers", () => {
  it("returns [] when no config file exists", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await getTriggers(octokit, "acme", "shop")).toEqual([]);
  });

  it("loads valid triggers and drops unknown-event entries", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        triggers: [VALID, { ...VALID, id: "bad-event", event: "not.real" }],
      }),
      sha: "s1",
      path: "p",
    });
    const triggers = await getTriggers(octokit, "acme", "shop");
    expect(triggers.map((t) => t.id)).toEqual(["save-form"]);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "bad-event" }),
      expect.stringContaining("unknown event"),
    );
  });

  it("returns [] and warns on an invalid file", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify({ triggers: [{ id: "NOT VALID" }] }),
      sha: "s1",
      path: "p",
    });
    expect(await getTriggers(octokit, "acme", "shop")).toEqual([]);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it("caches per owner/repo", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    await getTriggers(octokit, "acme", "shop");
    await getTriggers(octokit, "acme", "shop");
    expect(h.readStateText).toHaveBeenCalledTimes(1);
  });
});

describe("saveTriggers", () => {
  it("writes with the existing sha and invalidates the cache", async () => {
    h.readStateText.mockResolvedValue({ content: "{}", sha: "old", path: "p" });
    h.writeStateText.mockResolvedValue({ sha: "new", path: "p", htmlUrl: null });

    await saveTriggers(octokit, "acme", "shop", [VALID]);

    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "old", path: "triggers/config.json" }),
    );
    h.readStateText.mockClear();
    h.readStateText.mockRejectedValue({ status: 404 });
    await getTriggers(octokit, "acme", "shop");
    expect(h.readStateText).toHaveBeenCalledTimes(1);
  });
});

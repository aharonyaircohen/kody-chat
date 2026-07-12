/**
 * Unit tests for the trigger→user-state writer
 * (src/dashboard/lib/user-state/trigger-writer.ts): merge vs append modes
 * and the append history cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  getUserState: vi.fn(),
  setUserState: vi.fn(),
}));

vi.mock("@dashboard/lib/user-state/service", () => ({
  getUserState: h.getUserState,
  setUserState: h.setUserState,
}));

import { ensureTriggerStateWriter } from "@dashboard/lib/user-state/trigger-writer";
import { getTriggerStateWriter } from "@kody-ade/base/triggers";
import type { TriggerStateWrite } from "@kody-ade/base/triggers";

function write(overrides: Partial<TriggerStateWrite> = {}): TriggerStateWrite {
  return {
    octokit: {} as Octokit,
    owner: "acme",
    repo: "shop",
    userId: "client:jane@example.com",
    sessionId: null,
    namespace: "selections",
    data: { path: "/a" },
    mode: "merge",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserState.mockResolvedValue(null);
  h.setUserState.mockResolvedValue({});
  ensureTriggerStateWriter();
});

describe("trigger state writer", () => {
  it("merge mode writes the data as-is", async () => {
    await getTriggerStateWriter()!(write());
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "client:jane@example.com" }),
      "selections",
      { path: "/a" },
      { source: "system" },
    );
    expect(h.getUserState).not.toHaveBeenCalled();
  });

  it("append mode grows a list per key", async () => {
    h.getUserState.mockResolvedValue({
      data: { path: ["/x"] },
    });
    await getTriggerStateWriter()!(write({ mode: "append", data: { path: "/y" } }));
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "selections",
      { path: ["/x", "/y"] },
      { source: "system" },
    );
  });

  it("append mode wraps an existing scalar into a list", async () => {
    h.getUserState.mockResolvedValue({ data: { path: "/x" } });
    await getTriggerStateWriter()!(write({ mode: "append", data: { path: "/y" } }));
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "selections",
      { path: ["/x", "/y"] },
      { source: "system" },
    );
  });

  it("append mode caps history at 100 entries", async () => {
    h.getUserState.mockResolvedValue({
      data: { path: Array.from({ length: 100 }, (_, i) => `/p${i}`) },
    });
    await getTriggerStateWriter()!(write({ mode: "append", data: { path: "/new" } }));
    const saved = h.setUserState.mock.calls[0][2] as { path: string[] };
    expect(saved.path).toHaveLength(100);
    expect(saved.path.at(-1)).toBe("/new");
    expect(saved.path[0]).toBe("/p1");
  });
});

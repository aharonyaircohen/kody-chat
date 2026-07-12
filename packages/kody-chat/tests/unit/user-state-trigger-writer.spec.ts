/**
 * Unit tests for the trigger→user-state writer
 * (src/dashboard/lib/user-state/trigger-writer.ts): merge vs append modes,
 * record shape, and the history cap.
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
    namespace: "history",
    data: { path: "/a" },
    mode: "append",
    triggerId: "save-page-visits",
    eventName: "page.viewed",
    occurredAt: "2026-07-12T10:00:00.000Z",
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
    await getTriggerStateWriter()!(
      write({ mode: "merge", namespace: "selections" }),
    );
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "client:jane@example.com" }),
      "selections",
      { path: "/a" },
      { source: "system" },
    );
    expect(h.getUserState).not.toHaveBeenCalled();
  });

  it("append mode stores one full record per event, keyed by trigger id", async () => {
    await getTriggerStateWriter()!(write());
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "history",
      {
        "save-page-visits": [
          { path: "/a", event: "page.viewed", at: "2026-07-12T10:00:00.000Z" },
        ],
      },
      { source: "system" },
    );
  });

  it("append mode grows the trigger's record list", async () => {
    h.getUserState.mockResolvedValue({
      data: {
        "save-page-visits": [{ path: "/x", event: "page.viewed", at: "t0" }],
      },
    });
    await getTriggerStateWriter()!(write({ data: { path: "/y" } }));
    const saved = h.setUserState.mock.calls[0][2] as {
      "save-page-visits": unknown[];
    };
    expect(saved["save-page-visits"]).toHaveLength(2);
    expect(saved["save-page-visits"][1]).toMatchObject({ path: "/y" });
  });

  it("append mode caps history at 200 records", async () => {
    h.getUserState.mockResolvedValue({
      data: {
        "save-page-visits": Array.from({ length: 200 }, (_, i) => ({
          path: `/p${i}`,
        })),
      },
    });
    await getTriggerStateWriter()!(write({ data: { path: "/new" } }));
    const saved = h.setUserState.mock.calls[0][2] as {
      "save-page-visits": Array<{ path: string }>;
    };
    expect(saved["save-page-visits"]).toHaveLength(200);
    expect(saved["save-page-visits"].at(-1)?.path).toBe("/new");
    expect(saved["save-page-visits"][0].path).toBe("/p1");
  });
});

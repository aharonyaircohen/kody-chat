import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  applyStoredAgencyModelChange: vi.fn(async () => ({
    created: 1,
    reused: 0,
    states: 1,
  })),
}));

vi.mock("../src/backend/agency-model-store", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/backend/agency-model-store")
  >()),
  applyStoredAgencyModelChange: store.applyStoredAgencyModelChange,
}));
vi.mock("../src/routes/repo-write-access", () => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: { owner: "acme", repo: "widgets", token: "token" },
    actorLogin: "octocat",
  })),
}));

import { POST } from "../src/routes/agency-model-changes";

beforeEach(() => vi.clearAllMocks());

describe("Agency model change route", () => {
  it("normalizes and applies a Definition with its state atomically", async () => {
    const updatedAt = "2026-07-23T00:00:00.000Z";
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/agency-model-changes", {
        method: "POST",
        body: JSON.stringify({
          definitions: [
            {
              kind: "intent",
              definition: {
                id: "quality",
                direction: "Keep quality high",
                priorities: [],
                policy: {
                  authority: { allow: ["*"], deny: [] },
                  approval: "none",
                  riskyActions: [],
                  budget: {
                    maxRuns: 10,
                    maxTokens: 1000,
                    maxCostUsd: 1,
                    maxDurationSeconds: 60,
                  },
                  maxConcurrentRuns: 1,
                },
                constraints: [],
              },
            },
          ],
          states: [
            {
              kind: "intent",
              state: {
                definitionId: "quality",
                lifecycle: "active",
                updatedAt,
              },
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(store.applyStoredAgencyModelChange).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "widgets",
        change: {
          definitions: [
            expect.objectContaining({
              kind: "intent",
              data: expect.objectContaining({
                id: "quality",
                posture: "balanced",
              }),
            }),
          ],
          states: [
            expect.objectContaining({
              kind: "intent",
              data: {
                definitionId: "quality",
                lifecycle: "active",
                updatedAt,
              },
            }),
          ],
        },
      }),
    );
  });
});

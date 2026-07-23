import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createIntentDefinition } from "@kody-ade/agency-domain";

const store = vi.hoisted(() => ({
  definitions: [] as Array<Record<string, unknown>>,
  listStoredAgencyDefinitions: vi.fn(async () => store.definitions),
  createStoredAgencyDefinition: vi.fn(async () => undefined),
}));
vi.mock("../src/backend/agency-model-store", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/backend/agency-model-store")
  >()),
  listStoredAgencyDefinitions: store.listStoredAgencyDefinitions,
  createStoredAgencyDefinition: store.createStoredAgencyDefinition,
}));

vi.mock("../src/routes/repo-write-access", () => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: { owner: "acme", repo: "widgets", token: "token" },
    actorLogin: "octocat",
  })),
}));

import { GET, POST } from "../src/routes/agency-definitions";

const policy = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  store.definitions = [];
});

describe("agency definitions route", () => {
  it("creates a content-addressed immutable definition", async () => {
    const definition = {
      id: "product-quality",
      direction: "Keep product quality high",
      priorities: ["reliability"],
      policy,
      constraints: [],
    };
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/agency-definitions", {
        method: "POST",
        body: JSON.stringify({ kind: "intent", definition }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.recordId).toMatch(/^intent:product-quality:[a-f0-9]{64}$/);
    expect(store.createStoredAgencyDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "intent",
        data: createIntentDefinition(definition),
      }),
    );
  });

  it("rejects legacy ownership fields in a pure Intent", async () => {
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/agency-definitions", {
        method: "POST",
        body: JSON.stringify({
          kind: "intent",
          definition: {
            id: "product-quality",
            direction: "Keep product quality high",
            priorities: [],
            policy,
            constraints: [],
            portfolio: { goals: ["ship"] },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(store.createStoredAgencyDefinition).not.toHaveBeenCalled();
  });

  it("returns only the latest immutable revision per domain id", async () => {
    store.definitions = [
      {
        recordId: "operation:delivery:old",
        kind: "operation",
        schemaVersion: 1,
        data: { id: "delivery", name: "Old" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        recordId: "operation:delivery:new",
        kind: "operation",
        schemaVersion: 1,
        data: { id: "delivery", name: "New" },
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ];
    const response = await GET(
      new NextRequest(
        "https://dash.test/api/kody/agency-definitions?kind=operation",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.definitions).toHaveLength(1);
    expect(body.definitions[0].data.name).toBe("New");
  });
});

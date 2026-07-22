import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  verify: vi.fn(),
}));
const backend = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("@dashboard/lib/backend/github-actions-identity", () => ({
  bearerToken: (request: Request) =>
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
  verifyGitHubWorkflowIdentity: identity.verify,
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

import { POST } from "../../app/api/kody/engine/backend/route";

function request(body: unknown) {
  return new Request("http://localhost/api/kody/engine/backend", {
    method: "POST",
    headers: {
      authorization: "Bearer signed-github-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  identity.verify.mockResolvedValue({
    repository: "trusted/repo",
    workflowRef: "trusted/repo/.github/workflows/kody.yml@refs/heads/main",
    actor: "alice",
    runId: "42",
  });
});

describe("POST /api/kody/engine/backend", () => {
  it("forces every backend call to the repository signed by GitHub", async () => {
    backend.query.mockResolvedValue({ ok: true });

    const response = await POST(
      request({
        kind: "query",
        operation: "repoDocs.get",
        args: { tenantId: "attacker/repo", serviceKey: "stolen", kind: "variables" },
      }),
    );

    expect(response.status).toBe(200);
    expect(backend.query).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: "trusted/repo", kind: "variables" },
    );
  });

  it("rejects operations outside the explicit allowlist", async () => {
    const response = await POST(
      request({ kind: "mutation", operation: "users.delete", args: {} }),
    );

    expect(response.status).toBe(400);
    expect(backend.mutation).not.toHaveBeenCalled();
  });

  it("allows the Engine to read repository-scoped Agency Definitions", async () => {
    backend.query.mockResolvedValue([]);

    const response = await POST(
      request({
        kind: "query",
        operation: "agencyModel.listDefinitions",
        args: { tenantId: "attacker/repo" },
      }),
    );

    expect(response.status).toBe(200);
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "trusted/repo",
    });
  });
});

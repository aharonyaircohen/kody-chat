import { beforeEach, describe, expect, it, vi } from "vitest";

const requireKodyUser = vi.fn();
const getRequestAuth = vi.fn();

vi.mock("@dashboard/lib/auth/kody-user", () => ({ requireKodyUser }));
vi.mock("@kody-ade/base/auth", () => ({ getRequestAuth }));

describe("resolveKodyRequestScope", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a personal scope for a signed-in user without GitHub", async () => {
    requireKodyUser.mockResolvedValue({ id: "user-1", label: "User" });
    getRequestAuth.mockReturnValue(null);
    const { resolveKodyRequestScope } = await import(
      "@dashboard/lib/auth/kody-request-scope"
    );

    const result = await resolveKodyRequestScope({} as never);

    expect(result).toMatchObject({
      user: { id: "user-1" },
      scope: { kind: "personal", userId: "user-1" },
      tenantId: "user:user-1",
      repository: null,
    });
  });

  it("adds repository context without replacing the personal identity", async () => {
    requireKodyUser.mockResolvedValue({ id: "user-1", label: "User" });
    getRequestAuth.mockReturnValue({ owner: "acme", repo: "app", token: "x" });
    const { resolveKodyRequestScope } = await import(
      "@dashboard/lib/auth/kody-request-scope"
    );

    const result = await resolveKodyRequestScope({} as never);

    expect(result).toMatchObject({
      user: { id: "user-1" },
      scope: { kind: "repository", userId: "user-1", owner: "acme", repo: "app" },
      tenantId: "acme/app",
      personalTenantId: "user:user-1",
      repository: { owner: "acme", repo: "app", token: "x" },
    });
  });
});

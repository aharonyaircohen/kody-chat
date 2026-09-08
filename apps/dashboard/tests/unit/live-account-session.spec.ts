import { describe, expect, it, vi } from "vitest";

import {
  establishLiveKodyAccountSession,
  loadLiveKodyAccountCredentials,
  loadLiveKodyAccountCredentialsFromDashboard,
  readLiveKodyAccountCredentials,
} from "../../tests/e2e/live-account-session";

const githubMocks = vi.hoisted(() => ({
  createUserOctokit: vi.fn(() => ({ kind: "octokit" })),
  listVariables: vi.fn(() => [
    { name: "LOGIN_USER", value: "repository-quality@example.test" },
  ]),
  readVariables: vi.fn(async () => ({ doc: { variables: {} } })),
  readVault: vi.fn(async () => ({
    doc: { secrets: { LOGIN_PASSWORD: { value: "repository-password" } } },
  })),
}));

vi.mock("@kody-ade/base/github/core", () => ({
  createUserOctokit: githubMocks.createUserOctokit,
}));
vi.mock("@kody-ade/base/variables/store", () => ({
  listVariables: githubMocks.listVariables,
  readVariables: githubMocks.readVariables,
}));
vi.mock("@kody-ade/base/vault/store", () => ({
  readVault: githubMocks.readVault,
}));

const EMAIL = "quality@example.test";
const PASSWORD = "password-that-must-not-leak";

describe("live Kody account session", () => {
  it("requires configured test-account credentials", () => {
    expect(() => readLiveKodyAccountCredentials({})).toThrow(
      "Kody Quality requires a configured test account",
    );
  });

  it("loads the dedicated account from the tester repository when env credentials are absent", async () => {
    await expect(
      loadLiveKodyAccountCredentials({
        E2E_GITHUB_REPO: "https://github.com/example/kody-quality.git",
        E2E_GITHUB_TOKEN: "github-token",
      }),
    ).resolves.toEqual({
      email: "repository-quality@example.test",
      password: "repository-password",
    });

    expect(githubMocks.readVariables).toHaveBeenCalledWith(
      "example",
      "kody-quality",
      { force: true },
    );
    expect(githubMocks.readVault).toHaveBeenCalledWith(
      { kind: "octokit" },
      "example",
      "kody-quality",
      { force: true },
    );
  });

  it("loads repository credentials from the Dashboard deployment under test", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        ok: () => true,
        status: () => 200,
        json: () =>
          Promise.resolve({
            variables: [
              {
                name: "LOGIN_USER",
                value: "deployed-quality@example.test",
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: () => true,
        status: () => 200,
        json: () => Promise.resolve({ value: "deployed-password" }),
      });

    await expect(
      loadLiveKodyAccountCredentialsFromDashboard(
        { get, post: vi.fn() },
        "https://candidate.example.test",
        {
          "x-kody-token": "github-token",
          "x-kody-owner": "example",
          "x-kody-repo": "consumer",
        },
      ),
    ).resolves.toEqual({
      email: "deployed-quality@example.test",
      password: "deployed-password",
    });

    expect(get).toHaveBeenNthCalledWith(
      1,
      "https://candidate.example.test/api/kody/variables",
      { headers: expect.objectContaining({ "x-kody-repo": "consumer" }) },
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "https://candidate.example.test/api/kody/secrets/LOGIN_PASSWORD/value",
      { headers: expect.objectContaining({ "x-kody-repo": "consumer" }) },
    );
  });

  it("signs in through Kody and verifies the resulting session", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ ok: () => true, status: () => 200 });
    const get = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () => Promise.resolve({ user: { id: "quality-user" } }),
    });

    await establishLiveKodyAccountSession(
      { post, get },
      "https://quality.example.test",
      { email: EMAIL, password: PASSWORD },
    );

    expect(post).toHaveBeenCalledWith(
      "https://quality.example.test/api/auth/sign-in/email",
      {
        data: { email: EMAIL, password: PASSWORD, callbackURL: "/chat" },
        headers: { Origin: "https://quality.example.test" },
      },
    );
    expect(get).toHaveBeenCalledWith(
      "https://quality.example.test/api/auth/get-session",
    );
  });

  it("can authenticate an unpromoted deployment through a trusted origin", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ ok: () => true, status: () => 200 });
    const get = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () => Promise.resolve({ user: { id: "quality-user" } }),
    });

    await establishLiveKodyAccountSession(
      { post, get },
      "https://candidate.example.test",
      { email: EMAIL, password: PASSWORD },
      "https://dashboard.example.test",
    );

    expect(post).toHaveBeenCalledWith(
      "https://candidate.example.test/api/auth/sign-in/email",
      expect.objectContaining({
        headers: { Origin: "https://dashboard.example.test" },
      }),
    );
    expect(get).toHaveBeenCalledWith(
      "https://candidate.example.test/api/auth/get-session",
    );
  });

  it("never includes credentials or server response text in login errors", async () => {
    const post = vi.fn().mockResolvedValue({
      ok: () => false,
      status: () => 401,
      text: () => Promise.resolve(`bad ${EMAIL} ${PASSWORD}`),
    });

    const error = await establishLiveKodyAccountSession(
      { post, get: vi.fn() },
      "https://quality.example.test",
      { email: EMAIL, password: PASSWORD },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Kody account sign-in failed (401)");
    expect((error as Error).message).not.toContain(EMAIL);
    expect((error as Error).message).not.toContain(PASSWORD);
  });

  it("rejects a successful sign-in response without a real session", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ ok: () => true, status: () => 200 });
    const get = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () => Promise.resolve(null),
    });

    await expect(
      establishLiveKodyAccountSession(
        { post, get },
        "https://quality.example.test",
        { email: EMAIL, password: PASSWORD },
      ),
    ).rejects.toThrow("Kody account session was not established (200)");
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const github = vi.hoisted(() => ({
  getAuthenticated: vi.fn(),
  getCollaboratorPermissionLevel: vi.fn(),
}));

vi.mock("../src/github/core", () => ({
  createUserOctokit: () => ({
    rest: {
      users: { getAuthenticated: github.getAuthenticated },
      repos: {
        getCollaboratorPermissionLevel:
          github.getCollaboratorPermissionLevel,
      },
    },
  }),
}));

import {
  verifyRepoReadAccess,
  verifyRepoWriteAccess,
} from "../src/auth";

function request(token = "token") {
  return new NextRequest("https://dash.test/api", {
    headers: {
      "x-kody-token": token,
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  github.getAuthenticated.mockResolvedValue({ data: { login: "alice" } });
});

describe("repository access verification", () => {
  it("accepts read collaborators but does not grant them write access", async () => {
    github.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: "pull" },
    });

    await expect(verifyRepoReadAccess(request())).resolves.toMatchObject({
      actorLogin: "alice",
      permission: "pull",
    });
    const write = await verifyRepoWriteAccess(request());
    expect(write).toMatchObject({ status: 403 });
  });

  it("accepts GitHub push permission as write access", async () => {
    github.getCollaboratorPermissionLevel.mockResolvedValue({
      data: { permission: "push" },
    });

    await expect(verifyRepoWriteAccess(request())).resolves.toMatchObject({
      actorLogin: "alice",
      permission: "push",
    });
  });

  it("rejects invalid tokens and missing headers", async () => {
    github.getAuthenticated.mockRejectedValue(new Error("bad credentials"));
    await expect(verifyRepoReadAccess(request("invalid"))).resolves.toMatchObject(
      { status: 403 },
    );
    await expect(
      verifyRepoReadAccess(new NextRequest("https://dash.test/api")),
    ).resolves.toMatchObject({ status: 401 });
  });
});

import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/widgets";
const OTHER_TENANT = "other/private";
const USER = "user-1";
const CREATED_AT = "2026-07-25T10:00:00.000Z";
const REVISED_AT = "2026-07-25T11:00:00.000Z";

const content = {
  title: "Reply style",
  summary: "Prefers short replies.",
  body: "Use simple words and answer first.",
};

function userMemory() {
  return {
    id: "memory-1",
    scope: { kind: "user" as const, userId: USER },
    kind: "preference" as const,
    content,
    currentRevisionId: "revision-1",
    status: "active" as const,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function firstRevision() {
  return {
    id: "revision-1",
    memoryId: "memory-1",
    previousRevisionId: null,
    kind: "preference" as const,
    content,
    evidence: [{ source: "message" as const, id: "message-1" }],
    reason: "The user explicitly requested this memory.",
    actor: { kind: "user" as const, id: USER },
    createdAt: CREATED_AT,
  };
}

describe("typed memories", () => {
  it("creates and reads a user memory with its first revision atomically", async () => {
    const t = setup();

    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: userMemory(),
      revision: firstRevision(),
    });

    await expect(
      t.query(api.memories.get, {
        actorId: USER,
        tenantId: TENANT,
        memoryId: "memory-1",
      }),
    ).resolves.toEqual(userMemory());
    const revisions = await t.query(api.memories.listRevisions, {
      actorId: USER,
      tenantId: TENANT,
      memoryId: "memory-1",
    });
    expect(revisions).toEqual([firstRevision()]);
  });

  it("keeps user and repository scopes isolated", async () => {
    const t = setup();
    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: userMemory(),
      revision: firstRevision(),
    });

    const repositoryMemory = {
      ...userMemory(),
      id: "memory-2",
      scope: { kind: "repository" as const, tenantId: TENANT },
      kind: "decision" as const,
      currentRevisionId: "revision-2",
    };
    const repositoryRevision = {
      ...firstRevision(),
      id: "revision-2",
      memoryId: "memory-2",
      kind: "decision" as const,
    };
    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: repositoryMemory,
      revision: repositoryRevision,
    });

    await expect(
      t.query(api.memories.list, {
        actorId: USER,
        tenantId: TENANT,
        scope: { kind: "user", userId: USER },
      }),
    ).resolves.toEqual([userMemory()]);
    await expect(
      t.query(api.memories.list, {
        actorId: USER,
        tenantId: TENANT,
        scope: { kind: "repository", tenantId: TENANT },
      }),
    ).resolves.toEqual([repositoryMemory]);
    await expect(
      t.query(api.memories.get, {
        actorId: "user-2",
        tenantId: TENANT,
        memoryId: "memory-1",
      }),
    ).resolves.toBeNull();
  });

  it("rejects a scope that does not match the authenticated context", async () => {
    const t = setup();

    await expect(
      t.mutation(api.memories.create, {
        actorId: USER,
        tenantId: TENANT,
        memory: {
          ...userMemory(),
          scope: { kind: "user", userId: "user-2" },
        },
        revision: firstRevision(),
      }),
    ).rejects.toThrow(/scope/i);
    await expect(
      t.mutation(api.memories.create, {
        actorId: USER,
        tenantId: TENANT,
        memory: {
          ...userMemory(),
          scope: { kind: "repository", tenantId: OTHER_TENANT },
        },
        revision: firstRevision(),
      }),
    ).rejects.toThrow(/scope/i);
  });

  it("revises with compare-and-swap protection", async () => {
    const t = setup();
    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: userMemory(),
      revision: firstRevision(),
    });

    const revisedContent = {
      title: "Reply style",
      summary: "Prefers very short replies.",
      body: "Keep replies short and use simple words.",
    };
    const revisedMemory = {
      ...userMemory(),
      content: revisedContent,
      currentRevisionId: "revision-2",
      updatedAt: REVISED_AT,
    };
    const revision = {
      ...firstRevision(),
      id: "revision-2",
      previousRevisionId: "revision-1",
      content: revisedContent,
      evidence: [{ source: "message" as const, id: "message-2" }],
      reason: "The user clarified the preference.",
      createdAt: REVISED_AT,
    };
    await t.mutation(api.memories.revise, {
      actorId: USER,
      tenantId: TENANT,
      expectedRevisionId: "revision-1",
      memory: revisedMemory,
      revision,
    });

    await expect(
      t.mutation(api.memories.revise, {
        actorId: USER,
        tenantId: TENANT,
        expectedRevisionId: "revision-1",
        memory: {
          ...revisedMemory,
          currentRevisionId: "revision-3",
        },
        revision: {
          ...revision,
          id: "revision-3",
          previousRevisionId: "revision-2",
        },
      }),
    ).rejects.toThrow(/changed since it was read/i);

    await expect(
      t.mutation(api.memories.revise, {
        actorId: USER,
        tenantId: TENANT,
        expectedRevisionId: "revision-2",
        memory: {
          ...revisedMemory,
          currentRevisionId: "revision-4",
          updatedAt: "2026-07-25T12:00:00.000Z",
        },
        revision: {
          ...revision,
          id: "revision-4",
          previousRevisionId: "revision-2",
          content,
          createdAt: "2026-07-25T12:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/does not match/i);
  });

  it("deletes the memory and all revision history", async () => {
    const t = setup();
    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: userMemory(),
      revision: firstRevision(),
    });

    await expect(
      t.mutation(api.memories.remove, {
        actorId: USER,
        tenantId: TENANT,
        memoryId: "memory-1",
      }),
    ).resolves.toBe(true);
    await expect(
      t.query(api.memories.get, {
        actorId: USER,
        tenantId: TENANT,
        memoryId: "memory-1",
      }),
    ).resolves.toBeNull();
    const revisionCount = await t.run(async (ctx) => {
      const rows = await ctx.db.query("memoryRevisions").collect();
      return rows.length;
    });
    expect(revisionCount).toBe(0);
  });

  it("searches active memory text inside one authorized scope", async () => {
    const t = setup();
    await t.mutation(api.memories.create, {
      actorId: USER,
      tenantId: TENANT,
      memory: userMemory(),
      revision: firstRevision(),
    });

    await expect(
      t.query(api.memories.search, {
        actorId: USER,
        tenantId: TENANT,
        scope: { kind: "user", userId: USER },
        searchText: "short replies",
        limit: 5,
      }),
    ).resolves.toEqual([userMemory()]);
    await expect(
      t.query(api.memories.search, {
        actorId: USER,
        tenantId: TENANT,
        scope: { kind: "repository", tenantId: OTHER_TENANT },
        searchText: "short replies",
        limit: 5,
      }),
    ).rejects.toThrow(/scope/i);
  });
});

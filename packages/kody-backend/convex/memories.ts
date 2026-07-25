import {
  createMemory,
  createMemoryRevision,
  type Memory,
  type MemoryRevision,
  type MemoryScope,
} from "@kody-ade/memory";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";
import {
  memoryRevisionValidator,
  memoryScopeValidator,
  memoryValidator,
} from "./memoryValidators";

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

function requireScopeAccess(
  actorId: string,
  tenantId: string,
  scope: MemoryScope,
): void {
  const allowed =
    scope.kind === "user"
      ? scope.userId === actorId
      : scope.tenantId === tenantId;
  if (!allowed) throw new Error("Memory scope does not match caller context");
}

function scopeFields(scope: MemoryScope): {
  scopeKind: MemoryScope["kind"];
  scopeId: string;
} {
  return scope.kind === "user"
    ? { scopeKind: scope.kind, scopeId: scope.userId }
    : { scopeKind: scope.kind, scopeId: scope.tenantId };
}

function scopeFromDoc(doc: Doc<"memories">): MemoryScope {
  return doc.scopeKind === "user"
    ? { kind: "user", userId: doc.scopeId }
    : { kind: "repository", tenantId: doc.scopeId };
}

function sameScope(left: MemoryScope, right: MemoryScope): boolean {
  if (left.kind === "user" && right.kind === "user") {
    return left.userId === right.userId;
  }
  if (left.kind === "repository" && right.kind === "repository") {
    return left.tenantId === right.tenantId;
  }
  return false;
}

function memoryFromDoc(doc: Doc<"memories">): Readonly<Memory> {
  return createMemory({
    id: doc.memoryId,
    scope: scopeFromDoc(doc),
    kind: doc.kind,
    content: {
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
    },
    currentRevisionId: doc.currentRevisionId,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.expiresAt === undefined ? {} : { expiresAt: doc.expiresAt }),
  });
}

function revisionFromDoc(
  doc: Doc<"memoryRevisions">,
): Readonly<MemoryRevision> {
  return createMemoryRevision({
    id: doc.revisionId,
    memoryId: doc.memoryId,
    previousRevisionId: doc.previousRevisionId,
    kind: doc.kind,
    content: {
      title: doc.title,
      summary: doc.summary,
      body: doc.body,
    },
    evidence: doc.evidence,
    reason: doc.reason,
    actor: doc.actor,
    createdAt: doc.createdAt,
  });
}

function memoryDocument(memory: Readonly<Memory>) {
  return {
    memoryId: memory.id,
    ...scopeFields(memory.scope),
    kind: memory.kind,
    title: memory.content.title,
    summary: memory.content.summary,
    body: memory.content.body,
    searchText: [
      memory.content.title,
      memory.content.summary,
      memory.content.body,
    ].join("\n"),
    currentRevisionId: memory.currentRevisionId,
    status: memory.status,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    ...(memory.expiresAt === undefined
      ? {}
      : { expiresAt: memory.expiresAt }),
  };
}

function revisionDocument(revision: Readonly<MemoryRevision>) {
  return {
    revisionId: revision.id,
    memoryId: revision.memoryId,
    previousRevisionId: revision.previousRevisionId,
    kind: revision.kind,
    title: revision.content.title,
    summary: revision.content.summary,
    body: revision.content.body,
    evidence: [...revision.evidence],
    reason: revision.reason,
    actor: revision.actor,
    createdAt: revision.createdAt,
  };
}

async function findMemory(ctx: DatabaseContext, memoryId: string) {
  return await ctx.db
    .query("memories")
    .withIndex("by_memory", (index) => index.eq("memoryId", memoryId))
    .unique();
}

function validateCreatePair(
  memory: Readonly<Memory>,
  revision: Readonly<MemoryRevision>,
): void {
  if (
    revision.memoryId !== memory.id ||
    revision.id !== memory.currentRevisionId ||
    revision.previousRevisionId !== null ||
    revision.kind !== memory.kind ||
    revision.content.title !== memory.content.title ||
    revision.content.summary !== memory.content.summary ||
    revision.content.body !== memory.content.body
  ) {
    throw new Error("Initial memory and revision do not match");
  }
}

function sameContent(
  left: Memory["content"],
  right: MemoryRevision["content"],
): boolean {
  return (
    left.title === right.title &&
    left.summary === right.summary &&
    left.body === right.body
  );
}

function validateUserActor(actorId: string, revision: MemoryRevision): void {
  if (revision.actor.kind !== "user" || revision.actor.id !== actorId) {
    throw new Error("Memory revision actor does not match caller context");
  }
}

export const create = mutation({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    memory: memoryValidator,
    revision: memoryRevisionValidator,
  },
  handler: async (ctx, args) => {
    const memory = createMemory(args.memory);
    const revision = createMemoryRevision(args.revision);
    requireScopeAccess(args.actorId, args.tenantId, memory.scope);
    validateUserActor(args.actorId, revision);
    validateCreatePair(memory, revision);
    if (await findMemory(ctx, memory.id)) {
      throw new Error("Memory already exists");
    }
    const existingRevision = await ctx.db
      .query("memoryRevisions")
      .withIndex("by_revision", (index) =>
        index.eq("revisionId", revision.id),
      )
      .unique();
    if (existingRevision) throw new Error("Memory revision already exists");

    await ctx.db.insert("memoryRevisions", revisionDocument(revision));
    await ctx.db.insert("memories", memoryDocument(memory));
    return memory.id;
  },
});

export const get = query({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await findMemory(ctx, args.memoryId);
    if (!doc) return null;
    const memory = memoryFromDoc(doc);
    try {
      requireScopeAccess(args.actorId, args.tenantId, memory.scope);
      return memory;
    } catch {
      return null;
    }
  },
});

export const list = query({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    scope: memoryScopeValidator,
  },
  handler: async (ctx, args) => {
    requireScopeAccess(args.actorId, args.tenantId, args.scope);
    const scope = scopeFields(args.scope);
    const docs = await ctx.db
      .query("memories")
      .withIndex("by_scope_status", (index) =>
        index
          .eq("scopeKind", scope.scopeKind)
          .eq("scopeId", scope.scopeId)
          .eq("status", "active"),
      )
      .order("desc")
      .take(100);
    return docs.map(memoryFromDoc);
  },
});

export const search = query({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    scope: memoryScopeValidator,
    searchText: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    requireScopeAccess(args.actorId, args.tenantId, args.scope);
    const searchText = args.searchText.trim();
    if (!searchText) throw new Error("Memory search text is required");
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
      throw new Error("Memory search limit must be between 1 and 20");
    }
    const scope = scopeFields(args.scope);
    const docs = await ctx.db
      .query("memories")
      .withSearchIndex("search_memory", (search) =>
        search
          .search("searchText", searchText)
          .eq("scopeKind", scope.scopeKind)
          .eq("scopeId", scope.scopeId)
          .eq("status", "active"),
      )
      .take(args.limit);
    return docs.map(memoryFromDoc);
  },
});

export const listRevisions = query({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await findMemory(ctx, args.memoryId);
    if (!doc) return [];
    const memory = memoryFromDoc(doc);
    try {
      requireScopeAccess(args.actorId, args.tenantId, memory.scope);
    } catch {
      return [];
    }
    const revisions = await ctx.db
      .query("memoryRevisions")
      .withIndex("by_memory", (index) =>
        index.eq("memoryId", args.memoryId),
      )
      .order("asc")
      .collect();
    return revisions.map(revisionFromDoc);
  },
});

export const revise = mutation({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    expectedRevisionId: v.string(),
    memory: memoryValidator,
    revision: memoryRevisionValidator,
  },
  handler: async (ctx, args) => {
    const memory = createMemory(args.memory);
    const revision = createMemoryRevision(args.revision);
    const currentDoc = await findMemory(ctx, memory.id);
    if (!currentDoc) throw new Error("Memory not found");
    const current = memoryFromDoc(currentDoc);
    requireScopeAccess(args.actorId, args.tenantId, current.scope);
    validateUserActor(args.actorId, revision);
    if (current.currentRevisionId !== args.expectedRevisionId) {
      throw new Error("Memory changed since it was read");
    }
    if (
      revision.memoryId !== current.id ||
      revision.previousRevisionId !== args.expectedRevisionId ||
      revision.id !== memory.currentRevisionId ||
      !sameScope(memory.scope, current.scope) ||
      memory.createdAt !== current.createdAt ||
      memory.status !== "active" ||
      memory.updatedAt !== revision.createdAt ||
      memory.kind !== revision.kind ||
      !sameContent(memory.content, revision.content)
    ) {
      throw new Error("Revised memory does not match current memory");
    }
    const existingRevision = await ctx.db
      .query("memoryRevisions")
      .withIndex("by_revision", (index) =>
        index.eq("revisionId", revision.id),
      )
      .unique();
    if (existingRevision) throw new Error("Memory revision already exists");

    await ctx.db.insert("memoryRevisions", revisionDocument(revision));
    await ctx.db.replace(currentDoc._id, memoryDocument(memory));
    return memory.id;
  },
});

export const remove = mutation({
  args: {
    actorId: v.string(),
    tenantId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await findMemory(ctx, args.memoryId);
    if (!doc) return false;
    const memory = memoryFromDoc(doc);
    requireScopeAccess(args.actorId, args.tenantId, memory.scope);
    const revisions = await ctx.db
      .query("memoryRevisions")
      .withIndex("by_memory", (index) =>
        index.eq("memoryId", args.memoryId),
      )
      .collect();
    for (const revision of revisions) {
      await ctx.db.delete(revision._id);
    }
    await ctx.db.delete(doc._id);
    return true;
  },
});

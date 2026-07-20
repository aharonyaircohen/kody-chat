import { v } from "convex/values";

export const agentIdentityValidator = v.object({
  slug: v.string(),
  title: v.string(),
});

export const conversationScopeValidator = v.union(
  v.object({ kind: v.literal("global") }),
  v.object({
    kind: v.literal("repository"),
    owner: v.string(),
    repo: v.string(),
  }),
);

export const conversationRuntimeValidator = v.union(
  v.object({ kind: v.literal("direct"), modelId: v.string() }),
  v.object({ kind: v.literal("brain"), brainId: v.string() }),
  v.object({ kind: v.literal("engine"), profileId: v.string() }),
  v.object({ kind: v.literal("live"), profileId: v.string() }),
);

export const conversationAuthorValidator = v.union(
  v.object({ kind: v.literal("user"), actorId: v.string() }),
  v.object({
    kind: v.literal("agent"),
    slug: v.string(),
    title: v.string(),
  }),
);

export const conversationEntryValidator = v.union(
  v.object({
    kind: v.literal("message"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    author: conversationAuthorValidator,
    content: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("committed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    turnId: v.string(),
    attachmentIds: v.optional(v.array(v.string())),
    createdAt: v.string(),
  }),
  v.object({
    kind: v.literal("agent-handoff"),
    from: agentIdentityValidator,
    to: agentIdentityValidator,
    createdAt: v.string(),
  }),
);

export const conversationAttachmentValidator = v.object({
  attachmentId: v.string(),
  entryId: v.string(),
  storageId: v.string(),
  fileName: v.string(),
  mediaType: v.string(),
  sizeBytes: v.number(),
  createdAt: v.string(),
});

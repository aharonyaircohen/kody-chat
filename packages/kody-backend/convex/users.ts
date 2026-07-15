import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Per-user state: user-state namespaces, notification prefs, inbox,
// channels-seen (today: state-repo files + private gists).

export const getUserState = query({
  args: { repo: v.string(), namespace: v.string(), userKey: v.string() },
  handler: async (ctx, { repo, namespace, userKey }) => {
    return await ctx.db
      .query("userState")
      .withIndex("by_user", (q) =>
        q.eq("repo", repo).eq("namespace", namespace).eq("userKey", userKey),
      )
      .unique()
  },
})

export const saveUserState = mutation({
  args: {
    repo: v.string(),
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userState")
      .withIndex("by_user", (q) =>
        q.eq("repo", args.repo).eq("namespace", args.namespace).eq("userKey", args.userKey),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("userState", args)
  },
})

export const getNotificationPrefs = query({
  args: { repo: v.string(), login: v.string() },
  handler: async (ctx, { repo, login }) => {
    return await ctx.db
      .query("notificationPrefs")
      .withIndex("by_login", (q) => q.eq("repo", repo).eq("login", login))
      .unique()
  },
})

export const saveNotificationPrefs = mutation({
  args: { repo: v.string(), login: v.string(), prefs: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationPrefs")
      .withIndex("by_login", (q) => q.eq("repo", args.repo).eq("login", args.login))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { prefs: args.prefs, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("notificationPrefs", args)
  },
})

export const listInbox = query({
  args: { repo: v.string(), login: v.string() },
  handler: async (ctx, { repo, login }) => {
    return await ctx.db
      .query("inboxEntries")
      .withIndex("by_login", (q) => q.eq("repo", repo).eq("login", login))
      .order("desc")
      .collect()
  },
})

export const upsertInboxEntry = mutation({
  args: {
    repo: v.string(),
    login: v.string(),
    entryId: v.string(),
    entry: v.any(),
    sentAt: v.string(),
    readAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inboxEntries")
      .withIndex("by_entry", (q) =>
        q.eq("repo", args.repo).eq("login", args.login).eq("entryId", args.entryId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        entry: args.entry,
        sentAt: args.sentAt,
        readAt: args.readAt,
      })
      return existing._id
    }
    return await ctx.db.insert("inboxEntries", args)
  },
})

export const getChannelsSeen = query({
  args: { repo: v.string(), login: v.string() },
  handler: async (ctx, { repo, login }) => {
    return await ctx.db
      .query("channelsSeen")
      .withIndex("by_login", (q) => q.eq("repo", repo).eq("login", login))
      .unique()
  },
})

export const saveChannelsSeen = mutation({
  args: { repo: v.string(), login: v.string(), manifest: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("channelsSeen")
      .withIndex("by_login", (q) => q.eq("repo", args.repo).eq("login", args.login))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { manifest: args.manifest, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("channelsSeen", args)
  },
})

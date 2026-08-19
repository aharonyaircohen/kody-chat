import { v } from "convex/values";

import { dispatchLoopWakeToDashboard } from "../src/loop-wake-dispatch";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { serviceMutation as mutation } from "./lib/auth";

const MAX_WAKE_TARGETS = 1_000;
const DISPATCH_BATCH_SIZE = 25;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

type WakeClaim = { tenantId: string; wakeId: string };
type WakeDispatchSummary = {
  mode: "shadow" | "dispatch";
  claimed: number;
  dispatched: number;
};

export async function syncLoopRegistration(
  ctx: MutationCtx,
  args: {
    tenantId: string;
    loopId: string;
    enabled: boolean;
    updatedAt: string;
  },
) {
  if (!REPOSITORY.test(args.tenantId)) {
    throw new Error("Loop wake tenant must be owner/repository");
  }
  if (!args.loopId.trim()) throw new Error("Loop wake id is required");
  const existing = await ctx.db
    .query("loopWakeRegistrations")
    .withIndex("by_loop", (q) =>
      q.eq("tenantId", args.tenantId).eq("loopId", args.loopId),
    )
    .unique();
  const target = await ctx.db
    .query("loopWakeTargets")
    .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
    .unique();

  if (args.enabled) {
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: args.updatedAt });
      return { registered: true, count: target?.registrationCount ?? 1 };
    }
    await ctx.db.insert("loopWakeRegistrations", {
      tenantId: args.tenantId,
      loopId: args.loopId,
      updatedAt: args.updatedAt,
    });
    const count = (target?.registrationCount ?? 0) + 1;
    if (target) {
      await ctx.db.patch(target._id, {
        registrationCount: count,
        updatedAt: args.updatedAt,
      });
    } else {
      await ctx.db.insert("loopWakeTargets", {
        tenantId: args.tenantId,
        registrationCount: count,
        updatedAt: args.updatedAt,
      });
    }
    return { registered: true, count };
  }

  if (!existing) {
    return { registered: false, count: target?.registrationCount ?? 0 };
  }
  await ctx.db.delete(existing._id);
  const count = Math.max(0, (target?.registrationCount ?? 1) - 1);
  if (target && count === 0) await ctx.db.delete(target._id);
  else if (target) {
    await ctx.db.patch(target._id, {
      registrationCount: count,
      updatedAt: args.updatedAt,
    });
  }
  return { registered: false, count };
}

export const syncRegistration = mutation({
  args: {
    tenantId: v.string(),
    loopId: v.string(),
    enabled: v.boolean(),
    updatedAt: v.string(),
  },
  handler: syncLoopRegistration,
});

export const replaceRegistrations = mutation({
  args: {
    tenantId: v.string(),
    loopIds: v.array(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const desired = new Set(args.loopIds.map((id) => id.trim()).filter(Boolean));
    const existing = await ctx.db
      .query("loopWakeRegistrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    for (const registration of existing) {
      if (desired.has(registration.loopId)) {
        desired.delete(registration.loopId);
        await ctx.db.patch(registration._id, { updatedAt: args.updatedAt });
      } else {
        await syncLoopRegistration(ctx, {
          tenantId: args.tenantId,
          loopId: registration.loopId,
          enabled: false,
          updatedAt: args.updatedAt,
        });
      }
    }
    for (const loopId of desired) {
      await syncLoopRegistration(ctx, {
        tenantId: args.tenantId,
        loopId,
        enabled: true,
        updatedAt: args.updatedAt,
      });
    }
    return { count: args.loopIds.length };
  },
});

export const claimDue = internalMutation({
  args: { slot: v.string(), now: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(DISPATCH_BATCH_SIZE, Math.floor(args.limit)));
    const targets = await ctx.db.query("loopWakeTargets").take(MAX_WAKE_TARGETS);
    const claims: Array<{ tenantId: string; wakeId: string }> = [];
    for (const target of targets) {
      if (claims.length >= limit || target.registrationCount < 1) break;
      const wakeId = `loop-wake:${target.tenantId}:${args.slot}`;
      const existing = await ctx.db
        .query("loopWakeReceipts")
        .withIndex("by_wake", (q) =>
          q.eq("tenantId", target.tenantId).eq("wakeId", wakeId),
        )
        .unique();
      if (existing) {
        if (existing.status === "failed") {
          await ctx.db.patch(existing._id, {
            status: "reserved",
            detail: undefined,
            updatedAt: args.now,
          });
          claims.push({ tenantId: target.tenantId, wakeId });
        }
        continue;
      }
      await ctx.db.insert("loopWakeReceipts", {
        wakeId,
        tenantId: target.tenantId,
        slot: args.slot,
        status: "reserved",
        createdAt: args.now,
        updatedAt: args.now,
      });
      claims.push({ tenantId: target.tenantId, wakeId });
    }
    return claims;
  },
});

export const finishWake = internalMutation({
  args: {
    tenantId: v.string(),
    wakeId: v.string(),
    status: v.union(
      v.literal("shadow"),
      v.literal("dispatched"),
      v.literal("failed"),
    ),
    detail: v.string(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db
      .query("loopWakeReceipts")
      .withIndex("by_wake", (q) =>
        q.eq("tenantId", args.tenantId).eq("wakeId", args.wakeId),
      )
      .unique();
    if (!receipt || receipt.status !== "reserved") {
      throw new Error("Loop wake reservation is not active");
    }
    await ctx.db.patch(receipt._id, {
      status: args.status,
      detail: args.detail.slice(0, 200),
      updatedAt: args.now,
    });
  },
});

function wakeSlot(now: Date): string {
  const intervalMs = 15 * 60_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs).toISOString();
}

export const dispatchDue = internalAction({
  args: {},
  handler: async (ctx): Promise<WakeDispatchSummary> => {
    const now = new Date();
    const claims: WakeClaim[] = await ctx.runMutation(
      internal.loopWakes.claimDue,
      {
      slot: wakeSlot(now),
      now: now.toISOString(),
      limit: DISPATCH_BATCH_SIZE,
      },
    );
    const mode = process.env.KODY_LOOP_WAKE_MODE === "dispatch" ? "dispatch" : "shadow";
    if (mode === "shadow") {
      await Promise.all(
        claims.map((claim) =>
          ctx.runMutation(internal.loopWakes.finishWake, {
            wakeId: claim.wakeId,
            tenantId: claim.tenantId,
            status: "shadow",
            detail: "shadow wake recorded",
            now: new Date().toISOString(),
          }),
        ),
      );
      return { mode, claimed: claims.length, dispatched: 0 };
    }

    const dashboardUrl = process.env.KODY_LOOP_DASHBOARD_URL?.trim();
    const wakeApiKey = process.env.KODY_LOOP_WAKE_API_KEY?.trim();
    if (!dashboardUrl || !wakeApiKey) {
      throw new Error("Loop wake Dashboard configuration is missing");
    }
    const outcomes = await Promise.all(
      claims.map(async (claim) => {
        try {
          const outcome = await dispatchLoopWakeToDashboard(claim, {
            dashboardUrl,
            wakeApiKey,
          });
          await ctx.runMutation(internal.loopWakes.finishWake, {
            wakeId: claim.wakeId,
            tenantId: claim.tenantId,
            status: outcome.ok ? "dispatched" : "failed",
            detail: outcome.detail,
            now: new Date().toISOString(),
          });
          return outcome.ok;
        } catch {
          await ctx.runMutation(internal.loopWakes.finishWake, {
            wakeId: claim.wakeId,
            tenantId: claim.tenantId,
            status: "failed",
            detail: "Dashboard dispatch failed",
            now: new Date().toISOString(),
          });
          return false;
        }
      }),
    );
    return {
      mode,
      claimed: claims.length,
      dispatched: outcomes.filter(Boolean).length,
    };
  },
});

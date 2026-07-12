/**
 * @fileType utility
 * @domain guides
 * @pattern chat-tools
 * @ai-summary Chat tools that let the model run a guide: list guides, start
 *   one, read ONLY the current step, and advance. Steps are read fresh from
 *   the brand's CMS collection each turn (no duplicate data); the student's
 *   position lives in the user-state `progress` namespace as the current
 *   step's id, so it is per-student and survives CMS reorders. The model
 *   never sees future steps — one step at a time, pointer moves forward one
 *   at a time — so it cannot skip ahead or drift off the guide.
 */
import { tool, type ToolSet } from "ai";
import type { NextRequest } from "next/server";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  getGuide,
  listGuides,
  currentByPointer,
  answerCompletesStep,
  nextPointerId,
  guidePointerKey,
  type GuideConfig,
  type GuideStep,
} from "@kody-ade/base/guides";
import { listCmsDocuments } from "@kody-ade/cms/service";
import type { CmsDocument } from "@kody-ade/cms/types";
import {
  getUserState,
  setUserState,
  type UserStateServiceContext,
} from "@dashboard/lib/user-state";

interface Ctx {
  req: NextRequest;
  octokit: Octokit;
  owner: string;
  repo: string;
  /** Unified actor id of the chatting student. */
  userId: string;
  sessionId?: string | null;
}

function serviceContext(ctx: Ctx): UserStateServiceContext {
  return {
    octokit: ctx.octokit,
    owner: ctx.owner,
    repo: ctx.repo,
    userId: ctx.userId,
    sessionId: ctx.sessionId ?? null,
  };
}

async function readPointer(ctx: Ctx, slug: string): Promise<string> {
  const doc = await getUserState(serviceContext(ctx), "progress");
  const value = doc?.data[guidePointerKey(slug)];
  return typeof value === "string" ? value : "";
}

async function writePointer(
  ctx: Ctx,
  slug: string,
  pointerId: string,
): Promise<void> {
  await setUserState(
    serviceContext(ctx),
    "progress",
    { [guidePointerKey(slug)]: pointerId },
    { source: "system" },
  );
}

function fieldString(doc: CmsDocument, field: string | undefined): string {
  if (!field) return "";
  const value = doc[field];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Read the guide's steps fresh from its CMS collection, mapped by field. */
async function resolveSteps(
  ctx: Ctx,
  guide: GuideConfig,
): Promise<GuideStep[]> {
  const { source } = guide;
  const result = await listCmsDocuments(
    ctx.req,
    ctx.octokit,
    ctx.owner,
    ctx.repo,
    source.collection,
    { sort: [{ field: source.orderField, direction: "asc" }], limit: 100 },
  );
  return result.docs.map((doc, index) => {
    const id =
      fieldString(doc, source.idField) ||
      fieldString(doc, "_id") ||
      fieldString(doc, "id") ||
      `step-${index}`;
    const advanceRaw = source.advanceField
      ? fieldString(doc, source.advanceField)
      : "";
    const advance = advanceRaw === "keyword" ? "keyword" : source.defaultAdvance;
    const keyword = source.keywordField
      ? fieldString(doc, source.keywordField) || undefined
      : undefined;
    return {
      id,
      title: fieldString(doc, source.titleField) || `Step ${index + 1}`,
      instruction: fieldString(doc, source.instructionField),
      advance,
      keyword,
    };
  });
}

export async function createGuideTools(ctx: Ctx): Promise<ToolSet> {
  const guides = await listGuides(ctx.octokit, ctx.owner, ctx.repo);
  const enabled = guides.filter((guide) => guide.enabled);
  if (enabled.length === 0) return {};
  const slugs = enabled.map((guide) => guide.slug) as [string, ...string[]];

  async function loadSteps(slug: string) {
    const found = await getGuide(ctx.octokit, ctx.owner, ctx.repo, slug);
    if (!found) return null;
    try {
      return { guide: found.guide, steps: await resolveSteps(ctx, found.guide) };
    } catch (error) {
      return {
        guide: found.guide,
        steps: [] as GuideStep[],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    guide_list: tool({
      description:
        "List the guides available to the current student (slug, title, " +
        "description).",
      inputSchema: z.object({}).strict(),
      execute: async () => ({
        guides: enabled.map((guide) => ({
          slug: guide.slug,
          title: guide.title,
          description: guide.description,
        })),
      }),
    }),

    guide_start: tool({
      description:
        "Begin (or restart) a guide for the current student. Sets their " +
        "position to the first step and returns it. Call guide_current " +
        "afterwards to teach.",
      inputSchema: z.object({ slug: z.enum(slugs) }).strict(),
      execute: async ({ slug }) => {
        const loaded = await loadSteps(slug);
        if (!loaded) return { error: `Unknown guide "${slug}"` };
        if (loaded.steps.length === 0) {
          return { error: "This guide's step collection is empty." };
        }
        const first = loaded.steps[0];
        await writePointer(ctx, slug, first.id);
        return {
          started: true,
          title: loaded.guide.title,
          step: first,
          stepNumber: 1,
          totalSteps: loaded.steps.length,
        };
      },
    }),

    guide_current: tool({
      description:
        "Get the student's CURRENT guide step — its teaching instruction " +
        "and position. Teach exactly this step; do not reveal or jump to " +
        "later steps.",
      inputSchema: z.object({ slug: z.enum(slugs) }).strict(),
      execute: async ({ slug }) => {
        const loaded = await loadSteps(slug);
        if (!loaded) return { error: `Unknown guide "${slug}"` };
        const pointer = await readPointer(ctx, slug);
        const pos = currentByPointer(loaded.steps, pointer);
        if (pos.finished) return { finished: true, totalSteps: pos.total };
        return {
          step: pos.step,
          stepNumber: pos.index + 1,
          totalSteps: pos.total,
        };
      },
    }),

    guide_advance: tool({
      description:
        "Advance the student to the next guide step once they have " +
        "completed the current one. Provide the student's latest answer; " +
        "for keyword-gated steps the move only happens if the answer " +
        "matches. Returns the next step or that the guide is finished.",
      inputSchema: z
        .object({ slug: z.enum(slugs), answer: z.string().default("") })
        .strict(),
      execute: async ({ slug, answer }) => {
        const loaded = await loadSteps(slug);
        if (!loaded) return { error: `Unknown guide "${slug}"` };
        const pointer = await readPointer(ctx, slug);
        const pos = currentByPointer(loaded.steps, pointer);
        if (pos.finished || !pos.step) {
          return { finished: true, totalSteps: pos.total };
        }
        if (!answerCompletesStep(pos.step, answer)) {
          return {
            advanced: false,
            reason: "The answer does not yet complete this step.",
            step: pos.step,
            stepNumber: pos.index + 1,
            totalSteps: pos.total,
          };
        }
        const nextId = nextPointerId(loaded.steps, pointer);
        await writePointer(ctx, slug, nextId);
        const nextPos = currentByPointer(loaded.steps, nextId);
        if (nextPos.finished) {
          return { advanced: true, finished: true, totalSteps: nextPos.total };
        }
        return {
          advanced: true,
          step: nextPos.step,
          stepNumber: nextPos.index + 1,
          totalSteps: nextPos.total,
        };
      },
    }),
  };
}

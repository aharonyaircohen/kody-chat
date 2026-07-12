/**
 * @fileType utility
 * @domain lessons
 * @pattern chat-tools
 * @ai-summary Chat tools that let the model run a lesson: list lessons, start
 *   one, read ONLY the current step, and advance. The learner's position
 *   lives in the user-state `progress` namespace, so it is per-student. The
 *   model never sees future steps — it gets one step at a time and can only
 *   move the pointer forward one step, so it cannot skip ahead or drift off
 *   the curriculum.
 */
import { tool, type ToolSet } from "ai";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  getLesson,
  listLessons,
  positionAt,
  answerCompletesStep,
  nextPointer,
  lessonPointerKey,
} from "@kody-ade/base/lessons";
import {
  getUserState,
  setUserState,
  type UserStateServiceContext,
} from "@dashboard/lib/user-state";

interface Ctx {
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

async function readPointer(ctx: Ctx, slug: string): Promise<number> {
  const doc = await getUserState(serviceContext(ctx), "progress");
  const value = doc?.data[lessonPointerKey(slug)];
  return typeof value === "number" ? value : 0;
}

async function writePointer(
  ctx: Ctx,
  slug: string,
  pointer: number,
): Promise<void> {
  await setUserState(
    serviceContext(ctx),
    "progress",
    { [lessonPointerKey(slug)]: pointer },
    { source: "system" },
  );
}

export async function createLessonTools(ctx: Ctx): Promise<ToolSet> {
  const lessons = await listLessons(ctx.octokit, ctx.owner, ctx.repo);
  const enabled = lessons.filter((lesson) => lesson.enabled);
  if (enabled.length === 0) return {};
  const slugs = enabled.map((lesson) => lesson.slug) as [string, ...string[]];

  return {
    lesson_list: tool({
      description:
        "List the lessons available to teach the current student. Returns " +
        "each lesson's slug, title, description and step count.",
      inputSchema: z.object({}).strict(),
      execute: async () => ({
        lessons: enabled.map((lesson) => ({
          slug: lesson.slug,
          title: lesson.title,
          description: lesson.description,
          steps: lesson.steps.length,
        })),
      }),
    }),

    lesson_start: tool({
      description:
        "Begin (or restart) a lesson for the current student. Sets their " +
        "position to the first step and returns it. Call lesson_current " +
        "afterwards to teach.",
      inputSchema: z.object({ slug: z.enum(slugs) }).strict(),
      execute: async ({ slug }) => {
        const found = await getLesson(ctx.octokit, ctx.owner, ctx.repo, slug);
        if (!found) return { error: `Unknown lesson "${slug}"` };
        await writePointer(ctx, slug, 0);
        const pos = positionAt(found.lesson, 0);
        return {
          started: true,
          title: found.lesson.title,
          step: pos.step,
          stepNumber: 1,
          totalSteps: pos.total,
        };
      },
    }),

    lesson_current: tool({
      description:
        "Get the student's CURRENT lesson step — its teaching instruction " +
        "and position. Teach exactly this step; do not reveal or jump to " +
        "later steps.",
      inputSchema: z.object({ slug: z.enum(slugs) }).strict(),
      execute: async ({ slug }) => {
        const found = await getLesson(ctx.octokit, ctx.owner, ctx.repo, slug);
        if (!found) return { error: `Unknown lesson "${slug}"` };
        const pointer = await readPointer(ctx, slug);
        const pos = positionAt(found.lesson, pointer);
        if (pos.finished) {
          return { finished: true, totalSteps: pos.total };
        }
        return {
          step: pos.step,
          stepNumber: pos.index + 1,
          totalSteps: pos.total,
        };
      },
    }),

    lesson_advance: tool({
      description:
        "Advance the student to the next lesson step once they have " +
        "completed the current one. Provide the student's latest answer; " +
        "for keyword-gated steps the move only happens if the answer " +
        "matches. Returns the next step or that the lesson is finished.",
      inputSchema: z
        .object({
          slug: z.enum(slugs),
          answer: z.string().default(""),
        })
        .strict(),
      execute: async ({ slug, answer }) => {
        const found = await getLesson(ctx.octokit, ctx.owner, ctx.repo, slug);
        if (!found) return { error: `Unknown lesson "${slug}"` };
        const pointer = await readPointer(ctx, slug);
        const pos = positionAt(found.lesson, pointer);
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
        const next = nextPointer(found.lesson, pointer);
        await writePointer(ctx, slug, next);
        const nextPos = positionAt(found.lesson, next);
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

/**
 * @fileType utility
 * @domain kody
 * @pattern review-pr-inbox-dispatch
 * @ai-summary Server-only helper that turns an agent-opened state-repo review
 *   PR (e.g. operation-creator's Operation proposal) into an approvable inbox
 *   entry for every operator — Approve squash-merges the PR from the
 *   dashboard, so the operator never has to visit GitHub.
 *
 *   Convention: agents open review PRs on the state repo titled
 *   `<capability-slug>: <summary>`. On the `pull_request` webhook we resolve
 *   the consumer repo from the PR's file paths (`<consumer-repo>/…` under the
 *   state repo) and append one feed entry per operator with
 *   `ctoAction: "merge"` + `ctoRepo` (the state repo) so the existing
 *   decision flow merges in the right place and records trust under the
 *   proposing capability.
 *
 *   Idempotent ids; never throws (logs and swallows).
 */
import "server-only";
import { createUserOctokit } from "../github-client";
import { readOperators } from "@kody-ade/base/engine/config";
import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";
import { appendInboxFeed } from "../inbox/feed-server";
import type { InboxFeedEntry } from "../inbox/feed";
import { logger } from "@kody-ade/base/logger";

/** `operation-creator: Propose …` → "operation-creator". */
const REVIEW_TITLE_RE = /^([a-z0-9][a-z0-9-]{0,39}):\s+\S/;
/** State repos follow the `<owner>/kody-state` convention. */
const STATE_REPO_NAME = "kody-state";
const SNIPPET_MAX = 240;

export interface ReviewPr {
  /** State repo the PR lives in. */
  stateOwner: string;
  stateRepo: string;
  number: number;
  title: string;
  body: string;
  author: string | undefined;
  url: string;
}

/** Capability slug from a review-convention PR title, or null. */
export function reviewCapabilitySlug(title: string): string | null {
  const match = REVIEW_TITLE_RE.exec(title.trim());
  return match?.[1] ?? null;
}

/** Extract the PR fields, or null when this event is not an agent review PR
 *  being opened/reopened on a state repo. Exported for unit tests. */
export function reviewPrFromPayload(
  eventType: string,
  payload: Record<string, unknown>,
): ReviewPr | null {
  if (eventType !== "pull_request") return null;
  if (payload.action !== "opened" && payload.action !== "reopened") return null;

  const repository = payload.repository as Record<string, unknown> | undefined;
  const fullName =
    typeof repository?.full_name === "string" ? repository.full_name : "";
  const [stateOwner, stateRepo] = fullName.split("/");
  if (!stateOwner || stateRepo !== STATE_REPO_NAME) return null;

  const pr = payload.pull_request as Record<string, unknown> | undefined;
  const number = typeof pr?.number === "number" ? pr.number : null;
  const title = typeof pr?.title === "string" ? pr.title : "";
  const url = typeof pr?.html_url === "string" ? pr.html_url : "";
  if (!number || !url || !reviewCapabilitySlug(title)) return null;

  const user = pr?.user as Record<string, unknown> | undefined;
  return {
    stateOwner,
    stateRepo,
    number,
    title,
    body: typeof pr?.body === "string" ? pr.body : "",
    author: typeof user?.login === "string" ? user.login : undefined,
    url,
  };
}

/** First path segment shared by every changed file = the consumer repo the
 *  state path belongs to (state repos nest tenants as `<repo>/…`). */
export function consumerRepoFromPaths(paths: string[]): string | null {
  const roots = new Set(
    paths.map((p) => p.split("/", 1)[0] ?? "").filter(Boolean),
  );
  return roots.size === 1 ? [...roots][0]! : null;
}

function snippetFromBody(body: string): string {
  return body
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SNIPPET_MAX);
}

/** One approvable feed entry per operator. Exported for unit tests. */
export function buildReviewEntries(
  pr: ReviewPr,
  consumerRepo: string,
  operators: string[],
  sentAt: string,
): InboxFeedEntry[] {
  const capability = reviewCapabilitySlug(pr.title);
  if (!capability) return [];
  const stateFullName = `${pr.stateOwner}/${pr.stateRepo}`;
  const snippet = snippetFromBody(pr.body);
  return operators.map((login) => ({
    id: `review-pr:${login}:${stateFullName}#${pr.number}`,
    login,
    source: "request",
    // Consumer repo — routes the entry to the right per-repo inbox.
    repoFullName: `${pr.stateOwner}/${consumerRepo}`,
    threadType: "PullRequest",
    title: pr.title,
    snippet,
    author: pr.author,
    url: pr.url,
    sentAt,
    ctoAction: "merge",
    ctoCapability: capability,
    // Where Approve merges — the state repo, not the connected repo.
    ctoRepo: stateFullName,
  }));
}

/**
 * Entry point — call from the webhook receiver on every event. Cheap noop
 * for anything that isn't an agent review PR on a state repo. Never throws.
 */
export async function dispatchReviewPrs(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const pr = reviewPrFromPayload(eventType, payload);
    if (!pr) return;
    const stateFullName = `${pr.stateOwner}/${pr.stateRepo}`;

    const serverToken = process.env.GITHUB_TOKEN?.trim();
    if (!serverToken) {
      logger.warn(
        { event: "review_pr_no_server_token", repo: stateFullName },
        "Review PR seen but no server GITHUB_TOKEN — cannot resolve consumer repo",
      );
      return;
    }
    const serverOctokit = createUserOctokit(serverToken);
    const { data: files } = await serverOctokit.pulls.listFiles({
      owner: pr.stateOwner,
      repo: pr.stateRepo,
      pull_number: pr.number,
      per_page: 100,
    });
    const consumerRepo = consumerRepoFromPaths(files.map((f) => f.filename));
    if (!consumerRepo) {
      logger.info(
        { event: "review_pr_no_consumer", repo: stateFullName, pr: pr.number },
        "Review PR touches multiple/zero tenants — not routing to an inbox",
      );
      return;
    }

    const bg = await resolveBackgroundToken(pr.stateOwner, consumerRepo);
    const operators = await readOperators(
      createUserOctokit(bg?.token ?? serverToken),
      pr.stateOwner,
      consumerRepo,
    );
    if (operators.length === 0) {
      logger.info(
        { event: "review_pr_no_operators", repo: stateFullName },
        "Review PR seen but no operators configured — nothing to route",
      );
      return;
    }

    const added = await appendInboxFeed(
      buildReviewEntries(pr, consumerRepo, operators, new Date().toISOString()),
    );
    logger.info(
      {
        event: "review_pr_inbox_appended",
        added,
        pr: pr.number,
        operators: operators.length,
        repo: stateFullName,
      },
      `Review-PR inbox: +${added} entr${added === 1 ? "y" : "ies"}`,
    );
  } catch (err) {
    logger.error(
      {
        event: "review_pr_dispatch_crashed",
        error: err instanceof Error ? err.message : String(err),
      },
      "dispatchReviewPrs threw — swallowing so webhook still ACKs",
    );
  }
}

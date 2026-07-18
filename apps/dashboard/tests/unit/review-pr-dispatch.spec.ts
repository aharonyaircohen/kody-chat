/**
 * Tests for the review-PR inbox dispatcher: state-repo detection, consumer
 * repo resolution from file paths, and per-operator entry shape (merge action
 * acting on the state repo via ctoRepo).
 */
import { describe, expect, it } from "vitest";
import {
  buildReviewEntries,
  consumerRepoFromPaths,
  reviewCapabilitySlug,
  reviewPrFromPayload,
} from "@dashboard/lib/push/review-pr-dispatch";

const payload = (over: Record<string, unknown> = {}) => ({
  action: "opened",
  pull_request: {
    number: 25,
    title: "operation-creator: Propose default-branch reliability Operation",
    body: "## Summary\n\nAdds the `default-branch-reliability` Operation contract.",
    html_url: "https://github.com/acme/kody-state/pull/25",
    user: { login: "kody-bot" },
  },
  repository: { full_name: "acme/kody-state" },
  ...over,
});

describe("reviewCapabilitySlug", () => {
  it("parses the capability prefix", () => {
    expect(reviewCapabilitySlug("operation-creator: Propose X")).toBe(
      "operation-creator",
    );
    expect(reviewCapabilitySlug("Fix login bug")).toBeNull();
    expect(reviewCapabilitySlug("WIP: thing")).toBeNull(); // uppercase prefix
  });
});

describe("reviewPrFromPayload", () => {
  it("extracts agent review PRs on the state repo", () => {
    expect(reviewPrFromPayload("pull_request", payload())).toMatchObject({
      stateOwner: "acme",
      stateRepo: "kody-state",
      number: 25,
      author: "kody-bot",
    });
  });

  it("ignores non-state repos, other events, and plain titles", () => {
    expect(
      reviewPrFromPayload(
        "pull_request",
        payload({ repository: { full_name: "acme/widgets" } }),
      ),
    ).toBeNull();
    expect(reviewPrFromPayload("issues", payload())).toBeNull();
    expect(
      reviewPrFromPayload("pull_request", payload({ action: "closed" })),
    ).toBeNull();
  });
});

describe("consumerRepoFromPaths", () => {
  it("returns the single shared root, null otherwise", () => {
    expect(
      consumerRepoFromPaths([
        "widgets/operations/x/operation.json",
        "widgets/reports/a.md",
      ]),
    ).toBe("widgets");
    expect(consumerRepoFromPaths(["a/x.json", "b/y.json"])).toBeNull();
    expect(consumerRepoFromPaths([])).toBeNull();
  });
});

describe("buildReviewEntries", () => {
  it("emits a merge-request entry per operator, acting on the state repo", () => {
    const pr = reviewPrFromPayload("pull_request", payload())!;
    const entries = buildReviewEntries(pr, "widgets", ["alice"], "2026-07-18T10:00:00Z");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "review-pr:alice:acme/kody-state#25",
      login: "alice",
      source: "request",
      repoFullName: "acme/widgets",
      threadType: "PullRequest",
      ctoAction: "merge",
      ctoCapability: "operation-creator",
      ctoRepo: "acme/kody-state",
      sentAt: "2026-07-18T10:00:00Z",
    });
  });
});

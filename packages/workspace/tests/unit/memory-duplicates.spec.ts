import type { Memory } from "@kody-ade/memory";
import { describe, expect, it } from "vitest";

import { findDuplicateMemory } from "../../src/tools/memory-duplicates";

function memory(
  id: string,
  title: string,
  summary: string,
  body: string,
): Readonly<Memory> {
  return {
    id,
    scope: { kind: "user", userId: "github:1" },
    kind: "fact",
    content: { title, summary, body },
    currentRevisionId: `revision-${id}`,
    status: "active",
    createdAt: "2026-07-25T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
  };
}

describe("memory duplicate matching", () => {
  it("matches exact content despite punctuation and casing", () => {
    const existing = memory(
      "exact",
      "Office Location",
      "My office is in Tel Aviv.",
      "My office is in Tel Aviv.",
    );

    expect(
      findDuplicateMemory([existing], {
        title: "office location",
        summary: "My office is in Tel Aviv",
        body: "My office is in Tel Aviv",
      }),
    ).toBe(existing);
  });

  it("matches a semantic rewrite of the same stable fact", () => {
    const existing = memory(
      "rewrite",
      "that my office is in Tel Aviv",
      "that my office is in Tel Aviv.",
      "that my office is in Tel Aviv.",
    );

    expect(
      findDuplicateMemory([existing], {
        title: "Office location",
        summary: "The user's office is in Tel Aviv",
        body: "My office is in Tel Aviv.",
      }),
    ).toBe(existing);
  });

  it("does not merge different facts that share generic words", () => {
    const office = memory(
      "office",
      "Office location",
      "My office is in Tel Aviv.",
      "My office is in Tel Aviv.",
    );

    expect(
      findDuplicateMemory([office], {
        title: "Home location",
        summary: "My home is in Jerusalem.",
        body: "My home is in Jerusalem.",
      }),
    ).toBeNull();
  });
});

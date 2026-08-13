import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateProjectAssessmentReport } from "../../app/api/kody/chat/kody/project-assessment-report";
import { COMPLETE_PROJECT_ASSESSMENT } from "../fixtures/project-assessment-report";

describe("project assessment report validation", () => {
  it("accepts a complete report", () => {
    expect(
      validateProjectAssessmentReport({
        text: COMPLETE_PROJECT_ASSESSMENT,
        finishReason: "stop",
      }),
    ).toEqual({ valid: true });
  });

  it("rejects the incomplete report that ended by attempting another tool call", () => {
    const brokenReport = readFileSync(
      new URL("../fixtures/incomplete-project-assessment.md", import.meta.url),
      "utf8",
    );

    expect(validateProjectAssessmentReport({ text: brokenReport })).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });

  it("rejects complete-looking text when the model did not finish normally", () => {
    expect(
      validateProjectAssessmentReport({
        text: COMPLETE_PROJECT_ASSESSMENT,
        finishReason: "length",
      }),
    ).toEqual(
      expect.objectContaining({ valid: false, reason: "unfinished_output" }),
    );
  });
});

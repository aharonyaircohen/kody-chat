import { describe, expect, it } from "vitest";

import { createAgencyRequestApproval } from "../../app/api/kody/chat/tools/agency-request-approval";

describe("Agency request approval view", () => {
  it("builds the standard approval card deterministically", () => {
    const directive = createAgencyRequestApproval({
      todoSlug: "keep-ci-passing",
    });

    expect(directive.id).toBe("agency-request-keep-ci-passing");
    expect(directive.rendererSlug).toBe("approval-card");
    expect(JSON.stringify(directive.ui)).toContain("Approve");
    expect(JSON.stringify(directive.ui)).toContain("Cancel");
  });
});

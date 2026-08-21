import { describe, expect, it } from "vitest";
import { isReadOnlyViewInput } from "../../../src/dashboard/lib/chat/surface/RenderedViewCard";

describe("RenderedViewCard input ownership", () => {
  it("treats unspecified inputs as display-only", () => {
    expect(isReadOnlyViewInput({ type: "input", value: "repo" })).toBe(true);
  });

  it("keeps explicitly editable inputs as controls", () => {
    expect(
      isReadOnlyViewInput({ type: "input", value: "repo", readOnly: false }),
    ).toBe(false);
  });
});

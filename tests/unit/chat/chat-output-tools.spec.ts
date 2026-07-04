import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolErrorOutput,
} from "@dashboard/lib/chat-output-tools";

describe("chat output tools", () => {
  it("classifies structured tool error outputs", () => {
    expect(isToolErrorOutput({ error: "show_view requires data" })).toBe(true);
    expect(getToolErrorMessage({ error: "show_view requires data" })).toBe(
      "show_view requires data",
    );
    expect(isToolErrorOutput({ error: "" })).toBe(false);
    expect(isToolErrorOutput({ content: "ok" })).toBe(false);
  });
});

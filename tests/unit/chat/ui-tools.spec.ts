/**
 * @testFramework vitest
 * @domain kody-chat
 */
import { describe, expect, it } from "vitest";
import { normalizeViewDataForTool } from "../../../app/api/kody/chat/tools/ui-tools";

describe("ui tools", () => {
  it("normalizes simple approval input into renderable action objects", () => {
    const data = normalizeViewDataForTool({
      title: "Create this issue?",
      actions: ["Approve", "Edit first", "Cancel"],
    });

    expect(data.actions).toEqual([
      { id: "approve", label: "Approve", response: "approve" },
      { id: "edit-first", label: "Edit first", response: "edit-first" },
      { id: "cancel", label: "Cancel", response: "cancel" },
    ]);
  });

});

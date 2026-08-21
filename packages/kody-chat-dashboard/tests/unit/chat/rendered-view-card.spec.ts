import { describe, expect, it } from "vitest";
import {
  isReadOnlyViewInput,
  replaceFirstRenderedViewList,
} from "../../../src/dashboard/lib/chat/surface/RenderedViewCard";

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

describe("RenderedViewCard dynamic selection", () => {
  it("replaces the renderer's empty list with CMS-backed actions", () => {
    expect(
      replaceFirstRenderedViewList(
        {
          type: "stack",
          children: [
            { type: "text", value: "Choose a course" },
            { type: "list", children: [] },
          ],
        },
        [
          {
            id: "continue",
            label: "Algebra",
            response: "Algebra",
            result: { courseId: "course-1" },
          },
        ],
      ),
    ).toEqual({
      type: "stack",
      children: [
        { type: "text", value: "Choose a course" },
        {
          type: "list",
          children: [
            {
              type: "button",
              label: "Algebra",
              action: {
                id: "continue",
                label: "Algebra",
                response: "Algebra",
                result: { courseId: "course-1" },
              },
            },
          ],
        },
      ],
    });
  });
});

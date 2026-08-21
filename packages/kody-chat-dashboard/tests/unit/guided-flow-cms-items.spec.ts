import { describe, expect, it } from "vitest";
import {
  cmsSelectionItems,
  resolveCmsItemsSource,
} from "../../src/dashboard/lib/guided-flows/cms-items";

describe("Guided Flow CMS selection items", () => {
  const source = {
    type: "cms" as const,
    collection: "chapters",
    labelField: "name",
    valueField: "id",
    resultField: "chapterId",
    filter: { field: "course", fromResultField: "courseId" },
  };

  it("resolves a dependent filter from an earlier step result", () => {
    expect(resolveCmsItemsSource(source, { courseId: "course-1" })).toEqual({
      type: "cms",
      collection: "chapters",
      labelField: "name",
      valueField: "id",
      resultField: "chapterId",
      filter: { field: "course", value: "course-1" },
    });
  });

  it("marks a dependent source unavailable until its parent is selected", () => {
    expect(resolveCmsItemsSource(source, {})).toMatchObject({
      unavailable: "missing_filter_value",
    });
  });

  it("maps CMS documents to one reusable Guided Flow action", () => {
    expect(
      cmsSelectionItems(
        {
          type: "cms",
          collection: "courses",
          labelField: "name",
          valueField: "id",
          resultField: "courseId",
        },
        [
          { id: "course-1", name: "Algebra" },
          { id: "course-2", name: "Geometry" },
          { id: "invalid" },
        ],
      ),
    ).toEqual([
      {
        id: "continue",
        label: "Algebra",
        response: "Algebra",
        result: { courseId: "course-1", courseIdLabel: "Algebra" },
      },
      {
        id: "continue",
        label: "Geometry",
        response: "Geometry",
        result: { courseId: "course-2", courseIdLabel: "Geometry" },
      },
    ]);
  });
});

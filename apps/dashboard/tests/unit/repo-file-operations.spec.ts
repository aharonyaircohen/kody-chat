import { describe, expect, it } from "vitest";
import {
  buildDuplicateChanges,
  buildMoveChanges,
} from "../../src/dashboard/features/file-manager/lib/repo-file-operations";
import type { FileContent } from "../../src/dashboard/features/file-manager/lib/repo-files";

const binaryFile: FileContent = {
  path: "assets/logo.png",
  content: "",
  base64Content: "iVBORw0KGgo=",
  isBinary: true,
  encoding: "base64",
  sha: "old-sha",
  size: 8,
};

describe("repository file operation plans", () => {
  it("moves binary files without decoding their bytes", () => {
    expect(buildMoveChanges([binaryFile], "assets", "dir", "archive")).toEqual([
      {
        type: "write",
        path: "archive/logo.png",
        base64Content: "iVBORw0KGgo=",
      },
      { type: "delete", path: "assets/logo.png" },
    ]);
  });

  it("duplicates a file without changing its base64 content", () => {
    expect(
      buildDuplicateChanges(
        [binaryFile],
        "assets/logo.png",
        "file",
        "assets/logo-copy.png",
      ),
    ).toEqual([
      {
        type: "write",
        path: "assets/logo-copy.png",
        base64Content: "iVBORw0KGgo=",
      },
    ]);
  });
});

/**
 * @fileType component
 * @domain docs
 * @pattern focused-file-workspace
 * @ai-summary Configures the shared repository Files workspace for markdown
 *   documents under docs/, with the project README pinned separately.
 */
"use client";

import { FilesPage, type FileEntry } from "@dashboard/features/file-manager";

interface DocsViewProps {
  selectedPath?: string | null;
}

const README_ENTRY: FileEntry = {
  name: "Project README",
  path: "README.md",
  type: "file",
  size: 0,
  sha: "",
};

function isDocsEntry(entry: FileEntry): boolean {
  return (
    entry.type === "dir" ||
    (entry.type === "file" && entry.path.toLowerCase().endsWith(".md"))
  );
}

function selectedRepoPath(selectedPath: string | null | undefined): string {
  if (!selectedPath) return "";
  if (selectedPath === "README.md" || selectedPath.startsWith("docs/")) {
    return selectedPath;
  }
  return `docs/${selectedPath}`;
}

export function DocsView({ selectedPath = null }: DocsViewProps = {}) {
  return (
    <FilesPage
      title="Docs"
      rootPath="docs"
      routeBase="/docs"
      initialPath={selectedRepoPath(selectedPath)}
      pinnedEntries={[README_ENTRY]}
      protectedPaths={["README.md"]}
      entryFilter={isDocsEntry}
      newFileExtension=".md"
      newFilePlaceholder="Document title"
      newFileNameOnly
      showSearch={false}
      showUpload={false}
      defaultMarkdownViewMode="preview"
    />
  );
}

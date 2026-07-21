"use client";

import { FilesPage, type FileEntry } from "@dashboard/features/file-manager";

export function isMarkdownFileSpaceEntry(entry: FileEntry): boolean {
  return entry.type === "dir" || entry.path.toLowerCase().endsWith(".md");
}

export function RepositoryFileSpace({
  title,
  rootPath,
  routeBase,
  initialPath = "",
  pinnedEntries,
  protectedPaths,
}: {
  title: string;
  rootPath: string;
  routeBase: string;
  initialPath?: string;
  pinnedEntries?: FileEntry[];
  protectedPaths?: string[];
}) {
  return (
    <FilesPage
      title={title}
      rootPath={rootPath}
      routeBase={routeBase}
      initialPath={initialPath}
      pinnedEntries={pinnedEntries}
      protectedPaths={protectedPaths}
      entryFilter={isMarkdownFileSpaceEntry}
      newFileExtension=".md"
      newFilePlaceholder="Document title"
      newFileNameOnly
      showSearch={false}
      showUpload={false}
      defaultMarkdownViewMode="preview"
    />
  );
}

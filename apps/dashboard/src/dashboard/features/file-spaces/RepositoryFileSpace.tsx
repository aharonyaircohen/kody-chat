"use client";

import { FilesPage, type FileEntry } from "@dashboard/features/file-manager";
import { MARKDOWN_FILE_UPLOAD_POLICY } from "@dashboard/features/file-manager/lib/file-upload-policy";

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
      uploadPolicy={MARKDOWN_FILE_UPLOAD_POLICY}
      defaultMarkdownViewMode="preview"
    />
  );
}

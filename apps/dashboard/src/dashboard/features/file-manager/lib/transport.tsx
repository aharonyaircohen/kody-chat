/**
 * @fileType util
 * @domain files
 * @pattern files-transport
 * @ai-summary Pluggable read transport for the file-manager workspace.
 *   Default (no provider) is the GitHub Contents API via octokit props.
 *   A host page may supply a custom transport (e.g. database-backed
 *   virtual files) through FilesPage's `transport` prop; custom
 *   transports are read-only — all write UI stays disabled.
 */
"use client";

import { createContext, useContext } from "react";
import type { FileContent, FileEntry } from "./repo-files";

export interface FilesTransport {
  /**
   * Cache identity for this transport's data. Include it in query keys;
   * bump it when the backing data changes so cached listings refetch.
   */
  cacheKey?: string;
  /** List the entries of a directory path ("" = root). */
  listDir(path: string): Promise<FileEntry[]>;
  /** Read one file, or null when the path is not a file. */
  readFile(path: string): Promise<FileContent | null>;
  /**
   * Optional write: create or replace a file. When absent the workspace
   * is read-only and all write UI stays hidden.
   */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** Optional delete. Only offered when defined. */
  deleteFile?: (path: string) => Promise<void>;
  /** Optional external link for the "Open on …" action. */
  externalUrl?: (path: string, type: FileEntry["type"]) => string | null;
}

const FilesTransportContext = createContext<FilesTransport | null>(null);

export const FilesTransportProvider = FilesTransportContext.Provider;

/** The custom transport for this workspace, or null for GitHub default. */
export function useFilesTransport(): FilesTransport | null {
  return useContext(FilesTransportContext);
}

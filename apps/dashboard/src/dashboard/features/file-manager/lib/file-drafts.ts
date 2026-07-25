export interface FileDraft {
  version: 1;
  content: string;
  baseSha: string;
  updatedAt: number;
}

export type NewFileDraft = Omit<FileDraft, "version">;

export function fileDraftStorageKey(
  owner: string,
  repo: string,
  path: string,
): string {
  return `kody:file-draft:${owner}/${repo}/${path}`;
}

export function serializeFileDraft(draft: NewFileDraft): string {
  return JSON.stringify({ version: 1, ...draft } satisfies FileDraft);
}

export function parseFileDraft(value: string): FileDraft | null {
  try {
    const draft = JSON.parse(value) as Partial<FileDraft>;
    if (
      draft.version !== 1 ||
      typeof draft.content !== "string" ||
      typeof draft.baseSha !== "string" ||
      typeof draft.updatedAt !== "number"
    ) {
      return null;
    }
    return draft as FileDraft;
  } catch {
    return null;
  }
}

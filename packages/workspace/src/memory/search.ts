import type { MemoryFile } from "./files";

export interface MemorySearchHit {
  id: string;
  path: string;
  snippet: string;
}

const SNIPPET_RADIUS = 180;

export function searchMemoryFiles(
  memories: MemoryFile[],
  query: string,
  limit = 20,
): MemorySearchHit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  return memories
    .flatMap((memory): MemorySearchHit[] => {
      const searchable = [
        memory.meta.name,
        memory.meta.description,
        memory.meta.type,
        memory.body,
      ].join("\n");
      const index = searchable.toLocaleLowerCase().indexOf(needle);
      if (index < 0) return [];
      const start = Math.max(0, index - SNIPPET_RADIUS);
      const end = Math.min(
        searchable.length,
        index + needle.length + SNIPPET_RADIUS,
      );
      const snippet = searchable
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
      return [
        {
          id: memory.id,
          path: `memory/${memory.id}.md`,
          snippet: `${start > 0 ? "…" : ""}${snippet}${
            end < searchable.length ? "…" : ""
          }`,
        },
      ];
    })
    .slice(0, Math.max(0, limit));
}

/**
 * @fileType component
 * @domain snippets
 * @pattern snippet-injection
 * @ai-summary Server-rendered injection point for brand snippets: renders
 *   the enabled snippets for a placement verbatim into the page HTML, so
 *   "body-start" snippets execute before the app hydrates. Operator-managed
 *   content from the brand's own state repo (same trust level as the brand
 *   pages themselves).
 */
import type { SnippetConfig, SnippetPlacement } from "./types";

export function BrandSnippets({
  snippets,
  placement,
}: {
  snippets: readonly SnippetConfig[];
  placement: SnippetPlacement;
}) {
  const active = snippets.filter(
    (snippet) => snippet.enabled && snippet.placement === placement,
  );
  if (active.length === 0) return null;
  return (
    <>
      {active.map((snippet) => (
        <div
          key={snippet.id}
          data-kody-snippet={snippet.id}
          dangerouslySetInnerHTML={{ __html: snippet.html }}
        />
      ))}
    </>
  );
}

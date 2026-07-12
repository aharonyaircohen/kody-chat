/**
 * @fileType component
 * @domain snippets
 * @pattern snippet-injection
 * @ai-summary Client-side injector for brand snippets. React never executes
 *   <script> tags it renders (and SSR-injected scripts break hydration), so
 *   on mount this parses each snippet and appends real DOM nodes — script
 *   tags are recreated via document.createElement so the browser runs them.
 *   Operator-managed content from the brand's own state repo (same trust
 *   level as the brand pages themselves).
 */
"use client";

import { useEffect } from "react";
import type { SnippetConfig, SnippetPlacement } from "./types";

function injectSnippet(snippet: SnippetConfig): () => void {
  const container = document.createElement("div");
  container.setAttribute("data-kody-snippet", snippet.id);
  container.innerHTML = snippet.html;

  // innerHTML-inserted <script> tags never execute — recreate each one as a
  // real script element (preserving src/attributes/inline code).
  for (const inert of Array.from(container.querySelectorAll("script"))) {
    const script = document.createElement("script");
    for (const attr of Array.from(inert.attributes)) {
      script.setAttribute(attr.name, attr.value);
    }
    script.text = inert.text;
    inert.replaceWith(script);
  }

  if (snippet.placement === "body-start") {
    document.body.prepend(container);
  } else {
    document.body.append(container);
  }
  return () => container.remove();
}

export function BrandSnippets({
  snippets,
  placement,
}: {
  snippets: readonly SnippetConfig[];
  placement: SnippetPlacement;
}) {
  useEffect(() => {
    const cleanups = snippets
      .filter((snippet) => snippet.enabled && snippet.placement === placement)
      .map(injectSnippet);
    return () => cleanups.forEach((cleanup) => cleanup());
    // Snippets come from server config for the page render — identity by id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snippets), placement]);

  return null;
}

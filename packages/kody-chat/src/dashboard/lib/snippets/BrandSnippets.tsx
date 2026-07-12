/**
 * @fileType component
 * @domain snippets
 * @pattern snippet-injection
 * @ai-summary Client-side injector for brand snippets. React never executes
 *   <script> tags it renders, and inserting nodes into <body> during
 *   progressive hydration breaks React's Suspense hydration — so this waits
 *   for the window load event, puts scripts in <head> (never
 *   React-managed; the GTM approach), and any non-script markup at the end
 *   of <body>. Operator-managed content from the brand's own state repo.
 */
"use client";

import { useEffect } from "react";
import type { SnippetConfig, SnippetPlacement } from "./types";

function injectSnippet(snippet: SnippetConfig): () => void {
  const inserted: Element[] = [];
  const template = document.createElement("template");
  template.innerHTML = snippet.html;

  for (const node of Array.from(template.content.children)) {
    if (node.tagName === "SCRIPT") {
      // Recreate the script so the browser executes it; head is outside
      // React's hydration scope.
      const script = document.createElement("script");
      for (const attr of Array.from(node.attributes)) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = node.textContent ?? "";
      script.setAttribute("data-kody-snippet", snippet.id);
      document.head.appendChild(script);
      inserted.push(script);
    } else {
      // Non-script markup (pixels, noscript, iframes) goes at the end of
      // body — after `load`, hydration is complete and React ignores it.
      const container = document.createElement("div");
      container.setAttribute("data-kody-snippet", snippet.id);
      container.appendChild(node);
      document.body.appendChild(container);
      inserted.push(container);
    }
  }
  return () => inserted.forEach((node) => node.remove());
}

export function BrandSnippets({
  snippets,
  placement,
}: {
  snippets: readonly SnippetConfig[];
  placement: SnippetPlacement;
}) {
  useEffect(() => {
    const active = snippets.filter(
      (snippet) => snippet.enabled && snippet.placement === placement,
    );
    if (active.length === 0) return;

    let cleanups: Array<() => void> = [];
    const inject = () => {
      cleanups = active.map(injectSnippet);
    };

    if (document.readyState === "complete") {
      inject();
      return () => cleanups.forEach((cleanup) => cleanup());
    }
    window.addEventListener("load", inject, { once: true });
    return () => {
      window.removeEventListener("load", inject);
      cleanups.forEach((cleanup) => cleanup());
    };
    // Snippets are server-provided per render; identity by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snippets), placement]);

  return null;
}

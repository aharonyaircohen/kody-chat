export interface InternalLink {
  href: string;
  label: string;
}

export function isSafeInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function formatInternalLinks(links: readonly InternalLink[]): string {
  return links
    .filter((link) => isSafeInternalHref(link.href) && link.label.trim())
    .map((link) => `[${link.label.trim()}](${link.href})`)
    .join("\n");
}

export function stripConflictingInternalLinks(
  answer: string,
  links: readonly InternalLink[],
): string {
  return links.reduce((current, link) => {
    const label = link.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `\\[${label}\\]\\((?!${escapeRegExp(link.href)})[^)]+\\)`,
      "g",
    );
    return current.replace(pattern, "");
  }, answer);
}

/** Keep tool-validated Markdown destinations and make untrusted links plain text. */
export function stripUntrustedMarkdownLinks(
  answer: string,
  links: readonly InternalLink[],
): string {
  const trusted = new Set(
    links
      .filter((link) => isSafeInternalHref(link.href))
      .map((link) => link.href),
  );
  return answer.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) =>
    trusted.has(href) ? match : label,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

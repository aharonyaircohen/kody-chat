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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

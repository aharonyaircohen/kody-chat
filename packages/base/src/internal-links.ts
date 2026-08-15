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

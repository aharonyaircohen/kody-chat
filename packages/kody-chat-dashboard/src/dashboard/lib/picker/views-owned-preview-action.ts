import type { PreviewAction } from "./protocol";

export function isViewsPath(pathname: string | null): boolean {
  return /(?:^|\/)preview(?:\/|$)/.test(pathname ?? "");
}

export async function ensureViewsOwnedCapabilityAction(input: {
  action: PreviewAction;
  pathname: string | null;
  openViews: () => void;
  remoteBrowserAvailable: () => boolean;
  wait?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}): Promise<boolean> {
  if (!input.action.capabilitySlug) return true;

  if (!isViewsPath(input.pathname)) input.openViews();

  const wait =
    input.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = input.maxAttempts ?? 240;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.remoteBrowserAvailable()) return true;
    await wait(250);
  }
  return false;
}
